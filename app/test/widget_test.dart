import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:aoying_monitor/api.dart';
import 'package:aoying_monitor/app.dart';
import 'package:aoying_monitor/live.dart';
import 'package:aoying_monitor/session.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<({LiveController live, List<Uri> requests})> enter(
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final requests = <Uri>[];
    final api = ApiClient(
      httpClient: MockClient((request) async {
        requests.add(request.url);
        return http.Response(
          jsonEncode(switch (request.url.path) {
            '/api/telegram/dialogs' => [],
            '/api/telegram/topics' => [],
            '/api/telegram/messages' => {
              'messages': [
                {
                  'id': 1,
                  'chat_id': 10,
                  'message_id': 20,
                  'sender_name': '原发言人',
                  'sender_role': 'owner',
                  'dialog_title': 'TG群',
                  'topic_title': '原始报告',
                  'text': 'TG原文：BTC持仓截图说明',
                  'edited_at': '2026-11-09T01:00:00Z',
                  'deleted_at': '2026-11-09T02:00:00Z',
                  'revisions': [
                    {
                      'text': '原始快照：修改前原文',
                      'media_kind': 'photo',
                      'replaced_at': '2026-11-09T01:00:00Z',
                    },
                  ],
                },
              ],
            },
            _ => {},
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    final session = SessionController.seeded(
      api: api,
      user: const ApiUser(id: 1, username: 'admin', displayName: '管理员'),
      device: const ApiDevice(
        id: 7,
        name: '测试手机',
        platform: 'android',
        pushMode: 'local',
        lastSeenAt: null,
      ),
    );
    final live = LiveController(api: api, autoConnect: false);
    addTearDown(live.dispose);
    addTearDown(session.dispose);
    await tester.pumpWidget(AoyingApp(session: session, live: live));
    await tester.pumpAndSettle();
    return (live: live, requests: requests);
  }

  testWidgets('登录后直接展示TG消息，不加载推导仓位账本', (tester) async {
    final scope = await enter(tester);
    expect(find.text('TG原文：BTC持仓截图说明'), findsOneWidget);
    expect(find.text('持仓'), findsNothing);
    expect(find.text('未平仓数'), findsNothing);
    expect(find.text('Telegram 信号账本'), findsNothing);
    expect(
      scope.requests.map((r) => r.path),
      isNot(contains('/api/copy/status')),
    );
    expect(
      scope.requests.map((r) => r.path),
      isNot(contains('/api/positions')),
    );
    expect(scope.requests.map((r) => r.path), isNot(contains('/api/signals')));
    expect(
      scope.requests.where((r) => r.path == '/api/telegram/messages'),
      hasLength(1),
    );
  });

  testWidgets('保留编辑删除标记与修改前原始快照', (tester) async {
    await enter(tester);
    expect(find.text('已编辑'), findsWidgets);
    expect(find.text('已删除'), findsWidgets);
    await tester.tap(find.text('改前版本 1 条'));
    await tester.pumpAndSettle();
    expect(find.text('原始快照：修改前原文'), findsOneWidget);
  });

  testWidgets('消息筛选和实时事件仅重新加载TG原文', (tester) async {
    final scope = await enter(tester);
    await tester.tap(find.text('全部原文'));
    await tester.pumpAndSettle();
    expect(scope.requests.last.queryParameters['focus'], 'all');
    expect(scope.requests.last.queryParameters['include_revisions'], 'true');
    await tester.tap(find.text('已删除').first);
    await tester.pumpAndSettle();
    expect(scope.requests.last.queryParameters['kind'], 'deleted');
    final before = scope.requests.length;
    scope.live.ingestEvents([
      const ApiEvent(
        id: 1,
        kind: 'telegram.message.edited',
        payload: {},
        createdAt: null,
      ),
    ]);
    await tester.pumpAndSettle();
    expect(scope.requests.length, before + 1);
    expect(scope.requests.last.path, '/api/telegram/messages');
  });

  testWidgets('底部导航保留TG消息提醒与设置', (tester) async {
    await enter(tester);
    expect(find.byType(NavigationDestination), findsNWidgets(3));
    await tester.tap(find.text('提醒').last);
    await tester.pumpAndSettle();
    expect(find.text('送达通道'), findsOneWidget);
    await tester.tap(find.text('设置').last);
    await tester.pumpAndSettle();
    expect(find.text('已登录设备'), findsOneWidget);
    await tester.tap(find.text('TG消息').last);
    await tester.pumpAndSettle();
    expect(find.text('TG原文：BTC持仓截图说明'), findsOneWidget);
  });

  testWidgets('未登录时展示登录表单', (tester) async {
    final api = ApiClient(baseUrl: 'http://127.0.0.1:9');
    final session = SessionController.anonymous(api: api);
    final live = LiveController(api: api, autoConnect: false);
    addTearDown(session.dispose);
    addTearDown(live.dispose);
    await tester.pumpWidget(AoyingApp(session: session, live: live));
    await tester.pump();
    expect(find.text('进入监控台'), findsOneWidget);
  });
}

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aoying_monitor/api.dart';
import 'package:aoying_monitor/app.dart';
import 'package:aoying_monitor/live.dart';
import 'package:aoying_monitor/session.dart';

/// 手机竖屏但足够高，保证 ListView 里的卡片都被构建出来（默认 600 逻辑像素会裁掉下半屏）。
void _useTallSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

const _user = ApiUser(id: 1, username: 'admin', displayName: '管理员');
const _device = ApiDevice(
  id: 7,
  name: '测试手机',
  platform: 'android',
  pushMode: 'local',
  lastSeenAt: null,
);

/// A session that believes it is signed in, plus a socket that never dials.
({SessionController session, LiveController live}) _signedIn() {
  final api = ApiClient(
    httpClient: MockClient(
      (request) async => http.Response(
        jsonEncode(switch (request.url.path) {
          '/api/copy/status' => {
            'positions_open': 32,
            'positions_closed': 17,
            'realized_closed': 9.5,
            'signals': 50,
            'events': 70,
            'last_signal_at': null,
          },
          '/api/positions' => {
            'positions': [
              {
                'id': 1,
                'symbol': 'LIVEBTC',
                'side': 'long',
                'status': 'open',
                'opened_at': '2026-11-09T00:00:00Z',
                'entry': null,
                'qty_current': 0,
                'realized': 7,
                'held_seconds': 10,
                'events': [
                  {
                    'id': 1,
                    'kind': 'reduce',
                    'at': '2026-11-09T01:00:00Z',
                    'realized': 5,
                  },
                  {
                    'id': 2,
                    'kind': 'close',
                    'at': '2026-11-09T02:00:00Z',
                    'realized': 7,
                  },
                ],
              },
              {
                'id': 2,
                'symbol': 'LIVEETH',
                'side': 'short',
                'status': 'closed',
                'opened_at': '2026-11-09T00:00:00Z',
                'realized': 0,
                'held_seconds': 10,
                'events': [],
              },
            ],
            'count': 2,
          },
          '/api/signals' => {'signals': [], 'count': 0},
          _ => {},
        }),
        200,
      ),
    ),
  );
  final session = SessionController.seeded(
    api: api,
    user: _user,
    device: _device,
  );
  final live = LiveController(api: api, autoConnect: false);
  return (session: session, live: live);
}

Future<void> _enterShell(WidgetTester tester) async {
  _useTallSurface(tester);
  final scope = _signedIn();
  await tester.pumpWidget(AoyingApp(session: scope.session, live: scope.live));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('未登录时展示登录表单', (tester) async {
    _useTallSurface(tester);
    final api = ApiClient(baseUrl: 'http://127.0.0.1:9');
    final session = SessionController.anonymous(api: api);
    await tester.pumpWidget(
      AoyingApp(
        session: session,
        live: LiveController(api: api, autoConnect: false),
      ),
    );
    await tester.pump();

    expect(find.text('登录'), findsOneWidget);
    expect(find.text('用户名'), findsOneWidget);
    expect(find.text('密码'), findsOneWidget);
    expect(find.text('进入监控台'), findsOneWidget);
  });

  testWidgets('总览展示仓位与发言，而不是接入状态', (tester) async {
    await _enterShell(tester);

    expect(find.text('未平仓数'), findsOneWidget);
    expect(find.text('32'), findsOneWidget);
    expect(find.text('17'), findsOneWidget);
    expect(find.text('9.5'), findsOneWidget);
    expect(find.text('Telegram 信号账本'), findsOneWidget);
    expect(find.text('最近信号'), findsOneWidget);
    expect(find.text('LIVEBTC'), findsWidgets);
    expect(find.text('总名义仓位'), findsNothing);
    expect(find.text('场所分布'), findsNothing);
    expect(find.text('今日已实现'), findsNothing);
    // 接入状态与增量路线已从总览移除，只在设置页出现。
    expect(find.text('增量路线'), findsNothing);
    expect(find.text('系统骨架已就绪'), findsNothing);
  });

  testWidgets('底部导航在持仓、发言、提醒之间切换', (tester) async {
    await _enterShell(tester);

    await tester.tap(find.text('持仓').last);
    await tester.pumpAndSettle();
    expect(find.text('最近 100 条以内 · 非完整历史'), findsOneWidget);
    expect(find.text('全部'), findsOneWidget);

    await tester.tap(find.text('发言').last);
    await tester.pumpAndSettle();
    expect(find.text('全部来源'), findsOneWidget);

    await tester.tap(find.text('提醒').last);
    await tester.pumpAndSettle();
    expect(find.text('送达通道'), findsOneWidget);
  });

  testWidgets('持仓按状态筛选，生命周期显示累计而非求和', (tester) async {
    await _enterShell(tester);

    await tester.tap(find.text('持仓').last);
    await tester.pumpAndSettle();

    expect(find.text('LIVEBTC'), findsOneWidget);
    expect(find.text('LIVEETH'), findsOneWidget);
    await tester.tap(find.text('当前持仓').first);
    await tester.pumpAndSettle();
    expect(find.text('LIVEETH'), findsNothing);
    await tester.tap(find.text('LIVEBTC'));
    await tester.pumpAndSettle();
    expect(find.textContaining('累计已实现 5'), findsOneWidget);
    expect(find.textContaining('累计已实现 7'), findsWidgets);
    expect(find.textContaining('累计已实现 12'), findsNothing);
    expect(find.textContaining('数量 0'), findsWidgets);
    expect(find.textContaining('开仓价 —'), findsWidgets);
  });

  testWidgets('设置页展示数据源与设备', (tester) async {
    await _enterShell(tester);

    await tester.tap(find.text('设置').last);
    await tester.pumpAndSettle();
    expect(find.text('数据源'), findsOneWidget);
    expect(find.text('Telegram'), findsOneWidget);
    expect(find.text('已登录设备'), findsOneWidget);
    // 5 个数据源
    expect(find.text('未接入'), findsNWidgets(5));
  });
}

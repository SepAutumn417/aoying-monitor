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
  final api = ApiClient(baseUrl: 'http://127.0.0.1:9');
  final session = SessionController.seeded(api: api, user: _user, device: _device);
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
      AoyingApp(session: session, live: LiveController(api: api, autoConnect: false)),
    );
    await tester.pump();

    expect(find.text('登录'), findsOneWidget);
    expect(find.text('用户名'), findsOneWidget);
    expect(find.text('密码'), findsOneWidget);
    expect(find.text('进入监控台'), findsOneWidget);
  });

  testWidgets('总览展示仓位与发言，而不是接入状态', (tester) async {
    await _enterShell(tester);

    expect(find.text('总名义仓位'), findsOneWidget);
    expect(find.text('当前持仓'), findsOneWidget);
    expect(find.text('仓位变化'), findsOneWidget);
    expect(find.text('最新发言'), findsOneWidget);
    expect(find.text('最新提醒'), findsOneWidget);
    expect(find.text('BTCUSDT'), findsWidgets);
    // 接入状态与增量路线已从总览移除，只在设置页出现。
    expect(find.text('增量路线'), findsNothing);
    expect(find.text('系统骨架已就绪'), findsNothing);
  });

  testWidgets('底部导航在持仓、发言、提醒之间切换', (tester) async {
    await _enterShell(tester);

    await tester.tap(find.text('持仓').last);
    await tester.pumpAndSettle();
    expect(find.text('持仓明细'), findsOneWidget);
    expect(find.text('全部'), findsOneWidget);

    await tester.tap(find.text('发言').last);
    await tester.pumpAndSettle();
    expect(find.text('全部来源'), findsOneWidget);

    await tester.tap(find.text('提醒').last);
    await tester.pumpAndSettle();
    expect(find.text('送达通道'), findsOneWidget);
  });

  testWidgets('持仓页按场所筛选', (tester) async {
    await _enterShell(tester);

    await tester.tap(find.text('持仓').last);
    await tester.pumpAndSettle();

    expect(find.text('WIF'), findsOneWidget);
    await tester.tap(find.text('fomo').first);
    await tester.pumpAndSettle();
    expect(find.text('ETHUSDT'), findsNothing);
    expect(find.text('WIF'), findsOneWidget);
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

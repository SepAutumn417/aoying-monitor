import 'package:aoying_monitor/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('login gate opens the monitoring shell', (tester) async {
    await tester.pumpWidget(const AoyingApp());

    expect(find.text('登录'), findsOneWidget);
    expect(find.text('预览骨架'), findsOneWidget);

    await tester.tap(find.text('预览骨架'));
    await tester.pumpAndSettle();

    expect(find.text('监控总览'), findsOneWidget);
    expect(find.text('系统骨架已就绪'), findsOneWidget);
  });

  testWidgets('bottom navigation switches between tabs', (tester) async {
    await tester.pumpWidget(const AoyingApp());
    await tester.tap(find.text('预览骨架'));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.timeline_outlined));
    await tester.pumpAndSettle();
    expect(find.text('事件时间线'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.account_balance_wallet_outlined));
    await tester.pumpAndSettle();
    expect(find.text('持仓与仓位变化'), findsOneWidget);
  });
}

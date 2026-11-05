import 'package:flutter/material.dart';

import '../app_scope.dart';
import '../live.dart';
import '../theme.dart';
import 'alerts_screen.dart';
import 'dashboard_screen.dart';
import 'positions_screen.dart';
import 'settings_screen.dart';
import 'timeline_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.initialIndex = 0});

  /// 预留深链入口（通知点进来直接落到某个栏目）。
  final int initialIndex;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late int _index = widget.initialIndex.clamp(0, _screens.length - 1);
  LiveController? _live;

  static const _screens = <Widget>[
    DashboardScreen(),
    PositionsScreen(),
    TimelineScreen(),
    AlertsScreen(),
    SettingsScreen(),
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final live = AppScope.liveOf(context);
    if (!identical(live, _live)) {
      _live = live;
      live.start();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const Row(
          children: [
            Icon(Icons.monitor_heart_outlined, size: 18, color: AppColors.signal),
            SizedBox(width: 8),
            Text('熬鹰监控'),
          ],
        ),
        actions: [
          if (_live != null)
            AnimatedBuilder(
              animation: _live!,
              builder: (context, _) => Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _live!.status == LiveStatus.live
                            ? AppColors.signal
                            : _live!.status == LiveStatus.offline
                            ? AppColors.danger
                            : AppColors.amber,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      switch (_live!.status) {
                        LiveStatus.live => '实时连接',
                        LiveStatus.connecting => '连接中',
                        LiveStatus.retrying => '重连中',
                        LiveStatus.offline => '未连接',
                        LiveStatus.idle => '待连接',
                      },
                      style: const TextStyle(color: AppColors.mist, fontSize: 10),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: '总览',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: '持仓',
          ),
          NavigationDestination(
            icon: Icon(Icons.forum_outlined),
            selectedIcon: Icon(Icons.forum),
            label: '发言',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_none),
            selectedIcon: Icon(Icons.notifications),
            label: '提醒',
          ),
          NavigationDestination(
            icon: Icon(Icons.tune_outlined),
            selectedIcon: Icon(Icons.tune),
            label: '设置',
          ),
        ],
      ),
    );
  }
}

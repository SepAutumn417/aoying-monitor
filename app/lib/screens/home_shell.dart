import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/status_chip.dart';
import 'alerts_screen.dart';
import 'dashboard_screen.dart';
import 'positions_screen.dart';
import 'settings_screen.dart';
import 'timeline_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _screens = <Widget>[
    DashboardScreen(),
    TimelineScreen(),
    PositionsScreen(),
    AlertsScreen(),
    SettingsScreen(),
  ];

  static const _titles = <String>['总览', '时间线', '持仓', '告警', '设置'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            const Icon(Icons.monitor_heart_outlined, size: 18, color: AppColors.signal),
            const SizedBox(width: 8),
            const Text('熬鹰监控'),
            const SizedBox(width: 8),
            Text(
              _titles[_index],
              style: const TextStyle(
                color: AppColors.mist,
                fontSize: 11,
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Center(child: StatusChip(label: 'I0 骨架')),
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
            icon: Icon(Icons.timeline_outlined),
            selectedIcon: Icon(Icons.timeline),
            label: '时间线',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: '持仓',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_none),
            selectedIcon: Icon(Icons.notifications),
            label: '告警',
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

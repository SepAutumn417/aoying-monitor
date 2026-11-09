import 'package:flutter/material.dart';

import '../app_scope.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/ledger_widgets.dart';

class PositionsScreen extends StatefulWidget {
  const PositionsScreen({super.key});
  @override
  State<PositionsScreen> createState() => _PositionsScreenState();
}

class _PositionsScreenState extends State<PositionsScreen> {
  String _filter = '全部';
  @override
  Widget build(BuildContext context) {
    final controller = AppScope.of(context).ledger;
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final snapshot = controller.snapshot;
        final rows =
            snapshot?.positions
                .where(
                  (p) =>
                      _filter == '全部' ||
                      p.status == (_filter == '当前持仓' ? 'open' : 'closed'),
                )
                .toList() ??
            [];
        return RefreshIndicator(
          onRefresh: controller.reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              PageHeader(
                title: '持仓',
                action: IconButton(
                  tooltip: '刷新账本',
                  onPressed: controller.reload,
                  icon: const Icon(Icons.refresh),
                ),
              ),
              LedgerSource(controller: controller),
              const Text(
                '最近 100 条以内 · 非完整历史',
                style: TextStyle(color: AppColors.mist, fontSize: 12),
              ),
              const SizedBox(height: 8),
              FilterChipRow(
                options: const ['全部', '当前持仓', '历史已平仓'],
                value: _filter,
                onChanged: (value) => setState(() => _filter = value),
              ),
              const SizedBox(height: 12),
              if (snapshot != null)
                LedgerSection(
                  title: '持仓明细 · 本页 ${rows.length} 条',
                  children: [
                    const Text(
                      '按开仓时间倒序 · 已实现均为累计值（USDT）',
                      style: TextStyle(color: AppColors.mist, fontSize: 11),
                    ),
                    if (rows.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Text('暂无符合条件的仓位'),
                      ),
                    for (final p in rows) LedgerPositionTile(position: p),
                  ],
                ),
            ],
          ),
        );
      },
    );
  }
}

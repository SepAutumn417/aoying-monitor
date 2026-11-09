import 'package:flutter/material.dart';

import '../app_scope.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/ledger_widgets.dart';
import '../widgets/section_card.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final controller = AppScope.of(context).ledger;
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final snapshot = controller.snapshot;
        final status = snapshot?.status;
        final positions =
            snapshot?.positions
                .where((p) => p.status == 'open')
                .take(5)
                .toList() ??
            [];
        final stats = <(String, String)>[
          ('未平仓数', ledgerNumber(status?.positionsOpen)),
          ('已平仓数', ledgerNumber(status?.positionsClosed)),
          ('已平仓累计已实现（USDT）', ledgerNumber(status?.realizedClosed)),
          ('最后信号时间', ledgerTime(status?.lastSignalAt)),
        ];
        return RefreshIndicator(
          onRefresh: controller.reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              PageHeader(
                title: '总览',
                action: IconButton(
                  tooltip: '刷新账本',
                  onPressed: controller.reload,
                  icon: const Icon(Icons.refresh),
                ),
              ),
              LedgerSource(controller: controller),
              LayoutBuilder(
                builder: (context, constraints) {
                  final columns = constraints.maxWidth > 620 ? 4 : 2;
                  return Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final stat in stats)
                        SizedBox(
                          width:
                              (constraints.maxWidth - 8 * (columns - 1)) /
                              columns,
                          child: SectionCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  stat.$1,
                                  style: const TextStyle(
                                    color: AppColors.mist,
                                    fontSize: 11,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  stat.$2,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 12),
              if (snapshot != null) ...[
                LedgerSection(
                  title: '当前持仓',
                  children: [
                    const Text(
                      '最近 100 条账本内的未平仓预览 · 最多显示 5 条',
                      style: TextStyle(color: AppColors.mist, fontSize: 11),
                    ),
                    if (positions.isEmpty) const Text('最近账本中暂无未平仓记录'),
                    for (final p in positions) LedgerPositionTile(position: p),
                  ],
                ),
                LedgerSection(
                  title: '最近信号',
                  children: [
                    const Text(
                      '最多 20 条 · 按来源发布时间排序',
                      style: TextStyle(color: AppColors.mist, fontSize: 11),
                    ),
                    if (snapshot.signals.isEmpty) const Text('暂无信号'),
                    for (final signal in snapshot.signals)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          '${signal.symbol} · ${ledgerSide(signal.side)} · ${signal.action}',
                          style: const TextStyle(fontSize: 12),
                        ),
                        subtitle: Text(
                          '发布时间 ${ledgerTime(signal.postedAt)}\n报送时间 ${ledgerTime(signal.reportedAt)}\n数量 ${ledgerNumber(signal.qty)} · 报送开仓价 ${ledgerNumber(signal.entry)}\n累计已实现 ${ledgerNumber(signal.realized)} USDT',
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                  ],
                ),
              ] else if (!controller.loading && controller.error == null)
                const Text('登录后加载信号账本'),
            ],
          ),
        );
      },
    );
  }
}

import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class PositionsScreen extends StatelessWidget {
  const PositionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        const PageHeader(
          eyebrow: 'POSITIONS / 持仓',
          title: '持仓与仓位变化',
          subtitle: 'OKX 实盘、fomo 链上、Binance（TG 推断）分开展示，不做跨场所净额；每个仓位都带来源与置信度。',
        ),
        const SizedBox(height: 16),
        Row(
          children: const [
            Expanded(child: _MetricCard(label: '未实现 PnL', value: '—')),
            SizedBox(width: 8),
            Expanded(child: _MetricCard(label: '今日已实现', value: '—')),
            SizedBox(width: 8),
            Expanded(child: _MetricCard(label: '当前仓位', value: '0')),
          ],
        ),
        const SizedBox(height: 14),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('当前仓位', style: Theme.of(context).textTheme.titleMedium),
                  const Spacer(),
                  const StatusChip(label: '0 ROWS'),
                ],
              ),
              const SizedBox(height: 12),
              const EmptyState(
                icon: Icons.account_balance_wallet_outlined,
                title: '还没有持仓',
                description: 'I3 先接入 Binance（TG 推断），I4/I5 再接入 OKX 与 fomo 链上。',
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          '提示：TG 推断的仓位会标注“推断”，不会伪装成交易所原始数据。',
          style: TextStyle(color: AppColors.mist, fontSize: 10, height: 1.5),
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: AppColors.mist, fontSize: 9, letterSpacing: 0.4),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          const Text(
            '接入后统计',
            style: TextStyle(color: AppColors.mist, fontSize: 8),
          ),
        ],
      ),
    );
  }
}

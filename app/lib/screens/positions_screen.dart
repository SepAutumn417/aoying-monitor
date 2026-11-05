import 'package:flutter/material.dart';

import '../data/demo.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class PositionsScreen extends StatefulWidget {
  const PositionsScreen({super.key});

  @override
  State<PositionsScreen> createState() => _PositionsScreenState();
}

class _PositionsScreenState extends State<PositionsScreen> {
  String _venue = '全部';

  static const _venues = ['全部', '币安', 'OKX', 'fomo'];

  @override
  Widget build(BuildContext context) {
    final rows = (_venue == '全部'
            ? demoPositions
            : demoPositions.where((p) => p.venue == _venue).toList())
        .toList()
      ..sort((a, b) => b.notional.compareTo(a.notional));
    final notional = rows.fold(0.0, (sum, p) => sum + p.notional);
    final pnl = rows.fold(
      0.0,
      (sum, p) => sum + p.notional * p.pnlPct / 100 / (p.leverage ?? 1),
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHeader(
          title: '持仓',
          meta: '${rows.length} 个 · ${_compact(notional)}',
          action: const DemoBadge(),
        ),
        FilterChipRow(
          options: _venues,
          value: _venue,
          onChanged: (value) => setState(() => _venue = value),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _Summary(label: '名义价值', value: _compact(notional)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _Summary(
                label: '未实现盈亏',
                value: '${pnl >= 0 ? '+' : ''}${_compact(pnl)}',
                tone: pnl >= 0 ? AppColors.signal : AppColors.danger,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.border)),
                ),
                child: Row(
                  children: [
                    Text('持仓明细', style: Theme.of(context).textTheme.titleMedium),
                    const Spacer(),
                    const Text('按名义价值', style: TextStyle(color: AppColors.mist, fontSize: 10)),
                  ],
                ),
              ),
              for (final p in rows) _PositionRow(position: p),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.border)),
                ),
                child: Row(
                  children: [
                    Text('今日仓位变化', style: Theme.of(context).textTheme.titleMedium),
                    const Spacer(),
                    Text('$demoChangesToday 次',
                        style: const TextStyle(color: AppColors.mist, fontSize: 10)),
                  ],
                ),
              ),
              for (final change in demoChanges) _ChangeRow(change: change),
            ],
          ),
        ),
      ],
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.label, required this.value, this.tone});

  final String label;
  final String value;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.mist, fontSize: 11)),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: tone ?? Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _PositionRow extends StatelessWidget {
  const _PositionRow({required this.position});

  final DemoPosition position;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StatusChip(label: position.venue, tone: StatusTone.pending),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      position.symbol,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      position.leverage == null
                          ? position.side
                          : '${position.side} ${position.leverage}x',
                      style: const TextStyle(color: AppColors.mist, fontSize: 10),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '开仓 ${_price(position.entry)} · 标记 ${_price(position.mark)} · ${position.confidence}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.mist, fontSize: 10),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _compact(position.notional),
                style: const TextStyle(color: AppColors.mistBright, fontSize: 11),
              ),
              const SizedBox(height: 3),
              Text(
                '${position.pnlPct >= 0 ? '+' : ''}${position.pnlPct.toStringAsFixed(2)}%',
                style: TextStyle(
                  color: position.pnlPct >= 0 ? AppColors.signal : AppColors.danger,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChangeRow extends StatelessWidget {
  const _ChangeRow({required this.change});

  final DemoChange change;

  @override
  Widget build(BuildContext context) {
    final tone = switch (change.action) {
      '新开' || '加仓' => AppColors.signal,
      '减仓' => AppColors.amber,
      _ => AppColors.mistBright,
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      child: Row(
        children: [
          SizedBox(
            width: 38,
            child: Text(change.time,
                style: const TextStyle(color: AppColors.mist, fontSize: 10)),
          ),
          SizedBox(
            width: 34,
            child: Text(
              change.action,
              style: TextStyle(color: tone, fontSize: 11, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: Text(
              '${change.venue} · ${change.symbol}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontSize: 11),
            ),
          ),
          Text(
            change.amount,
            style: const TextStyle(color: AppColors.mistBright, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

String _compact(double value) {
  final abs = value.abs();
  if (abs >= 1000000) return '\$${(value / 1000000).toStringAsFixed(2)}M';
  if (abs >= 1000) return '\$${(value / 1000).toStringAsFixed(1)}K';
  return '\$${value.toStringAsFixed(0)}';
}

String _price(double value) {
  if (value >= 1000) {
    return value
        .toStringAsFixed(0)
        .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
  }
  return value.toStringAsFixed(value >= 10 ? 1 : 3);
}

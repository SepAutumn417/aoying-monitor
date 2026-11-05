import 'package:flutter/material.dart';

import '../data/demo.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHeader(
          title: '总览',
          meta: '最后更新 $demoUpdatedAt',
          action: const DemoBadge(),
        ),
        const _KpiGrid(),
        const SizedBox(height: 10),
        const _AllocationCard(),
        const SizedBox(height: 12),
        const SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardHead(title: '当前持仓', trailing: '7 个'),
              _PositionTable(),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardHead(title: '仓位变化', trailing: '今日 $demoChangesToday 次'),
              for (final change in demoChanges) _ChangeRow(change: change),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardHead(title: '最新发言', trailing: 'TG · X'),
              _StatementList(),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardHead(title: '最新提醒', trailing: '全部已送达'),
              _AlertList(),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const _WatchCard(),
      ],
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid();

  @override
  Widget build(BuildContext context) {
    final positive = demoUnrealized >= 0;
    final cards = <(String, String, String, Color)>[
      (
        '总名义仓位',
        _compact(demoTotalNotional),
        '${demoPositions.length} 个持仓 · 3 个场所',
        Colors.white,
      ),
      (
        '未实现盈亏',
        '${positive ? '+' : ''}${_compact(demoUnrealized)}',
        '按标记价',
        positive ? AppColors.signal : AppColors.danger,
      ),
      (
        '今日已实现',
        '+${_compact(demoRealizedToday)}',
        '含已平仓 2 笔',
        AppColors.signal,
      ),
      ('今日仓位变化', '$demoChangesToday', '最近 5 次在下方', Colors.white),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 620 ? 4 : 2;
        final width = (constraints.maxWidth - 8 * (columns - 1)) / columns;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final card in cards)
              SizedBox(
                width: width,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
                  decoration: BoxDecoration(
                    color: AppColors.panel,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        card.$1,
                        style: const TextStyle(color: AppColors.mist, fontSize: 11),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        card.$2,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: card.$4,
                          fontSize: 19,
                          fontWeight: FontWeight.w600,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        card.$3,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.mist, fontSize: 10),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _AllocationCard extends StatelessWidget {
  const _AllocationCard();

  static const _bars = <String, Color>{
    '币安': AppColors.amber,
    'OKX': AppColors.mist,
    'fomo': AppColors.signal,
  };

  @override
  Widget build(BuildContext context) {
    final allocation = demoAllocation;
    final total = allocation.values.fold(0.0, (a, b) => a + b);

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Text('场所分布', style: TextStyle(color: AppColors.mist, fontSize: 11)),
              Spacer(),
              Text('按名义价值', style: TextStyle(color: AppColors.mist, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              height: 7,
              child: Row(
                children: [
                  for (final entry in allocation.entries)
                    Expanded(
                      flex: ((entry.value / total) * 1000).round(),
                      child: Container(color: _bars[entry.key]),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 4,
            children: [
              for (final entry in allocation.entries)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 7, height: 7, color: _bars[entry.key]),
                    const SizedBox(width: 5),
                    Text(
                      '${entry.key} ${_compact(entry.value)}',
                      style: const TextStyle(color: AppColors.mist, fontSize: 10),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${((entry.value / total) * 100).round()}%',
                      style: const TextStyle(color: AppColors.mistBright, fontSize: 10),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PositionTable extends StatelessWidget {
  const _PositionTable();

  @override
  Widget build(BuildContext context) {
    final rows = [...demoPositions]..sort((a, b) => b.notional.compareTo(a.notional));

    // 窄屏优先：每个持仓一行两段，左侧场所/币种/方向，右侧名义/盈亏，
    // 开仓与标记价放第二行明细，避免横向滚动把列挤出屏幕。
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0)
            const Divider(height: 1, thickness: 1, color: AppColors.border),
          _PositionRow(position: rows[i]),
        ],
      ],
    );
  }
}

class _PositionRow extends StatelessWidget {
  const _PositionRow({required this.position});

  final DemoPosition position;

  @override
  Widget build(BuildContext context) {
    final long = position.side == '多';

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 9, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StatusChip(label: position.venue, tone: StatusTone.pending),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  position.symbol,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                position.leverage == null
                    ? position.side
                    : '${position.side} ${position.leverage}x',
                style: TextStyle(
                  color: long ? AppColors.signal : AppColors.amber,
                  fontSize: 10,
                ),
              ),
              const Spacer(),
              Text(
                _compact(position.notional),
                style: const TextStyle(color: AppColors.mistBright, fontSize: 11),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 54,
                child: Text(
                  '${position.pnlPct >= 0 ? '+' : ''}${position.pnlPct.toStringAsFixed(2)}%',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    color: position.pnlPct >= 0 ? AppColors.signal : AppColors.danger,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
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
            child: Text(
              change.time,
              style: const TextStyle(color: AppColors.mist, fontSize: 10),
            ),
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
            style: const TextStyle(
              color: AppColors.mistBright,
              fontSize: 11,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatementList extends StatelessWidget {
  const _StatementList();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final item in demoStatements.take(4)) _StatementRow(item: item),
      ],
    );
  }
}

class _StatementRow extends StatelessWidget {
  const _StatementRow({required this.item});

  final DemoStatement item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 26,
            child: Text(
              item.source,
              style: TextStyle(
                color: item.source == 'TG' ? AppColors.signal : AppColors.mistBright,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.mistBright,
                    fontSize: 11,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${item.channel} · ${item.time} · ${item.kind}',
                  style: const TextStyle(color: AppColors.mist, fontSize: 10),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AlertList extends StatelessWidget {
  const _AlertList();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final alert in demoAlerts.take(4)) _AlertRow(alert: alert),
      ],
    );
  }
}

class _AlertRow extends StatelessWidget {
  const _AlertRow({required this.alert});

  final DemoAlert alert;

  @override
  Widget build(BuildContext context) {
    final tone = switch (alert.level) {
      '高' => AppColors.amber,
      '中' => AppColors.mistBright,
      _ => AppColors.mist,
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 20,
            child: Text(
              alert.level,
              style: TextStyle(color: tone, fontSize: 10, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  alert.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 11),
                ),
                const SizedBox(height: 2),
                Text(
                  alert.detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.mist, fontSize: 10),
                ),
                const SizedBox(height: 2),
                Text(
                  '${alert.channel} · ${alert.state}',
                  style: const TextStyle(color: AppColors.mist, fontSize: 10),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WatchCard extends StatelessWidget {
  const _WatchCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('关注标的', style: TextStyle(color: AppColors.mist, fontSize: 11)),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final item in demoWatchlist)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.symbol,
                        style: const TextStyle(color: AppColors.mistBright, fontSize: 11),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.price,
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                      ),
                      Text(
                        '${item.change >= 0 ? '+' : ''}${item.change.toStringAsFixed(2)}%',
                        style: TextStyle(
                          color: item.change >= 0 ? AppColors.signal : AppColors.danger,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CardHead extends StatelessWidget {
  const _CardHead({required this.title, required this.trailing});

  final String title;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const Spacer(),
          Text(trailing, style: const TextStyle(color: AppColors.mist, fontSize: 10)),
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

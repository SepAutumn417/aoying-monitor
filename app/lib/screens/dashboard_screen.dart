import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  static const _sources = [
    ('Telegram', '4 个会话 · 仓位/观点/互动', 'I2 接入'),
    ('Binance（TG 推断）', '从群消息/截图抽取仓位', 'I3 接入'),
    ('OKX 实盘', '只读 API · Orbit 持仓', 'I4 接入'),
    ('fomo 链上', 'Solana / Base 钱包', 'I5 接入'),
  ];

  static const _roadmap = [
    ('I0', '规格与脚手架', '当前', StatusTone.ok),
    ('I1', '登录 + 设备 + 实时通道', '下一步', StatusTone.pending),
    ('I2', 'Telegram + 时间线', '待开始', StatusTone.pending),
    ('I3', 'Binance 抽取 + 安卓通知', '待开始', StatusTone.pending),
    ('I4–I6', 'OKX / fomo / X', '待开始', StatusTone.pending),
    ('I7–I8', '可靠性 / 上线 soak', '待开始', StatusTone.pending),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        const PageHeader(
          eyebrow: 'OVERVIEW / 总览',
          title: '监控总览',
          subtitle: '熬鹰资本的交易动作与公开发言，最终会汇入同一条时间线。当前是 I0 骨架，先把三端跑通，再逐个接入数据源。',
        ),
        const SizedBox(height: 16),
        const _HeroCard(),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = (constraints.maxWidth - 10) / 2;
            return Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final (name, detail, stage) in _sources)
                  SizedBox(width: width, child: _SourceCard(name: name, detail: detail, stage: stage)),
              ],
            );
          },
        ),
        const SizedBox(height: 18),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('最新事件', style: Theme.of(context).textTheme.titleMedium),
                  const Spacer(),
                  const Icon(Icons.layers_outlined, size: 18, color: AppColors.mist),
                ],
              ),
              const SizedBox(height: 14),
              const EmptyState(
                icon: Icons.inbox_outlined,
                title: '还没有事件',
                description: 'I2 接入 Telegram 后，这里会按时间倒序出现消息、仓位变化和告警；点击可查看原始证据。',
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('增量路线', style: Theme.of(context).textTheme.titleMedium),
                  const Spacer(),
                  const Icon(Icons.arrow_outward, size: 18, color: AppColors.mist),
                ],
              ),
              const SizedBox(height: 10),
              for (final (id, label, state, tone) in _roadmap)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 42,
                        child: Text(
                          id,
                          style: const TextStyle(
                            color: AppColors.mist,
                            fontSize: 10,
                            letterSpacing: 1.0,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          label,
                          style: const TextStyle(color: AppColors.mistBright, fontSize: 12),
                        ),
                      ),
                      StatusChip(label: state, tone: tone),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.signal.withValues(alpha: 0.10),
            AppColors.panel,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.signal.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.verified_user_outlined, size: 16, color: AppColors.signal),
              SizedBox(width: 7),
              Text(
                'SYSTEM SKELETON',
                style: TextStyle(
                  color: AppColors.signal,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('系统骨架已就绪', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(
            'React Web、FastAPI 后端、Flutter Android 三段骨架已经落位。接下来先做登录与实时通道，再按增量接入数据源。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _Metric(value: '3', label: '端骨架'),
              const SizedBox(width: 8),
              _Metric(value: '0', label: '数据源'),
              const SizedBox(width: 8),
              _Metric(value: '1', label: '当前增量'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.ink.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: const TextStyle(color: AppColors.mist, fontSize: 9, letterSpacing: 0.8),
            ),
          ],
        ),
      ),
    );
  }
}

class _SourceCard extends StatelessWidget {
  const _SourceCard({required this.name, required this.detail, required this.stage});

  final String name;
  final String detail;
  final String stage;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            detail,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.mist, fontSize: 10, height: 1.45),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              StatusChip(label: stage),
              const Spacer(),
              const Text(
                '—',
                style: TextStyle(color: AppColors.mist, fontSize: 14),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

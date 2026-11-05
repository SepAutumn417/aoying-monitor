import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class TimelineScreen extends StatelessWidget {
  const TimelineScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        const PageHeader(
          eyebrow: 'TIMELINE / 时间线',
          title: '事件时间线',
          subtitle: 'Telegram、X、OKX、链上事件最终统一到这里。I0 先放筛选与空状态，I2 起接入真实消息。',
        ),
        const SizedBox(height: 16),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const TextField(
                decoration: InputDecoration(
                  hintText: '搜索币种、原文、地址或事件 ID',
                  prefixIcon: Icon(Icons.search, size: 18),
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final label in ['全部来源', '全部币种', '全部类型', '最近 24h'])
                    _FilterPill(label: label),
                ],
              ),
              const SizedBox(height: 16),
              const EmptyState(
                icon: Icons.radar_outlined,
                title: '时间线还没有数据',
                description: 'I2 会先接入 4 个 Telegram 会话；届时这里按时间倒序显示原始消息、抽取结果和仓位事件，并支持断线补拉。',
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const Row(
          children: [
            StatusChip(label: 'I2 接入', tone: StatusTone.pending),
            SizedBox(width: 8),
            Text(
              '断线补拉 · 编辑/删除归档',
              style: TextStyle(color: AppColors.mist, fontSize: 10),
            ),
          ],
        ),
      ],
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.ink.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        label,
        style: const TextStyle(color: AppColors.mistBright, fontSize: 11),
      ),
    );
  }
}

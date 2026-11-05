import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        const PageHeader(
          eyebrow: 'ALERTS / 告警',
          title: '告警与送达',
          subtitle: 'Android 在线时走自建 WebSocket；App 离线或 30 秒未确认时，critical 事件降级到企业微信/邮件。',
        ),
        const SizedBox(height: 16),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('最近告警', style: Theme.of(context).textTheme.titleMedium),
                  const Spacer(),
                  const Icon(Icons.notifications_off_outlined, size: 18, color: AppColors.mist),
                ],
              ),
              const SizedBox(height: 14),
              const EmptyState(
                icon: Icons.notifications_none,
                title: '还没有告警',
                description: 'I3 接入仓位事件后，这里会显示每次提醒的通道、送达状态和确认时间。',
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('送达通道', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              const _ChannelRow(name: 'Android App', detail: '主通道 · WebSocket + 本地通知', state: '待 I1'),
              const _ChannelRow(name: '企业微信', detail: '兜底 · critical 事件', state: '待配置'),
              const _ChannelRow(name: '邮件', detail: '日报 / 严重告警', state: '待配置'),
              const SizedBox(height: 8),
              Text(
                '告警去重与合并规则在 I3 实现，避免刷屏。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ChannelRow extends StatelessWidget {
  const _ChannelRow({required this.name, required this.detail, required this.state});

  final String name;
  final String detail;
  final String state;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(color: AppColors.mistBright, fontSize: 12)),
                const SizedBox(height: 2),
                Text(detail, style: const TextStyle(color: AppColors.mist, fontSize: 10)),
              ],
            ),
          ),
          Text(state, style: const TextStyle(color: AppColors.mist, fontSize: 10)),
        ],
      ),
    );
  }
}

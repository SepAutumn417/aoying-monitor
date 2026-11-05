import 'package:flutter/material.dart';

import '../data/demo.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  String _level = '全部等级';

  static const _levels = ['全部等级', '高', '中', '低'];

  @override
  Widget build(BuildContext context) {
    final rows = _level == '全部等级'
        ? demoAlerts
        : demoAlerts.where((a) => a.level == _level).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHeader(
          title: '提醒',
          meta: '${rows.length} 条',
          action: const DemoBadge(),
        ),
        FilterChipRow(
          options: _levels,
          value: _level,
          onChanged: (value) => setState(() => _level = value),
        ),
        const SizedBox(height: 10),
        SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0)
                  const Divider(height: 1, thickness: 1, color: AppColors.border),
                _AlertRow(alert: rows[i]),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('送达通道', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              const _ChannelRow(name: 'Android App', detail: '主通道 · WebSocket + 本地通知', state: '未接入'),
              const _ChannelRow(name: '企业微信', detail: '兜底 · 仅 critical', state: '待配置'),
              const _ChannelRow(name: '邮件', detail: '日报 / 严重告警', state: '待配置'),
            ],
          ),
        ),
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
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 30,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  alert.level,
                  style: TextStyle(color: tone, fontSize: 11, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  alert.time,
                  style: const TextStyle(color: AppColors.mist, fontSize: 10),
                ),
              ],
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  alert.title,
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
                const SizedBox(height: 3),
                Text(
                  alert.detail,
                  style: const TextStyle(color: AppColors.mist, fontSize: 10, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                alert.channel,
                style: const TextStyle(color: AppColors.mistBright, fontSize: 10),
              ),
              const SizedBox(height: 2),
              Text(
                alert.state,
                style: const TextStyle(color: AppColors.mist, fontSize: 10),
              ),
            ],
          ),
        ],
      ),
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

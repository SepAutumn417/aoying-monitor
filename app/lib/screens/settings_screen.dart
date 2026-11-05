import 'package:flutter/material.dart';

import '../config.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  static const _sources = [
    ('Telegram', '4 个会话 · 观点 / 仓位 / 互动'),
    ('币安（TG 推断）', '从群消息与截图抽取仓位'),
    ('OKX 实盘', '只读 API · 持仓与成交'),
    ('fomo 链上', 'Solana / Base 钱包监听'),
    ('X', '专用小号 cookies 轮询'),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        const PageHeader(title: '设置', meta: 'v${AppConfig.appVersion}'),
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
                    Text('数据源', style: Theme.of(context).textTheme.titleMedium),
                    const Spacer(),
                    const Text('5 个来源', style: TextStyle(color: AppColors.mist, fontSize: 10)),
                  ],
                ),
              ),
              for (final (name, detail) in _sources)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: const TextStyle(color: Colors.white, fontSize: 12),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              detail,
                              style: const TextStyle(color: AppColors.mist, fontSize: 10),
                            ),
                          ],
                        ),
                      ),
                      const StatusChip(label: '未接入'),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('提醒阈值', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              const _SettingField(label: '最小仓位变化（%）', value: '1'),
              const _SettingField(label: '最小名义价值（USD）', value: '50'),
              const _SettingField(label: '去重窗口（分钟）', value: '10'),
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: null,
                  child: const Text('接入数据源后可保存'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('设备', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              const _DeviceRow(name: 'Android', detail: '主接收端 · 前台服务 + 本地通知', state: '未接入'),
              const _DeviceRow(name: 'Web', detail: '浏览器访问，无需安装', state: '已可用'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const Row(
          children: [
            StatusChip(label: '只读', tone: StatusTone.ok),
            SizedBox(width: 8),
            Text(
              '不执行任何交易',
              style: TextStyle(color: AppColors.mist, fontSize: 10),
            ),
          ],
        ),
      ],
    );
  }
}

class _SettingField extends StatelessWidget {
  const _SettingField({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: const TextStyle(color: AppColors.mist, fontSize: 11)),
          ),
          Container(
            width: 92,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: AppColors.ink.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.border),
            ),
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.mistBright, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({required this.name, required this.detail, required this.state});

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

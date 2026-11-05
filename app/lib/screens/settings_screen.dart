import 'package:flutter/material.dart';

import '../config.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        const PageHeader(
          eyebrow: 'SETTINGS / 设置',
          title: '系统设置',
          subtitle: '阈值、静默时段、通知通道和设备管理会在 I1/I3/I7 逐步接入；I0 只保留结构。',
        ),
        const SizedBox(height: 16),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.tune, size: 18, color: AppColors.mistBright),
                  const SizedBox(width: 7),
                  Text('仓位提醒阈值', style: Theme.of(context).textTheme.titleMedium),
                ],
              ),
              const SizedBox(height: 14),
              const _SettingField(label: '最小仓位变化（%）', value: '1'),
              const _SettingField(label: '最小名义价值（USD）', value: '50'),
              const _SettingField(label: '去重窗口（分钟）', value: '10'),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: null,
                  icon: const Icon(Icons.save_outlined, size: 16),
                  label: const Text('I3 后启用保存'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('设备与版本', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              _DeviceRow(
                name: 'Web',
                detail: 'Windows 用 Chrome/Edge 打开；无需安装。',
                state: 'v${AppConfig.appVersion} · 本地',
              ),
              const _DeviceRow(
                name: 'Android',
                detail: 'Flutter APK；前台服务 + 本地通知。',
                state: 'I1 接入',
              ),
              const SizedBox(height: 6),
              Text(
                '当前为 I0 骨架，所有设置仅展示，不会保存。真实配置在 I1 起逐步接通。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const Row(
          children: [
            StatusChip(label: 'READ-ONLY', tone: StatusTone.ok),
            SizedBox(width: 8),
            Text(
              '只读监控 · 不执行交易',
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
      child: TextField(
        enabled: false,
        controller: TextEditingController(text: value),
        decoration: InputDecoration(labelText: label),
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
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.ink.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: AppColors.border),
      ),
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

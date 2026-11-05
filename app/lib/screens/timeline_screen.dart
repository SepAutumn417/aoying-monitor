import 'package:flutter/material.dart';

import '../data/demo.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key});

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  String _source = '全部来源';

  static const _sources = ['全部来源', 'TG', 'X'];

  @override
  Widget build(BuildContext context) {
    final rows = _source == '全部来源'
        ? demoStatements
        : demoStatements.where((s) => s.source == _source).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHeader(
          title: '发言',
          meta: '${rows.length} 条',
          action: const DemoBadge(),
        ),
        FilterChipRow(
          options: _sources,
          value: _source,
          onChanged: (value) => setState(() => _source = value),
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
                _StatementRow(item: rows[i]),
              ],
            ],
          ),
        ),
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
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: (item.source == 'TG' ? AppColors.signal : AppColors.mistBright)
                      .withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  item.source,
                  style: TextStyle(
                    color: item.source == 'TG' ? AppColors.signal : AppColors.mistBright,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  item.channel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.mist, fontSize: 11),
                ),
              ),
              Text(
                item.time,
                style: const TextStyle(color: AppColors.mist, fontSize: 10),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            item.text,
            style: const TextStyle(
              color: AppColors.mistBright,
              fontSize: 12,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 7),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              for (final tag in item.tags)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    tag,
                    style: const TextStyle(color: AppColors.mist, fontSize: 10),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

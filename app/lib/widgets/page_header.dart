import 'package:flutter/material.dart';

import '../theme.dart';

class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.title,
    this.meta,
    this.action,
  });

  final String title;
  final String? meta;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(title, style: Theme.of(context).textTheme.headlineSmall),
          if (meta != null) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                meta!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.mist, fontSize: 11),
              ),
            ),
          ] else
            const Spacer(),
          ?action,
        ],
      ),
    );
  }
}

/// 紧凑筛选胶囊，用于持仓/发言/提醒的过滤条。
class FilterChipRow extends StatelessWidget {
  const FilterChipRow({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<String> options;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, index) {
          final option = options[index];
          final active = option == value;
          return GestureDetector(
            onTap: () => onChanged(option),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: active
                    ? AppColors.signal.withValues(alpha: 0.12)
                    : AppColors.ink.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: active
                      ? AppColors.signal.withValues(alpha: 0.35)
                      : AppColors.border,
                ),
              ),
              child: Text(
                option,
                style: TextStyle(
                  color: active ? AppColors.signal : AppColors.mistBright,
                  fontSize: 11,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

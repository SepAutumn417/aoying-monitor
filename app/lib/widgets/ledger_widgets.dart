import 'package:flutter/material.dart';

import '../ledger.dart';
import '../ledger_models.dart';
import '../theme.dart';
import 'section_card.dart';

String ledgerNumber(num? value) =>
    value == null ? '—' : '$value'.replaceFirst(RegExp(r'\.0$'), '');
String ledgerTime(DateTime? value) => value == null
    ? '—'
    : value.toLocal().toIso8601String().split('.').first.replaceFirst('T', ' ');
String ledgerSide(String value) => switch (value) {
  'long' => '多',
  'short' => '空',
  _ => value,
};

class LedgerSource extends StatelessWidget {
  const LedgerSource({super.key, required this.controller});
  final LedgerController controller;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Telegram 信号账本', style: TextStyle(color: AppColors.signal)),
        Text(
          '最后来源更新（最后信号） ${ledgerTime(controller.snapshot?.status.lastSignalAt)}',
          style: const TextStyle(color: AppColors.mist, fontSize: 11),
        ),
        const Text(
          '被监控交易员报送数据 · 非我方余额 / 实时行情 / 交易所对账',
          style: TextStyle(color: AppColors.mist, fontSize: 11),
        ),
        if (controller.loading) const LinearProgressIndicator(minHeight: 2),
        if (controller.error != null) ...[
          Text(
            controller.snapshot == null
                ? '账本加载失败：${controller.error}'
                : '刷新失败，当前为过期数据：${controller.error}',
            style: const TextStyle(color: AppColors.amber),
          ),
          TextButton(onPressed: controller.reload, child: const Text('重试')),
        ],
      ],
    ),
  );
}

class LedgerSection extends StatelessWidget {
  const LedgerSection({super.key, required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    ),
  );
}

class LedgerPositionTile extends StatelessWidget {
  const LedgerPositionTile({super.key, required this.position});
  final LedgerPosition position;
  @override
  Widget build(BuildContext context) {
    final p = position;
    return ExpansionTile(
      key: PageStorageKey('ledger-position-${p.id}'),
      tilePadding: EdgeInsets.zero,
      title: Text(
        p.symbol,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        '${ledgerSide(p.side)} · ${p.status == 'open' ? '未平仓' : '已平仓'} · 杠杆 ${ledgerNumber(p.lev)}\n开仓价 ${ledgerNumber(p.entry)} · 数量 ${ledgerNumber(p.qtyCurrent)}\n累计已实现 ${ledgerNumber(p.realized)} USDT\n开仓 ${ledgerTime(p.openedAt)}\n平仓 ${ledgerTime(p.closedAt)}',
        style: const TextStyle(fontSize: 11, color: AppColors.mistBright),
      ),
      children: [
        const Text(
          '事件生命周期 · 每条已实现均为累计值，不相加',
          style: TextStyle(fontSize: 11, color: AppColors.mist),
        ),
        if (p.events.isEmpty)
          const Padding(padding: EdgeInsets.all(12), child: Text('暂无事件')),
        for (final e in p.events)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              '${e.kind} · ${ledgerTime(e.at)}',
              style: const TextStyle(fontSize: 12),
            ),
            subtitle: Text(
              '数量 ${ledgerNumber(e.qtyBefore)} → ${ledgerNumber(e.qtyAfter)}\n报送开仓价 ${ledgerNumber(e.entry)} · 报送标记价 ${ledgerNumber(e.mark)}\n报送浮盈 ${ledgerNumber(e.floating)} USDT\n累计已实现 ${ledgerNumber(e.realized)} USDT',
              style: const TextStyle(fontSize: 11),
            ),
          ),
      ],
    );
  }
}

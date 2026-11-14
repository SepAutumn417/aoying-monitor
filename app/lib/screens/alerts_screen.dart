import 'package:flutter/material.dart';

import '../alerts.dart';
import '../app_scope.dart';
import '../live.dart';
import '../signals.dart';
import '../sound.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  SignalAction? _filter;
  AlertController? _alerts;
  bool _markedRead = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _alerts = AppScope.alertsOf(context);
    // Opening this tab is the user reading the feed.
    if (!_markedRead) {
      _markedRead = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _alerts?.markRead();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _alerts;
    if (controller == null) return const SizedBox.shrink();

    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final all = controller.alerts;
        final rows = _filter == null
            ? all
            : all.where((alert) => alert.action == _filter).toList();

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            PageHeader(
              title: '信号提醒',
              meta: '${rows.length} 条',
              action: controller.live.usesNativeMonitor
                  ? null
                  : _MuteButton(controller: controller),
            ),
            _FilterBar(
              value: _filter,
              counts: countByAction(all),
              onChanged: (value) => setState(() => _filter = value),
            ),
            const SizedBox(height: 10),
            if (controller.soundBlocked) ...[
              const _Notice(
                icon: Icons.volume_off_outlined,
                text: '系统拒绝了播放声音，请检查手机静音键或通知权限。信号仍会显示在这里。',
              ),
              const SizedBox(height: 10),
            ],
            if (rows.isEmpty)
              SectionCard(
                padding: EdgeInsets.zero,
                child: EmptyState(
                  icon: Icons.notifications_none,
                  title: '还没有收到信号',
                  description: controller.live.usesNativeMonitor
                      ? '收到开仓、加仓、减仓、平仓或调杠杆信号时会显示在这里；后台通知能力请在设置中查看。'
                      : '熬鹰发出开仓、加仓、减仓、平仓或调杠杆时会出现在这里，并按动作播放不同的提示音。',
                ),
              )
            else
              SectionCard(
                padding: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < rows.length; i++) ...[
                      if (i > 0)
                        const Divider(
                          height: 1,
                          thickness: 1,
                          color: AppColors.border,
                        ),
                      _AlertRow(alert: rows[i]),
                    ],
                  ],
                ),
              ),
            const SizedBox(height: 12),
            if (controller.live.usesNativeMonitor)
              const _Notice(
                icon: Icons.notifications_outlined,
                text: '通知声音由系统设置管理',
              )
            else
              _SoundLegend(controller: controller),
            const SizedBox(height: 12),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('送达通道', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  _ChannelRow(
                    name: 'Android App',
                    detail: controller.live.usesNativeMonitor
                        ? '原生常驻监控 · 后台系统通知'
                        : '主通道 · WebSocket 实时 + 本地声音',
                    state: _channelState(controller),
                    tone: _channelTone(controller),
                  ),
                  const _ChannelRow(
                    name: '企业微信',
                    detail: '兜底 · 仅 critical',
                    state: '待配置',
                  ),
                  const _ChannelRow(
                    name: '邮件',
                    detail: '日报 / 严重告警',
                    state: '待配置',
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  static String _channelState(AlertController controller) {
    return switch (controller.live.status) {
      LiveStatus.live => '已连接',
      LiveStatus.connecting => '连接中',
      LiveStatus.retrying => '重连中',
      LiveStatus.offline => '未连接',
      LiveStatus.idle => '待连接',
    };
  }

  static Color _channelTone(AlertController controller) {
    return switch (controller.live.status) {
      LiveStatus.live => AppColors.signal,
      LiveStatus.offline => AppColors.danger,
      _ => AppColors.amber,
    };
  }
}

class _MuteButton extends StatelessWidget {
  const _MuteButton({required this.controller});

  final AlertController controller;

  @override
  Widget build(BuildContext context) {
    final muted = controller.muted;
    return IconButton(
      onPressed: controller.toggleMuted,
      tooltip: muted ? '打开提示音' : '关闭提示音',
      iconSize: 18,
      visualDensity: VisualDensity.compact,
      icon: Icon(
        muted
            ? Icons.notifications_off_outlined
            : Icons.notifications_active_outlined,
        color: muted ? AppColors.mist : AppColors.signal,
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.value,
    required this.counts,
    required this.onChanged,
  });

  final SignalAction? value;
  final Map<SignalAction, int> counts;
  final ValueChanged<SignalAction?> onChanged;

  @override
  Widget build(BuildContext context) {
    final options = <(String, SignalAction?, int)>[
      ('全部', null, counts.values.fold(0, (sum, count) => sum + count)),
      for (final action in SignalAction.values)
        (actionLabel[action]!, action, counts[action] ?? 0),
    ];

    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, index) {
          final (label, action, count) = options[index];
          final active = action == value;
          return GestureDetector(
            onTap: () => onChanged(action),
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
                count > 0 ? '$label $count' : label,
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

class _AlertRow extends StatelessWidget {
  const _AlertRow({required this.alert});

  final SignalAlert alert;

  @override
  Widget build(BuildContext context) {
    final tone = actionTone(alert.action);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 40,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  clockOf(alert.createdAt),
                  style: const TextStyle(
                    color: AppColors.mist,
                    fontSize: 10,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 1,
                  ),
                  decoration: BoxDecoration(
                    color: tone.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: tone.withValues(alpha: 0.35)),
                  ),
                  child: Text(
                    actionLabel[alert.action]!,
                    style: TextStyle(
                      color: tone,
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        alert.headline,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    if (alert.test) ...[
                      const SizedBox(width: 6),
                      const Text(
                        '测试',
                        style: TextStyle(color: AppColors.amber, fontSize: 9),
                      ),
                    ],
                  ],
                ),
                if (alert.summary.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    alert.summary,
                    style: const TextStyle(
                      color: AppColors.mist,
                      fontSize: 10,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (alert.realized != null) ...[
            const SizedBox(width: 8),
            Text(
              _signed(alert.realized!),
              style: TextStyle(
                color: alert.realized! >= 0
                    ? AppColors.signal
                    : AppColors.danger,
                fontSize: 11,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _signed(double value) {
    final sign = value >= 0 ? '+' : '-';
    final magnitude = value.abs();
    if (magnitude >= 1000) {
      return '$sign${(magnitude / 1000).toStringAsFixed(1)}K';
    }
    return '$sign${magnitude.toStringAsFixed(0)}';
  }
}

class _SoundLegend extends StatelessWidget {
  const _SoundLegend({required this.controller});

  final AlertController controller;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('声音对照', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              Text(
                controller.muted ? '静音中' : '按动作区分',
                style: const TextStyle(color: AppColors.mist, fontSize: 10),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            '点一下试听。五种动作在音高和节奏上都不同，不看屏幕也能分辨。',
            style: TextStyle(color: AppColors.mist, fontSize: 10, height: 1.5),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final action in SignalAction.values)
                OutlinedButton(
                  onPressed: () => controller.preview(action),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    side: const BorderSide(color: AppColors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.volume_up_outlined,
                        size: 13,
                        color: actionTone(action),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        actionLabel[action]!,
                        style: TextStyle(
                          color: actionTone(action),
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        soundLabel[action]!,
                        style: const TextStyle(
                          color: AppColors.mist,
                          fontSize: 9,
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

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.amber.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.amber.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: AppColors.amber),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: AppColors.mistBright,
                fontSize: 11,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChannelRow extends StatelessWidget {
  const _ChannelRow({
    required this.name,
    required this.detail,
    required this.state,
    this.tone,
  });

  final String name;
  final String detail;
  final String state;
  final Color? tone;

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
                Text(
                  name,
                  style: const TextStyle(
                    color: AppColors.mistBright,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  detail,
                  style: const TextStyle(color: AppColors.mist, fontSize: 10),
                ),
              ],
            ),
          ),
          Text(
            state,
            style: TextStyle(color: tone ?? AppColors.mist, fontSize: 10),
          ),
        ],
      ),
    );
  }
}

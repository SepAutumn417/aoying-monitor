import 'package:flutter/material.dart';

import '../api.dart';
import '../app_scope.dart';
import '../config.dart';
import '../live.dart';
import '../monitor_bridge.dart';
import '../signals.dart';
import '../sound.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';
import '../widgets/status_chip.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  static const _sources = [
    ('Telegram', '4 个会话 · 观点 / 仓位 / 互动'),
    ('币安（TG 推断）', '从群消息与截图抽取仓位'),
    ('OKX 实盘', '只读 API · 持仓与成交'),
    ('fomo 链上', 'Solana / Base 钱包监听'),
    ('X', '专用小号 cookies 轮询'),
  ];

  List<ApiDevice>? _devices;
  String? _error;
  bool _busy = false;
  bool _monitorBusy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_devices == null) _loadDevices();
  }

  ApiClient get _api => AppScope.sessionOf(context).api;

  Future<void> _loadDevices() async {
    setState(() => _error = null);
    try {
      final devices = await _api.devices();
      if (!mounted) return;
      setState(() => _devices = devices);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '设备列表加载失败');
    }
  }

  Future<void> _revoke(ApiDevice device) async {
    setState(() => _busy = true);
    try {
      await _api.revokeDevice(device.id);
      await _loadDevices();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendTest({SignalAction? action}) async {
    setState(() => _busy = true);
    try {
      final event = await _api.publishTestEvent(action: action?.name);
      if (!mounted) return;
      final label = action == null ? '测试事件' : '「${actionLabel[action]}」信号';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('已发送$label #${event.id}')));
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _monitorAction(Future<void> Function() action) async {
    setState(() => _monitorBusy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _monitorBusy = false);
    }
  }

  Widget _monitorSection(LiveController live) => AnimatedBuilder(
    animation: live,
    builder: (context, _) {
      final status = live.monitorStatus;
      String capability(bool? value, String yes, String no) =>
          value == null ? '未知' : (value ? yes : no);
      final connection = switch (status.connection) {
        'connected' || 'live' => '已连接',
        'connecting' => '连接中',
        'retrying' || 'reconnecting' => '重连中',
        'idle' || 'stopped' || 'offline' => '未连接',
        _ => '未知',
      };
      return SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              status.enabled == true
                  ? '后台监控已开启'
                  : (status.enabled == false ? '后台提醒未启用' : '后台提醒状态未知'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              '通知权限：${capability(status.notificationPermission, '已授权', '未授权')}',
            ),
            Text(
              '系统通知：${capability(status.notificationsEnabled, '允许', '已关闭')}',
            ),
            Text('常驻服务：${capability(status.enabled, '已开启', '未开启')}'),
            Text('连接状态：$connection'),
            Text(
              '电池策略：${capability(status.batteryUnrestricted, '不受限制', '受限制')}',
            ),
            if (status.reason.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  _monitorReason(status),
                  style: const TextStyle(color: AppColors.mist, fontSize: 12),
                ),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton(
                  onPressed: _monitorBusy
                      ? null
                      : () => _monitorAction(
                          () => live.startMonitor(requestPermission: true),
                        ),
                  child: const Text('开启后台提醒'),
                ),
                OutlinedButton(
                  onPressed: _monitorBusy
                      ? null
                      : () => _monitorAction(live.stopMonitor),
                  child: const Text('停止后台提醒'),
                ),
                TextButton(
                  onPressed: _monitorBusy
                      ? null
                      : () => _monitorAction(live.refreshMonitorStatus),
                  child: const Text('刷新状态'),
                ),
                TextButton(
                  onPressed: _monitorBusy
                      ? null
                      : () => _monitorAction(live.openBatterySettings),
                  child: const Text('电池设置'),
                ),
              ],
            ),
            const Text(
              '开启后显示常驻通知。前台由应用展示信号，后台／锁屏使用系统通知。'
              '强制停止、系统电池限制或网络异常可能阻止送达；电池设置需自行确认，不保证绝对保活。',
              style: TextStyle(
                color: AppColors.mist,
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ],
        ),
      );
    },
  );

  String _monitorReason(MonitorStatus status) => switch (status.reason) {
    'notification_permission_denied' => '通知权限未获准，请点击开启并在系统设置中允许通知。',
    'notifications_disabled' => '系统已关闭通知，请在系统设置中允许通知。',
    'bridge_unavailable' => '无法读取原生监控状态，未确认后台提醒已启用。',
    'unknown' => '正在读取原生状态，尚未确认后台提醒能力。',
    'logged_out' || 'no_session' || 'unauthenticated' => '请先登录后再开启后台提醒。',
    _ => '原生状态：${status.reason}',
  };

  @override
  Widget build(BuildContext context) {
    final session = AppScope.sessionOf(context);
    final live = AppScope.liveOf(context);
    final native = live.usesNativeMonitor;
    final devices = _devices;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        PageHeader(
          title: '设置',
          meta: 'v${AppConfig.appVersion}',
          action: TextButton(
            onPressed: _busy ? null : () => _sendTest(),
            child: const Text('发送测试事件', style: TextStyle(fontSize: 11)),
          ),
        ),
        if (native) ...[_monitorSection(live), const SizedBox(height: 12)],
        if (_error != null) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.danger.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppColors.danger.withValues(alpha: 0.30),
              ),
            ),
            child: Text(
              _error!,
              style: const TextStyle(color: AppColors.danger, fontSize: 11),
            ),
          ),
          const SizedBox(height: 12),
        ],
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
                    Text(
                      '已登录设备',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: _loadDevices,
                      iconSize: 16,
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.refresh, color: AppColors.mist),
                    ),
                  ],
                ),
              ),
              if (devices == null)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    '加载中',
                    style: TextStyle(color: AppColors.mist, fontSize: 11),
                  ),
                )
              else if (devices.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    '暂无设备',
                    style: TextStyle(color: AppColors.mist, fontSize: 11),
                  ),
                )
              else
                for (final device in devices)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                device.name,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${device.platform} · ${device.pushMode} · '
                                '${_seenLabel(device.lastSeenAt)}',
                                style: const TextStyle(
                                  color: AppColors.mist,
                                  fontSize: 10,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (device.isActive)
                          TextButton(
                            onPressed: _busy ? null : () => _revoke(device),
                            child: const Text(
                              '断开',
                              style: TextStyle(fontSize: 11),
                            ),
                          )
                        else
                          const StatusChip(label: '已断开'),
                      ],
                    ),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 12),
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
                    const Text(
                      '5 个来源',
                      style: TextStyle(color: AppColors.mist, fontSize: 10),
                    ),
                  ],
                ),
              ),
              for (final (name, detail) in _sources)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              detail,
                              style: const TextStyle(
                                color: AppColors.mist,
                                fontSize: 10,
                              ),
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
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.border)),
                ),
                child: Text(
                  native ? '通知测试' : '提示音试听',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                child: Text(
                  native
                      ? '按钮让服务端发出明确标注的测试信号。Android 由原生监控负责通知；前台不播放 Dart 提示音，后台通知是否送达仍需实际验证。'
                      : '每种操作有自己的声音。下面的按钮让服务端真的发一条测试信号，'
                            '走和真实信号完全相同的路径——数据库事件、WebSocket、扬声器。',
                  style: const TextStyle(
                    color: AppColors.mist,
                    fontSize: 10,
                    height: 1.5,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final action in SignalAction.values)
                      OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () => _sendTest(action: action),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              actionLabel[action]!,
                              style: const TextStyle(fontSize: 11),
                            ),
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
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(12, 0, 12, 10),
                child: Text(
                  '测试信号不计入未读，也不会被当成真实成交。',
                  style: TextStyle(color: AppColors.mist, fontSize: 10),
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
              const SizedBox(height: 2),
              const Text(
                '阈值将在采集接入后生效',
                style: TextStyle(color: AppColors.mist, fontSize: 10),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.user?.displayName ?? '未登录',
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      session.user?.username ?? '',
                      style: const TextStyle(
                        color: AppColors.mist,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
              OutlinedButton(
                onPressed: () => session.logout(),
                child: const Text('退出登录', style: TextStyle(fontSize: 11)),
              ),
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

  String _seenLabel(DateTime? seenAt) {
    if (seenAt == null) return '从未活跃';
    final diff = DateTime.now().difference(seenAt);
    if (diff.inMinutes < 1) return '刚刚活跃';
    if (diff.inMinutes < 60) return '${diff.inMinutes} 分钟前';
    if (diff.inHours < 24) return '${diff.inHours} 小时前';
    return '${diff.inDays} 天前';
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
            child: Text(
              label,
              style: const TextStyle(color: AppColors.mist, fontSize: 11),
            ),
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

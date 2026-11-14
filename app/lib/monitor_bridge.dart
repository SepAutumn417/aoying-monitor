import 'package:flutter/services.dart';

/// Injectable boundary for the Android-owned session and background monitor.
abstract interface class MonitorBridge {
  Stream<Map<String, dynamic>> get events;
  Future<dynamic> invoke(String method, [Map<String, dynamic>? arguments]);
}

/// No tokens or session objects are exposed on the event stream.
class ChannelMonitorBridge implements MonitorBridge {
  ChannelMonitorBridge({MethodChannel? control, EventChannel? eventChannel})
    : _control = control ?? const MethodChannel('com.aoying.monitor/control'),
      _eventChannel =
          eventChannel ?? const EventChannel('com.aoying.monitor/events');

  final MethodChannel _control;
  final EventChannel _eventChannel;
  late final Stream<Map<String, dynamic>> _events = _eventChannel
      .receiveBroadcastStream()
      .map((frame) => (frame as Map).cast<String, dynamic>());

  @override
  Stream<Map<String, dynamic>> get events => _events;

  @override
  Future<dynamic> invoke(String method, [Map<String, dynamic>? arguments]) =>
      _control.invokeMethod<dynamic>(method, arguments ?? <String, dynamic>{});
}

/// Unknown capability is distinct from denied permission and a running service.
class MonitorStatus {
  const MonitorStatus({
    this.enabled,
    this.notificationPermission,
    this.notificationsEnabled,
    this.batteryUnrestricted,
    this.connection = 'unknown',
    this.reason = 'unknown',
  });

  factory MonitorStatus.fromJson(Map<String, dynamic> json) => MonitorStatus(
    enabled: json['enabled'] as bool?,
    notificationPermission: json['notificationPermission'] as bool?,
    notificationsEnabled: json['notificationsEnabled'] as bool?,
    batteryUnrestricted: json['batteryUnrestricted'] as bool?,
    connection: json['connection'] as String? ?? 'unknown',
    reason: json['reason'] as String? ?? '',
  );

  final bool? enabled;
  final bool? notificationPermission;
  final bool? notificationsEnabled;
  final bool? batteryUnrestricted;
  final String connection;
  final String reason;
}

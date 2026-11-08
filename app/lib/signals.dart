import 'package:flutter/material.dart';

import 'api.dart';
import 'theme.dart';

/// Trading signals carried over the live socket.
///
/// The backend encodes the action in the event *kind* (`signal.open`,
/// `signal.close`, …) rather than only inside the payload, so a client can pick
/// a sound from the kind alone and never has to parse a message to decide
/// whether something is worth ringing for.
///
/// Everything here is pure: no sockets, no audio, no widgets. The alert
/// controller and the alerts screen both read from these helpers, so the two
/// can never disagree about what counts as a signal. The Web client has a
/// mirror-image module (`web/src/lib/signals.ts`) — keep them in step.
enum SignalAction { open, add, reduce, close, leverage }

const signalEventPrefix = 'signal.';

const actionLabel = <SignalAction, String>{
  SignalAction.open: '新开仓',
  SignalAction.add: '加仓',
  SignalAction.reduce: '减仓',
  SignalAction.close: '平仓',
  SignalAction.leverage: '调杠杆',
};

/// One line of plain language, used where the label alone is too terse.
const actionHint = <SignalAction, String>{
  SignalAction.open: '他开了一笔新仓',
  SignalAction.add: '他在原有仓位上加大',
  SignalAction.reduce: '他减掉了一部分仓位',
  SignalAction.close: '他把这笔平掉了',
  SignalAction.leverage: '只调了杠杆，仓位没变',
};

/// Colour per action, mirroring `ACTION_TONE` in the Web client: green means a
/// position appeared, amber means it shrank, grey means it went away.
Color actionTone(SignalAction action) {
  return switch (action) {
    SignalAction.open => AppColors.signal,
    SignalAction.add => AppColors.signal.withValues(alpha: 0.75),
    SignalAction.reduce => AppColors.amber,
    SignalAction.close => AppColors.mistBright,
    SignalAction.leverage => AppColors.mist,
  };
}

/// `signal.close` → [SignalAction.close]; anything else → null.
SignalAction? actionOf(String kind) {
  if (!kind.startsWith(signalEventPrefix)) return null;
  final name = kind.substring(signalEventPrefix.length);
  for (final action in SignalAction.values) {
    if (action.name == name) return action;
  }
  return null;
}

class SignalAlert {
  const SignalAlert({
    required this.id,
    required this.action,
    required this.headline,
    required this.summary,
    required this.symbol,
    required this.sideLabel,
    required this.leverage,
    required this.entry,
    required this.realized,
    required this.floating,
    required this.createdAt,
    required this.test,
  });

  /// Event id — stable, monotonic, and what the socket de-duplicates on.
  final int id;
  final SignalAction action;
  final String headline;
  final String summary;
  final String symbol;
  final String sideLabel;
  final double? leverage;
  final double? entry;
  final double? realized;
  final double? floating;
  final DateTime? createdAt;

  /// Published by the "发送测试推送" button; shown but never rung for.
  final bool test;
}

String _text(Map<String, dynamic> payload, String key) {
  final value = payload[key];
  return value is String ? value : '';
}

double? _num(Map<String, dynamic> payload, String key) {
  final value = payload[key];
  if (value is num) return value.toDouble();
  if (value is String && value.trim().isNotEmpty) return double.tryParse(value);
  return null;
}

/// Turn one socket event into an alert, or null when it is not a signal.
///
/// The headline and summary are copied from the payload rather than rebuilt
/// here: the backend already owns the Chinese wording and the number
/// formatting, and a second formatter would drift from it.
SignalAlert? toSignalAlert(ApiEvent event) {
  final action = actionOf(event.kind);
  if (action == null) return null;
  final payload = event.payload;
  final symbol = _text(payload, 'symbol');
  final fallback = symbol.isEmpty ? actionLabel[action]! : '${actionLabel[action]} $symbol';
  final headline = _text(payload, 'headline');
  return SignalAlert(
    id: event.id,
    action: action,
    headline: headline.isEmpty ? fallback : headline,
    summary: _text(payload, 'summary'),
    symbol: symbol,
    sideLabel: _text(payload, 'side_label'),
    leverage: _num(payload, 'leverage'),
    entry: _num(payload, 'entry'),
    realized: _num(payload, 'realized'),
    floating: _num(payload, 'floating'),
    createdAt: event.createdAt,
    test: payload['test'] == true,
  );
}

/// Newest first, capped so a long session cannot grow the page without bound.
List<SignalAlert> mergeSignalAlerts(List<ApiEvent> events, {int limit = 200}) {
  final alerts = <SignalAlert>[];
  for (final event in events) {
    final alert = toSignalAlert(event);
    if (alert != null) alerts.add(alert);
  }
  alerts.sort((a, b) => b.id.compareTo(a.id));
  return alerts.length > limit ? alerts.sublist(0, limit) : alerts;
}

Map<SignalAction, int> countByAction(List<SignalAlert> alerts) {
  final counts = <SignalAction, int>{
    for (final action in SignalAction.values) action: 0,
  };
  for (final alert in alerts) {
    counts[alert.action] = counts[alert.action]! + 1;
  }
  return counts;
}

/// `01:05` — the feed is chronological within a day, so the date is noise.
String clockOf(DateTime? time) {
  if (time == null) return '--:--';
  final local = time.toLocal();
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

import 'package:flutter_test/flutter_test.dart';

import 'package:aoying_monitor/api.dart';
import 'package:aoying_monitor/signals.dart';

ApiEvent _event(int id, String kind, [Map<String, dynamic> payload = const {}]) {
  return ApiEvent(
    id: id,
    kind: kind,
    payload: payload,
    createdAt: DateTime.utc(2026, 11, 9, 1, 5),
  );
}

void main() {
  group('actionOf', () {
    test('maps every signal kind to its action', () {
      expect(actionOf('signal.open'), SignalAction.open);
      expect(actionOf('signal.add'), SignalAction.add);
      expect(actionOf('signal.reduce'), SignalAction.reduce);
      expect(actionOf('signal.close'), SignalAction.close);
      expect(actionOf('signal.leverage'), SignalAction.leverage);
    });

    test('ignores telegram chatter and unknown kinds', () {
      expect(actionOf('telegram.message'), isNull);
      expect(actionOf('signal.'), isNull);
      expect(actionOf('signal.whatever'), isNull);
      expect(actionOf('system.test'), isNull);
    });
  });

  group('toSignalAlert', () {
    test('keeps the wording the backend already formatted', () {
      final alert = toSignalAlert(
        _event(7, 'signal.close', {
          'headline': '平仓 空 BTCUSDT',
          'summary': '平仓价 68,500.00 · 已实现 +1,234.00',
          'symbol': 'BTCUSDT',
          'side_label': '空',
          'leverage': 10,
          'realized': 1234.0,
        }),
      )!;

      expect(alert.id, 7);
      expect(alert.action, SignalAction.close);
      expect(alert.headline, '平仓 空 BTCUSDT');
      expect(alert.summary, contains('已实现'));
      expect(alert.sideLabel, '空');
      expect(alert.leverage, 10);
      expect(alert.realized, 1234.0);
      expect(alert.test, isFalse);
    });

    test('falls back to label + symbol when headline is missing', () {
      final alert = toSignalAlert(
        _event(9, 'signal.open', {'symbol': 'ETHUSDT'}),
      )!;
      expect(alert.headline, '新开仓 ETHUSDT');
      expect(alert.summary, isEmpty);
    });

    test('drops telegram events', () {
      expect(toSignalAlert(_event(1, 'telegram.message', {'text': 'hi'})), isNull);
    });

    test('carries the test flag through', () {
      final alert = toSignalAlert(
        _event(2, 'signal.open', {'symbol': 'BTCUSDT', 'test': true}),
      )!;
      expect(alert.test, isTrue);
    });
  });

  group('mergeSignalAlerts', () {
    test('keeps only signals, newest first', () {
      final alerts = mergeSignalAlerts([
        _event(1, 'signal.open', {'symbol': 'A'}),
        _event(2, 'telegram.message', {'text': 'chatter'}),
        _event(3, 'signal.close', {'symbol': 'B'}),
      ]);

      expect(alerts.map((alert) => alert.id), [3, 1]);
    });

    test('caps the list so a long session cannot grow without bound', () {
      final events = [
        for (var i = 1; i <= 30; i++) _event(i, 'signal.open', {'symbol': 'BTCUSDT'}),
      ];
      expect(mergeSignalAlerts(events, limit: 5).length, 5);
    });

    test('counts by action', () {
      final alerts = mergeSignalAlerts([
        _event(1, 'signal.open'),
        _event(2, 'signal.open'),
        _event(3, 'signal.close'),
      ]);
      final counts = countByAction(alerts);
      expect(counts[SignalAction.open], 2);
      expect(counts[SignalAction.close], 1);
      expect(counts[SignalAction.add], 0);
    });
  });

  test('clockOf pads and survives a missing timestamp', () {
    expect(clockOf(DateTime(2026, 11, 9, 1, 5)), '01:05');
    expect(clockOf(DateTime(2026, 11, 9, 13, 40)), '13:40');
    expect(clockOf(null), '--:--');
  });
}

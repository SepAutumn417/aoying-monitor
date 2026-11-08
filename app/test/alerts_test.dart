import 'package:flutter_test/flutter_test.dart';

import 'package:aoying_monitor/alerts.dart';
import 'package:aoying_monitor/api.dart';
import 'package:aoying_monitor/live.dart';
import 'package:aoying_monitor/signals.dart';
import 'package:aoying_monitor/sound.dart';

ApiEvent _signal(int id, String action, {bool test = false}) {
  return ApiEvent(
    id: id,
    kind: 'signal.$action',
    payload: {'symbol': 'BTCUSDT', 'headline': '测试信号', 'test': test},
    createdAt: DateTime.utc(2026, 11, 9, 1, 5),
  );
}

({LiveController live, AlertController alerts, SilentSound sound}) _setup() {
  final live = LiveController(
    api: ApiClient(baseUrl: 'http://127.0.0.1:9'),
    autoConnect: false,
  );
  final sound = SilentSound();
  final alerts = AlertController(live: live, sound: sound);
  return (live: live, alerts: alerts, sound: sound);
}

void main() {
  test('the first batch is history: it lists but does not ring', () {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open'), _signal(11, 'close')]);

    expect(scope.alerts.alerts.length, 2);
    expect(scope.sound.played, isEmpty, reason: '重放的历史不该响铃');
    expect(scope.alerts.unread, 0, reason: '历史也不算未读');
  });

  test('a new signal after priming rings once', () {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open')]);
    scope.live.ingestEvents([_signal(11, 'reduce')]);

    expect(scope.sound.played, [SignalAction.reduce]);
    expect(scope.alerts.unread, 1);
  });

  test('a batch rings only the loudest action', () {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open')]);
    scope.live.ingestEvents([
      _signal(11, 'leverage'),
      _signal(12, 'reduce'),
      _signal(13, 'close'),
    ]);

    expect(scope.sound.played, [SignalAction.close], reason: '平仓比减仓、调杠杆更该被听到');
    expect(scope.alerts.unread, 3);
  });

  test('a test signal rings but never counts as unread', () async {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    // The first batch is history and primes the cursor silently.
    scope.live.ingestEvents([_signal(10, 'open')]);
    expect(scope.sound.played, isEmpty);

    // The rehearsal has to travel the real path -- event, socket, speaker --
    // or it proves nothing about whether a live signal would be heard.
    scope.live.ingestEvents([_signal(11, 'close', test: true)]);
    await Future<void>.delayed(Duration.zero);
    expect(scope.sound.played, [SignalAction.close], reason: '测试信号也要真的响');

    scope.live.ingestEvents([_signal(12, 'reduce')]);
    await Future<void>.delayed(Duration.zero);

    expect(scope.sound.played, [SignalAction.close, SignalAction.reduce]);
    expect(scope.alerts.alerts.length, 3);
    expect(scope.alerts.unread, 1, reason: '只有真实信号计入未读');
    expect(scope.alerts.alerts.first.test, isFalse);
  });

  test('mute silences the ring but keeps the feed', () {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open')]);
    scope.alerts.toggleMuted();
    scope.live.ingestEvents([_signal(11, 'open')]);

    expect(scope.alerts.muted, isTrue);
    expect(scope.sound.played, isEmpty);
    expect(scope.alerts.alerts.first.id, 11);
  });

  test('a refused playback surfaces soundBlocked, a muted one does not', () async {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open')]);
    scope.sound.succeeds = false;
    scope.live.ingestEvents([_signal(11, 'open')]);
    // The chime is played off the listener, so let its future settle.
    await Future<void>.delayed(Duration.zero);
    expect(scope.alerts.soundBlocked, isTrue, reason: '平台拒绝了播放，应该提示用户');

    scope.alerts.toggleMuted();
    expect(scope.alerts.soundBlocked, isFalse, reason: '静音不是故障');
  });

  test('markRead clears the unread count', () {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open')]);
    scope.live.ingestEvents([_signal(11, 'close')]);
    expect(scope.alerts.unread, 1);

    scope.alerts.markRead();
    expect(scope.alerts.unread, 0);
  });

  test('preview plays even while muted', () async {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.alerts.toggleMuted();
    expect(await scope.alerts.preview(SignalAction.leverage), isTrue);
    expect(scope.sound.played, [SignalAction.leverage]);
  });

  test('the newest alert is exposed for the toast', () {
    final scope = _setup();
    addTearDown(scope.alerts.dispose);
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open'), _signal(11, 'close')]);
    expect(scope.alerts.latest?.id, 11);
  });

  test('disposing detaches from the socket', () {
    final scope = _setup();
    addTearDown(scope.live.dispose);

    scope.live.ingestEvents([_signal(10, 'open')]);
    scope.alerts.dispose();
    scope.live.ingestEvents([_signal(11, 'open')]);

    expect(scope.sound.played, isEmpty);
  });
}

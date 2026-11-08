import 'dart:async';

import 'package:flutter/foundation.dart';

import 'live.dart';
import 'signals.dart';
import 'sound.dart';

/// The alert centre: turns live socket traffic into ringable signals.
///
/// Two rules keep this from becoming noise, and they are the same two the Web
/// client uses (`web/src/lib/alerts.tsx`):
///
/// 1. The first batch we ever see is history, not news. On connect the server
///    replays whatever we missed, which may be a hundred events; ringing for
///    them would sound like an alarm clock. So the first non-empty batch only
///    sets the cursor.
/// 2. A batch rings at most once. If five signals land in the same second, the
///    phone plays the most consequential one (open beats close beats add beats
///    reduce beats leverage) instead of five overlapping chimes.
///
/// A third rule covers test signals (`发送测试信号` in Settings). They do ring,
/// because the point of a rehearsal is to prove the chime travels the real path
/// -- backend event, socket, speaker -- not to play a tone locally. What keeps
/// them harmless is that they never count as unread and the feed labels them
/// 测试, so a rehearsal cannot be mistaken for a trade.
class AlertController extends ChangeNotifier {
  AlertController({
    required this.live,
    SignalSound? sound,
    this.keep = 200,
  }) : _sound = sound ?? AudioSignalSound() {
    live.addListener(_onLive);
  }
  /// When several actions arrive together, the loudest one wins.
  static const ringPriority = <SignalAction>[
    SignalAction.open,
    SignalAction.close,
    SignalAction.add,
    SignalAction.reduce,
    SignalAction.leverage,
  ];

  final LiveController live;
  final SignalSound _sound;

  /// How many alerts the page keeps in memory.
  final int keep;

  List<SignalAlert> _alerts = const [];
  int _cursor = 0;
  bool _primed = false;
  int _readUpTo = 0;
  bool _disposed = false;

  /// Set when the platform refused to make any sound at all.
  bool _soundBlocked = false;

  List<SignalAlert> get alerts => _alerts;
  SignalAlert? get latest => _alerts.isEmpty ? null : _alerts.first;

  int get unread => _alerts
      .where((alert) => alert.id > _readUpTo && !alert.test)
      .length;

  bool get muted => _sound.muted;
  bool get soundBlocked => _soundBlocked;

  /// Replays a chime for one action — used by the sound picker.
  Future<bool> preview(SignalAction action) => _sound.preview(action);

  void toggleMuted() {
    _sound.muted = !_sound.muted;
    if (_sound.muted) _soundBlocked = false;
    notifyListeners();
  }

  void markRead() {
    final newest = _alerts.isEmpty ? _readUpTo : _alerts.first.id;
    if (newest <= _readUpTo) return;
    _readUpTo = newest;
    notifyListeners();
  }

  void _onLive() {
    if (_disposed) return;
    final events = live.events;
    if (events.isEmpty) return;

    final next = mergeSignalAlerts(events, limit: keep);
    final changed = _alerts.isEmpty || next.isEmpty || next.first.id != _alerts.first.id;
    _alerts = next;

    final newest = next.isEmpty ? 0 : next.first.id;
    if (!_primed) {
      // History: adopt the cursor silently.
      _primed = true;
      _cursor = newest;
      _readUpTo = newest;
      notifyListeners();
      return;
    }
    if (newest <= _cursor) {
      if (changed) notifyListeners();
      return;
    }

    // Test signals are included on purpose: a rehearsal that skips the ring
    // would not prove the speaker works. They stay out of `unread` instead,
    // which is where a fake trade could actually mislead someone.
    final fresh = next.where((alert) => alert.id > _cursor).toList();
    _cursor = newest > _cursor ? newest : _cursor;
    if (fresh.isEmpty) {
      notifyListeners();
      return;
    }

    final alert = _loudest(fresh);
    if (alert != null) unawaited(_ring(alert));
    notifyListeners();
  }

  SignalAlert? _loudest(List<SignalAlert> alerts) {
    for (final action in ringPriority) {
      for (final alert in alerts) {
        if (alert.action == action) return alert;
      }
    }
    return null;
  }

  Future<void> _ring(SignalAlert alert) async {
    final played = await _sound.play(alert.action);
    if (_disposed) return;
    // Only report a block when we actually wanted sound: a muted phone is not
    // a broken phone.
    final blocked = !played && !_sound.muted;
    if (blocked != _soundBlocked) {
      _soundBlocked = blocked;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    live.removeListener(_onLive);
    unawaited(_sound.dispose());
    super.dispose();
  }
}

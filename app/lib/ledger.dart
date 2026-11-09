import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api.dart';
import 'ledger_models.dart';
import 'live.dart';
import 'session.dart';

/// Socket frames only invalidate REST snapshots; they are never ledger data.
class LedgerController extends ChangeNotifier {
  LedgerController({
    required this.api,
    required this.live,
    required this.session,
  }) {
    _userId = session.isAuthenticated ? session.user?.id : null;
    _lastEventId = live.lastEventId;
    _liveStatus = live.status;
    live.addListener(_onLive);
    session.addListener(_onSession);
    if (_userId != null) unawaited(reload());
  }
  final ApiClient api;
  final LiveController live;
  final SessionController session;
  LedgerSnapshot? snapshot;
  String? error;
  bool loading = false;
  bool _disposed = false, _pending = false;
  int _generation = 0, _lastEventId = 0;
  int? _userId;
  late LiveStatus _liveStatus;
  Future<void>? _running;

  void _onSession() {
    final id = session.isAuthenticated ? session.user?.id : null;
    if (id == _userId) return;
    _userId = id;
    _generation++;
    _pending = false;
    snapshot = null;
    error = null;
    loading = false;
    _lastEventId = live.lastEventId;
    notifyListeners();
    if (id != null) unawaited(reload());
  }

  void _onLive() {
    var invalid =
        live.status == LiveStatus.live && _liveStatus != LiveStatus.live;
    _liveStatus = live.status;
    for (final event in live.events) {
      if (event.id <= _lastEventId) continue;
      if ((event.kind.startsWith('signal.') && event.payload['test'] != true) ||
          event.kind == 'telegram.message.edited' ||
          event.kind == 'telegram.message.deleted') {
        invalid = true;
      }
    }
    _lastEventId = live.lastEventId;
    if (invalid && _userId != null) unawaited(reload());
  }

  Future<void> reload() {
    if (_disposed || _userId == null) return Future.value();
    _generation++;
    _pending = true;
    return _running ??= _drain();
  }

  Future<void> _drain() async {
    try {
      while (_pending && !_disposed && _userId != null) {
        _pending = false;
        final generation = _generation;
        loading = true;
        notifyListeners();
        try {
          // Wait for every request before starting a coalesced reload.
          final values = await Future.wait<Object>([
            api.copyStatus(),
            api.positions(),
            api.signals(),
          ]);
          if (!_disposed && generation == _generation && _userId != null) {
            snapshot = LedgerSnapshot(
              status: values[0] as LedgerStatus,
              positions: values[1] as List<LedgerPosition>,
              signals: values[2] as List<LedgerSignal>,
            );
            error = null;
          }
        } catch (e) {
          if (!_disposed && generation == _generation && _userId != null) {
            error = e is ApiException ? e.message : '无法加载信号账本，请重试';
          }
        }
        if (!_disposed && generation == _generation) {
          loading = false;
          notifyListeners();
        }
      }
    } finally {
      _running = null;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    live.removeListener(_onLive);
    session.removeListener(_onSession);
    super.dispose();
  }
}

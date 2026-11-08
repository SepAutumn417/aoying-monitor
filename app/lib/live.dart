import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'api.dart';

enum LiveStatus { idle, connecting, live, retrying, offline }

/// The app's single live connection.
///
/// The server hands out a single-use ticket, we redeem it, then keep the socket
/// alive with a ping every 25s (idle sockets are dropped after 75s). On a drop
/// we reconnect with exponential backoff and replay from the last event id we
/// saw, so a message is never silently lost.
class LiveController extends ChangeNotifier {
  LiveController({required this.api, this.autoConnect = true});

  static const _pingInterval = Duration(seconds: 25);
  static const _maxBackoff = Duration(seconds: 30);
  static const _maxEvents = 200;

  final ApiClient api;

  /// Tests disable the socket so no timer or network call escapes the test.
  final bool autoConnect;

  LiveStatus _status = LiveStatus.idle;
  final List<ApiEvent> _events = [];
  int _lastEventId = 0;
  int _attempt = 0;
  bool _enabled = false;
  bool _disposed = false;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _ping;
  Timer? _retry;

  LiveStatus get status => _status;
  List<ApiEvent> get events => List.unmodifiable(_events);
  int get lastEventId => _lastEventId;

  void start() {
    if (!autoConnect) return;
    _enabled = true;
    unawaited(_connect());
  }

  void stop() {
    _enabled = false;
    _teardown();
    _setStatus(LiveStatus.idle);
  }

  void reconnect() => unawaited(_connect());

  /// Test seam: feed frames that would normally arrive over the socket.
  ///
  /// The alert centre is driven entirely by this list, so the tests need a way
  /// to deliver a batch without a server. Marked visible-for-testing so nothing
  /// in the app reaches for it by accident.
  @visibleForTesting
  void ingestEvents(List<ApiEvent> events) => _remember(events);

  Future<void> _connect() async {
    if (!_enabled || _disposed) return;
    _teardown();
    if (api.accessToken == null) {
      _setStatus(LiveStatus.offline);
      return;
    }
    _setStatus(LiveStatus.connecting);
    try {
      final ticket = await api.wsTicket();
      final channel = WebSocketChannel.connect(Uri.parse(api.socketUrl(ticket)));
      await channel.ready;
      _channel = channel;
      _attempt = 0;
      _setStatus(LiveStatus.live);
      channel.sink.add(jsonEncode({'type': 'hello', 'last_event_id': _lastEventId}));
      _ping?.cancel();
      _ping = Timer.periodic(_pingInterval, (_) {
        if (_channel != null) _channel!.sink.add(jsonEncode({'type': 'ping'}));
      });
      _subscription = channel.stream.listen(
        _onFrame,
        onDone: _onDone,
        onError: (_) => _onDone(),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleRetry();
    }
  }

  void _onFrame(dynamic raw) {
    Map<String, dynamic> frame;
    try {
      frame = (jsonDecode(raw as String) as Map).cast<String, dynamic>();
    } catch (_) {
      return;
    }
    switch (frame['type']) {
      case 'hello':
        final latest = (frame['last_event_id'] as num?)?.toInt() ?? 0;
        if (_lastEventId == 0) _lastEventId = latest > 0 ? latest - 1 : 0;
        break;
      case 'event':
        _remember([ApiEvent.fromJson((frame['event'] as Map).cast<String, dynamic>())]);
        break;
      case 'replay':
        final events = (frame['events'] as List? ?? const [])
            .map((item) => ApiEvent.fromJson((item as Map).cast<String, dynamic>()))
            .toList();
        _remember(events);
        break;
      default:
        break;
    }
  }

  void _remember(List<ApiEvent> incoming) {
    if (incoming.isEmpty) return;
    for (final event in incoming) {
      if (event.id > _lastEventId) _lastEventId = event.id;
    }
    final seen = _events.map((event) => event.id).toSet();
    _events.addAll(incoming.where((event) => !seen.contains(event.id)));
    _events.sort((a, b) => b.id.compareTo(a.id));
    if (_events.length > _maxEvents) _events.removeRange(_maxEvents, _events.length);
    notifyListeners();
  }

  void _onDone() {
    _closeChannel();
    if (!_enabled) return;
    _scheduleRetry();
  }

  void _scheduleRetry() {
    _ping?.cancel();
    _ping = null;
    _attempt += 1;
    final seconds = 1 << (_attempt - 1).clamp(0, 5);
    _setStatus(LiveStatus.retrying);
    _retry?.cancel();
    _retry = Timer(
      Duration(seconds: seconds.clamp(1, _maxBackoff.inSeconds)),
      () => unawaited(_connect()),
    );
  }

  void _teardown() {
    _ping?.cancel();
    _ping = null;
    _retry?.cancel();
    _retry = null;
    unawaited(_subscription?.cancel());
    _subscription = null;
    _closeChannel();
  }

  void _closeChannel() {
    try {
      _channel?.sink.close();
    } catch (_) {
      // Already closed.
    }
    _channel = null;
  }

  void _setStatus(LiveStatus value) {
    if (_status == value || _disposed) return;
    _status = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _enabled = false;
    _teardown();
    super.dispose();
  }
}

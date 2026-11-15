import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'ledger_models.dart';
import 'monitor_bridge.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

class ApiUser {
  const ApiUser({
    required this.id,
    required this.username,
    required this.displayName,
  });

  final int id;
  final String username;
  final String displayName;

  factory ApiUser.fromJson(Map<String, dynamic> json) => ApiUser(
    id: json['id'] as int,
    username: json['username'] as String? ?? '',
    displayName:
        json['display_name'] as String? ?? json['username'] as String? ?? '',
  );
}

class ApiDevice {
  const ApiDevice({
    required this.id,
    required this.name,
    required this.platform,
    required this.pushMode,
    required this.lastSeenAt,
    this.revokedAt,
  });

  final int id;
  final String name;
  final String platform;
  final String pushMode;
  final DateTime? lastSeenAt;
  final DateTime? revokedAt;

  bool get isActive => revokedAt == null;

  factory ApiDevice.fromJson(Map<String, dynamic> json) => ApiDevice(
    id: json['id'] as int,
    name: json['name'] as String? ?? '未命名设备',
    platform: json['platform'] as String? ?? 'unknown',
    pushMode: json['push_mode'] as String? ?? 'poll',
    lastSeenAt: DateTime.tryParse(json['last_seen_at'] as String? ?? '')
        ?.toLocal(),
    revokedAt: DateTime.tryParse(json['revoked_at'] as String? ?? '')
        ?.toLocal(),
  );
}

class ApiSession {
  const ApiSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.device,
  });

  final String accessToken;
  final String refreshToken;
  final ApiUser user;
  final ApiDevice device;
}

class ApiTicket {
  const ApiTicket({required this.ticket, required this.wsUrl});

  final String ticket;
  final String wsUrl;
}

class ApiEvent {
  const ApiEvent({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
  });

  final int id;
  final String kind;
  final Map<String, dynamic> payload;
  final DateTime? createdAt;

  factory ApiEvent.fromJson(Map<String, dynamic> json) => ApiEvent(
    id: json['id'] as int,
    kind: json['kind'] as String? ?? 'unknown',
    payload: (json['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
    createdAt: DateTime.tryParse(json['created_at'] as String? ?? '')
        ?.toLocal(),
  );
}

/// One followed Telegram chat, as listed by the collector.
class ApiTelegramDialog {
  const ApiTelegramDialog({
    required this.id,
    required this.chatId,
    required this.title,
    required this.kind,
    required this.username,
    required this.enabled,
    required this.lastMessageId,
    required this.lastSyncedAt,
    required this.messages,
  });

  final int id;
  final int chatId;
  final String title;
  final String kind;
  final String username;
  final bool enabled;
  final int lastMessageId;
  final DateTime? lastSyncedAt;
  final int messages;

  factory ApiTelegramDialog.fromJson(Map<String, dynamic> json) =>
      ApiTelegramDialog(
        id: json['id'] as int,
        chatId: json['chat_id'] as int,
        title: json['title'] as String? ?? '未命名会话',
        kind: json['kind'] as String? ?? '',
        username: json['username'] as String? ?? '',
        enabled: json['enabled'] as bool? ?? false,
        lastMessageId: json['last_message_id'] as int? ?? 0,
        lastSyncedAt: DateTime.tryParse(
          json['last_synced_at'] as String? ?? '',
        )?.toLocal(),
        messages: json['messages'] as int? ?? 0,
      );
}

/// One forum topic inside a followed chat.
class ApiTelegramTopic {
  const ApiTelegramTopic({
    required this.id,
    required this.chatId,
    required this.topicId,
    required this.title,
    required this.enabled,
    required this.lastMessageId,
    required this.lastSyncedAt,
    required this.messages,
    required this.lastError,
  });

  final int id;
  final int chatId;
  final int topicId;
  final String title;
  final bool enabled;
  final int lastMessageId;
  final DateTime? lastSyncedAt;
  final int messages;
  final String lastError;

  factory ApiTelegramTopic.fromJson(Map<String, dynamic> json) =>
      ApiTelegramTopic(
        id: json['id'] as int,
        chatId: json['chat_id'] as int,
        topicId: json['topic_id'] as int,
        title: json['title'] as String? ?? '未命名话题',
        enabled: json['enabled'] as bool? ?? false,
        lastMessageId: json['last_message_id'] as int? ?? 0,
        lastSyncedAt: DateTime.tryParse(
          json['last_synced_at'] as String? ?? '',
        )?.toLocal(),
        messages: json['messages'] as int? ?? 0,
        lastError: json['last_error'] as String? ?? '',
      );
}

/// The text a message carried before the author rewrote it.
class ApiTelegramRevision {
  const ApiTelegramRevision({
    required this.text,
    required this.mediaKind,
    required this.replacedAt,
  });

  final String text;
  final String mediaKind;
  final DateTime? replacedAt;

  factory ApiTelegramRevision.fromJson(Map<String, dynamic> json) =>
      ApiTelegramRevision(
        text: json['text'] as String? ?? '',
        mediaKind: json['media_kind'] as String? ?? '',
        replacedAt: DateTime.tryParse(
          json['replaced_at'] as String? ?? '',
        )?.toLocal(),
      );
}

/// One archived Telegram message, including edits and deletions.
class ApiTelegramMessage {
  const ApiTelegramMessage({
    required this.id,
    required this.chatId,
    required this.dialogTitle,
    required this.messageId,
    required this.senderName,
    required this.senderId,
    required this.topicId,
    required this.topicTitle,
    required this.senderRole,
    required this.replyTo,
    required this.text,
    required this.mediaKind,
    required this.postedAt,
    required this.editedAt,
    required this.deletedAt,
    required this.revisions,
  });

  final int id;
  final int chatId;
  final String dialogTitle;
  final int messageId;
  final String senderName;
  final int? senderId;
  final int? topicId;
  final String topicTitle;
  final String senderRole;
  final int? replyTo;
  final String text;
  final String mediaKind;
  final DateTime? postedAt;
  final DateTime? editedAt;
  final DateTime? deletedAt;
  final List<ApiTelegramRevision> revisions;

  bool get isDeleted => deletedAt != null;
  bool get isEdited => editedAt != null;

  factory ApiTelegramMessage.fromJson(Map<String, dynamic> json) =>
      ApiTelegramMessage(
        id: json['id'] as int,
        chatId: json['chat_id'] as int,
        dialogTitle: json['dialog_title'] as String? ?? '',
        messageId: json['message_id'] as int? ?? 0,
        senderName: json['sender_name'] as String? ?? '未知',
        senderId: json['sender_id'] as int?,
        topicId: json['topic_id'] as int?,
        topicTitle: json['topic_title'] as String? ?? '未分类',
        senderRole: json['sender_role'] as String? ?? 'member',
        replyTo: json['reply_to'] as int?,
        text: json['text'] as String? ?? '',
        mediaKind: json['media_kind'] as String? ?? '',
        postedAt: DateTime.tryParse(json['posted_at'] as String? ?? '')?.toLocal(),
        editedAt: DateTime.tryParse(json['edited_at'] as String? ?? '')?.toLocal(),
        deletedAt: DateTime.tryParse(
          json['deleted_at'] as String? ?? '',
        )?.toLocal(),
        revisions: [
          for (final item in (json['revisions'] as List?) ?? const [])
            ApiTelegramRevision.fromJson((item as Map).cast<String, dynamic>()),
        ],
      );
}

/// Which slice of the archive the timeline shows.
enum TelegramFocus { important, owner, all }

/// Which lifecycle state a message is in.
enum TelegramKind { all, media, edited, deleted }

/// HTTP client for the monitor API.
///
/// The access token is short-lived and stays in memory; the refresh token is
/// persisted so an app restart does not force another login. A 401 triggers
/// exactly one refresh-and-retry, never a refresh storm.
class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl, MonitorBridge? monitor})
    : _http = httpClient ?? http.Client(),
      monitor =
          monitor ??
          (!kIsWeb && Platform.isAndroid ? ChannelMonitorBridge() : null),
      baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  static const _refreshKey = 'aoying.refresh_token';

  final http.Client _http;
  final String baseUrl;
  final MonitorBridge? monitor;

  String? _accessToken;
  Future<String?>? _refreshing;
  int _epoch = 0;
  Future<void> _storageTail = Future<void>.value();

  void _requireEpoch(int epoch) {
    if (epoch != _epoch) throw ApiException(401, '会话已变更，请重新登录');
  }

  // Serialize preference mutations: a late disk write can never finish after
  // the clear/new-login write that supersedes it.
  Future<T> _withPreferences<T>(Future<T> Function(SharedPreferences) action) {
    final result = _storageTail.then(
      (_) async => action(await SharedPreferences.getInstance()),
    );
    _storageTail = result.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return result;
  }

  String? get accessToken => _accessToken;

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> _headers({bool json = true}) => {
    if (json) 'content-type': 'application/json',
    if (_accessToken != null) 'authorization': 'Bearer $_accessToken',
  };

  Future<Map<String, dynamic>> _send(
    String path,
    Future<http.Response> Function() run, {
    bool retry = true,
  }) async {
    final epoch = _epoch;
    final expectedAccess = _accessToken;
    final response = await run();
    _requireEpoch(epoch);
    if (response.statusCode == 401 && retry) {
      final token = await _refreshFor(expectedAccess, epoch);
      _requireEpoch(epoch);
      if (token != null) {
        return _send(path, run, retry: false);
      }
    }
    final body = response.body.isEmpty
        ? <String, dynamic>{}
        : (jsonDecode(response.body) as Map).cast<String, dynamic>();
    if (response.statusCode >= 400) {
      throw ApiException(
        response.statusCode,
        body['detail'] as String? ?? '请求失败',
      );
    }
    return body;
  }

  Future<String?> _refreshFor(String? expectedAccess, int epoch) async {
    _requireEpoch(epoch);
    if (expectedAccess != _accessToken) return _accessToken;
    if (_refreshing != null) return _refreshing;
    final pending = _refreshAccessToken(expectedAccess, epoch);
    _refreshing = pending;
    try {
      return await pending;
    } finally {
      if (identical(_refreshing, pending)) _refreshing = null;
    }
  }

  Future<String?> _refreshAccessToken(String? expectedAccess, int epoch) async {
    if (monitor != null) {
      final body = await monitor!.invoke('auth.refresh', {
        'expectedAccess': expectedAccess,
      });
      _requireEpoch(epoch);
      if (body == null) return null;
      final session = _sessionFrom((body as Map).cast<String, dynamic>());
      _accessToken = session.accessToken;
      return session.accessToken;
    }
    final token = await _withPreferences(
      (prefs) async => prefs.getString(_refreshKey),
    );
    _requireEpoch(epoch);
    if (token == null) return null;
    final body = await _send(
      '/api/auth/refresh',
      () => _http.post(
        _uri('/api/auth/refresh'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'refresh_token': token}),
      ),
      retry: false,
    );
    _requireEpoch(epoch);
    final session = _sessionFrom(body);
    await _store(session, epoch);
    return session.accessToken;
  }

  Future<void> _store(ApiSession session, int epoch) async {
    await _withPreferences((prefs) async {
      _requireEpoch(epoch);
      await prefs.setString(_refreshKey, session.refreshToken);
    });
    _requireEpoch(epoch);
    _accessToken = session.accessToken;
  }

  ApiSession _sessionFrom(Map<String, dynamic> body) => ApiSession(
    accessToken: body['access_token'] as String,
    refreshToken: body['refresh_token'] as String,
    user: ApiUser.fromJson((body['user'] as Map).cast<String, dynamic>()),
    device: ApiDevice.fromJson((body['device'] as Map).cast<String, dynamic>()),
  );

  Future<ApiSession> login(String username, String password) async {
    final epoch = ++_epoch;
    _refreshing = null;
    _accessToken = null;
    if (monitor != null) {
      final body = await monitor!.invoke('auth.login', {
        'baseUrl': baseUrl,
        'username': username,
        'password': password,
        'device': _deviceDescriptor(),
      });
      _requireEpoch(epoch);
      final session = _sessionFrom((body as Map).cast<String, dynamic>());
      await _withPreferences((prefs) async {
        _requireEpoch(epoch);
        await prefs.remove(_refreshKey);
      });
      _requireEpoch(epoch);
      _accessToken = session.accessToken;
      return session;
    }
    final body = await _send(
      '/api/auth/login',
      () => _http.post(
        _uri('/api/auth/login'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({
          'username': username,
          'password': password,
          'device': _deviceDescriptor(),
        }),
      ),
      retry: false,
    );
    final session = _sessionFrom(body);
    await _store(session, epoch);
    return session;
  }

  /// Exchanges a stored refresh token for a fresh session, or returns null when
  /// there is nothing to restore.
  Future<ApiSession?> restore() async {
    final epoch = ++_epoch;
    _refreshing = null;
    final legacy = await _withPreferences(
      (prefs) async => prefs.getString(_refreshKey),
    );
    _requireEpoch(epoch);
    if (monitor != null) {
      final body = await monitor!.invoke('auth.restore', {
        'baseUrl': baseUrl,
        'legacyRefresh': ?legacy,
      });
      _requireEpoch(epoch);
      if (body == null) return null;
      final session = _sessionFrom((body as Map).cast<String, dynamic>());
      // Native only returns after the encrypted migration is durable.
      await _withPreferences((prefs) async {
        _requireEpoch(epoch);
        await prefs.remove(_refreshKey);
      });
      _requireEpoch(epoch);
      _accessToken = session.accessToken;
      return session;
    }
    if (legacy == null) return null;
    final body = await _send(
      '/api/auth/refresh',
      () => _http.post(
        _uri('/api/auth/refresh'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'refresh_token': legacy}),
      ),
      retry: false,
    );
    final session = _sessionFrom(body);
    await _store(session, epoch);
    return session;
  }

  Future<void> logout() async {
    ++_epoch;
    _refreshing = null;
    final headers = _headers();
    _accessToken = null;
    // Queue the clear before any subsequent login can queue its durable store.
    final clearing = _withPreferences((prefs) async {
      final token = prefs.getString(_refreshKey);
      await prefs.remove(_refreshKey);
      return token;
    });
    if (monitor != null) {
      // Native logout invalidates auth and stops its service internally. Sending
      // monitor.stop here would persist the user's explicit stop preference.
      await Future.wait<dynamic>([monitor!.invoke('auth.logout'), clearing]);
      return;
    }
    final token = await clearing;
    if (token != null) {
      try {
        await _send(
          '/api/auth/logout',
          () => _http.post(
            _uri('/api/auth/logout'),
            headers: headers,
            body: jsonEncode({'refresh_token': token}),
          ),
          retry: false,
        );
      } on ApiException {
        // Already revoked server-side; clearing locally is enough.
      }
    }
  }

  Future<List<ApiDevice>> devices() async {
    final list = await _sendList(
      '/api/devices',
      () => _http.get(_uri('/api/devices'), headers: _headers()),
    );
    return list.map((item) => ApiDevice.fromJson(item)).toList();
  }

  Future<List<Map<String, dynamic>>> _sendList(
    String path,
    Future<http.Response> Function() run, {
    bool retry = true,
  }) async {
    final epoch = _epoch;
    final expectedAccess = _accessToken;
    final response = await run();
    _requireEpoch(epoch);
    if (response.statusCode == 401 && retry) {
      final token = await _refreshFor(expectedAccess, epoch);
      _requireEpoch(epoch);
      if (token != null) {
        return _sendList(path, run, retry: false);
      }
    }
    if (response.statusCode >= 400) {
      final body = response.body.isEmpty ? {} : jsonDecode(response.body);
      throw ApiException(
        response.statusCode,
        body is Map ? (body['detail'] as String? ?? '请求失败') : '请求失败',
      );
    }
    final decoded = jsonDecode(response.body);
    return (decoded as List).cast<Map<String, dynamic>>();
  }

  Future<void> revokeDevice(int id) async {
    await _send(
      '/api/devices/$id',
      () => _http.delete(_uri('/api/devices/$id'), headers: _headers()),
    );
  }

  Future<ApiTicket> wsTicket() async {
    final body = await _send(
      '/api/ws/ticket',
      () => _http.post(_uri('/api/ws/ticket'), headers: _headers()),
    );
    return ApiTicket(
      ticket: body['ticket'] as String,
      wsUrl: body['ws_url'] as String? ?? '',
    );
  }

  Future<LedgerStatus> copyStatus() async {
    const path = '/api/copy/status';
    return LedgerStatus.fromJson(
      await _send(path, () => _http.get(_uri(path), headers: _headers())),
    );
  }

  Future<List<LedgerPosition>> positions({
    String? status,
    String? symbol,
    int limit = 100,
    bool includeEvents = true,
  }) async {
    final uri = _uri('/api/positions').replace(
      queryParameters: {
        'limit': '${limit.clamp(1, 100)}',
        'include_events': '$includeEvents',
        'status': ?status,
        'symbol': ?symbol,
      },
    );
    final body = await _send(
      uri.path,
      () => _http.get(uri, headers: _headers()),
    );
    return List.unmodifiable(
      (body['positions'] as List).map(
        (e) => LedgerPosition.fromJson((e as Map).cast<String, dynamic>()),
      ),
    );
  }

  Future<List<LedgerSignal>> signals({
    int limit = 20,
    int? beforeId,
    String? kind,
    String? symbol,
  }) async {
    final uri = _uri('/api/signals').replace(
      queryParameters: {
        'limit': '${limit.clamp(1, 500)}',
        if (beforeId != null) 'before_id': '$beforeId',
        'kind': ?kind,
        'symbol': ?symbol,
      },
    );
    final body = await _send(
      uri.path,
      () => _http.get(uri, headers: _headers()),
    );
    return List.unmodifiable(
      (body['signals'] as List).map(
        (e) => LedgerSignal.fromJson((e as Map).cast<String, dynamic>()),
      ),
    );
  }

  Future<ApiEvent> publishTestEvent({String? action}) async {
    final path = action == null
        ? '/api/events/test'
        : '/api/events/test?action=${Uri.encodeQueryComponent(action)}';
    final body = await _send(
      path,
      () => _http.post(_uri(path), headers: _headers()),
    );
    return ApiEvent.fromJson((body['event'] as Map).cast<String, dynamic>());
  }

  Future<List<ApiTelegramDialog>> telegramDialogs() async {
    final list = await _sendList(
      '/api/telegram/dialogs',
      () => _http.get(_uri('/api/telegram/dialogs'), headers: _headers()),
    );
    return list.map(ApiTelegramDialog.fromJson).toList();
  }

  Future<List<ApiTelegramTopic>> telegramTopics(int chatId) async {
    final uri = _uri(
      '/api/telegram/topics',
    ).replace(queryParameters: {'chat_id': '$chatId'});
    final list = await _sendList(
      uri.path,
      () => _http.get(uri, headers: _headers()),
    );
    return list.map(ApiTelegramTopic.fromJson).toList();
  }

  Future<List<ApiTelegramMessage>> telegramMessages({
    int limit = 100,
    int? chatId,
    int? beforeId,
    int? topicId,
    TelegramFocus? focus,
    TelegramKind kind = TelegramKind.all,
    DateTime? since,
    bool includeRevisions = true,
  }) async {
    final uri = _uri('/api/telegram/messages').replace(
      queryParameters: {
        'limit': '${limit.clamp(1, 200)}',
        if (chatId != null) 'chat_id': '$chatId',
        if (beforeId != null) 'before_id': '$beforeId',
        if (topicId != null) 'topic_id': '$topicId',
        if (focus != null) 'focus': focus.name,
        if (kind != TelegramKind.all) 'kind': kind.name,
        if (since != null) 'since': since.toUtc().toIso8601String(),
        'include_revisions': '$includeRevisions',
      },
    );
    final body = await _send(
      uri.path,
      () => _http.get(uri, headers: _headers()),
    );
    return List.unmodifiable(
      ((body['messages'] as List?) ?? const []).map(
        (e) => ApiTelegramMessage.fromJson((e as Map).cast<String, dynamic>()),
      ),
    );
  }

  Map<String, dynamic> _deviceDescriptor() {
    if (kIsWeb) {
      return {
        'name': '浏览器',
        'platform': 'web',
        'fingerprint': 'web-browser',
        'app_version': AppConfig.appVersion,
        'push_mode': 'browser',
      };
    }
    final name = Platform.isAndroid ? 'Android 手机' : Platform.operatingSystem;
    return {
      'name': name,
      'platform': Platform.operatingSystem,
      'fingerprint': 'flutter-${Platform.operatingSystem}',
      'app_version': AppConfig.appVersion,
      'push_mode': 'local',
    };
  }

  /// The socket URL for this client: reuse the API origin unless the server
  /// handed back an absolute URL that already points elsewhere.
  String socketUrl(ApiTicket ticket) {
    final base = Uri.parse(baseUrl);
    final scheme = base.scheme == 'https' ? 'wss' : 'ws';
    return '$scheme://${base.authority}/ws?ticket=${Uri.encodeComponent(ticket.ticket)}';
  }
}

import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

class ApiUser {
  const ApiUser({required this.id, required this.username, required this.displayName});

  final int id;
  final String username;
  final String displayName;

  factory ApiUser.fromJson(Map<String, dynamic> json) => ApiUser(
    id: json['id'] as int,
    username: json['username'] as String? ?? '',
    displayName: json['display_name'] as String? ?? json['username'] as String? ?? '',
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
    lastSeenAt: DateTime.tryParse(json['last_seen_at'] as String? ?? '')?.toLocal(),
    revokedAt: DateTime.tryParse(json['revoked_at'] as String? ?? '')?.toLocal(),
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
    createdAt: DateTime.tryParse(json['created_at'] as String? ?? '')?.toLocal(),
  );
}

/// HTTP client for the monitor API.
///
/// The access token is short-lived and stays in memory; the refresh token is
/// persisted so an app restart does not force another login. A 401 triggers
/// exactly one refresh-and-retry, never a refresh storm.
class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl})
    : _http = httpClient ?? http.Client(),
      baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  static const _refreshKey = 'aoying.refresh_token';

  final http.Client _http;
  final String baseUrl;

  String? _accessToken;
  Future<String?>? _refreshing;

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
    final response = await run();
    if (response.statusCode == 401 && retry) {
      final token = await (_refreshing ??= _refreshAccessToken());
      if (token != null) {
        return _send(path, run, retry: false);
      }
    }
    final body = response.body.isEmpty
        ? <String, dynamic>{}
        : (jsonDecode(response.body) as Map).cast<String, dynamic>();
    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, body['detail'] as String? ?? '请求失败');
    }
    return body;
  }

  Future<String?> _refreshAccessToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(_refreshKey);
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
      final session = _sessionFrom(body);
      await _store(session);
      return session.accessToken;
    } finally {
      _refreshing = null;
    }
  }

  Future<void> _store(ApiSession session) async {
    _accessToken = session.accessToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_refreshKey, session.refreshToken);
  }

  ApiSession _sessionFrom(Map<String, dynamic> body) => ApiSession(
    accessToken: body['access_token'] as String,
    refreshToken: body['refresh_token'] as String,
    user: ApiUser.fromJson((body['user'] as Map).cast<String, dynamic>()),
    device: ApiDevice.fromJson((body['device'] as Map).cast<String, dynamic>()),
  );

  Future<ApiSession> login(String username, String password) async {
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
    await _store(session);
    return session;
  }

  /// Exchanges a stored refresh token for a fresh session, or returns null when
  /// there is nothing to restore.
  Future<ApiSession?> restore() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_refreshKey) == null) return null;
    final body = await _send(
      '/api/auth/refresh',
      () async {
        final token = (await SharedPreferences.getInstance()).getString(_refreshKey)!;
        return _http.post(
          _uri('/api/auth/refresh'),
          headers: {'content-type': 'application/json'},
          body: jsonEncode({'refresh_token': token}),
        );
      },
      retry: false,
    );
    final session = _sessionFrom(body);
    await _store(session);
    return session;
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_refreshKey);
    if (token != null) {
      try {
        await _send(
          '/api/auth/logout',
          () => _http.post(
            _uri('/api/auth/logout'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'refresh_token': token}),
          ),
          retry: false,
        );
      } on ApiException {
        // Already revoked server-side; clearing locally is enough.
      }
    }
    _accessToken = null;
    await prefs.remove(_refreshKey);
  }

  Future<List<ApiDevice>> devices() async {
    final list = await _sendList('/api/devices', () => _http.get(_uri('/api/devices'), headers: _headers()));
    return list.map((item) => ApiDevice.fromJson(item)).toList();
  }

  Future<List<Map<String, dynamic>>> _sendList(
    String path,
    Future<http.Response> Function() run,
  ) async {
    final response = await run();
    if (response.statusCode == 401) {
      final token = await (_refreshing ??= _refreshAccessToken());
      if (token != null) {
        return _sendList(path, () => _http.get(_uri(path), headers: _headers()));
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

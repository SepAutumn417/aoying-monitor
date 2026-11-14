import 'package:flutter/foundation.dart';

import 'api.dart';

enum SessionStatus { loading, anonymous, authenticated }

/// Owns the one truth the whole app reads: are we logged in, as whom.
///
/// The Web client does the same thing with `AuthProvider`; keeping the two
/// shapes aligned makes the two front ends behave identically.
class SessionController extends ChangeNotifier {
  SessionController({ApiClient? client}) : api = client ?? ApiClient();

  /// Test entry point: start already signed in, skipping the network.
  SessionController.seeded({
    required this.api,
    required ApiUser user,
    required ApiDevice device,
  }) {
    _user = user;
    _device = device;
    _status = SessionStatus.authenticated;
  }

  /// Test entry point: start signed out without asking the server.
  SessionController.anonymous({required this.api}) {
    _status = SessionStatus.anonymous;
  }

  final ApiClient api;

  SessionStatus _status = SessionStatus.loading;
  ApiUser? _user;
  ApiDevice? _device;
  String? _error;

  SessionStatus get status => _status;
  ApiUser? get user => _user;
  ApiDevice? get device => _device;
  String? get error => _error;
  bool get isAuthenticated => _status == SessionStatus.authenticated;

  Future<void> bootstrap() async {
    try {
      final session = await api.restore();
      if (session == null) {
        _status = SessionStatus.anonymous;
      } else {
        _apply(session);
      }
    } catch (_) {
      _status = SessionStatus.anonymous;
    }
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    _error = null;
    notifyListeners();
    try {
      final session = await api.login(username.trim(), password);
      _apply(session);
      notifyListeners();
      return true;
    } on ApiException catch (error) {
      _error = error.message;
      notifyListeners();
      return false;
    } catch (_) {
      _error = '无法连接服务器';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    // Silence session-scoped work immediately, even if revocation is slow.
    _user = null;
    _device = null;
    _status = SessionStatus.anonymous;
    notifyListeners();
    try {
      await api.logout();
    } catch (_) {
      // Local sign-out must succeed even when the network does not.
    }
  }

  void clearError() {
    if (_error == null) return;
    _error = null;
    notifyListeners();
  }

  void _apply(ApiSession session) {
    _user = session.user;
    _device = session.device;
    _status = SessionStatus.authenticated;
    _error = null;
  }
}

import 'dart:async';
import 'dart:convert';

import 'package:aoying_monitor/alerts.dart';
import 'package:aoying_monitor/api.dart';
import 'package:aoying_monitor/app.dart';
import 'package:aoying_monitor/live.dart';
import 'package:aoying_monitor/session.dart';
import 'package:aoying_monitor/signals.dart';
import 'package:aoying_monitor/sound.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _sessionBody() => {
  'access_token': 'test-access',
  'refresh_token': 'test-refresh',
  'user': {'id': 1, 'username': 'test', 'display_name': 'Test'},
  'device': {'id': 1, 'name': 'test', 'platform': 'android'},
};

ApiEvent _signal(int id) => ApiEvent(
  id: id,
  kind: 'signal.open',
  payload: const {'symbol': 'BTCUSDT'},
  createdAt: null,
);

class _CountingLive extends LiveController {
  _CountingLive(ApiClient api) : super(api: api, autoConnect: false);
  int starts = 0;
  int stops = 0;

  @override
  void start() {
    starts++;
    super.start();
  }

  @override
  void stop() {
    stops++;
    super.stop();
  }
}

class _PendingTicketApi extends ApiClient {
  final ticket = Completer<ApiTicket>();

  @override
  String? get accessToken => 'test-access';

  @override
  Future<ApiTicket> wsTicket() => ticket.future;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'logout authenticates server revocation and clears local tokens',
    () async {
      http.Request? logoutRequest;
      final api = ApiClient(
        httpClient: MockClient((request) async {
          if (request.url.path.endsWith('/login')) {
            return http.Response(jsonEncode(_sessionBody()), 200);
          }
          logoutRequest = request;
          return http.Response('{}', 200);
        }),
      );
      await api.login('test', 'unused');
      await api.logout();

      expect(logoutRequest!.headers['authorization'], 'Bearer test-access');
      expect(jsonDecode(logoutRequest!.body), {
        'refresh_token': 'test-refresh',
      });
      expect(api.accessToken, isNull);
      expect(
        (await SharedPreferences.getInstance()).getString(
          'aoying.refresh_token',
        ),
        isNull,
      );
    },
  );

  test('failed logout still clears local access and refresh tokens', () async {
    final api = ApiClient(
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/login')) {
          return http.Response(jsonEncode(_sessionBody()), 200);
        }
        throw http.ClientException('offline');
      }),
    );
    final session = SessionController.anonymous(api: api);
    addTearDown(session.dispose);
    await session.login('test', 'unused');
    await session.logout();

    expect(session.isAuthenticated, isFalse);
    expect(api.accessToken, isNull);
    expect(
      (await SharedPreferences.getInstance()).getString('aoying.refresh_token'),
      isNull,
    );
  });

  test('a slow logout cannot clear a newer login session', () async {
    final logoutResponse = Completer<http.Response>();
    final logoutStarted = Completer<void>();
    http.Request? logoutRequest;
    var logins = 0;
    final api = ApiClient(
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/login')) {
          logins++;
          final body = _sessionBody();
          if (logins > 1) {
            body['access_token'] = 'new-access';
            body['refresh_token'] = 'new-refresh';
          }
          return http.Response(jsonEncode(body), 200);
        }
        logoutRequest = request;
        logoutStarted.complete();
        return logoutResponse.future;
      }),
    );
    final session = SessionController.anonymous(api: api);
    addTearDown(session.dispose);
    await session.login('test', 'unused');
    final signingOut = session.logout();
    await logoutStarted.future;
    expect(session.isAuthenticated, isFalse);
    expect(await session.login('test', 'unused'), isTrue);
    expect(api.accessToken, 'new-access');

    logoutResponse.complete(http.Response('{}', 200));
    await signingOut;

    expect(session.isAuthenticated, isTrue);
    expect(api.accessToken, 'new-access');
    expect(
      (await SharedPreferences.getInstance()).getString('aoying.refresh_token'),
      'new-refresh',
    );
    expect(logoutRequest!.headers['authorization'], 'Bearer test-access');
    expect(jsonDecode(logoutRequest!.body), {'refresh_token': 'test-refresh'});
  });

  for (final relogin in [false, true]) {
    test(
      'late HTTP refresh cannot ${relogin ? 'overwrite new login' : 'resurrect logout'}',
      () async {
        final refreshing = Completer<void>();
        final response = Completer<http.Response>();
        var logins = 0;
        final api = ApiClient(
          httpClient: MockClient((request) async {
            if (request.url.path.endsWith('/login')) {
              final body = _sessionBody();
              if (++logins > 1) {
                body['access_token'] = 'new-access';
                body['refresh_token'] = 'new-refresh';
              }
              return http.Response(jsonEncode(body), 200);
            }
            if (request.url.path.endsWith('/refresh')) {
              if (refreshing.isCompleted) {
                return http.Response('{"detail":"expired"}', 401);
              }
              refreshing.complete();
              return response.future;
            }
            if (request.url.path.endsWith('/logout')) {
              return http.Response('{}', 200);
            }
            return http.Response('{"detail":"expired"}', 401);
          }),
        );
        await api.login('test', 'unused');
        final pending = expectLater(
          api.devices(),
          throwsA(isA<ApiException>()),
        );
        await refreshing.future;
        await api.logout();
        if (relogin) await api.login('test', 'unused');
        final old = _sessionBody()
          ..['access_token'] = 'late-access'
          ..['refresh_token'] = 'late-refresh';
        response.complete(http.Response(jsonEncode(old), 200));
        await pending;
        expect(api.accessToken, relogin ? 'new-access' : isNull);
        expect(
          (await SharedPreferences.getInstance()).getString(
            'aoying.refresh_token',
          ),
          relogin ? 'new-refresh' : isNull,
        );
      },
    );
  }

  test('list 401 performs at most one refresh and one retry', () async {
    var gets = 0;
    var refreshes = 0;
    final api = ApiClient(
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/login')) {
          return http.Response(jsonEncode(_sessionBody()), 200);
        }
        if (request.url.path.endsWith('/refresh')) {
          refreshes++;
          return http.Response(jsonEncode(_sessionBody()), 200);
        }
        gets++;
        return http.Response(
          '{"detail":"unauthorized"}',
          gets <= 2 ? 401 : 403,
        );
      }),
    );
    await api.login('test', 'unused');
    await expectLater(api.devices(), throwsA(isA<ApiException>()));
    expect(gets, 2);
    expect(refreshes, 1);
  });

  test(
    'late concurrent 401 reuses the already refreshed access token',
    () async {
      final late401 = Completer<http.Response>();
      var gets = 0;
      var refreshes = 0;
      final api = ApiClient(
        httpClient: MockClient((request) async {
          if (request.url.path.endsWith('/login')) {
            return http.Response(jsonEncode(_sessionBody()), 200);
          }
          if (request.url.path.endsWith('/refresh')) {
            refreshes++;
            return http.Response(
              jsonEncode(_sessionBody()..['access_token'] = 'rotated'),
              200,
            );
          }
          if (request.headers['authorization'] == 'Bearer rotated') {
            return http.Response('[]', 200);
          }
          if (++gets == 2) return late401.future;
          return http.Response('{"detail":"expired"}', 401);
        }),
      );
      await api.login('test', 'unused');
      final first = api.devices();
      final second = api.devices();
      await first;
      late401.complete(http.Response('{"detail":"expired"}', 401));
      await second;
      expect(refreshes, 1);
    },
  );

  test(
    'a pending ticket failure cannot restart a stopped connection',
    () async {
      final api = _PendingTicketApi();
      final live = LiveController(api: api);
      addTearDown(live.dispose);
      live.start();
      expect(live.status, LiveStatus.connecting);
      live.stop();
      api.ticket.completeError(StateError('late ticket failure'));
      await Future<void>.delayed(Duration.zero);
      expect(live.status, LiveStatus.idle);
    },
  );

  testWidgets(
    'anonymous and signing-out sessions silence alerts; login resumes with fresh history',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final logoutResponse = Completer<http.Response>();
      final api = ApiClient(
        httpClient: MockClient((request) async {
          return switch (request.url.path) {
            '/api/auth/login' => http.Response(jsonEncode(_sessionBody()), 200),
            '/api/auth/logout' => logoutResponse.future,
            '/api/positions' => http.Response(
              '{"positions":[],"count":0}',
              200,
            ),
            '/api/signals' => http.Response('{"signals":[],"count":0}', 200),
            _ => http.Response('{}', 200),
          };
        }),
      );
      final session = SessionController.anonymous(api: api);
      final live = _CountingLive(api);
      final sound = SilentSound();
      final alerts = AlertController(live: live, sound: sound);
      addTearDown(session.dispose);
      addTearDown(live.dispose);
      addTearDown(alerts.dispose);
      await tester.pumpWidget(
        AoyingApp(session: session, live: live, alerts: alerts),
      );
      live.ingestEvents([_signal(10)]);
      live.ingestEvents([_signal(11)]);
      expect(
        sound.played,
        isEmpty,
        reason: 'anonymous traffic must never ring',
      );
      expect(alerts.alerts, isEmpty);

      await session.login('test', 'unused');
      await tester.pumpAndSettle();
      expect(live.starts, 1);
      live.ingestEvents([_signal(20)]);
      expect(sound.played, isEmpty, reason: 'first login batch is history');
      live.ingestEvents([_signal(21)]);
      expect(sound.played, [SignalAction.open]);

      final signingOut = session.logout();
      expect(
        session.isAuthenticated,
        isFalse,
        reason: 'do not wait for network to silence the session',
      );
      expect(live.stops, greaterThan(0));
      expect(live.events, isEmpty);
      expect(live.lastEventId, 0);
      expect(alerts.alerts, isEmpty);
      expect(alerts.unread, 0);
      live.ingestEvents([_signal(22)]);
      expect(sound.played, [SignalAction.open]);
      logoutResponse.complete(http.Response('{}', 200));
      await signingOut;
      await tester.pumpAndSettle();

      await session.login('test', 'unused');
      await tester.pumpAndSettle();
      expect(live.starts, 2);
      live.ingestEvents([_signal(1)]);
      expect(sound.played, [
        SignalAction.open,
      ], reason: 'new session history must not ring');
      live.ingestEvents([_signal(2)]);
      expect(sound.played, [SignalAction.open, SignalAction.open]);
      expect(alerts.unread, 1);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(live.stops, greaterThanOrEqualTo(2));
    },
  );
}

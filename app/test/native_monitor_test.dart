import 'dart:async';
import 'dart:convert';

import 'package:aoying_monitor/alerts.dart';
import 'package:aoying_monitor/api.dart';
import 'package:aoying_monitor/app.dart';
import 'package:aoying_monitor/session.dart';
import 'package:flutter/material.dart';
import 'package:aoying_monitor/live.dart';
import 'package:aoying_monitor/monitor_bridge.dart';
import 'package:aoying_monitor/signals.dart';
import 'package:aoying_monitor/sound.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> sessionBody([String access = 'native-access']) => {
  'access_token': access,
  'refresh_token': '',
  'user': {'id': 1, 'username': 'test', 'display_name': 'Test'},
  'device': {'id': 1, 'name': 'test', 'platform': 'android'},
};

class FakeMonitor implements MonitorBridge {
  final frames = StreamController<Map<String, dynamic>>.broadcast(sync: true);
  final calls = <String>[];
  final arguments = <String, Map<String, dynamic>>{};
  Future<dynamic> Function(String, Map<String, dynamic>)? handler;

  @override
  Stream<Map<String, dynamic>> get events => frames.stream;

  @override
  Future<dynamic> invoke(
    String method, [
    Map<String, dynamic>? arguments,
  ]) async {
    calls.add(method);
    this.arguments[method] = arguments ?? {};
    if (handler != null) return handler!(method, arguments ?? {});
    if (method.startsWith('auth.') && method != 'auth.logout') {
      return sessionBody();
    }
    return {
      'supported': true,
      'enabled': false,
      'notificationPermission': false,
      'notificationsEnabled': false,
      'batteryUnrestricted': false,
      'connection': 'idle',
      'reason': 'notification_permission_denied',
    };
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'Android login delegates to native owner without storing refresh in Dart',
    () async {
      final bridge = FakeMonitor();
      addTearDown(bridge.frames.close);
      var httpCalls = 0;
      final api = ApiClient(
        monitor: bridge,
        httpClient: MockClient((_) async {
          httpCalls++;
          return http.Response(jsonEncode(sessionBody('http-access')), 200);
        }),
      );
      final session = await api.login('test', 'unused');
      expect(bridge.calls, ['auth.login']);
      expect(httpCalls, 0);
      expect(session.accessToken, 'native-access');
      expect(api.accessToken, 'native-access');
      expect(bridge.arguments['auth.login']!['baseUrl'], api.baseUrl);
      expect(bridge.arguments['auth.login']!['device'], isA<Map>());
      expect(
        (await SharedPreferences.getInstance()).containsKey(
          'aoying.refresh_token',
        ),
        isFalse,
      );
    },
  );

  test(
    'native restore migrates legacy refresh only after durable success',
    () async {
      SharedPreferences.setMockInitialValues({
        'aoying.refresh_token': 'legacy',
      });
      final bridge = FakeMonitor();
      addTearDown(bridge.frames.close);
      final api = ApiClient(
        monitor: bridge,
        httpClient: MockClient(
          (_) async =>
              http.Response(jsonEncode(sessionBody('http-access')), 200),
        ),
      );
      final restored = await api.restore();
      expect(bridge.calls, ['auth.restore']);
      expect(bridge.arguments['auth.restore']!['legacyRefresh'], 'legacy');
      expect(restored!.accessToken, 'native-access');
      expect(
        (await SharedPreferences.getInstance()).containsKey(
          'aoying.refresh_token',
        ),
        isFalse,
      );
    },
  );

  test(
    'failed native migration retains legacy token for a later attempt',
    () async {
      SharedPreferences.setMockInitialValues({
        'aoying.refresh_token': 'legacy',
      });
      final bridge = FakeMonitor()
        ..handler = (_, _) async => throw StateError('unavailable');
      addTearDown(bridge.frames.close);
      final api = ApiClient(
        monitor: bridge,
        httpClient: MockClient((_) async => http.Response('{}', 503)),
      );
      await expectLater(api.restore(), throwsA(anything));
      expect(
        (await SharedPreferences.getInstance()).getString(
          'aoying.refresh_token',
        ),
        'legacy',
      );
    },
  );

  test(
    'Android REST 401 refreshes through native expectedAccess exactly once',
    () async {
      final bridge = FakeMonitor();
      bridge.handler = (method, args) async => sessionBody(
        method == 'auth.refresh' ? 'rotated-access' : 'native-access',
      );
      addTearDown(bridge.frames.close);
      var dartRefresh = 0;
      var gets = 0;
      final api = ApiClient(
        monitor: bridge,
        httpClient: MockClient((request) async {
          if (request.url.path.endsWith('/login')) {
            return http.Response(jsonEncode(sessionBody()), 200);
          }
          if (request.url.path.endsWith('/refresh')) {
            dartRefresh++;
            return http.Response(jsonEncode(sessionBody('wrong-owner')), 200);
          }
          gets++;
          return gets == 1
              ? http.Response('{"detail":"expired"}', 401)
              : http.Response('[]', 200);
        }),
      );
      await api.login('test', 'unused');
      expect(await api.devices(), isEmpty);
      expect(bridge.calls.where((m) => m == 'auth.refresh').length, 1);
      expect(bridge.arguments['auth.refresh'], {
        'expectedAccess': 'native-access',
      });
      expect(dartRefresh, 0);
      expect(api.accessToken, 'rotated-access');
    },
  );

  test('Android live consumes native frames without a Dart ticket/socket', () async {
    final bridge = FakeMonitor();
    addTearDown(bridge.frames.close);
    var tickets = 0;
    final api = ApiClient(
      monitor: bridge,
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/login')) {
          return http.Response(jsonEncode(sessionBody()), 200);
        }
        tickets++;
        return http.Response('{"detail":"not a Dart socket"}', 503);
      }),
    );
    await api.login('test', 'unused');
    final live = LiveController(api: api);
    var disposed = false;
    addTearDown(() {
      if (!disposed) live.dispose();
    });
    live.start();
    await Future<void>.delayed(Duration.zero);
    bridge.frames.add({
      'type': 'event',
      'event': {
        'id': 12,
        'kind': 'signal.open',
        'payload': {'symbol': 'BTCUSDT'},
        'created_at': null,
      },
    });
    expect(tickets, 0);
    expect(live.events.map((e) => e.id), [12]);
    live.dispose();
    disposed = true;
    expect(
      bridge.calls,
      isNot(contains('monitor.stop')),
      reason: 'UI disposal must not stop the independent service',
    );
    await api.logout();
    // auth.logout owns service teardown; monitor.stop is user preference only.
    expect(bridge.calls, contains('auth.logout'));
    expect(bridge.calls, isNot(contains('monitor.stop')));
    expect(api.accessToken, isNull);
  });

  test(
    'ordinary logout preserves automatic monitor restart after login',
    () async {
      final bridge = FakeMonitor();
      addTearDown(bridge.frames.close);
      var hasSession = false;
      var userStopped = false;
      var enabled = false;
      bridge.handler = (method, arguments) async {
        if (method == 'auth.login') {
          hasSession = true;
          return sessionBody();
        }
        if (method == 'auth.logout') {
          hasSession = false;
          enabled = false;
        }
        if (method == 'monitor.stop') {
          userStopped = true;
          enabled = false;
        }
        if (method == 'monitor.start') {
          if (arguments['requestPermission'] == true) userStopped = false;
          enabled = hasSession && !userStopped;
        }
        return {
          'supported': true,
          'enabled': enabled,
          'connection': enabled ? 'live' : 'stopped',
          'reason': userStopped ? 'user_stopped' : '',
        };
      };
      final api = ApiClient(monitor: bridge);
      final live = LiveController(api: api, autoConnect: false);
      addTearDown(live.dispose);
      await api.login('test', 'unused');
      live.start();
      await live.startMonitor(requestPermission: false);
      expect(live.monitorStatus.enabled, isTrue);
      await api.logout();
      live.stop();
      await api.login('test', 'unused');
      live.start();
      await live.startMonitor(requestPermission: false);
      expect(
        live.monitorStatus.enabled,
        isTrue,
        reason: 'logout is not an explicit user stop preference',
      );
      expect(bridge.calls, isNot(contains('monitor.stop')));
      expect(bridge.calls, contains('auth.logout'));
    },
  );

  testWidgets(
    'settings exposes denied status and only an explicit action requests permission',
    (tester) async {
      final bridge = FakeMonitor();
      addTearDown(bridge.frames.close);
      final api = ApiClient(
        monitor: bridge,
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/devices') {
            return http.Response('[]', 200);
          }
          if (request.url.path == '/api/positions') {
            return http.Response('{"positions":[],"count":0}', 200);
          }
          if (request.url.path == '/api/signals') {
            return http.Response('{"signals":[],"count":0}', 200);
          }
          return http.Response('{}', 200);
        }),
      );
      final session = SessionController.seeded(
        api: api,
        user: const ApiUser(id: 1, username: 'test', displayName: 'Test'),
        device: const ApiDevice(
          id: 1,
          name: 'test',
          platform: 'android',
          pushMode: 'local',
          lastSeenAt: null,
        ),
      );
      final live = LiveController(api: api, autoConnect: false);
      addTearDown(session.dispose);
      addTearDown(live.dispose);
      await tester.pumpWidget(AoyingApp(session: session, live: live));
      await tester.pumpAndSettle();
      expect(
        bridge.arguments['monitor.start']?['requestPermission'],
        isNot(true),
      );
      await tester.tap(find.text('提醒').last);
      await tester.pumpAndSettle();
      expect(
        find.byTooltip('打开提示音'),
        findsNothing,
        reason: 'Android audio is owned by native notification settings',
      );
      expect(find.byTooltip('关闭提示音'), findsNothing);
      expect(find.text('通知声音由系统设置管理'), findsOneWidget);
      await tester.tap(find.text('设置').last);
      await tester.pumpAndSettle();
      expect(find.text('后台提醒未启用'), findsOneWidget);
      expect(find.text('通知权限：未授权'), findsOneWidget);
      await tester.ensureVisible(find.text('开启后台提醒'));
      await tester.tap(find.text('开启后台提醒'));
      await tester.pumpAndSettle();
      expect(bridge.arguments['monitor.start'], {'requestPermission': true});
      expect(find.text('后台提醒未启用'), findsOneWidget);
      await tester.ensureVisible(find.text('电池设置'));
      await tester.tap(find.text('电池设置'));
      await tester.pumpAndSettle();
      expect(bridge.calls, contains('monitor.batterySettings'));
      await tester.pumpWidget(const SizedBox.shrink());
      expect(
        bridge.calls,
        isNot(contains('monitor.stop')),
        reason: 'UI disposal only detaches adapter',
      );
    },
  );

  test(
    'late native start status cannot overwrite a later explicit stop',
    () async {
      final bridge = FakeMonitor();
      addTearDown(bridge.frames.close);
      final starting = Completer<Map<String, dynamic>>();
      bridge.handler = (method, _) async {
        if (method == 'monitor.start') return starting.future;
        return {
          'supported': true,
          'enabled': false,
          'notificationPermission': true,
          'notificationsEnabled': true,
          'batteryUnrestricted': false,
          'connection': 'stopped',
          'reason': 'user_stopped',
        };
      };
      final live = LiveController(
        api: ApiClient(monitor: bridge),
        autoConnect: false,
      );
      addTearDown(live.dispose);
      live.start();
      final pending = live.startMonitor(requestPermission: true);
      await live.stopMonitor();
      starting.complete({
        'supported': true,
        'enabled': true,
        'notificationPermission': true,
        'notificationsEnabled': true,
        'batteryUnrestricted': false,
        'connection': 'live',
        'reason': '',
      });
      await pending;
      expect(live.monitorStatus.enabled, isFalse);
      expect(live.status, LiveStatus.idle);
    },
  );

  test(
    'unavailable native bridge reports unknown rather than enabled',
    () async {
      final bridge = FakeMonitor()
        ..handler = (_, _) async => throw StateError('unavailable');
      addTearDown(bridge.frames.close);
      final live = LiveController(
        api: ApiClient(monitor: bridge),
        autoConnect: false,
      );
      addTearDown(live.dispose);
      live.start();
      await live.startMonitor(requestPermission: true);
      expect(live.monitorStatus.enabled, isNull);
      expect(live.monitorStatus.reason, 'bridge_unavailable');
      expect(live.status, LiveStatus.offline);
    },
  );

  test(
    'first native signal is unread and Android never plays Dart audio',
    () async {
      final bridge = FakeMonitor();
      addTearDown(bridge.frames.close);
      final live = LiveController(
        api: ApiClient(monitor: bridge),
        autoConnect: false,
      );
      final sound = SilentSound();
      final alerts = AlertController(live: live, sound: sound);
      addTearDown(live.dispose);
      addTearDown(alerts.dispose);
      live.ingestEvents([
        const ApiEvent(
          id: 1,
          kind: 'signal.open',
          payload: {'symbol': 'BTCUSDT'},
          createdAt: null,
        ),
      ]);
      expect(
        alerts.unread,
        1,
        reason: 'native already owns silent history baseline',
      );
      live.ingestEvents([
        const ApiEvent(
          id: 2,
          kind: 'signal.close',
          payload: {'symbol': 'BTCUSDT'},
          createdAt: null,
        ),
      ]);
      expect(sound.played, isEmpty);
      await alerts.preview(SignalAction.open);
      expect(
        sound.played,
        isEmpty,
        reason:
            'sound previews also must not create a second Android audio owner',
      );
    },
  );
}

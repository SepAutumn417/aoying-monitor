import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:aoying_monitor/api.dart';
import 'package:aoying_monitor/ledger.dart';
import 'package:aoying_monitor/ledger_models.dart';
import 'package:aoying_monitor/live.dart';
import 'package:aoying_monitor/session.dart';

const statusJson = {
  'positions_open': 3,
  'positions_closed': 12,
  'realized_closed': 0,
  'signals': 20,
  'events': 30,
  'last_signal_at': '2026-11-09T00:00:00Z',
};
const positionJson = {
  'id': 1,
  'symbol': 'BTCUSDT',
  'side': 'long',
  'status': 'open',
  'opened_at': '2026-11-09T00:00:00Z',
  'closed_at': null,
  'entry': null,
  'qty_open': 0,
  'qty_current': 0,
  'lev': null,
  'margin': null,
  'realized': 7,
  'held_seconds': 10,
  'events': [
    {'id': 2, 'kind': 'reduce', 'at': '2026-11-09T00:01:00Z', 'realized': 5},
    {'id': 3, 'kind': 'reduce', 'at': '2026-11-09T00:02:00Z', 'realized': 7},
  ],
};
const signalJson = {
  'id': 4,
  'message_id': 8,
  'symbol': 'BTCUSDT',
  'side': 'long',
  'kind': 'position',
  'action': 'open',
  'qty': 0,
  'entry': null,
  'posted_at': '2026-11-09T00:00:00Z',
  'reported_at': null,
};
SessionController signedIn(ApiClient api) => SessionController.seeded(
  api: api,
  user: const ApiUser(id: 1, username: 'a', displayName: 'A'),
  device: const ApiDevice(
    id: 1,
    name: 'test',
    platform: 'android',
    pushMode: 'local',
    lastSeenAt: null,
  ),
);
http.Response reply(http.Request request) => http.Response(
  jsonEncode(switch (request.url.path) {
    '/api/copy/status' => statusJson,
    '/api/positions' => {
      'positions': [positionJson],
      'count': 1,
    },
    '/api/signals' => {
      'signals': [signalJson],
      'count': 1,
    },
    _ => {},
  }),
  200,
);
ApiEvent event(int id, String kind, {bool test = false}) =>
    ApiEvent(id: id, kind: kind, payload: {'test': test}, createdAt: null);

class FakeLive extends LiveController {
  FakeLive(ApiClient api) : super(api: api, autoConnect: false);
  LiveStatus value = LiveStatus.idle;
  @override
  LiveStatus get status => value;
  void change(LiveStatus status) {
    value = status;
    notifyListeners();
  }
}

Future<void> flush() async {
  for (var i = 0; i < 10; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'ledger GET uses existing token refresh and authenticated retry',
    () async {
      SharedPreferences.setMockInitialValues({'aoying.refresh_token': 'old'});
      final requests = <http.Request>[];
      final api = ApiClient(
        httpClient: MockClient((r) async {
          requests.add(r);
          if (r.url.path == '/api/auth/refresh') {
            return http.Response(
              jsonEncode({
                'access_token': 'new-access',
                'refresh_token': 'new-refresh',
                'user': {'id': 1, 'username': 'a'},
                'device': {'id': 1},
              }),
              200,
            );
          }
          return r.headers['authorization'] == 'Bearer new-access'
              ? reply(r)
              : http.Response('{"detail":"expired"}', 401);
        }),
      );
      expect((await api.copyStatus()).positionsOpen, 3);
      expect(requests.map((r) => r.url.path), [
        '/api/copy/status',
        '/api/auth/refresh',
        '/api/copy/status',
      ]);
      expect(requests.last.headers['authorization'], 'Bearer new-access');
      SharedPreferences.setMockInitialValues({});
    },
  );
  test(
    'logout and dispose suppress outstanding successful snapshots',
    () async {
      SharedPreferences.setMockInitialValues({});
      for (final dispose in [false, true]) {
        final pending =
            <({http.Request request, Completer<http.Response> response})>[];
        final api = ApiClient(
          httpClient: MockClient((r) {
            final response = Completer<http.Response>();
            pending.add((request: r, response: response));
            return response.future;
          }),
        );
        final session = signedIn(api);
        final live = FakeLive(api);
        final c = LedgerController(api: api, live: live, session: session);
        await flush();
        var notifications = 0;
        c.addListener(() => notifications++);
        if (dispose) {
          c.dispose();
        } else {
          await session.logout();
        }
        final afterStop = notifications;
        for (final item in pending) {
          item.response.complete(reply(item.request));
        }
        await flush();
        expect(c.snapshot, isNull);
        expect(notifications, afterStop);
        if (!dispose) c.dispose();
        live.dispose();
        session.dispose();
      }
    },
  );
  test('models preserve null, zero, cumulative realized and source times', () {
    final p = LedgerPosition.fromJson(positionJson);
    expect(p.entry, isNull);
    expect(p.qtyCurrent, 0);
    expect(p.realized, 7);
    expect(p.events.map((e) => e.realized), [5, 7]);
    expect(p.openedAt.toUtc(), DateTime.utc(2026, 11, 9));
    final s = LedgerSignal.fromJson(signalJson);
    expect(s.qty, 0);
    expect(s.entry, isNull);
    expect(s.reportedAt, isNull);
    expect(LedgerStatus.fromJson(statusJson).realizedClosed, 0);
  });
  test('readonly API builds encoded query and returns typed lists', () async {
    final requests = <http.Request>[];
    final api = ApiClient(
      httpClient: MockClient((r) async {
        requests.add(r);
        return reply(r);
      }),
    );
    expect((await api.copyStatus()).positionsOpen, 3);
    expect(
      (await api.positions(
        status: 'open',
        symbol: 'A B',
        limit: 100,
      )).single.realized,
      7,
    );
    expect(requests.last.url.queryParameters, {
      'status': 'open',
      'symbol': 'A B',
      'limit': '100',
      'include_events': 'true',
    });
    expect((await api.signals(limit: 20)).single.qty, 0);
    expect(requests.every((r) => r.method == 'GET'), isTrue);
  });
  test('controller loads snapshot, ignores duplicates/tests, refreshes edits and reconnect', () async {
    var calls = 0;
    final api = ApiClient(
      httpClient: MockClient((r) async {
        calls++;
        return reply(r);
      }),
    );
    final live = FakeLive(api);
    final session = signedIn(api);
    final c = LedgerController(api: api, live: live, session: session);
    await flush();
    expect(c.snapshot!.status.positionsOpen, 3);
    expect(calls, 3);
    live.ingestEvents([event(1, 'signal.open', test: true)]);
    await flush();
    expect(calls, 3);
    live.ingestEvents([event(2, 'signal.open')]);
    await flush();
    expect(calls, 6);
    live.ingestEvents([event(2, 'signal.open')]);
    await flush();
    expect(calls, 6);
    live.ingestEvents([
      event(3, 'telegram.message.edited'),
      event(4, 'telegram.message.deleted'),
    ]);
    await flush();
    expect(calls, 9);
    live.change(LiveStatus.live);
    await flush();
    expect(calls, 12);
    live.change(LiveStatus.retrying);
    live.change(LiveStatus.live);
    await flush();
    expect(calls, 15);
    c.dispose();
    live.ingestEvents([event(5, 'signal.close')]);
    await flush();
    expect(calls, 15);
    live.dispose();
    session.dispose();
  });
  test('refresh failure keeps stale snapshot; logout clears it', () async {
    var fail = false;
    final api = ApiClient(
      httpClient: MockClient(
        (r) async =>
            fail ? http.Response('{"detail":"failed"}', 503) : reply(r),
      ),
    );
    final live = FakeLive(api);
    final session = signedIn(api);
    final c = LedgerController(api: api, live: live, session: session);
    await flush();
    final previous = c.snapshot;
    fail = true;
    await c.reload();
    expect(c.snapshot, same(previous));
    expect(c.error, isNotNull);
    await session.logout();
    expect(c.snapshot, isNull);
    expect(c.error, isNull);
    c.dispose();
    live.dispose();
    session.dispose();
  });
  test('coalesces invalidations and never publishes superseded or disposed results', () async {
    final pending = <Completer<http.Response>>[];
    var calls = 0;
    final api = ApiClient(
      httpClient: MockClient((r) {
        calls++;
        if (calls <= 3) {
          final p = Completer<http.Response>();
          pending.add(p);
          return p.future;
        }
        return Future.value(reply(r));
      }),
    );
    final live = FakeLive(api);
    final session = signedIn(api);
    final c = LedgerController(api: api, live: live, session: session);
    await flush();
    var published = 0;
    c.addListener(() {
      if (c.snapshot != null) published++;
    });
    live.ingestEvents([event(1, 'signal.open')]);
    live.ingestEvents([event(2, 'signal.close')]);
    expect(calls, 3);
    for (final p in pending) {
      p.complete(
        http.Response(
          '{"positions_open":999,"positions_closed":0,"realized_closed":0,"signals":0,"events":0,"positions":[],"signals_list":[]}',
          200,
        ),
      );
    }
    await flush();
    expect(calls, 6);
    expect(c.snapshot!.status.positionsOpen, 3);
    expect(published, 1);
    c.dispose();
    live.dispose();
    session.dispose();
  });
}

# Android Background Alerts Implementation Plan

> **For agentic workers:** Execute task-by-task with focused subagents and Lead review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved native foreground-service background signal notification feature, without changing trading data or replacing the live Web.

**Architecture:** One Android native authentication owner and one native WSS dispatcher; Flutter is an adapter, not a second Android refresh/socket owner. WSS v2 uses snapshot-bounded replay pages plus a completion watermark; v1 remains compatible. Keystore storage, session epochs, persisted cursor, stable notification identity, explicit permissions and honest background limitations are required.

**Tech Stack:** FastAPI/SQLAlchemy, Kotlin/OkHttp/Android FGS, Flutter MethodChannel/EventChannel, pytest/JUnit/flutter_test.

---

## Integration contract (all tasks)

MethodChannel `com.aoying.monitor/control`; EventChannel `com.aoying.monitor/events`.
Methods (arguments map): `auth.login` {baseUrl,username,password,device}; `auth.restore` {baseUrl,legacyRefresh?}; `auth.refresh` {expectedAccess}; `auth.logout` {}; `monitor.start` {requestPermission:boolean}; `monitor.stop` {}; `monitor.status` {}; `monitor.visibility` {visible:boolean}; `monitor.batterySettings` {}.
Auth responses match backend session fields but `refresh_token` is redacted to an empty string; access may return to the calling Dart HTTP adapter, never via broadcast events/logs. Native holds encrypted refresh and serializes rotation; logout invalidates epoch before asynchronous revoke. Errors are PlatformException with safe, token-free messages.
Status map: {supported:true,enabled:boolean,notificationPermission:boolean,notificationsEnabled:boolean,batteryUnrestricted:boolean,connection:string,reason:string}; no claim of delivery guarantee. Event stream emits existing {type:event,event:{id,kind,payload,created_at}}, {type:status,status:...}. Native startup/restore does not request permissions without visible explicit interaction. `auth.logout` synchronously invalidates the session and internally stops/clears monitoring without changing the persisted user-stop preference; Dart must not additionally call `monitor.stop` during ordinary logout. `monitor.stop` is reserved for an explicit user stop and persists that preference; automatic `monitor.start(false)` respects it, while explicit `monitor.start(true)` may clear it.
WSS v2 client hello {type:hello,protocol_version:2,last_event_id:N}; server replay pages {type:replay,events:[],count:n,next_cursor:N,watermark:H,has_more:boolean}; completion {type:replay_complete,last_event_id:H}. First connection takes server hello H as silent baseline before sending client hello. During catch-up live frames are buffered and ordered after completion. Unknown event kinds advance cursor without notifying. Five signal kinds use existing headline/summary; test flags remain visible.

## Task 1: Reliable WSS v2 catch-up (backend-only worker)
Files: backend/app/events.py, backend/app/api/ws.py; tests backend/tests/test_ws_replay_v2.py and existing websocket tests.
- [ ] Write failing tests for 201+ records, gap IDs, live/replay interleave, empty completion, overflow causing reconnect, v1 compatibility.
- [ ] Run `python -m pytest backend/tests/test_ws_replay_v2.py -q`; record the actual RED assertion before implementation.
- [ ] Add bounded replay query `after_id < Event.id <= through_id` with limit100; subscribe before snapshot capture; serialize websocket writes; paginate to fixed H and send completion even when empty. Invalid JSON object/negative cursor handled safely. Queue overflow must close/resync, not drop silently.
- [ ] Run targeted tests, then `python -m pytest backend/tests -q` and ruff for modified files. Return commands/results and protocol readback to Lead; do not deploy or commit unrelated files.

## Task 2: Native monitor (Android-only worker)
Files: app/android/app/src/main/kotlin/com/aoying/aoying_monitor/MainActivity.kt, monitor/*.kt, pure/*.kt; app/android/app/src/test/...; app/android/app/build.gradle.kts and AndroidManifest.xml. Do not touch Dart.
- [ ] Write JUnit RED for replay reducer baseline/201 events/duplicate/reconnect, 5-kind notification filtering/test marker, epoch and rotation concurrency. Run the test task and record RED before implementation; if toolchain permission blocks execution ask Lead to run exact command.
- [ ] Implement contract above with injectable HTTP/auth/storage seams. Auth is single-flight with epoch-protected atomic store; native encrypted session migration removes old Dart refresh only after durable success. Logout disables first and never resurrects from a late refresh/login.
- [ ] Persist cursor by origin/user/device; process at-most-once notification identity using stable event tag and onlyAlertOnce; buffer live until completion; JSON ping25s/pong timeout75s; reconnect1–30s with jitter, fresh ticket each connection and TLS validation. Do not log URLs containing tickets.
- [ ] Add exported=false specialUse foreground service with explicit honest subtype and required version-gated permissions; low-noise ongoing status channel and separate signal channel, immutable PendingIntent opens app only. User stop/permission denial reflected in status; no boot receiver/force-stop guarantee.
- [ ] Track visibility/lock state to suppress duplicate foreground system sound; Flutter Android sound is disabled by Task3. Activity destruction must not destroy a started service. Backpressure/resync and late callbacks must not skip events or revive logout.
- [ ] Run native tests and compile; report RED/GREEN, integration API and remaining platform risks. No device operations, credentials, server access or broad formatting.

## Task 3: Dart adapter and generation regression (Dart-only worker)
Files: app/lib/monitor_bridge.dart, api.dart, live.dart, alerts.dart, app.dart, screens/settings_screen.dart; app/test/native_monitor_test.dart and logout_test.dart. Do not touch Android build/source.
- [ ] Write RED tests for native auth delegation, native socket adapter (no Dart Android socket), denied notification status, enable/stop/logout, first real event not swallowed, slow refresh versus logout/new login and concurrent401.
- [ ] Implement injectable bridge matching exact contract; Android uses native session owner for login/restore/refresh/logout. Other platforms use existing HTTP with epoch protection and bounded one refresh/retry. Remove legacy refresh preference after successful native migration only.
- [ ] LiveController Android consumes native events/status; cancel adapter subscriptions without stopping the independent service during UI disposal. Explicit logout invokes native stop/clear. Android never plays Dart audio; native handles signal notification exclusively, including visible silent notifications if desired.
- [ ] Add a minimal existing-settings section: actual permission/service/connection state, explicit enable-permission action, explicit battery guidance. Do not redo design or imply running before native confirmation. No modal assumptions or simulated delivery success.
- [ ] Run `flutter test test/native_monitor_test.dart test/logout_test.dart`, all Flutter tests, `dart analyze lib test`; return RED/GREEN and exact changed files.

## Task 4: Integration and delivery (Lead)
- [ ] Review native/Dart contract and tests; test denied permission, anonymous startup, offline logout, relogin, repeated enable, orientation/background disposal without duplicate sockets, replay first future event.
- [ ] `scripts/build-online-android.ps1` uses quoted Gradle -P flags and HTTPS production API. Run native tests with same ASCII Gradle environment, then build internal arm64 debug APK. Inspect final Manifest/version/signature, do not label old APK current.
- [ ] Back up persistent server SQLite using SQLite backup API; package backend/Web without overwriting production DB/env/session; deploy new release only after tests pass; restart single API worker, nginx test and authenticated HTTPS/WSS v1/v2 smoke. Keep rollback release and existing certificate renewals.
- [ ] Re-probe local TG configuration only as presence booleans. If still absent, leave live-ingestion verification pending and ask user to save the correct local configuration, never request secrets in chat. Do not enable unauthorized sources or inject fake ledger messages.
- [ ] Publish new APK and download URL, verify checksum over HTTPS. Ask permission before installing/foregrounding phone; distinguish automated tests from actual background/lockscreen notification receipt. Record status and honest limits in docs/deployment-20261110.md; mark goal complete only on actual delivery criteria or report concrete missing gates.

## Review checklist

Plan covers service, auth/rotation, replay/backpressure, permission/visibility/notification, Dart compatibility, tests, packaging/deploy, live TG and authorized device verification. No FCM, exchange operations, new UI redesign or guaranteed force-stop delivery. Source scopes are disjoint; Lead owns final integration and production writes.

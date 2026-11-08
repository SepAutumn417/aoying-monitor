import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'alerts.dart';
import 'app_scope.dart';
import 'config.dart';
import 'live.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'session.dart';
import 'theme.dart';

class AoyingApp extends StatefulWidget {
  const AoyingApp({super.key, this.session, this.live, this.alerts});

  /// Test hooks: inject a ready-made session/live controller instead of hitting
  /// the network. All are optional so production wiring stays one line.
  final SessionController? session;
  final LiveController? live;
  final AlertController? alerts;

  @override
  State<AoyingApp> createState() => _AoyingAppState();
}

class _AoyingAppState extends State<AoyingApp> {
  late final SessionController _session = widget.session ?? SessionController();
  late final LiveController _live = widget.live ?? LiveController(api: _session.api);
  late final AlertController _alerts =
      widget.alerts ?? AlertController(live: _live);

  /// 调试用的直达栏目：
  /// - Android/测试：`--dart-define=START_AT=2`
  /// - Web：`?tab=2`
  /// 都没有时返回 null，正常从登录页开始。
  static int? _debugStartIndex() {
    final fromEnv = int.tryParse(AppConfig.startAt);
    if (fromEnv != null) return fromEnv;
    if (!kIsWeb) return null;
    return int.tryParse(Uri.base.queryParameters['tab'] ?? '');
  }

  @override
  void initState() {
    super.initState();
    if (widget.session == null) unawaited(_session.bootstrap());
  }

  @override
  void dispose() {
    if (widget.alerts == null) _alerts.dispose();
    _live.dispose();
    if (widget.session == null) _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final debugIndex = _debugStartIndex();

    return AppScope(
      session: _session,
      live: _live,
      alerts: _alerts,
      child: MaterialApp(
        title: '熬鹰资本 · 交易监控',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: debugIndex != null
            ? HomeShell(initialIndex: debugIndex)
            : AnimatedBuilder(
                animation: _session,
                builder: (context, _) {
                  if (_session.status == SessionStatus.loading) {
                    return const _Splash();
                  }
                  if (_session.isAuthenticated) return const HomeShell();
                  return const LoginScreen();
                },
              ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}

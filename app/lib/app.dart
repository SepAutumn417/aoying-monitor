import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'config.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'theme.dart';

class AoyingApp extends StatelessWidget {
  const AoyingApp({super.key});

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
  Widget build(BuildContext context) {
    final startIndex = _debugStartIndex();

    return MaterialApp(
      title: '熬鹰资本 · 交易监控',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: startIndex == null
          ? const LoginScreen()
          : HomeShell(initialIndex: startIndex),
    );
  }
}

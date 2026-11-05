import 'package:flutter/material.dart';

import 'screens/login_screen.dart';
import 'theme.dart';

class AoyingApp extends StatelessWidget {
  const AoyingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '熬鹰资本 · 交易监控',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const LoginScreen(),
    );
  }
}

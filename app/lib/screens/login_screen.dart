import 'package:flutter/material.dart';

import '../config.dart';
import '../theme.dart';
import '../widgets/status_chip.dart';
import 'home_shell.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: AppColors.signal.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: AppColors.signal.withValues(alpha: 0.30),
                          ),
                        ),
                        child: const Icon(
                          Icons.monitor_heart_outlined,
                          color: AppColors.signal,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'AOYING MONITOR',
                            style: TextStyle(
                              color: AppColors.mist,
                              fontSize: 9,
                              letterSpacing: 2.0,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(height: 3),
                          Text(
                            '熬鹰资本 · 交易监控',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.lock_outline,
                                size: 16,
                                color: AppColors.mistBright,
                              ),
                              const SizedBox(width: 7),
                              Text(
                                '登录',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              const Spacer(),
                              const StatusChip(label: 'I1 接入'),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '登录与设备会话将在 I1 接入；现在可以先预览监控骨架。',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const SizedBox(height: 16),
                          const TextField(
                            enabled: false,
                            decoration: InputDecoration(
                              labelText: '用户名',
                              hintText: 'I1 接入',
                              prefixIcon: Icon(Icons.person_outline, size: 18),
                            ),
                          ),
                          const SizedBox(height: 10),
                          const TextField(
                            enabled: false,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: '密码',
                              hintText: 'I1 接入',
                              prefixIcon: Icon(Icons.key_outlined, size: 18),
                            ),
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: () {
                                Navigator.of(context).pushReplacement(
                                  MaterialPageRoute<void>(
                                    builder: (_) => const HomeShell(),
                                  ),
                                );
                              },
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.signal,
                                foregroundColor: AppColors.ink,
                                padding: const EdgeInsets.symmetric(vertical: 13),
                              ),
                              child: const Text(
                                '预览骨架',
                                style: TextStyle(fontWeight: FontWeight.w600),
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Center(
                            child: Text(
                              '只读监控 · 不执行交易',
                              style: TextStyle(
                                color: AppColors.mist.withValues(alpha: 0.7),
                                fontSize: 10,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: Text(
                      'v${AppConfig.appVersion} · ${AppConfig.increment} SCAFFOLD',
                      style: TextStyle(
                        color: AppColors.mist.withValues(alpha: 0.55),
                        fontSize: 10,
                        letterSpacing: 1.0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

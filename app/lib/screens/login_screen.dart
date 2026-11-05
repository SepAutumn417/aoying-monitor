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
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.signal.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(11),
                          border: Border.all(
                            color: AppColors.signal.withValues(alpha: 0.30),
                          ),
                        ),
                        child: const Icon(
                          Icons.monitor_heart_outlined,
                          color: AppColors.signal,
                          size: 21,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        '熬鹰资本 · 交易监控',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 26),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text('登录', style: Theme.of(context).textTheme.titleMedium),
                              const Spacer(),
                              const StatusChip(label: '演示', tone: StatusTone.pending),
                            ],
                          ),
                          const SizedBox(height: 14),
                          const TextField(
                            enabled: false,
                            decoration: InputDecoration(
                              labelText: '用户名',
                              prefixIcon: Icon(Icons.person_outline, size: 18),
                            ),
                          ),
                          const SizedBox(height: 10),
                          const TextField(
                            enabled: false,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: '密码',
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
                                '进入监控台',
                                style: TextStyle(fontWeight: FontWeight.w600),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Center(
                    child: Text(
                      'v${AppConfig.appVersion} · 只读',
                      style: const TextStyle(color: AppColors.mist, fontSize: 10),
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

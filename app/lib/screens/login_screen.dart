import 'package:flutter/material.dart';

import '../app_scope.dart';
import '../theme.dart';
import '../widgets/status_chip.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final session = AppScope.sessionOf(context);
    final ok = await session.login(_username.text, _password.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (!ok) _error = session.error ?? '登录失败';
    });
  }

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
                              const StatusChip(label: '只读', tone: StatusTone.ok),
                            ],
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _username,
                            enabled: !_busy,
                            textInputAction: TextInputAction.next,
                            autocorrect: false,
                            decoration: const InputDecoration(
                              labelText: '用户名',
                              prefixIcon: Icon(Icons.person_outline, size: 18),
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: _password,
                            enabled: !_busy,
                            obscureText: true,
                            onSubmitted: (_) => _submit(),
                            decoration: const InputDecoration(
                              labelText: '密码',
                              prefixIcon: Icon(Icons.key_outlined, size: 18),
                            ),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              decoration: BoxDecoration(
                                color: AppColors.danger.withValues(alpha: 0.10),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: AppColors.danger.withValues(alpha: 0.30),
                                ),
                              ),
                              child: Text(
                                _error!,
                                style: const TextStyle(color: AppColors.danger, fontSize: 11),
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: _busy ? null : _submit,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.signal,
                                foregroundColor: AppColors.ink,
                                padding: const EdgeInsets.symmetric(vertical: 13),
                              ),
                              child: _busy
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: AppColors.ink,
                                      ),
                                    )
                                  : const Text(
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
                  const Center(
                    child: Text(
                      '只读 · 不执行任何交易',
                      style: TextStyle(color: AppColors.mist, fontSize: 10),
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

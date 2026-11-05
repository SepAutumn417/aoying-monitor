class AppConfig {
  const AppConfig._();

  /// Android emulator: 10.0.2.2 maps to the host machine.
  /// Physical device: pass `--dart-define=API_BASE_URL=http://<LAN-IP>:8000`.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  static const appVersion = '0.2.0';

  /// 调试/截图用：`--dart-define=START_AT=0` 直接进监控壳，跳过登录占位。
  /// 空字符串表示正常从登录页开始。
  static const startAt = String.fromEnvironment('START_AT');
}

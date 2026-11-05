class AppConfig {
  const AppConfig._();

  /// Android emulator: 10.0.2.2 maps to the host machine.
  /// Physical device: pass `--dart-define=API_BASE_URL=http://<LAN-IP>:8000`.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  static const appVersion = '0.1.0';
  static const increment = 'I0';
}

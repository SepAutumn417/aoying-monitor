import 'package:flutter/widgets.dart';

import 'alerts.dart';
import 'live.dart';
import 'ledger.dart';
import 'session.dart';

/// Hand-held dependency scope: one session, one live socket, one alert centre.
///
/// Deliberately not a DI package — three controllers do not justify one.
class AppScope extends InheritedWidget {
  const AppScope({
    super.key,
    required this.session,
    required this.live,
    required this.alerts,
    required this.ledger,
    required super.child,
  });

  final SessionController session;
  final LiveController live;
  final AlertController alerts;
  final LedgerController ledger;

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope 未挂载');
    return scope!;
  }

  /// Listen to the session without rebuilding the whole tree.
  static SessionController sessionOf(BuildContext context) =>
      of(context).session;

  static LiveController liveOf(BuildContext context) => of(context).live;

  static AlertController alertsOf(BuildContext context) => of(context).alerts;

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      session != oldWidget.session ||
      live != oldWidget.live ||
      alerts != oldWidget.alerts ||
      ledger != oldWidget.ledger;
}

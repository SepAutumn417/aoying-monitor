import 'package:flutter/widgets.dart';

import 'live.dart';
import 'session.dart';

/// Hand-held dependency scope: one session and one live socket for the app.
///
/// Deliberately not a DI package — two controllers do not justify one.
class AppScope extends InheritedWidget {
  const AppScope({
    super.key,
    required this.session,
    required this.live,
    required super.child,
  });

  final SessionController session;
  final LiveController live;

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope 未挂载');
    return scope!;
  }

  /// Listen to the session without rebuilding the whole tree.
  static SessionController sessionOf(BuildContext context) => of(context).session;

  static LiveController liveOf(BuildContext context) => of(context).live;

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      session != oldWidget.session || live != oldWidget.live;
}

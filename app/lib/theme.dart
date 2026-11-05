import 'package:flutter/material.dart';

class AppColors {
  const AppColors._();

  static const ink = Color(0xFF0A0E12);
  static const panel = Color(0xFF11171F);
  static const panelRaised = Color(0xFF151D26);
  static const border = Color(0xFF22303D);
  static const mist = Color(0xFF8A99A8);
  static const mistBright = Color(0xFFC9D4DF);
  static const signal = Color(0xFF3DDC97);
  static const amber = Color(0xFFF5B84B);
  static const danger = Color(0xFFFF6B6B);
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.signal,
    brightness: Brightness.dark,
  ).copyWith(
    surface: AppColors.panel,
    primary: AppColors.signal,
    secondary: AppColors.amber,
    error: AppColors.danger,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.ink,
    // InkSparkle needs a runtime shader asset; InkRipple keeps tests and
    // low-end Android devices on the plain material ripple.
    splashFactory: InkRipple.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: Colors.white,
        fontSize: 16,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.panel,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.panel,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.signal.withValues(alpha: 0.14),
      height: 66,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 11,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          color: selected ? AppColors.signal : AppColors.mist,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          size: 22,
          color: selected ? AppColors.signal : AppColors.mist,
        );
      }),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.ink.withValues(alpha: 0.55),
      hintStyle: const TextStyle(color: AppColors.mist, fontSize: 13),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.signal),
      ),
    ),
    textTheme: const TextTheme(
      headlineSmall: TextStyle(
        color: Colors.white,
        fontSize: 22,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
      ),
      titleMedium: TextStyle(
        color: Colors.white,
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
      bodyMedium: TextStyle(color: AppColors.mistBright, fontSize: 13, height: 1.5),
      bodySmall: TextStyle(color: AppColors.mist, fontSize: 12, height: 1.5),
      labelSmall: TextStyle(
        color: AppColors.mist,
        fontSize: 10,
        letterSpacing: 1.2,
        fontWeight: FontWeight.w500,
      ),
    ),
  );
}

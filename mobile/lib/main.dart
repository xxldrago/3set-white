import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app/router.dart';
import 'app/theme.dart';
import 'features/auth/providers.dart';

/// Main entry point for the 3set VPN mobile app.
/// Sets up ProviderScope, MaterialApp.router with GoRouter and Material 3 theme.
void main() {
  runApp(const ProviderScope(child: App()));
}

/// Root app widget with Riverpod ProviderScope and GoRouter.
class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Instantiate app-level listeners: incoming deep links and the biometric
    // resume gate must exist before the first route is shown.
    ref.watch(deepLinkHandlerProvider);
    ref.watch(resumeBiometricGateProvider);

    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: '3set VPN',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      routerConfig: router,
      builder: (context, child) {
        // MediaQuery override for text scaling (accessibility)
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(MediaQuery.of(context).textScaler.scale(1.0).clamp(0.8, 1.3)),
          ),
          child: child!,
        );
      },
    );
  }
}
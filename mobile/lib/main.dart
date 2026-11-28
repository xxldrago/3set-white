import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app/router.dart';
import 'app/theme.dart';
import "core/payment/payment_resume_listener.dart"
    show paymentResumeListenerProvider;
import "core/settings/auto_connect_listener.dart"
    show autoConnectListenerProvider;
import "core/vpn/connection_notifier.dart"
    show connectionReconnectListenerProvider;
import 'features/auth/providers.dart';
import 'features/servers/providers.dart' show networkPingInvalidationProvider;

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
    // D-11/REQ-PING-05: keep the real connectivity listener alive for the whole
    // app lifetime so a network change clears ping cache + last-good and
    // re-pings the current tab. Without this watch the provider is lazy and
    // the feature never runs in production.
    ref.watch(networkPingInvalidationProvider);
    // D-15/REQ-CONN-08: keep the real connectivity → FSM reconnect listener
    // alive for the whole app lifetime (debounce + VPN-only filter live in the
    // notifier). No bottom navigation is reintroduced.
    ref.watch(connectionReconnectListenerProvider);
    // D-06/REQ-SHOP-06: resume the last pending payment once per launch.
    // Kept in main.dart (not the router) so the WebView route stays side-effect
    // free (T-21-34, router_test.dart).
    ref.watch(paymentResumeListenerProvider);
    // REQ-SET-02: one-shot auto-connect after auth restore + active key. It is
    // deliberately a caller of the existing FSM; no second reconnect path,
    // native rule or kill-switch change is introduced (D-04, D-15 preserved).
    ref.watch(autoConnectListenerProvider);

    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: '3set VPN',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
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
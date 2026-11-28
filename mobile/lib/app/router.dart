import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/features/auth/screens/login_screen.dart';
import 'package:mobile/features/auth/screens/register_screen.dart';
import 'package:mobile/features/auth/screens/telegram_wait_screen.dart';
import 'package:mobile/core/payment/payment_flow.dart';
import 'package:mobile/features/servers/server_pool_screen.dart';
import 'package:mobile/features/shop/shop_screen.dart';

part 'router.g.dart';

/// App router configuration using GoRouter.
/// Routes:
/// - /auth: Login screen
/// - /register: Registration screen
/// - /telegram-wait: Telegram authentication wait screen
/// - /: Main app screen (full prototype server pools, D-15)
/// - /shop: real server-driven Shop Screen (no bottom navigation)
/// - /payment/webview: in-app hosted payment page; the URL is validated https
///   and is never treated as payment confirmation (status comes from the DB).

/// Riverpod provider for the GoRouter instance
@riverpod
GoRouter router(Ref ref) {
  return _createRouter(ref);
}

/// Creates the GoRouter with all app routes.
/// This is separated for testability.
GoRouter _createRouter(Ref ref) {
  // Re-evaluate redirects whenever the auth state changes (login, logout,
  // biometric lockout). Without this, GoRouter only redirects on navigation.
  final authRefresh = ValueNotifier<int>(0);
  ref.listen(authNotifierProvider, (_, __) => authRefresh.value++);
  ref.onDispose(authRefresh.dispose);

  return GoRouter(
    initialLocation: '/auth',
    debugLogDiagnostics: true,
    refreshListenable: authRefresh,
    redirect: (context, state) {
      final authState = ref.read(authStateProvider);
      final isAuthenticated = authState.maybeWhen(
        data: (state) => state.maybeWhen(
          authenticated: (_, __) => true,
          orElse: () => false,
        ),
        orElse: () => false,
      );
      final isAuthRoute = state.matchedLocation == '/auth' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/telegram-wait';

      // If authenticated and trying to access auth routes, redirect to home
      if (isAuthenticated && isAuthRoute) {
        return '/';
      }

      // If not authenticated and trying to access protected routes, redirect to auth
      if (!isAuthenticated && !isAuthRoute) {
        return '/auth';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/auth',
        name: 'auth',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/telegram-wait',
        name: 'telegramWait',
        builder: (context, state) {
          final nonce = state.extra as String?;
          if (nonce == null || nonce.isEmpty) {
            return const LoginScreen(); // Fallback
          }
          return TelegramWaitScreen(nonce: nonce);
        },
      ),
      GoRoute(
        path: '/',
        name: 'home',
        builder: (context, state) => const ServerPoolScreen(),
      ),
      GoRoute(
        path: '/shop',
        name: 'shop',
        builder: (context, state) => const ShopScreen(),
      ),
      // D-05/T-21-34: a dedicated in-app page for the server-returned URL.
      // Only an absolute https URL is rendered, and this route has NO success
      // side effect: a deep-link return can never mark an order CONFIRMED.
      GoRoute(
        path: '/payment/webview',
        name: 'paymentWebView',
        builder: (context, state) {
          final url = state.extra;
          if (url is! String || !PaymentFlow.isHttpsPaymentUrl(url)) {
            return const _UnsafePaymentPage();
          }
          return PaymentWebViewPage(url: url);
        },
      ),
    ],
  );
}

/// Safe fallback for a missing or non-https URL: no navigation to untrusted
/// content, no provider text and no payment-status side effect.
class _UnsafePaymentPage extends StatelessWidget {
  const _UnsafePaymentPage();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text("Оплата")),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Text(
                  "Не удалось открыть оплату",
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.go('/shop'),
                  child: const Text("В магазин"),
                ),
              ],
            ),
          ),
        ),
      );
}

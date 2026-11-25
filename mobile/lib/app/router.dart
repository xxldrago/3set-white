import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'router.g.dart';

/// App router configuration using GoRouter.
/// Routes:
/// - /auth: Login screen
/// - /register: Registration screen
/// - /telegram-wait: Telegram authentication wait screen
/// - /: Main app screen (placeholder for now)

/// Riverpod provider for the GoRouter instance
@riverpod
GoRouter router(Ref ref) {
  return _createRouter();
}

/// Creates the GoRouter with all app routes.
/// This is separated for testability.
GoRouter _createRouter() {
  return GoRouter(
    initialLocation: '/auth',
    debugLogDiagnostics: true,
    redirect: (context, state) {
      // TODO: Implement auth-based redirect logic in Plan 03
      // For now, allow all routes
      return null;
    },
    routes: [
      GoRoute(
        path: '/auth',
        name: 'auth',
        builder: (context, state) => const _AuthPlaceholder(),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const _RegisterPlaceholder(),
      ),
      GoRoute(
        path: '/telegram-wait',
        name: 'telegramWait',
        builder: (context, state) => const _TelegramWaitPlaceholder(),
      ),
      GoRoute(
        path: '/',
        name: 'home',
        builder: (context, state) => const _MainPlaceholder(),
      ),
    ],
  );
}

/// Placeholder widgets for the router skeleton
/// These will be replaced with actual screens in Plan 03

class _AuthPlaceholder extends StatelessWidget {
  const _AuthPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('Login Screen', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
            SizedBox(height: 8),
            Text('Placeholder - Plan 01a', style: TextStyle(color: Colors.grey)),
            SizedBox(height: 24),
            Text('Email/Password form will be here', style: TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}

class _RegisterPlaceholder extends StatelessWidget {
  const _RegisterPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Register')),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.person_add_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('Register Screen', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
            SizedBox(height: 8),
            Text('Placeholder - Plan 01a', style: TextStyle(color: Colors.grey)),
            SizedBox(height: 24),
            Text('Registration form will be here', style: TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}

class _TelegramWaitPlaceholder extends StatelessWidget {
  const _TelegramWaitPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Telegram Auth')),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.telegram, size: 64, color: Colors.blue),
            SizedBox(height: 16),
            Text('Waiting for Telegram...', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
            SizedBox(height: 8),
            Text('Placeholder - Plan 01a', style: TextStyle(color: Colors.grey)),
            SizedBox(height: 24),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class _MainPlaceholder extends StatelessWidget {
  const _MainPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('3set VPN')),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.vpn_key, size: 64, color: Colors.blue),
            SizedBox(height: 16),
            Text('Main Screen', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
            SizedBox(height: 8),
            Text('Placeholder - Plan 01a', style: TextStyle(color: Colors.grey)),
            SizedBox(height: 24),
            Text('Authenticated user dashboard will be here', style: TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
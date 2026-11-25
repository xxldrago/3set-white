import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/features/auth/screens/login_screen.dart';
import 'package:mobile/features/auth/screens/register_screen.dart';
import 'package:mobile/features/auth/screens/telegram_wait_screen.dart';
import 'package:mobile/features/home/providers.dart';

part 'router.g.dart';

/// App router configuration using GoRouter.
/// Routes:
/// - /auth: Login screen
/// - /register: Registration screen
/// - /telegram-wait: Telegram authentication wait screen
/// - /: Main app screen (home)

/// Riverpod provider for the GoRouter instance
@riverpod
GoRouter router(Ref ref) {
  return _createRouter(ref);
}

/// Creates the GoRouter with all app routes.
/// This is separated for testability.
GoRouter _createRouter(Ref ref) {
  return GoRouter(
    initialLocation: '/auth',
    debugLogDiagnostics: true,
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
        builder: (context, state) => const _HomeScreen(),
      ),
    ],
  );
}

/// Home screen with bottom navigation and user data.
class _HomeScreen extends ConsumerWidget {
  const _HomeScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final homeData = ref.watch(homeScreenProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('3set VPN'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              final authNotifier = ref.read(authNotifierProviderForUI);
              await authNotifier.logout();
              if (context.mounted) {
                context.go('/auth');
              }
            },
            tooltip: 'Выйти',
          ),
        ],
      ),
      body: homeData.when(
        data: (data) => _HomeContent(data: data),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 64, color: theme.colorScheme.error),
              const SizedBox(height: 16),
              Text('Ошибка загрузки', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(error.toString(), style: theme.textTheme.bodyMedium),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => ref.invalidate(homeScreenProvider),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: ref.watch(currentTabProvider),
        onDestinationSelected: (index) {
          ref.read(currentTabProvider.notifier).state = index;
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Главная',
          ),
          NavigationDestination(
            icon: Icon(Icons.vpn_key_outlined),
            selectedIcon: Icon(Icons.vpn_key),
            label: 'Ключи',
          ),
          NavigationDestination(
            icon: Icon(Icons.subscriptions_outlined),
            selectedIcon: Icon(Icons.subscriptions),
            label: 'Подписка',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Настройки',
          ),
        ],
      ),
    );
  }
}

class _HomeContent extends ConsumerWidget {
  final Map<String, dynamic> data;

  const _HomeContent({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final hasSubscription = data['hasActiveSubscription'] as bool? ?? false;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Welcome header
          Text(
            'Привет, ${data['email'] ?? 'пользователь'}!',
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Ваш ID: ${data['userId']}',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 32),

          // Subscription status card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        hasSubscription
                            ? Icons.check_circle
                            : Icons.cancel_outlined,
                        color: hasSubscription
                            ? theme.colorScheme.secondary
                            : theme.colorScheme.error,
                        size: 28,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              hasSubscription ? 'Активная подписка' : 'Подписка не активна',
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (data['subscriptionEndDate'] != null)
                              Text(
                                'Действует до: ${data['subscriptionEndDate']}',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (!hasSubscription) ...[
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {
                        // Navigate to subscription screen
                        ref.read(currentTabProvider.notifier).state = 2;
                      },
                      child: const Text('Оформить подписку'),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Quick actions
          Text(
            'Быстрые действия',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),

          // VPN keys placeholder
          Card(
            child: ListTile(
              leading: const Icon(Icons.vpn_key_outlined),
              title: const Text('Мои VPN ключи'),
              subtitle: const Text('Управление ключами и устройствами'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                ref.read(currentTabProvider.notifier).state = 1;
              },
            ),
          ),
          const SizedBox(height: 12),

          // Subscription placeholder
          Card(
            child: ListTile(
              leading: const Icon(Icons.subscriptions_outlined),
              title: const Text('Подписка'),
              subtitle: const Text('Просмотр и продление тарифа'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                ref.read(currentTabProvider.notifier).state = 2;
              },
            ),
          ),
          const SizedBox(height: 12),

          // Support placeholder
          Card(
            child: ListTile(
              leading: const Icon(Icons.support_outlined),
              title: const Text('Поддержка'),
              subtitle: const Text('Создать тикет или посмотреть FAQ'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                // TODO: Navigate to support
              },
            ),
          ),
        ],
      ),
    );
  }
}
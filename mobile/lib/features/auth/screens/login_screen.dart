import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/app/theme.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/features/auth/widgets/auth_form.dart';
import 'package:mobile/features/auth/widgets/error_toast.dart';

/// Login screen with email/password and Telegram authentication.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _isLoading = false;

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _handleLogin(String email, String password, String? _) async {
    setState(() => _isLoading = true);

    try {
      final authNotifier = ref.read(authNotifierProviderForUI);
      final result = await authNotifier.login(email, password);

      if (!mounted) return;

      result.maybeWhen(
        authenticated: (_, __) {
          if (context.mounted) {
            context.go('/');
          }
        },
        error: (message) {
          showErrorToast(context, message);
        },
        orElse: () {},
      );
    } catch (e) {
      if (!mounted) return;
      showErrorToast(context, 'Ошибка входа: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _handleTelegramAuth() async {
    setState(() => _isLoading = true);

    try {
      final authNotifier = ref.read(authNotifierProviderForUI);
      final nonce = await authNotifier.startTelegramAuth();

      if (nonce != null && mounted) {
        // Navigate to Telegram wait screen with nonce
        if (context.mounted) {
          context.go('/telegram-wait', extra: nonce);
        }
      } else if (mounted) {
        final authState = ref.read(authStateProvider);
        final error = authState.maybeWhen(
          data: (state) => state.maybeWhen(
            error: (message) => message,
            orElse: () => null,
          ),
          orElse: () => null,
        );
        if (error != null && context.mounted) {
          showErrorToast(context, error);
        } else if (context.mounted) {
          showErrorToast(context, 'Не удалось получить код для входа через Telegram');
        }
      }
    } catch (e) {
      if (mounted) {
        showErrorToast(context, 'Ошибка Telegram входа: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _navigateToRegister() {
    context.go('/register');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Вход'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo/Icon — dark prototype surface with lime accent.
                  Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: AppTheme.surface2,
                      borderRadius: BorderRadius.circular(AppTheme.radius),
                      border: Border.all(color: AppTheme.line),
                    ),
                    child: const Icon(
                      Icons.vpn_key,
                      size: 44,
                      color: AppTheme.lime,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Title
                  Text(
                    'Добро пожаловать',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),

                  // Subtitle
                  Text(
                    'Войдите в свой аккаунт 3set VPN',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  // Auth form on a prototype card.
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(AppTheme.radius),
                      border: Border.all(color: AppTheme.line),
                    ),
                    child: AuthForm(
                      isLogin: true,
                      isLoading: _isLoading,
                      submitLabel: 'Войти',
                      toggleLabel: 'Зарегистрироваться',
                      onSubmit: _handleLogin,
                      onToggleAuthMode: _navigateToRegister,
                      onTelegramLogin: _handleTelegramAuth,
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Forgot password (stub)
                  TextButton(
                    onPressed: _isLoading ? null : () {
                      showInfoToast(context, 'Функция в разработке');
                    },
                    child: const Text('Забыли пароль?'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
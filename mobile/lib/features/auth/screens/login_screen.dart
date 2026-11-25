import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/auth/auth_notifier.dart';
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
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    setState(() {
      _isLoading = true;
    });

    try {
      final authNotifier = ref.read(authNotifierProviderForUI);
      final result = await authNotifier.login(email, password);

      if (!mounted) return;

      result.when(
        authenticated: (_, __) {
          // Success - router redirect will handle navigation
          if (context.mounted) {
            context.go('/');
          }
        },
        error: (message) {
          showErrorToast(context, message);
        },
        unauthenticated: () {},
        loading: () {},
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

  void _navigateToRegister() {
    if (!context.mounted) return;
    context.go('/register');
  }

  Future<void> _handleTelegramLogin() async {
    setState(() {
      _isLoading = true;
    });

    final authNotifier = ref.read(authNotifierProviderForUI);
    final nonce = await authNotifier.startTelegramAuth();

    if (!mounted) return;

    setState(() => _isLoading = false);

    if (nonce != null) {
      // Navigate to Telegram wait screen with nonce
      if (context.mounted) {
        context.go('/telegram-wait', extra: nonce);
      }
    } else {
      showErrorToast(context, 'Не удалось инициировать вход через Telegram');
    }
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
                  // Logo/Icon
                  Icon(
                    Icons.vpn_key,
                    size: 80,
                    color: theme.colorScheme.primary,
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

                  // Auth form
                  AuthForm(
                    isLogin: true,
                    isLoading: _isLoading,
                    submitLabel: 'Войти',
                    toggleLabel: 'Зарегистрироваться',
                    onSubmit: _handleLogin,
                    onToggleAuthMode: _navigateToRegister,
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
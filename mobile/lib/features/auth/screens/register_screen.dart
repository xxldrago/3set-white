import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/features/auth/widgets/auth_form.dart';
import 'package:mobile/features/auth/widgets/error_toast.dart';

/// Registration screen with email/password.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  bool _isLoading = false;

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _handleRegister(String email, String password, String? confirmPassword) async {
    setState(() => _isLoading = true);

    try {
      final authNotifier = ref.read(authNotifierProviderForUI);
      final result = await authNotifier.register(email, password);

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
      showErrorToast(context, 'Ошибка регистрации: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _navigateToLogin() {
    context.go('/auth');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Регистрация'),
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
                    Icons.person_add_outlined,
                    size: 80,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: 24),

                  // Title
                  Text(
                    'Создать аккаунт',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),

                  // Subtitle
                  Text(
                    'Зарегистрируйтесь в 3set VPN',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  // Auth form
                  AuthForm(
                    isLogin: false,
                    isLoading: _isLoading,
                    submitLabel: 'Зарегистрироваться',
                    toggleLabel: 'Войти',
                    onSubmit: _handleRegister,
                    onToggleAuthMode: _navigateToLogin,
                  ),

                  const SizedBox(height: 24),

                  // Terms and privacy (stub)
                  Text(
                    'Регистрируясь, вы соглашаетесь с условиями использования и политикой конфиденциальности.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
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
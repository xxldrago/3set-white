import 'package:flutter/material.dart';

/// Reusable authentication form with email and password fields.
/// Supports both login and registration variants.
class AuthForm extends StatefulWidget {
  final bool isLogin;
  final VoidCallback onSubmit;
  final VoidCallback? onToggleAuthMode;
  final String submitLabel;
  final String toggleLabel;
  final bool isLoading;
  final String? errorMessage;

  const AuthForm({
    super.key,
    required this.isLogin,
    required this.onSubmit,
    this.onToggleAuthMode,
    required this.submitLabel,
    required this.toggleLabel,
    this.isLoading = false,
    this.errorMessage,
  });

  @override
  State<AuthForm> createState() => _AuthFormState();
}

class _AuthFormState extends State<AuthForm> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  String? _emailError;
  String? _passwordError;
  String? _confirmPasswordError;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  bool _validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      _emailError = 'Введите email';
      return false;
    }
    final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,}$');
    if (!emailRegex.hasMatch(value)) {
      _emailError = 'Неверный формат email';
      return false;
    }
    _emailError = null;
    return true;
  }

  bool _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      _passwordError = 'Введите пароль';
      return false;
    }
    if (value.length < 8) {
      _passwordError = 'Пароль должен быть минимум 8 символов';
      return false;
    }
    _passwordError = null;
    return true;
  }

  bool _validateConfirmPassword(String? value) {
    if (!widget.isLogin) {
      if (value == null || value.isEmpty) {
        _confirmPasswordError = 'Подтвердите пароль';
        return false;
      }
      if (value != _passwordController.text) {
        _confirmPasswordError = 'Пароли не совпадают';
        return false;
      }
      _confirmPasswordError = null;
    }
    return true;
  }

  bool _validateForm() {
    final emailValid = _validateEmail(_emailController.text);
    final passwordValid = _validatePassword(_passwordController.text);
    final confirmValid = _validateConfirmPassword(_confirmPasswordController.text);

    setState(() {});
    return emailValid && passwordValid && confirmValid;
  }

  void _handleSubmit() {
    if (_validateForm()) {
      widget.onSubmit();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Email field
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            enabled: !widget.isLoading,
            decoration: InputDecoration(
              labelText: 'Email',
              hintText: 'user@example.com',
              prefixIcon: const Icon(Icons.email_outlined),
              errorText: _emailError,
              border: const OutlineInputBorder(),
            ),
            validator: (value) {
              _validateEmail(value);
              return _emailError;
            },
            onFieldSubmitted: (_) => _handleSubmit(),
          ),
          const SizedBox(height: 16),

          // Password field
          TextFormField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            textInputAction: widget.isLogin ? TextInputAction.done : TextInputAction.next,
            enabled: !widget.isLoading,
            decoration: InputDecoration(
              labelText: 'Пароль',
              hintText: 'Минимум 8 символов',
              prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword ? Icons.visibility_off : Icons.visibility,
                ),
                onPressed: () {
                  setState(() => _obscurePassword = !_obscurePassword);
                },
              ),
              errorText: _passwordError,
              border: const OutlineInputBorder(),
            ),
            validator: (value) {
              _validatePassword(value);
              return _passwordError;
            },
            onFieldSubmitted: (_) {
              if (widget.isLogin) {
                _handleSubmit();
              }
            },
          ),

          // Confirm password field (registration only)
          if (!widget.isLogin) ...[
            const SizedBox(height: 16),
            TextFormField(
              controller: _confirmPasswordController,
              obscureText: _obscureConfirmPassword,
              textInputAction: TextInputAction.done,
              enabled: !widget.isLoading,
              decoration: InputDecoration(
                labelText: 'Подтвердите пароль',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscureConfirmPassword ? Icons.visibility_off : Icons.visibility,
                  ),
                  onPressed: () {
                    setState(() => _obscureConfirmPassword = !_obscureConfirmPassword);
                  },
                ),
                errorText: _confirmPasswordError,
                border: const OutlineInputBorder(),
              ),
              validator: (value) {
                _validateConfirmPassword(value);
                return _confirmPasswordError;
              },
              onFieldSubmitted: (_) => _handleSubmit(),
            ),
          ],

          // Error message
          if (widget.errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              widget.errorMessage!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.error,
              ),
              textAlign: TextAlign.center,
            ),
          ],

          const SizedBox(height: 24),

          // Submit button
          FilledButton(
            onPressed: widget.isLoading ? null : _handleSubmit,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: widget.isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    widget.submitLabel,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
          ),

          // Toggle auth mode
          if (widget.onToggleAuthMode != null) ...[
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  widget.isLogin
                      ? 'Нет аккаунта? '
                      : 'Уже есть аккаунт? ',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                TextButton(
                  onPressed: widget.isLoading ? null : widget.onToggleAuthMode,
                  child: Text(widget.toggleLabel),
                ),
              ],
            ),
          ],

          // Telegram login button (login only)
          if (widget.isLogin) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: widget.isLoading ? null : widget.onToggleAuthMode,
              icon: const Icon(Icons.telegram, size: 20),
              label: const Text('Войти через Telegram'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
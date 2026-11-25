import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/features/auth/widgets/error_toast.dart';

/// Screen shown while waiting for Telegram authentication to complete.
/// Polls the backend for auth status using the nonce.
class TelegramWaitScreen extends ConsumerStatefulWidget {
  final String nonce;

  const TelegramWaitScreen({super.key, required this.nonce});

  @override
  ConsumerState<TelegramWaitScreen> createState() => _TelegramWaitScreenState();
}

class _TelegramWaitScreenState extends ConsumerState<TelegramWaitScreen>
    with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _pulseAnimation;
  Timer? _pollTimer;
  int _pollAttempts = 0;
  static const int _maxPollAttempts = 60; // 3 minutes at 3s interval
  static const Duration _pollInterval = Duration(seconds: 3);
  bool _isCancelled = false;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.2).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut),
    );

    _startPolling();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(_pollInterval, (timer) {
      if (_isCancelled || _pollAttempts >= _maxPollAttempts) {
        timer.cancel();
        if (!_isCancelled && mounted) {
          _handleTimeout();
        }
        return;
      }
      _pollAttempts++;
      _pollForAuth();
    });

    // Also do an immediate poll
    _pollForAuth();
  }

  Future<void> _pollForAuth() async {
    if (_isCancelled || !mounted) return;

    try {
      final dioClient = ref.read(dioClientProvider);
      final response = await dioClient.dio.get(
        '/api/mobile/auth/telegram/poll',
        queryParameters: {'nonce': widget.nonce},
      );

      if (!mounted) return;

      if (response.statusCode == 200) {
        // Success - got token pair
        _pollTimer?.cancel();
        _isCancelled = true;

        final authNotifier = ref.read(authNotifierProviderForUI);
        await authNotifier.restoreSession();

        // Check if session restored successfully
        final authState = ref.read(authStateProvider);
        final user = authState.maybeWhen(
          data: (state) => state.maybeWhen(
            authenticated: (_, user) => user,
            orElse: () => null,
          ),
          orElse: () => null,
        );

        if (user != null && mounted) {
          if (context.mounted) {
            context.go('/');
          }
        } else if (mounted) {
          showErrorToast(context, 'Авторизация прошла, но не удалось восстановить сессию');
        }
      } else if (response.statusCode == 202) {
        // Still pending - continue polling
        _updateProgress();
      } else if (response.statusCode == 410 || response.statusCode == 409) {
        // Nonce expired or already used
        _pollTimer?.cancel();
        _isCancelled = true;
        if (mounted) {
          showErrorToast(context, 'Ссылка недействительна или уже использована');
          context.go('/auth');
        }
      } else {
        // Other error - stop polling
        _pollTimer?.cancel();
        _isCancelled = true;
        if (mounted) {
          showErrorToast(context, 'Ошибка авторизации через Telegram');
          context.go('/auth');
        }
      }
    } catch (e) {
      // Network errors - continue polling unless max attempts reached
      if (_pollAttempts >= _maxPollAttempts && mounted) {
        _pollTimer?.cancel();
        _isCancelled = true;
        showErrorToast(context, 'Ошибка сети. Попробуйте позже');
        context.go('/auth');
      }
    }
  }

  void _updateProgress() {
    if (mounted) {
      setState(() {}); // Trigger rebuild for progress indicator
    }
  }

  void _handleTimeout() {
    if (mounted) {
      showErrorToast(context, 'Время ожидания истекло');
      context.go('/auth');
    }
  }

  void _handleCancel() {
    setState(() => _isCancelled = true);
    _pollTimer?.cancel();
    context.go('/auth');
  }

  double get progress => _pollAttempts / _maxPollAttempts;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          _handleCancel();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Telegram вход'),
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: _handleCancel,
          ),
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Animated Telegram icon
                AnimatedBuilder(
                  animation: _pulseAnimation,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _pulseAnimation.value,
                      child: Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          color: const Color(0xFF0088CC).withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.telegram,
                          size: 64,
                          color: Color(0xFF0088CC),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 32),

                // Title
                Text(
                  'Ожидание авторизации',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),

                // Description
                Text(
                  'Откройте Telegram и нажмите "Войти" в открывшемся чате.\n'
                  'Авторизация произойдет автоматически.',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),

                // Progress indicator
                Column(
                  children: [
                    LinearProgressIndicator(
                      value: progress,
                      minHeight: 8,
                      borderRadius: BorderRadius.circular(4),
                      backgroundColor: theme.colorScheme.surfaceContainerHighest,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        theme.colorScheme.primary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Попытка ${_pollAttempts} из $_maxPollAttempts',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Cancel button
                TextButton(
                  onPressed: _handleCancel,
                  child: const Text('Отменить'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
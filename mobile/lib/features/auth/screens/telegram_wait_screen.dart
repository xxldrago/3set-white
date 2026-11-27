import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/core/deep_link/deep_link_handler.dart';
import 'package:mobile/features/auth/providers.dart';
import 'package:mobile/features/auth/widgets/error_toast.dart';
import 'package:url_launcher/url_launcher.dart';

/// Screen shown while waiting for Telegram authentication to complete.
///
/// Polling itself lives in [DeepLinkHandler] (single source of truth), so the
/// same code path is used whether the flow starts from the login button or
/// from an incoming deep link.
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
  late DeepLinkHandler _handler;
  Timer? _progressTimer;
  bool _navigated = false;

  static const int _maxPollAttempts = 60; // 3 minutes at 3s interval
  static const String _botDeepLinkBase = 'https://t.me/set3vpn_bot';

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

    _handler = ref.read(deepLinkHandlerProvider);
    _handler.startPolling(widget.nonce);

    // Keep the progress UI ticking without owning the polling logic.
    _progressTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });

    // Send the user to Telegram so the bot can bind the nonce.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openTelegram();
    });
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    _handler.stopPolling();
    _animationController.dispose();
    super.dispose();
  }

  Future<void> _openTelegram() async {
    final uri = Uri.parse('$_botDeepLinkBase?start=nonce_${widget.nonce}');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      if (mounted) {
        showErrorToast(context, 'Не удалось открыть Telegram. Откройте бота вручную.');
      }
    }
  }

  void _goHome() {
    if (_navigated || !mounted) return;
    _navigated = true;
    context.go('/');
  }

  void _goAuth(String? errorMessage) {
    if (_navigated || !mounted) return;
    _navigated = true;
    if (errorMessage != null) {
      showErrorToast(context, errorMessage);
    }
    context.go('/auth');
  }

  void _handleCancel() {
    _handler.stopPolling();
    _goAuth(null);
  }

  double get progress =>
      (_handler.pollAttempts / _maxPollAttempts).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // React to auth state changes driven by DeepLinkHandler polling.
    ref.listen<AsyncValue<AuthState>>(authStateProvider, (previous, next) {
      next.maybeWhen(
        data: (state) {
          state.maybeWhen(
            authenticated: (_, __) => _goHome(),
            error: (message) => _goAuth(message),
            orElse: () {},
          );
        },
        orElse: () {},
      );
    });

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
                const SizedBox(height: 24),

                // Re-open Telegram
                FilledButton.icon(
                  onPressed: _openTelegram,
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Открыть Telegram'),
                ),
                const SizedBox(height: 24),

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
                      'Попытка ${_handler.pollAttempts} из $_maxPollAttempts',
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

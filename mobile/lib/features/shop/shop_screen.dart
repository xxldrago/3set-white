// Real, server-driven Shop Screen (D-16). Replaces the phase-19 stub.
//
// Prices come only from pricingPlansProvider (/api/mobile/pricing), entitlement
// only from userSubscriptionProvider (/api/mobile/subscription), and a promo
// discount only from the server preview. Local state holds selection, not
// authority. The pay action hands off to the single plan-01 PaymentFlow; no
// amount, URL or key is generated here and there is no bottom navigation.
import "dart:async";

import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_riverpod/legacy.dart";
import "package:flutter_secure_storage/flutter_secure_storage.dart";

import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/core/payment/payment_flow.dart";
import "package:mobile/features/subscription/models/pricing.dart";
import "package:mobile/features/subscription/models/promo.dart";
import "package:mobile/features/subscription/models/subscription.dart";
import "package:mobile/features/subscription/providers.dart";

import "../../app/theme.dart";
import "painting/confetti_overlay.dart";
import "widgets/shop_widgets.dart";

/// Copies a subscription link. The default is the Flutter clipboard only —
/// the link is never logged, persisted as a secret or sent anywhere (D-15 /
/// T-21-27). Tests override this seam with a recorder.
typedef LinkCopier = Future<void> Function(String link);

/// Starts one real purchase. Injected so widget tests can assert the intent
/// without a WebView or a platform channel; production uses PaymentFlow.
typedef PaymentFlowStarter = Future<PaymentFlowResult> Function(
  BuildContext context,
  PaymentRequest request,
);

/// Clipboard seam, defaulting to `Clipboard.setData` (D-15).
final linkCopierProvider = Provider<LinkCopier>((ref) {
  return (link) => Clipboard.setData(ClipboardData(text: link));
});

/// The real plan-01 flow: intent-only create → https WebView → DB poll.
final paymentFlowStarterProvider = Provider<PaymentFlowStarter>((ref) {
  return (context, request) {
    final dio = ref.read(dioClientProvider).dio;
    final flow = PaymentFlow(
      dio: dio,
      store: SecurePendingOrderStore(const FlutterSecureStorage()),
      launcher: InAppWebViewLauncher(context),
    );
    return flow.start(request);
  };
});

/// UI mirror of the real DB poll outcome. It is set ONLY by PaymentFlowResult
/// (which is derived from the stored `provisioned` status), never by a timer or
/// a demo flag. Confetti reads this transition (D-14 / T-21-28).
final purchaseStatusProvider = StateProvider<String?>((ref) => null);

/// Promo code actually submitted; empty means no preview request.
final appliedPromoCodeProvider = StateProvider<String>((ref) => "");

/// Controller kept in a provider so typed text survives rebuilds.
final promoControllerProvider = Provider<TextEditingController>((ref) {
  final controller = TextEditingController();
  ref.onDispose(controller.dispose);
  return controller;
});

/// One stable async slot for the promo preview: no code means no request.
final promoPreviewStateProvider = FutureProvider<PromoPreview?>((ref) async {
  final code = ref.watch(appliedPromoCodeProvider);
  if (code.trim().isEmpty) return null;
  return ref.watch(promoPreviewProvider(code).future);
});

/// Full prototype shop: five server terms, 2..10 stepper, promo, UI-only chips,
/// live summary, real key card, no-key gate, trial block and one buy action.
class ShopScreen extends ConsumerWidget {
  /// Creates the shop screen.
  const ShopScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pricingAsync = ref.watch(pricingPlansProvider);
    final subscriptionAsync = ref.watch(userSubscriptionProvider);
    final promoAsync = ref.watch(promoPreviewStateProvider);
    final processing = ref.watch(paymentProcessingProvider);
    final purchaseStatus = ref.watch(purchaseStatusProvider);

    // One place applies the server percentage to presentation-only state.
    ref.listen<AsyncValue<PromoPreview?>>(
      promoPreviewStateProvider,
      (_, next) {
        next.when(
          data: (preview) => ref.read(discountPercentProvider.notifier).state =
              preview?.discountPercent ?? 0,
          error: (_, __) =>
              ref.read(discountPercentProvider.notifier).state = 0,
          loading: () {},
        );
      },
    );

    final promoError =
        promoAsync.hasError ? subscriptionNotice(promoAsync.error) : null;
    final promoPercent = promoAsync.value?.discountPercent ?? 0;
    final promoSuccess = promoError == null && promoPercent > 0
        ? "Промокод применён: −$promoPercent%"
        : null;

    final content = pricingAsync.when<Widget>(
      data: (terms) => subscriptionAsync.when(
        data: (subscription) => _shop(
          context,
          ref,
          terms,
          subscription,
          promoError: promoError,
          promoSuccess: promoSuccess,
          shake: promoAsync.hasError,
          processing: processing,
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(
          message: subscriptionNotice(error),
          onRetry: () => ref.invalidate(userSubscriptionProvider),
        ),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => _ErrorState(
        message: subscriptionNotice(error),
        onRetry: () => ref.invalidate(pricingPlansProvider),
      ),
    );

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: const Text("Покупка ключа"),
        leading: IconButton(
          tooltip: "Назад",
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: ConfettiOnStatus(
          status: purchaseStatus,
          expiresAt: subscriptionAsync.value?.expiresAt,
          link: subscriptionAsync.value?.link,
          onCopyLink: () {
            unawaited(
              copySubscriptionLink(context, ref, subscriptionAsync.value?.link),
            );
          },
          child: content,
        ),
      ),
    );
  }

  /// Copies a real server-provided link through the injectable clipboard seam
  /// and shows the frozen Russian toast (D-15/T-21-27).
  Future<void> copySubscriptionLink(
    BuildContext context,
    WidgetRef ref,
    String? link,
  ) async {
    if (link == null || link.isEmpty) return;
    await ref.read(linkCopierProvider)(link);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Ссылка скопирована")),
    );
  }

  Widget _shop(
    BuildContext context,
    WidgetRef ref,
    List<PricingTerm> terms,
    SubscriptionStatus subscription, {
    required String? promoError,
    required String? promoSuccess,
    required bool shake,
    required bool processing,
  }) {
    final theme = Theme.of(context);
    if (terms.isEmpty) {
      return const _ErrorState(
        message: "Тарифы временно недоступны. Повторите позже",
      );
    }

    final devices = ref.watch(deviceCountProvider);
    final selectedDays =
        ref.watch(selectedTermDaysProvider) ?? terms.first.days;
    final selectedTerm = terms.firstWhere(
      (term) => term.days == selectedDays,
      orElse: () => terms.first,
    );
    final days = selectedTerm.days;
    final unitAmount = selectedTerm.amount;
    final discount = ref.watch(discountPercentProvider);
    final base = previewTotalRub(unitAmount: unitAmount, devices: devices);
    final total = previewTotalRub(
      unitAmount: unitAmount,
      devices: devices,
      discountPercent: discount,
    );
    final discountRub = base - total;
    final perDay = _perDayPerDevice(total, days, devices);

    final isTrial = subscription.isTrial;
    final hasKey = _hasConnectableKey(subscription);
    final expiryLabel = _expiryLabel(subscription.expiresAt);
    final controller = ref.watch(promoControllerProvider);
    final chip = ref.watch(paymentMethodProvider);

    final termsKey = GlobalKey();

    void applyPromo() {
      final code = controller.text.trim().toUpperCase();
      ref.read(appliedPromoCodeProvider.notifier).state = code;
    }

    void copyLink() {
      unawaited(copySubscriptionLink(context, ref, subscription.link));
    }

    void buy() async {
      final starter = ref.read(paymentFlowStarterProvider);
      ref.read(purchaseStatusProvider.notifier).state = null;
      ref.read(paymentProcessingProvider.notifier).state = true;
      // WR-02/21-CONTEXT: the required in-flight toast stays visible above the
      // pushed WebView while the DB-status poll runs alongside navigation.
      ScaffoldFeatureController<SnackBar, SnackBarClosedReason>? pendingToast;
      if (context.mounted) {
        pendingToast = ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Ожидаем оплату…")),
        );
      }
      try {
        final result = await starter(
          context,
          PaymentRequest(kind: "new", days: days, devices: devices),
        );
        if (!context.mounted) return;
        if (result.isSuccess) {
          // The key was issued by the webhook → outbox → worker; refresh the
          // single subscription read so the confetti date is the real one.
          ref.invalidate(userSubscriptionProvider);
          ref.read(purchaseStatusProvider.notifier).state = "provisioned";
        } else {
          ref.read(purchaseStatusProvider.notifier).state =
              result.outcome.name;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Оплата не завершена. Попробуйте снова"),
            ),
          );
        }
      } on Object catch (_) {
        if (context.mounted) {
          ref.read(purchaseStatusProvider.notifier).state = "failed";
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Не удалось открыть оплату")),
          );
        }
      } finally {
        // Never let the in-flight toast queue ahead of terminal feedback.
        pendingToast?.close();
        if (context.mounted) {
          ref.read(paymentProcessingProvider.notifier).state = false;
        }
      }
    }

    final buttonLabel = isTrial
        ? "Купить новый ключ"
        : (hasKey ? "Купить и продлить" : "Купить ключ");

    return Stack(
      children: <Widget>[
        Column(
          children: <Widget>[
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    ShopKeyCard(
                      days: subscription.remainingDays,
                      expiryLabel: expiryLabel,
                      link: hasKey ? subscription.link : null,
                      onCopyLink: copyLink,
                    ),
                    const SizedBox(height: 16),
                    // D-10/REQ-SUB-06: server-derived only — no local 24h math.
                    if (subscription.statusKind == "expiring" ||
                        subscription.graceUntil != null) ...<Widget>[
                      ExpiresSoonBanner(graceUntil: subscription.graceUntil),
                      const SizedBox(height: 16),
                    ],
                    // WR-02: visible while the DB-status poll is in flight.
                    if (processing) ...<Widget>[
                      const PaymentPendingNotice(),
                      const SizedBox(height: 16),
                    ],
                    if (!hasKey) ...<Widget>[
                      ShopNoKeyBanner(
                        onAction: () => Scrollable.ensureVisible(
                          termsKey.currentContext!,
                          duration: const Duration(milliseconds: 250),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (isTrial) ...<Widget>[
                      const TrialNotice(),
                      const SizedBox(height: 16),
                    ],
                    Container(
                      key: termsKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: <Widget>[
                          Text(
                            "Срок подписки",
                            style: theme.textTheme.titleSmall,
                          ),
                          const SizedBox(height: 8),
                          for (final term in terms)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: ShopTermCard(
                                label: term.label,
                                perDayPerDevice: _termPerDay(
                                  term.amount,
                                  term.days,
                                ),
                                amountRub: term.amount,
                                selected: term.days == days,
                                isHit: term.days == 30,
                                onTap: () => ref
                                    .read(selectedTermDaysProvider.notifier)
                                    .state = term.days,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppTheme.surface2,
                        borderRadius: BorderRadius.circular(AppTheme.radius),
                        border: Border.all(color: AppTheme.line),
                      ),
                      child: DeviceStepper(
                        devices: devices,
                        onDecrement: () => ref
                            .read(deviceCountProvider.notifier)
                            .state = devices - 1 < 2 ? 2 : devices - 1,
                        onIncrement: () => ref
                            .read(deviceCountProvider.notifier)
                            .state = devices + 1 > 10 ? 10 : devices + 1,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppTheme.surface2,
                        borderRadius: BorderRadius.circular(AppTheme.radius),
                        border: Border.all(color: AppTheme.line),
                      ),
                      child: LiveSummary(
                        termLabel: selectedTerm.label,
                        baseRub: base,
                        devices: devices,
                        discountPercent: discount,
                        discountRub: discountRub,
                        totalRub: total,
                        perDayPerDevice: perDay,
                      ),
                    ),
                    const SizedBox(height: 16),
                    PromoField(
                      controller: controller,
                      onApply: applyPromo,
                      errorText: promoError,
                      successText: promoSuccess,
                      shake: shake,
                    ),
                    const SizedBox(height: 16),
                    PaymentChips(
                      selected: chip,
                      onSelected: (value) => ref
                          .read(paymentMethodProvider.notifier)
                          .state = value,
                    ),
                  ],
                ),
              ),
            ),
            ShopPayBar(
              totalRub: total,
              perDayPerDevice: perDay,
              buttonLabel: buttonLabel,
              onPressed: buy,
              processing: processing,
            ),
          ],
        ),
      ],
    );
  }

  /// Entitlement is read from the server's statusKind/graceUntil only.
  bool _hasConnectableKey(SubscriptionStatus subscription) {
    final kind = subscription.statusKind;
    if (kind == "active" || kind == "expiring") return true;
    if (kind == "expired" && subscription.graceUntil != null) return true;
    return false;
  }

  String _expiryLabel(String? expiresAt) {
    if (expiresAt == null) return "Нет активного ключа";
    final parsed = DateTime.tryParse(expiresAt);
    if (parsed == null) return "Нет активного ключа";
    return "Действует до ${_ruDate(parsed)}";
  }

  /// Presentation-only estimate from the server amount; never posted.
  String _perDayPerDevice(int total, int days, int devices) {
    if (days <= 0 || devices <= 0) return "";
    final value = total / (days * devices);
    final rounded = value.toStringAsFixed(1).replaceAll(".", ",");
    return "≈ $rounded ₽ / день · $devices устр.";
  }

  String _termPerDay(int unitAmount, int days) {
    if (days <= 0) return "";
    final value = unitAmount / (days * 2);
    final rounded = value.toStringAsFixed(1).replaceAll(".", ",");
    return "≈ $rounded ₽/день · устр.";
  }

  String _ruDate(DateTime date) {
    final day = date.day.toString().padLeft(2, "0");
    final month = date.month.toString().padLeft(2, "0");
    return "$day.$month.${date.year}";
  }
}

/// Stable, provider-free error state used by both async branches.
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppTheme.text,
                  ),
            ),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: 16),
              FilledButton(
                onPressed: onRetry,
                child: const Text("Повторить"),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

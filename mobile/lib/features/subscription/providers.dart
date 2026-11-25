import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile/features/auth/providers.dart';

/// Pricing plan model for subscription tiers.
class PricingPlan {
  final String id;
  final String name;
  final int durationDays;
  final int priceRub;
  final String description;

  const PricingPlan({
    required this.id,
    required this.name,
    required this.durationDays,
    required this.priceRub,
    required this.description,
  });

  /// Formats price as "XXX ₽"
  String get formattedPrice => '$priceRub ₽';

  /// Formats duration as human-readable string
  String get formattedDuration {
    if (durationDays == 7) return '7 дней';
    if (durationDays == 30) return '1 месяц';
    if (durationDays == 90) return '3 месяца';
    if (durationDays == 180) return '6 месяцев';
    if (durationDays == 365) return '12 месяцев';
    return '$durationDays дней';
  }
}

/// Available pricing plans (matching backend prices).
final pricingPlansProvider = Provider<List<PricingPlan>>((ref) {
  return const [
    PricingPlan(
      id: '7d',
      name: 'Неделя',
      durationDays: 7,
      priceRub: 115,
      description: 'Идеально для кратковременного использования',
    ),
    PricingPlan(
      id: '1m',
      name: 'Месяц',
      durationDays: 30,
      priceRub: 400,
      description: 'Популярный выбор для регулярного использования',
    ),
    PricingPlan(
      id: '3m',
      name: '3 месяца',
      durationDays: 90,
      priceRub: 1000,
      description: 'Выгода 17% по сравнению с месячным',
    ),
    PricingPlan(
      id: '6m',
      name: 'Полгода',
      durationDays: 180,
      priceRub: 1900,
      description: 'Выгода 21% + приоритетная поддержка',
    ),
    PricingPlan(
      id: '12m',
      name: 'Год',
      durationDays: 365,
      priceRub: 3800,
      description: 'Максимальная выгода 21% + все функции',
    ),
  ];
});

/// Provider for selected pricing plan during purchase flow.
final selectedPlanProvider = StateProvider<PricingPlan?>((ref) => null);

/// Provider for payment processing state.
final paymentProcessingProvider = StateProvider<bool>((ref) => false);

/// Provider for payment URL from Platega.
final paymentUrlProvider = StateProvider<String?>((ref) => null);

/// Provider for user's current subscription status.
final userSubscriptionProvider = FutureProvider.autoDispose<Map<String, dynamic>?>((ref) async {
  final user = ref.watch(currentUserProvider);

  if (user == null) return null;

  // TODO: Fetch actual subscription from API in future phases
  // For now, return null (no active subscription)
  return null;
});

/// Provider for creating a payment (will call backend /api/mobile/payments/create).
final createPaymentProvider = FutureProvider.family<String, ({String planId, String paymentMethod})>((ref, params) async {
  // TODO: Implement actual API call to backend
  // For now, return a mock URL for testing
  return 'https://dash.3set.online/payment/mock?plan=${params.planId}';
});
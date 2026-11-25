import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile/features/auth/providers.dart';

/// Provider for the current tab index (bottom navigation).
/// 0 = Servers, 1 = Keys, 2 = Subscription, 3 = Settings
final currentTabProvider = StateProvider<int>((ref) => 0);

/// Provider for the home screen data.
/// Fetches user's subscription, keys, traffic stats from API.
final homeScreenProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  // Ensure user is authenticated before loading home data
  final user = ref.watch(currentUserProvider);

  if (user == null) {
    throw Exception('User not authenticated');
  }

  // TODO: Fetch user's subscription, keys, traffic stats from API
  // For now, return placeholder data
  return {
    'userId': user.id,
    'email': user.email,
    'hasActiveSubscription': false,
    'subscriptionEndDate': null,
    'activeKeys': [],
    'trafficUsed': 0,
    'trafficLimit': 0,
  };
});
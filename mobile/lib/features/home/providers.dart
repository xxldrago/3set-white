import "dart:async";

import "package:flutter_riverpod/flutter_riverpod.dart";

import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/features/auth/providers.dart";
import "package:mobile/features/servers/server.dart";

/// Currently displayed server pool, persisted in Drift `current_tab` (D-14).
///
/// This replaces the old bottom-navigation `int` index. Switching tabs does
/// not tear down any ping state; selection and last-good are per-tab.
final currentTabProvider =
    NotifierProvider<CurrentTabNotifier, PoolTab>(CurrentTabNotifier.new);

/// Persists the active pool tab while keeping the UI type-safe.
class CurrentTabNotifier extends Notifier<PoolTab> {
  bool _touched = false;

  @override
  PoolTab build() {
    unawaited(_loadPersisted());
    return PoolTab.simple;
  }

  Future<void> _loadPersisted() async {
    try {
      final saved = await PingCacheDao(ref.read(appDatabaseProvider))
          .getCurrentTab();
      if (!_touched) {
        state = PoolTab.fromWire(saved);
      }
    } on Object catch (_) {
      return;
    }
  }

  /// Switches tab and persists it without disturbing ping/selection state.
  Future<void> setTab(PoolTab tab) async {
    _touched = true;
    state = tab;
    try {
      await PingCacheDao(ref.read(appDatabaseProvider)).setCurrentTab(tab.wireName);
    } on Object catch (_) {
      return;
    }
  }
}

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

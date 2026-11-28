// REQ-SET-02 / T-22-09 / T-22-10: one launch-time auto-connect caller.
//
// The persisted preference is read from the client-local Drift settings table.
// The listener fires the EXISTING connection FSM's connect(tab, auto: true)
// once, and only after auth restore produced an authenticated state and the
// ownership-joined subscription provider returned an active key. A biometric
// lockout calls authNotifier.setUnauthenticated(), so the authenticated gate
// below also covers the existing resume gate (A4). No FSM transition, native
// VPN rule, kill-switch or second reconnect path is introduced here: later
// network changes stay owned by connectionReconnectListenerProvider (D-15).
import "dart:async";

import "package:drift/drift.dart" show InsertMode, Value;
import "package:flutter_riverpod/flutter_riverpod.dart";

import "package:mobile/core/auth/auth_notifier.dart" show authNotifierProvider;
import "package:mobile/core/auth/auth_state.dart";
import "package:mobile/core/auth/biometric_gate.dart"
    show resumeBiometricGateProvider;
import "package:mobile/core/db/app_database.dart"
    show AppDatabase, SettingsCompanion, appDatabaseProvider;
import "package:mobile/core/vpn/connection_notifier.dart"
    show connectionNotifierProvider;
import "package:mobile/features/home/providers.dart" show currentTabProvider;
import "package:mobile/features/servers/server.dart" show PoolTab;
import "package:mobile/features/subscription/providers.dart"
    show userSubscriptionProvider;

/// The single connect call made by the launch listener.
typedef AutoConnectCaller = Future<void> Function(PoolTab tab);

/// Reads and writes the singleton local settings row (`id = 1`).
class AutoConnectStore {
  const AutoConnectStore(this._db);

  final AppDatabase _db;

  /// Returns the persisted preference, or `false` when no row exists yet.
  Future<bool> readAutoConnect() async {
    final row = await (_db.select(_db.settings)
          ..where((t) => t.id.equals(1)))
        .getSingleOrNull();
    return row?.autoConnect ?? false;
  }

  /// Persists the preference. Replaces the singleton row instead of appending.
  Future<void> setAutoConnect(bool enabled) async {
    await _db.into(_db.settings).insert(
          SettingsCompanion(id: const Value(1), autoConnect: Value(enabled)),
          mode: InsertMode.insertOrReplace,
        );
  }
}

/// Store seam backed by the app-wide Drift database (overridable in tests).
final autoConnectStoreProvider = Provider<AutoConnectStore>((ref) {
  return AutoConnectStore(ref.read(appDatabaseProvider));
});

/// The one connect caller: delegates to the existing guarded FSM, never to a
/// new tunnel path. Overridable so unit tests can observe the call without a
/// native bridge.
final autoConnectCallerProvider = Provider<AutoConnectCaller>((ref) {
  return (PoolTab tab) =>
      ref.read(connectionNotifierProvider.notifier).connect(tab, auto: true);
});

/// App-level always-on listener: at most one connect per process launch.
///
/// Riverpod runs the provider body only on its first read, so watching this
/// from `App.build` evaluates the gates once. Both `ref.listen` subscriptions
/// are closed on dispose; no connectivity stream is subscribed, so a later
/// network change cannot produce a second connect from this path.
final autoConnectListenerProvider = Provider<bool>((ref) {
  // Keep the existing resume gate alive at startup. A failed/cancelled unlock
  // clears tokens and sets auth unauthenticated, which the gate below observes
  // before any connect attempt (T-22-09).
  ref.read(resumeBiometricGateProvider);

  var fired = false;

  void maybeFire() {
    if (fired) return;
    final auth = ref.read(authNotifierProvider);
    if (!auth.hasValue) return;
    final isAuthenticated = auth.value!.when(
      unauthenticated: () => false,
      authenticated: (_, __) => true,
      loading: () => false,
      error: (_) => false,
    );
    if (!isAuthenticated) return;
    final subscription = ref.read(userSubscriptionProvider);
    if (!subscription.hasValue || subscription.value?.ok != true) return;
    // Claim the single launch attempt before awaiting anything so a second
    // auth/subscription emission cannot start a parallel connect.
    fired = true;
    unawaited(_connectOnce(ref));
  }

  final authSub = ref.listen(authNotifierProvider, (_, __) => maybeFire());
  final subscriptionSub =
      ref.listen(userSubscriptionProvider, (_, __) => maybeFire());
  ref.onDispose(() {
    authSub.close();
    subscriptionSub.close();
  });

  // Auth restore may already be complete when the provider is first read.
  maybeFire();
  return true;
});

Future<void> _connectOnce(Ref ref) async {
  try {
    if (!await ref.read(autoConnectStoreProvider).readAutoConnect()) return;
    await ref.read(autoConnectCallerProvider)(ref.read(currentTabProvider));
  } on Object catch (_) {
    // Startup must never break and no retry is scheduled: the single attempt
    // is consumed whether it succeeded or failed.
  }
}

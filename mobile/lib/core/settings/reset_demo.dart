// REQ-SET-04 / T-22-11 / T-22-12: Reset Demo is purely local.
//
// It clears the token store, both secure-storage namespaces and every Drift
// table, then invalidates auth so the router redirects to /auth. It never
// revokes a server session, clears a provider device or key, calls any
// ARTEMIDA operation, or logs a token/secret. The UI row that invokes this
// function belongs to the profile plan and supplies a context-free /auth
// navigation callback (`() => router.go('/auth')`) so no widget BuildContext
// is used after the awaits below (WR-05).
import "package:flutter_riverpod/flutter_riverpod.dart";

import "package:mobile/core/auth/auth_notifier.dart" show authNotifierProvider;
import "package:mobile/core/db/app_database.dart" show AppDatabase, appDatabaseProvider;
import "package:mobile/core/storage/token_store.dart"
    show secureStorageProvider, tokenStoreProvider;

/// Clears every local credential surface and hands navigation back to caller.
///
/// After this returns `hasTokens()` is false in both namespaces, so no
/// biometric prompt can resurrect a session. Exactly one navigation callback
/// is issued after auth invalidation.
Future<void> resetDemo(
  Ref ref, {
  required void Function() onNavigateToAuth,
}) async {
  final tokenStore = ref.read(tokenStoreProvider);
  final secureStorage = ref.read(secureStorageProvider);
  final database = ref.read(appDatabaseProvider);

  // TokenStore.clearAll deletes access_token, refresh_token and user_id from
  // the standard namespace. SecureStorage.clearAll then clears the whole
  // standard namespace. The biometric namespace is separate (Pitfall 5): the
  // access token can also live there and must be removed or a biometric read
  // could still find it. Neither call touches the server.
  await tokenStore.clearAll();
  await secureStorage.clearAll();
  await secureStorage.biometricStorage.deleteAll();

  await _deleteAllTables(database);

  ref.invalidate(authNotifierProvider);
  onNavigateToAuth();
}

Future<void> _deleteAllTables(AppDatabase db) async {
  await db.batch((batch) {
    batch.deleteAll(db.pingCache);
    batch.deleteAll(db.lastGood);
    batch.deleteAll(db.selection);
    batch.deleteAll(db.currentTab);
    batch.deleteAll(db.serverListCache);
    batch.deleteAll(db.settings);
  });
}

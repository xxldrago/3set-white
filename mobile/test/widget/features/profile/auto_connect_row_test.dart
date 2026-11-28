// REQ-SET-02 (UI priority 1): the persisted auto-connect preference now has a
// real UI writer, and the launch listener reads that same persisted value.
// The store, auth and connect caller are all injected — no native tunnel,
// platform channel or outbound request is involved.
import "package:drift/native.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mocktail/mocktail.dart";

import "package:mobile/app/theme.dart";
import "package:mobile/core/auth/auth_notifier.dart"
    show AuthNotifier, authNotifierProvider;
import "package:mobile/core/auth/auth_state.dart" show AuthState;
import "package:mobile/core/auth/biometric_gate.dart"
    show BiometricGate, resumeBiometricGateProvider;
import "package:mobile/core/biometric/biometric_gate.dart"
    show BiometricResult;
import "package:mobile/core/db/app_database.dart" show AppDatabase;
import "package:mobile/core/settings/auto_connect_listener.dart"
    show
        AutoConnectStore,
        autoConnectCallerProvider,
        autoConnectListenerProvider,
        autoConnectStoreProvider;
import "package:mobile/core/storage/secure_storage.dart" show SecureStorage;
import "package:mobile/core/storage/token_store.dart" show TokenStore;
import "package:mobile/features/home/providers.dart"
    show CurrentTabNotifier, currentTabProvider;
import "package:mobile/features/profile/profile_sheet.dart"
    show AutoConnectRow;
import "package:mobile/features/servers/server.dart" show PoolTab;
import "package:mobile/features/subscription/models/subscription.dart"
    show SubscriptionStatus;
import "package:mobile/features/subscription/providers.dart"
    show userSubscriptionProvider;
import "package:mobile/models/auth_models.dart" show TokenPair, User;

class FakeAutoConnectStore extends AutoConnectStore {
  FakeAutoConnectStore(AppDatabase db, this.stored) : super(db);

  bool stored;
  final List<bool> writes = <bool>[];

  @override
  Future<bool> readAutoConnect() async => stored;

  @override
  Future<void> setAutoConnect(bool enabled) async {
    writes.add(enabled);
    stored = enabled;
  }
}

class MockSecureStorage extends Mock implements SecureStorage {}

class FakeAuthNotifier extends AuthNotifier {
  FakeAuthNotifier(this._state);

  final AuthState _state;

  @override
  AuthState build() => _state;
}

class FakeCurrentTabNotifier extends CurrentTabNotifier {
  @override
  PoolTab build() => PoolTab.simple;
}

class FakeBiometricGate extends BiometricGate {
  FakeBiometricGate(TokenStore tokenStore)
      : super(
          tokenStore,
          authenticate: () async => BiometricResult.notAvailable,
        );
}

final AuthState _authenticated = AuthState.authenticated(
  tokens: const TokenPair(
    accessToken: "a",
    refreshToken: "r",
    expiresIn: 900,
    userId: 1,
  ),
  user: const User(id: 1),
);

Widget _rowApp(FakeAutoConnectStore store) {
  return ProviderScope(
    overrides: [
      autoConnectStoreProvider.overrideWithValue(store),
    ],
    child: MaterialApp(
      theme: AppTheme.dark,
      home: const Scaffold(body: AutoConnectRow()),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
  });

  tearDown(() {
    db.close();
  });

  group("auto-connect toggle row", () {
    testWidgets("seeds from the stored value and writes once per toggle", (
      tester,
    ) async {
      final store = FakeAutoConnectStore(db, true);
      await tester.pumpWidget(_rowApp(store));
      await tester.pumpAndSettle();

      final switchWidget = tester.widget<Switch>(find.byType(Switch));
      expect(switchWidget.value, isTrue); // seeded, not an optimistic false
      expect(store.writes, isEmpty); // loading itself never persists

      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(store.writes, <bool>[false]);
      expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);

      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(store.writes, <bool>[false, true]);
      expect(store.stored, isTrue);
    });

    testWidgets("stays read-only until the persisted value has loaded", (
      tester,
    ) async {
      final store = FakeAutoConnectStore(db, true);
      await tester.pumpWidget(_rowApp(store));
      // No pumpAndSettle: the async read has not completed yet.
      expect(tester.widget<Switch>(find.byType(Switch)).onChanged, isNull);
      await tester.pumpAndSettle();
      expect(tester.widget<Switch>(find.byType(Switch)).onChanged,
          isNotNull);
      expect(store.writes, isEmpty);
    });
  });

  group("listener reads the persisted preference", () {
    testWidgets("a stored true fires exactly one launch connect", (
      tester,
    ) async {
      final store = FakeAutoConnectStore(db, true);
      final connectCalls = <PoolTab>[];
      final tokenStore = TokenStore(MockSecureStorage());

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            autoConnectStoreProvider.overrideWithValue(store),
            authNotifierProvider.overrideWith(
              () => FakeAuthNotifier(_authenticated),
            ),
            userSubscriptionProvider.overrideWith(
              (ref) async => const SubscriptionStatus(ok: true),
            ),
            autoConnectCallerProvider.overrideWithValue((tab) async {
              connectCalls.add(tab);
            }),
            resumeBiometricGateProvider.overrideWithValue(
              FakeBiometricGate(tokenStore),
            ),
            currentTabProvider.overrideWith(() => FakeCurrentTabNotifier()),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const Scaffold(
              body: Column(
                children: <Widget>[
                  AutoConnectRow(),
                  _ListenerProbe(),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(store.writes, isEmpty);
      expect(connectCalls, <PoolTab>[PoolTab.simple]);
    });
  });
}

/// Mounts the app-level listener inside the widget tree so this suite proves
/// the persisted store and the listener observe the same value.
class _ListenerProbe extends ConsumerWidget {
  const _ListenerProbe();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(autoConnectListenerProvider);
    return const SizedBox.shrink();
  }
}

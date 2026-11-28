// REQ-SET-02 / T-22-09 / T-22-10: the persisted preference and the single
// launch connect. Fake stores, an in-memory Drift database and an injected
// connect caller keep this independent of any native tunnel or platform
// channel — no second reconnect path and no FSM/native file is involved.
import "dart:async";

import "package:connectivity_plus/connectivity_plus.dart";
import "package:drift/native.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mocktail/mocktail.dart";

import "package:mobile/core/auth/auth_notifier.dart"
    show AuthNotifier, authNotifierProvider;
import "package:mobile/core/auth/auth_state.dart" show AuthState;
import "package:mobile/core/auth/biometric_gate.dart"
    show BiometricGate, resumeBiometricGateProvider;
import "package:mobile/core/biometric/biometric_gate.dart"
    show BiometricResult;
import "package:mobile/core/connectivity/connectivity_service.dart"
    show ConnectivityService, connectivityServiceProvider;
import "package:mobile/core/db/app_database.dart"
    show AppDatabase, appDatabaseProvider;
import "package:mobile/core/settings/auto_connect_listener.dart";
import "package:mobile/core/storage/secure_storage.dart" show SecureStorage;
import "package:mobile/core/storage/token_store.dart" show TokenStore;
import "package:mobile/features/home/providers.dart"
    show CurrentTabNotifier, currentTabProvider;
import "package:mobile/features/servers/server.dart" show PoolTab;
import "package:mobile/features/subscription/models/subscription.dart"
    show SubscriptionStatus;
import "package:mobile/features/subscription/providers.dart"
    show SubscriptionFailure, userSubscriptionProvider;
import "package:mobile/models/auth_models.dart" show TokenPair, User;

class MockConnectivityService extends Mock implements ConnectivityService {}

class MockSecureStorage extends Mock implements SecureStorage {}

/// Fake notifier that resolves to a fixed state without any session restore or
/// platform read.
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

AuthState get _authenticated => AuthState.authenticated(
      tokens: const TokenPair(
        accessToken: "a",
        refreshToken: "r",
        expiresIn: 900,
        userId: 1,
      ),
      user: const User(id: 1),
    );

Future<void> _settle() async {
  for (var i = 0; i < 40; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late TokenStore tokenStore;
  late List<PoolTab> connectCalls;
  late MockConnectivityService connectivity;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    tokenStore = TokenStore(MockSecureStorage());
    connectCalls = <PoolTab>[];
    connectivity = MockConnectivityService();
    when(() => connectivity.connectivityStream).thenAnswer(
      (_) => StreamController<List<ConnectivityResult>>.broadcast().stream,
    );
  });

  tearDown(() {
    db.close();
  });

  ProviderContainer buildContainer({
    required AuthState auth,
    required bool activeKey,
    bool throwOnStoreRead = false,
  }) {
    return ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        authNotifierProvider.overrideWith(() => FakeAuthNotifier(auth)),
        userSubscriptionProvider.overrideWith((ref) async {
          if (!activeKey) {
            throw const SubscriptionFailure(
              "no_active_key",
              "Нужен активный ключ",
            );
          }
          return const SubscriptionStatus(ok: true);
        }),
        autoConnectCallerProvider.overrideWithValue((tab) async {
          connectCalls.add(tab);
        }),
        resumeBiometricGateProvider.overrideWithValue(
          FakeBiometricGate(tokenStore),
        ),
        currentTabProvider.overrideWith(() => FakeCurrentTabNotifier()),
        connectivityServiceProvider.overrideWithValue(connectivity),
        if (throwOnStoreRead)
          autoConnectStoreProvider.overrideWithValue(
            _ThrowingAutoConnectStore(db),
          ),
      ],
    );
  }

  group("auto-connect preference", () {
    test("persists across a store rebuild and defaults to false", () async {
      final first = AutoConnectStore(db);
      expect(await first.readAutoConnect(), isFalse);

      await first.setAutoConnect(true);
      // A brand-new store (a cold restart reading the same database) sees it.
      expect(await AutoConnectStore(db).readAutoConnect(), isTrue);

      await AutoConnectStore(db).setAutoConnect(false);
      expect(await AutoConnectStore(db).readAutoConnect(), isFalse);
    });

    test("one singleton row holds the value instead of appending", () async {
      final store = AutoConnectStore(db);
      await store.setAutoConnect(true);
      await store.setAutoConnect(true);
      final rows = await (db.select(db.settings)).get();
      expect(rows, hasLength(1));
      expect(rows.single.id, 1);
      expect(rows.single.wasConnected, isFalse);
    });
  });

  group("one-shot launch listener", () {
    test("calls connect once when authenticated, key-gated and enabled",
        () async {
      await AutoConnectStore(db).setAutoConnect(true);
      final container = buildContainer(
        auth: _authenticated,
        activeKey: true,
      );
      addTearDown(container.dispose);

      expect(container.read(autoConnectListenerProvider), isTrue);
      await _settle();

      expect(connectCalls, <PoolTab>[PoolTab.simple]);
      // Re-watching the provider cannot start a second connection.
      container.read(autoConnectListenerProvider);
      await _settle();
      expect(connectCalls, hasLength(1));
      // No connectivity subscription is added by this path: a network change
      // stays owned by connectionReconnectListenerProvider (D-15).
      verifyNever(() => connectivity.connectivityStream);
    });

    test("never connects while unauthenticated", () async {
      await AutoConnectStore(db).setAutoConnect(true);
      final container = buildContainer(
        auth: const AuthState.unauthenticated(),
        activeKey: true,
      );
      addTearDown(container.dispose);

      container.read(autoConnectListenerProvider);
      await _settle();

      expect(connectCalls, isEmpty);
    });

    test("never connects without an active key", () async {
      await AutoConnectStore(db).setAutoConnect(true);
      final container = buildContainer(
        auth: _authenticated,
        activeKey: false,
      );
      addTearDown(container.dispose);

      container.read(autoConnectListenerProvider);
      await _settle();

      expect(connectCalls, isEmpty);
    });

    test("never connects when the preference is false", () async {
      await AutoConnectStore(db).setAutoConnect(false);
      final container = buildContainer(
        auth: _authenticated,
        activeKey: true,
      );
      addTearDown(container.dispose);

      container.read(autoConnectListenerProvider);
      await _settle();

      expect(connectCalls, isEmpty);
    });

    test("a storage failure never breaks startup and schedules no retry",
        () async {
      final container = buildContainer(
        auth: _authenticated,
        activeKey: true,
        throwOnStoreRead: true,
      );
      addTearDown(container.dispose);

      expect(container.read(autoConnectListenerProvider), isTrue);
      await _settle();

      expect(connectCalls, isEmpty);
    });
  });
}

class _ThrowingAutoConnectStore extends AutoConnectStore {
  _ThrowingAutoConnectStore(AppDatabase db) : super(db);

  @override
  Future<bool> readAutoConnect() async =>
      throw StateError("storage unavailable");
}

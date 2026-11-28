// REQ-SET-04 / T-22-11 / T-22-12: Reset Demo clears every local credential
// surface and makes zero server calls. Fake secure storage, an in-memory Drift
// database and a counting auth notifier make the whole boundary observable
// without a platform channel or network client.
import "package:drift/native.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_secure_storage/flutter_secure_storage.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mocktail/mocktail.dart";

import "package:mobile/core/api/dio_client.dart" show DioClient;
import "package:mobile/core/auth/auth_notifier.dart"
    show AuthNotifier, authNotifierProvider, dioClientProvider;
import "package:mobile/core/auth/auth_state.dart" show AuthState;
import "package:mobile/core/db/app_database.dart" show AppDatabase, appDatabaseProvider;
import "package:mobile/core/db/ping_cache_dao.dart" show PingCacheDao;
import "package:mobile/core/ping/ping_repository.dart" show PingCacheEntry;
import "package:mobile/core/settings/auto_connect_listener.dart"
    show AutoConnectStore;
import "package:mobile/core/settings/reset_demo.dart" show resetDemo;
import "package:mobile/core/storage/secure_storage.dart" show SecureStorage;
import "package:mobile/core/storage/token_store.dart"
    show TokenStore, secureStorageProvider, tokenStoreProvider;
import "package:mobile/models/auth_models.dart" show TokenPair;

/// Captures the provider ref so the function under test can be called exactly
/// as the profile UI will call it (a WidgetRef is also a Ref).
final testRefProvider = Provider<Ref>((ref) => ref);

class MockDioClient extends Mock implements DioClient {}

/// In-memory stand-in for one FlutterSecureStorage namespace.
class InMemorySecureStorage extends Mock implements FlutterSecureStorage {
  InMemorySecureStorage() {
    for (final key in const <String>[
      "access_token",
      "refresh_token",
      "user_id",
      "biometric_only",
    ]) {
      when(() => write(key: key, value: any(named: "value")))
          .thenAnswer((invocation) async {
        final value = invocation.namedArguments[const Symbol("value")] as String?;
        if (value == null) {
          values.remove(key);
        } else {
          values[key] = value;
        }
      });
      when(() => read(key: key)).thenAnswer((_) async => values[key]);
      when(() => delete(key: key)).thenAnswer((_) async {
        values.remove(key);
      });
    }
    when(() => deleteAll()).thenAnswer((_) async {
      values.clear();
    });
  }

  final Map<String, String> values = <String, String>{};
}

class FakeSecureStorage implements SecureStorage {
  FakeSecureStorage(this._standard, this._biometric);

  final InMemorySecureStorage _standard;
  final InMemorySecureStorage _biometric;

  @override
  FlutterSecureStorage get storage => _standard;

  @override
  FlutterSecureStorage get biometricStorage => _biometric;

  @override
  Future<void> clearAll() => _standard.deleteAll();
}

class CountingAuthNotifier extends AuthNotifier {
  int builds = 0;

  @override
  AuthState build() {
    builds++;
    return const AuthState.unauthenticated();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late PingCacheDao dao;
  late InMemorySecureStorage standard;
  late InMemorySecureStorage biometric;
  late FakeSecureStorage secureStorage;
  late TokenStore tokenStore;
  late CountingAuthNotifier authNotifier;
  late MockDioClient dioClient;
  late ProviderContainer container;
  late int navigations;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dao = PingCacheDao(db);
    standard = InMemorySecureStorage();
    biometric = InMemorySecureStorage();
    secureStorage = FakeSecureStorage(standard, biometric);
    tokenStore = TokenStore(secureStorage);
    authNotifier = CountingAuthNotifier();
    dioClient = MockDioClient();
    navigations = 0;

    container = ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        secureStorageProvider.overrideWithValue(secureStorage),
        tokenStoreProvider.overrideWithValue(tokenStore),
        authNotifierProvider.overrideWith(() => authNotifier),
        dioClientProvider.overrideWithValue(dioClient),
      ],
    );
  });

  tearDown(() {
    container.dispose();
    db.close();
  });

  Future<void> seedEveryLocalSurface() async {
    await tokenStore.saveTokenPair(
      const TokenPair(
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresIn: 900,
        userId: 1,
      ),
    );
    // A biometric-scoped copy of the access token is the stale secret that a
    // plain SecureStorage.clearAll() would leave behind (Pitfall 5).
    await biometric.write(key: "access_token", value: "biometric-secret");
    await biometric.write(key: "biometric_only", value: "biometric-secret");

    await dao.write(
      PingCacheEntry(
        serverId: "s1",
        tab: "simple",
        rttMs: 12,
        online: true,
        approx: false,
        tsMs: 1000,
      ),
    );
    await dao.pushLastGood("simple", "s1", tsMs: 1000);
    await dao.setSelection("simple", "s1");
    await dao.setCurrentTab("whitelist");
    await dao.cacheServerList("simple", "[]");
    await AutoConnectStore(db).setAutoConnect(true);
  }

  test("clears tokens, both storage namespaces and every Drift table", () async {
    await seedEveryLocalSurface();
    // Keep auth alive so invalidate() triggers a real rebuild.
    container.listen(authNotifierProvider, (_, __) {});
    expect(await tokenStore.hasTokens(), isTrue);

    final ref = container.read(testRefProvider);
    await resetDemo(ref, onNavigateToAuth: () => navigations++);

    expect(await tokenStore.hasTokens(), isFalse);
    expect(standard.values, isEmpty);
    expect(biometric.values, isEmpty);
    expect(await (db.select(db.pingCache)).get(), isEmpty);
    expect(await (db.select(db.lastGood)).get(), isEmpty);
    expect(await (db.select(db.selection)).get(), isEmpty);
    expect(await (db.select(db.currentTab)).get(), isEmpty);
    expect(await (db.select(db.serverListCache)).get(), isEmpty);
    expect(await (db.select(db.settings)).get(), isEmpty);
  });

  test("invalidates auth, navigates once and makes no outbound call", () async {
    await seedEveryLocalSurface();
    container.listen(authNotifierProvider, (_, __) {});
    final buildsBefore = authNotifier.builds;

    final ref = container.read(testRefProvider);
    await resetDemo(ref, onNavigateToAuth: () => navigations++);

    // Reading after the invalidation rebuilds the notifier once more.
    final state = container.read(authNotifierProvider);
    expect(state.value, const AuthState.unauthenticated());
    expect(authNotifier.builds, greaterThan(buildsBefore));
    expect(navigations, 1);
    // No DioClient, therefore no HTTP, provider clear, key/device delete or
    // server session revocation can originate from this path.
    verifyNever(() => dioClient.dio);
  });

  test("hasTokens stays false after reset even with a stored biometric copy",
      () async {
    await seedEveryLocalSurface();
    final ref = container.read(testRefProvider);
    await resetDemo(ref, onNavigateToAuth: () => navigations++);

    expect(await tokenStore.getAccessTokenNoBiometric(), isNull);
    expect(await tokenStore.getRefreshToken(), isNull);
    expect(await tokenStore.getAccessToken(), isNull);
    expect(await tokenStore.hasTokens(), isFalse);
  });
}

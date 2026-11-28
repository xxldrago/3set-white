import "dart:io";

import "package:dio/dio.dart";
import "package:drift/native.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:go_router/go_router.dart";
import "package:mobile/app/router.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/api/endpoints.dart";
import "package:mobile/core/auth/auth_notifier.dart";
import "package:mobile/core/auth/auth_state.dart";
import "package:mobile/core/db/app_database.dart";
import "package:mobile/core/db/ping_cache_dao.dart";
import "package:mobile/core/ping/libbox_core.dart";
import "package:mobile/core/ping/libbox_ping_service.dart";
import "package:mobile/core/ping/ping_repository.dart";
import "package:mobile/core/ping/socket_ping_service.dart";
import "package:mobile/features/auth/providers.dart" show currentUserProvider;
import "package:mobile/features/auth/screens/login_screen.dart";
import "package:mobile/features/auth/screens/register_screen.dart";
import "package:mobile/features/servers/providers.dart"
    show pingRepositoryProvider;
import "package:mobile/features/servers/server_pool_screen.dart"
    show ServerPoolScreen, networkLabelProvider;
import "package:mobile/features/shop/shop_screen.dart";
import "package:mobile/models/auth_models.dart";
import "package:mocktail/mocktail.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

/// Deterministic libbox stand-in; production ping stays real (D-06).
class FakeLibboxClient implements LibboxPingClient {
  /// Creates a prober that reports one fixed online RTT.
  const FakeLibboxClient();

  @override
  Future<void> init() async {}

  @override
  Future<void> start(String configJson) async {}

  @override
  Future<LibboxUrltestResult> urltest(
    String tag, {
    Duration timeout = const Duration(seconds: 2),
  }) async =>
      LibboxUrltestResult(online: true, rttMs: 42);
}

/// Fixed-state notifier so redirect logic can be driven deterministically.
class FakeAuthNotifier extends AuthNotifier {
  /// Creates a notifier pinned to [authState].
  FakeAuthNotifier(this.authState);

  /// Fixed authentication state reported to the router.
  final AuthState authState;

  @override
  AuthState build() => authState;
}

AuthState authenticatedState() => AuthState.authenticated(
      tokens: const TokenPair(
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 900,
        userId: 1,
      ),
      user: User(id: 1, email: "test@example.com"),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    registerFallbackValue(
      const TokenPair(
        accessToken: "fallback_access",
        refreshToken: "fallback_refresh",
        expiresIn: 900,
      ),
    );
    registerFallbackValue(
      User(id: 1, email: "fallback@example.com"),
    );
  });

  late AppDatabase db;
  late ProviderContainer container;
  late GoRouter router;
  late ProviderSubscription<GoRouter> routerSubscription;
  late MockDio dio;
  late MockDioClient client;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    dio = MockDio();
    client = MockDioClient();
    when(() => client.dio).thenReturn(dio);
    when(() => dio.get(Endpoints.servers)).thenAnswer(
      (_) async => Response<dynamic>(
        statusCode: 200,
        data: <String, dynamic>{
          "ok": true,
          "simple": <dynamic>[],
          "whitelist": <dynamic>[],
          "key": <String, dynamic>{
            "active": true,
            "keyId": "key_1",
            "isTrial": false,
            "remainingDays": 30,
          },
        },
        requestOptions: RequestOptions(path: Endpoints.servers),
      ),
    );
  });

  tearDown(() {
    if (!routerSubscription.closed) {
      routerSubscription.close();
    }
    container.dispose();
    db.close();
  });

  Future<void> pumpRouter(
    WidgetTester tester, {
    required AuthState state,
  }) async {
    final dao = PingCacheDao(db);
    final repository = PingRepository(
      libbox: LibboxPingService(client: const FakeLibboxClient()),
      socket: SocketPingService(),
      cacheWriter: dao,
      cacheLookup: dao,
    );
    container = ProviderContainer(
      overrides: [
        authNotifierProvider.overrideWith(() => FakeAuthNotifier(state)),
        appDatabaseProvider.overrideWithValue(db),
        dioClientProvider.overrideWithValue(client),
        pingRepositoryProvider.overrideWithValue(repository),
        networkLabelProvider.overrideWith((_) => Stream<String>.value("Wi-Fi")),
        currentUserProvider.overrideWith((_) => null),
      ],
    );
    routerSubscription = container.listen(routerProvider, (_, _) {});
    router = container.read(routerProvider);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          theme: AppTheme.dark,
          darkTheme: AppTheme.dark,
          themeMode: ThemeMode.dark,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets("home renders the pool screen without a bottom nav", (
    WidgetTester tester,
  ) async {
    await pumpRouter(tester, state: authenticatedState());

    expect(find.byType(ServerPoolScreen), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(LoginScreen), findsNothing);
  });

  testWidgets("unauthenticated protected navigation redirects to auth", (
    WidgetTester tester,
  ) async {
    await pumpRouter(
      tester,
      state: const AuthState.unauthenticated(),
    );
    expect(find.byType(LoginScreen), findsOneWidget);

    router.go("/");
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets("shop route renders the real Shop Screen without bottom nav", (
    WidgetTester tester,
  ) async {
    await pumpRouter(tester, state: authenticatedState());

    router.go("/shop");
    await tester.pumpAndSettle();
    expect(find.byType(ShopScreen), findsOneWidget);
    expect(find.text("Покупка ключа"), findsOneWidget);
    expect(find.text("Магазин ключей появится в фазе 21"), findsNothing);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets("unauthenticated auth routes are preserved", (
    WidgetTester tester,
  ) async {
    await pumpRouter(
      tester,
      state: const AuthState.unauthenticated(),
    );
    expect(find.byType(LoginScreen), findsOneWidget);

    router.go("/register");
    await tester.pumpAndSettle();
    expect(find.byType(RegisterScreen), findsOneWidget);
  });

  testWidgets("authenticated auth routes redirect to the pool screen", (
    WidgetTester tester,
  ) async {
    await pumpRouter(tester, state: authenticatedState());

    router.go("/register");
    await tester.pumpAndSettle();
    expect(find.byType(ServerPoolScreen), findsOneWidget);
    expect(find.byType(RegisterScreen), findsNothing);
  });

  test("router source keeps auth wiring and drops the bottom nav", () {
    final routerSource = File("lib/app/router.dart").readAsStringSync();
    final mainSource = File("lib/main.dart").readAsStringSync();
    final loginSource =
        File("lib/features/auth/screens/login_screen.dart").readAsStringSync();

    expect(routerSource, contains("refreshListenable: authRefresh"));
    expect(routerSource, contains("redirect: (context, state)"));
    expect(routerSource, contains("isAuthRoute"));
    expect(routerSource, contains("authNotifierProvider"));
    expect(routerSource, contains("authStateProvider"));
    expect(routerSource, contains("path: '/auth'"));
    expect(routerSource, contains("path: '/register'"));
    expect(routerSource, contains("path: '/telegram-wait'"));
    expect(routerSource, contains("path: '/shop'"));
    expect(routerSource, contains("const ServerPoolScreen()"));
    expect(routerSource, isNot(contains("NavigationBar")));
    expect(routerSource, isNot(contains("_HomeContent")));
    expect(routerSource, isNot(contains("_HomeScreen")));
    expect(routerSource, isNot(contains("bottomNavIndexProvider")));
    expect(routerSource, isNot(contains("currentTabProvider")));
    expect(mainSource, contains("deepLinkHandlerProvider"));
    expect(mainSource, contains("resumeBiometricGateProvider"));
    expect(loginSource, contains("context.go('/')"));
  });
}

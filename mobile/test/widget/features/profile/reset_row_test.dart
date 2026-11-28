// Wave 0 widget contract for the local-only Reset Demo row (22-03,
// REQ-SET-04 / T-22-17). The row confirms, then calls ONLY the injected local
// reset seam with one navigation callback; no HTTP client is ever touched.
import "package:dio/dio.dart";
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/app/theme.dart";
import "package:mobile/core/api/dio_client.dart";
import "package:mobile/core/auth/auth_notifier.dart" show dioClientProvider;
import "package:mobile/features/profile/settings/reset_row.dart";
import "package:mocktail/mocktail.dart";

class MockDioClient extends Mock implements DioClient {}

class MockDio extends Mock implements Dio {}

void main() {
  testWidgets("confirm then call only the local reset with one navigation", (
    tester,
  ) async {
    final resetCalls = <void Function()>[];
    final navigations = <int>[];
    final dio = MockDio();
    final dioClient = MockDioClient();
    when(() => dioClient.dio).thenReturn(dio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          resetDemoCallProvider.overrideWithValue((onNavigateToAuth) async {
            resetCalls.add(onNavigateToAuth);
          }),
          resetNavigationProvider.overrideWithValue(
            () => navigations.add(1),
          ),
          dioClientProvider.overrideWithValue(dioClient),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ResetRow()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text("Сбросить демо-данные"));
    await tester.pumpAndSettle();
    expect(find.text("Сбросить демо-данные?"), findsOneWidget);
    expect(resetCalls, isEmpty); // cancelling or dismissing does nothing

    await tester.tap(find.text("Сбросить"));
    await tester.pumpAndSettle();

    expect(resetCalls, hasLength(1));
    resetCalls.single();
    expect(navigations, <int>[1]);
    verifyNever(() => dio.get(any()));
    verifyNever(() => dio.post(any()));
  });

  testWidgets("navigation callback outlives the reset row's context", (
    tester,
  ) async {
    final resetCalls = <void Function()>[];
    final navigations = <int>[];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          resetDemoCallProvider.overrideWithValue((onNavigateToAuth) async {
            resetCalls.add(onNavigateToAuth);
          }),
          resetNavigationProvider.overrideWithValue(() {
            navigations.add(1);
          }),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ResetRow()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text("Сбросить демо-данные"));
    await tester.pumpAndSettle();
    await tester.tap(find.text("Сбросить"));
    await tester.pumpAndSettle();

    expect(resetCalls, hasLength(1));
    // Tear down the whole tree: a captured BuildContext would be dead here.
    await tester.pumpWidget(const SizedBox.shrink());
    resetCalls.single();
    expect(navigations, <int>[1]);
  });
}

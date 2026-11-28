// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'router.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// App router configuration using GoRouter.
/// Routes:
/// - /auth: Login screen
/// - /register: Registration screen
/// - /telegram-wait: Telegram authentication wait screen
/// - /: Main app screen (full prototype server pools, D-15)
/// - /shop: real server-driven Shop Screen (no bottom navigation)
/// - /payment/webview: in-app hosted payment page; the URL is validated https
///   and is never treated as payment confirmation (status comes from the DB).
/// Riverpod provider for the GoRouter instance

@ProviderFor(router)
final routerProvider = RouterProvider._();

/// App router configuration using GoRouter.
/// Routes:
/// - /auth: Login screen
/// - /register: Registration screen
/// - /telegram-wait: Telegram authentication wait screen
/// - /: Main app screen (full prototype server pools, D-15)
/// - /shop: real server-driven Shop Screen (no bottom navigation)
/// - /payment/webview: in-app hosted payment page; the URL is validated https
///   and is never treated as payment confirmation (status comes from the DB).
/// Riverpod provider for the GoRouter instance

final class RouterProvider
    extends $FunctionalProvider<GoRouter, GoRouter, GoRouter>
    with $Provider<GoRouter> {
  /// App router configuration using GoRouter.
  /// Routes:
  /// - /auth: Login screen
  /// - /register: Registration screen
  /// - /telegram-wait: Telegram authentication wait screen
  /// - /: Main app screen (full prototype server pools, D-15)
  /// - /shop: real server-driven Shop Screen (no bottom navigation)
  /// - /payment/webview: in-app hosted payment page; the URL is validated https
  ///   and is never treated as payment confirmation (status comes from the DB).
  /// Riverpod provider for the GoRouter instance
  RouterProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'routerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$routerHash();

  @$internal
  @override
  $ProviderElement<GoRouter> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  GoRouter create(Ref ref) {
    return router(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(GoRouter value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<GoRouter>(value),
    );
  }
}

String _$routerHash() => r'f5f8eb89f1b2eb96fbe6a888c2c23267a69df3ba';

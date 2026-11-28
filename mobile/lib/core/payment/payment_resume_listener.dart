// D-06 / REQ-SHOP-06: continue the last pending payment after an app kill.
//
// App.build watches paymentResumeListenerProvider once at app startup. The
// only trigger is the persisted non-secret order id read by resumePending():
// no WebView return URL, deep link or timer can confirm a payment (T-21-34).
// The router and the WebView page stay side-effect free.
import "dart:async";

import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_secure_storage/flutter_secure_storage.dart";

import "package:mobile/core/auth/auth_notifier.dart" show dioClientProvider;
import "package:mobile/core/payment/payment_flow.dart";
import "package:mobile/features/shop/shop_screen.dart"
    show purchaseStatusProvider;
import "package:mobile/features/subscription/providers.dart"
    show userSubscriptionProvider;

/// Secure store seam for the non-secret pending order id (T-21-09).
final pendingOrderStoreProvider = Provider<PendingOrderStore>((ref) {
  return SecurePendingOrderStore(const FlutterSecureStorage());
});

/// A resume never opens a WebView, but PaymentFlow requires a launcher seam.
class NoopPaymentLauncher implements PaymentWebViewLauncher {
  /// Creates a launcher that cannot navigate.
  const NoopPaymentLauncher();

  @override
  Future<void> openPaymentPage(String url) async {}
}

/// Applies the only real success edge: refresh entitlement and publish the
/// status read by the Shop's status-driven celebration (T-21-34).
void onPaymentProvisioned(Ref ref) {
  ref.invalidate(userSubscriptionProvider);
  ref.read(purchaseStatusProvider.notifier).state = "provisioned";
}

/// The one PaymentFlow used by the killed-app resume path.
final resumePaymentFlowProvider = Provider<PaymentFlow>((ref) {
  return PaymentFlow(
    dio: ref.read(dioClientProvider).dio,
    store: ref.read(pendingOrderStoreProvider),
    launcher: const NoopPaymentLauncher(),
    onProvisioned: () async => onPaymentProvisioned(ref),
  );
});

/// App-level always-on listener: starts one resume attempt per process.
///
/// Riverpod runs a provider body only on its first read, so watching this
/// from main.dart's App.build calls resumePending() exactly once at startup.
/// A terminal result clears the stored id; a timeout keeps it for the next
/// launch (D-06).
final paymentResumeListenerProvider = Provider<bool>((ref) {
  unawaited(_resumePending(ref.read(resumePaymentFlowProvider)));
  return true;
});

Future<void> _resumePending(PaymentFlow flow) async {
  try {
    await flow.resumePending();
  } on Object catch (_) {
    // Startup must never break the app. The id stays stored so the next
    // launch can resume again (D-06).
    return;
  }
}

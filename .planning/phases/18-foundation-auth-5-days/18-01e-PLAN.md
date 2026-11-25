---
phase: 18-foundation-auth-5-days
plan: 01e
type: execute
wave: 2
depends_on:
  - 18-01d
  - 18-02
files_modified:
  - mobile/android/app/src/main/AndroidManifest.xml
  - mobile/android/app/build.gradle.kts
  - mobile/ios/Runner/Info.plist
  - mobile/ios/Runner/Runner.entitlements
  - mobile/test/integration/deep_link_tracer_test.dart
autonomous: true
requirements:
  - REQ-AUTH-01
  - REQ-AUTH-03
  - REQ-AUTH-04
  - REQ-AUTH-05

estimate:
  tokens: 14000
  raw_tokens: 7000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - Android App Links intent-filter with autoVerify configured for dash.3set.online
    - iOS Universal Links configured with FlutterDeepLinkingEnabled=YES and associated domains
    - Android VPN/foreground service permissions declared for future phases
    - Integration test proves cold start deep link → polling → authenticated → biometric resume → logout
  artifacts:
    - mobile/android/app/src/main/AndroidManifest.xml (App Links intent-filter, VPN/foreground permissions)
    - mobile/android/app/build.gradle.kts (no changes needed, placeholder)
    - mobile/ios/Runner/Info.plist (FlutterDeepLinkingEnabled, LSApplicationQueriesSchemes, custom URL scheme)
    - mobile/ios/Runner/Runner.entitlements (associated domains for Universal Links)
    - mobile/test/integration/deep_link_tracer_test.dart (end-to-end integration test)
  key_links:
    - AndroidManifest.xml ↔ DeepLinkHandler (App Links verification)
    - Info.plist ↔ DeepLinkHandler (Universal Links + Telegram scheme queries)
    - Integration test ↔ all auth providers (proves vertical slice)

---

<objective>
Configure native platform requirements for deep links and biometric storage, and write the end-to-end integration test that proves the complete auth vertical slice works.
</objective>

<execution_context>
@/Users/alekseimikhalkin/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/alekseimikhalkin/.config/opencode/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/18-foundation-auth-5-days/18-RESEARCH.md
@.planning/phases/18-foundation-auth-5-days/18-01a-PLAN.md
@.planning/phases/18-foundation-auth-5-days/18-01b-PLAN.md
@.planning/phases/18-foundation-auth-5-days/18-01c-PLAN.md
@.planning/phases/18-foundation-auth-5-days/18-01d-PLAN.md
@.planning/phases/18-foundation-auth-5-days/18-02-PLAN.md
@mobile/lib/core/deep_link/deep_link_handler.dart
@mobile/lib/core/auth/biometric_gate.dart
@mobile/lib/core/auth/auth_notifier.dart
</context>

<tasks>

<task type="tracer">
  <name>Tracer: Integration test — cold launch → deep link → poll → authenticated → biometric resume → logout</name>
  <files>
    mobile/android/app/src/main/AndroidManifest.xml
    mobile/ios/Runner/Info.plist
    mobile/ios/Runner/Runner.entitlements
    mobile/test/integration/deep_link_tracer_test.dart
  </files>
  <action>
    Configure native platforms and write the integration test:

    **Android** (`AndroidManifest.xml`):
    - Add `android.permission.INTERNET` (already present)
    - Add `android.permission.FOREGROUND_SERVICE` and `android.permission.FOREGROUND_SERVICE_TYPE_VPN` and `android.permission.VPN_MANAGE` (for future VPN phases, add now to avoid rebuild)
    - Configure `MainActivity` with `android:launchMode="singleTop"` and intent-filter for App Links:
      ```xml
      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="dash.3set.online" />
        <data android:scheme="https" android:host="3set.online" />
      </intent-filter>
      ```
      Also add custom scheme intent-filter for `three-set-vpn://` fallback.

    **iOS** (`Info.plist`):
    - Add `FlutterDeepLinkingEnabled` = `YES` (required for `app_links` on Flutter 3.27+)
    - Add `LSApplicationQueriesSchemes` with `["tg", "telegram"]` for Telegram deep links
    - Add `CFBundleURLTypes` for custom scheme `three-set-vpn`
    - Add `com.apple.developer.associated-domains` entitlement (in `Runner.entitlements`): `applinks:dash.3set.online`, `applinks:3set.online`
    - Ensure `KeychainAccessibility.first_unlock_this_device` works (default in `TokenStore`).

    **assetlinks.json / apple-app-site-association**: Backend serves these from `https://dash.3set.online/.well-known/` (Plan 02 responsibility).

    **Integration Test** (`deep_link_tracer_test.dart`):
    Uses `integration_test` package. Exercises full vertical slice:
    1. Launch app cold → verify unauthenticated state (auth screen shown)
    2. Simulate deep link `t.me/set3vpn_bot?start=nonce_test123` via `AppLinks` test API
    3. Verify DeepLinkHandler receives nonce and starts polling
    4. Mock backend poll endpoint to return 202 (pending) then 200 with tokenPair
    5. Verify AuthNotifier transitions to authenticated
    6. Verify TokenStore has saved tokens
    7. Simulate app background → resume → verify BiometricGate triggers TokenStore.getAccessToken()
    8. Simulate logout → verify storage cleared + unauthenticated state

    Run on simulator/emulator via `flutter test integration_test/deep_link_tracer_test.dart -d <device_id>`.
  </action>
  <verify>
    <automated>cd mobile && flutter analyze && grep -q "FlutterDeepLinkingEnabled" ios/Runner/Info.plist && grep -q "autoVerify" android/app/src/main/AndroidManifest.xml && flutter test integration_test/deep_link_tracer_test.dart -d <device_id></automated>
  </verify>
  <done>
    AndroidManifest.xml has App Links intent-filter with autoVerify, FOREGROUND_SERVICE/VPN_MANAGE permissions. Info.plist has FlutterDeepLinkingEnabled=YES, LSApplicationQueriesSchemes for Telegram, custom URL scheme. Runner.entitlements has associated domains. Integration test passes on Android emulator and iOS simulator, covering cold start deep link → polling → authenticated → biometric resume → logout flow.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Android App Links ↔ dash.3set.online | Verified via assetlinks.json; prevents link hijacking |
| iOS Universal Links ↔ dash.3set.online | Verified via apple-app-site-association; prevents link hijacking |
| Telegram App ↔ Flutter App | Deep link with nonce; validated server-side via poll |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-18-01 | Spoofing | Deep link handler | high | mitigate | App Links/Universal Links verification; nonce validated server-side |
| T-18-02 | Tampering | Token storage | critical | mitigate | Hardware-backed encryption; biometric required on read |
| T-18-06 | Elevation of Privilege | Biometric bypass | high | mitigate | Cancel/failure clears tokens; fallback to device passcode only |
</threat_model>

<verification>
- `flutter analyze` returns 0 errors, 0 warnings
- AndroidManifest.xml has App Links intent-filter with autoVerify=true
- Info.plist has FlutterDeepLinkingEnabled=YES
- Runner.entitlements has associated domains
- Integration test passes all 8 scenarios on Android emulator + iOS simulator
- Deep link opens app and starts Telegram polling flow
- Biometric prompt appears on resume when tokens exist
- Logout clears storage and returns to auth screen
</verification>

<success_criteria>
- Android App Links configured with autoVerify for dash.3set.online
- iOS Universal Links configured with associated domains
- Android VPN/foreground permissions declared
- Integration test proves end-to-end auth vertical slice
- flutter analyze clean
</success_criteria>

<output>
Create `.planning/phases/18-foundation-auth-5-days/18-01e-SUMMARY.md` when done
</output>
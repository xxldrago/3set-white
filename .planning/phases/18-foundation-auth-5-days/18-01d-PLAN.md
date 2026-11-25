---
phase: 18-foundation-auth-5-days
plan: 01d
type: execute
wave: 1
depends_on:
  - 18-01c
files_modified:
  - mobile/lib/core/auth/biometric_gate.dart
  - mobile/lib/core/connectivity/connectivity_service.dart
  - mobile/lib/core/deep_link/deep_link_handler.dart
  - mobile/test/unit/core/auth/biometric_gate_test.dart
  - mobile/test/unit/core/connectivity/connectivity_service_test.dart
  - mobile/test/unit/core/deep_link/deep_link_handler_test.dart
autonomous: true
requirements:
  - REQ-AUTH-01
  - REQ-AUTH-03
  - REQ-AUTH-04

estimate:
  tokens: 18000
  raw_tokens: 9000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - Biometric prompt appears on app resume when tokens exist
    - Biometric cancel/failure clears tokens and returns unauthenticated
    - Connectivity stream emits distinct network change events
    - Deep link handler receives cold-start and runtime Telegram links
    - Deep link nonce triggers polling → authenticated state on success
  artifacts:
    - mobile/lib/core/auth/biometric_gate.dart (WidgetsBindingObserver listening for resume, triggers TokenStore.getAccessToken)
    - mobile/lib/core/connectivity/connectivity_service.dart (wraps Connectivity().onConnectivityChanged.distinct())
    - mobile/lib/core/deep_link/deep_link_handler.dart (AppLinks getInitialAppLink + uriLinkStream, parses nonce, polls /telegram/poll)
    - Unit tests for all three providers
  key_links:
    - BiometricGate → TokenStore (resume triggers biometric read)
    - DeepLinkHandler → AuthNotifier (polling success sets authenticated state)
    - ConnectivityService → future ping cache (Phase 19)

---

<objective>
Build the biometric gate, connectivity monitoring, and Telegram deep link handler — the platform integration layer that responds to app lifecycle, network changes, and external deep links.
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
@mobile/lib/core/storage/token_store.dart
@mobile/lib/core/auth/auth_notifier.dart
@mobile/lib/core/api/dio_client.dart
</context>

<tasks>

<task type="tracer">
  <name>Tracer: Deep link → nonce parse → poll 202 → poll 200 → AuthNotifier authenticated → BiometricGate on resume</name>
  <files>
    mobile/lib/core/auth/biometric_gate.dart
    mobile/lib/core/connectivity/connectivity_service.dart
    mobile/lib/core/deep_link/deep_link_handler.dart
  </files>
  <action>
    Implement the three platform integration providers:

    1. **BiometricGate** (`biometric_gate.dart`): Riverpod provider with `WidgetsBindingObserver`:
       - `didChangeAppLifecycleState(AppLifecycleState.resumed)` → if `TokenStore.hasTokens()` → call `TokenStore.getAccessToken()` (triggers biometric)
       - On biometric success: do nothing (stay authenticated)
       - On biometric cancel/failure/error: `TokenStore.clearAll()` → `AuthNotifier` auto-transitions via next build or explicit call
       - Register observer in `ProviderScope` overlay or via `Ref.listen`

    2. **ConnectivityService** (`connectivity_service.dart`): Riverpod provider:
       - Wraps `Connectivity().onConnectivityChanged.distinct()` stream
       - Exposes `Stream<ConnectivityResult>` for ping cache invalidation (Phase 19)
       - `Stream<ConnectivityResult> get connectivityStream` — distinct events only

    3. **DeepLinkHandler** (`deep_link_handler.dart`): Riverpod provider using `AppLinks()`:
       - `build()`: await `getInitialAppLink()` for cold start, listen `uriLinkStream` for runtime
       - Parse `nonce` from `t.me/set3vpn_bot?start=nonce_{nonce}` or custom scheme `three-set-vpn://auth?nonce=...`
       - On nonce: start polling `GET /api/mobile/auth/telegram/poll?nonce=...` every 3s (max 60 attempts = 3min)
       - On 200 with tokenPair → `TokenStore.saveTokenPair()` → `AuthNotifier` session restore → authenticated
       - On 202: continue polling
       - On 410/409/timeout/error → stop polling → set error state via AuthNotifier or local state
       - `cancelPolling()` method for TelegramWaitScreen cancel button

    4. **Unit tests**: Mock AppLinks, TokenStore, AuthNotifier, DioClient. Test:
       - BiometricGate: resume triggers getAccessToken, cancel clears storage
       - ConnectivityService: distinct stream emits on network change
       - DeepLinkHandler: cold start link parsed, nonce extracted, polling starts, 200 response → authenticated

    All code follows RESEARCH.md patterns exactly — no deviations.
  </action>
  <verify>
    <automated>cd mobile && flutter analyze && flutter test test/unit/core/auth/biometric_gate_test.dart test/unit/core/connectivity/connectivity_service_test.dart test/unit/core/deep_link/deep_link_handler_test.dart</automated>
  </verify>
  <done>
    BiometricGate triggers on resume, ConnectivityService emits distinct network events, DeepLinkHandler parses Telegram deep links and polls to authenticated state, all unit tests pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile App ↔ Telegram Deep Link | External app (Telegram) launches app with nonce; nonce validated server-side |
| Mobile App ↔ Secure Storage | Trusted local boundary; biometric gate on read |
| DeepLinkHandler ↔ Backend API | Untrusted network; polling with nonce |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-18-01 | Spoofing | Deep link handler | high | mitigate | Nonce validated server-side via `/telegram/poll`; nonce TTL 10min; consumed once |
| T-18-06 | Elevation of Privilege | Biometric bypass | high | mitigate | `enforceBiometrics: false` allows device passcode fallback; cancel clears tokens |
</threat_model>

<verification>
- `flutter analyze` returns 0 errors, 0 warnings
- `flutter test` unit tests for biometric_gate, connectivity_service, deep_link_handler all pass
- Deep link: cold start `t.me/set3vpn_bot?start=nonce_xxx` → nonce parsed → polling starts
- Polling: 202 → continue, 200 with tokens → TokenStore.save → AuthNotifier authenticated
- BiometricGate: app resume → getAccessToken called → biometric prompt
- Connectivity: network toggle → distinct event emitted
</verification>

<success_criteria>
- BiometricGate provider registered and triggers on AppLifecycleState.resumed
- ConnectivityService exposes distinct connectivity stream
- DeepLinkHandler handles cold-start and runtime deep links
- Telegram nonce polling works end-to-end (202 → 200 → authenticated)
- Unit tests cover all three providers with mocked dependencies
</success_criteria>

<output>
Create `.planning/phases/18-foundation-auth-5-days/18-01d-SUMMARY.md` when done
</output>
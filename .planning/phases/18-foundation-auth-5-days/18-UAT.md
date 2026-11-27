---
status: testing
phase: 18-foundation-auth-5-days
source: [18-01a-SUMMARY.md, 18-01b-SUMMARY.md, 18-01c-SUMMARY.md, 18-01d-SUMMARY.md, 18-01e-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-VERIFICATION.md]
started: 2026-11-27T10:35:00Z
updated: 2026-11-27T14:10:00Z
---

## Current Test

number: 4
name: Telegram deep-link round trip
expected: |
  Tap «Войти через Telegram» → Telegram opens `t.me/set3vpn_bot?start=nonce_<nonce>`
  → press Start → return to the app → «Ожидание авторизации» resolves → home screen
  with an authenticated session.
awaiting: decision — the bot has no `nonce_` handler, so this test cannot pass
  without a code fix (see Gaps #1). Needs a product decision on the handshake.

## Tests

### 1. Cold start smoke test

expected: Backend boots without errors, the app launches on the login screen, and `GET /api/mobile/subscription` without a token returns 401 (server is live).
result: pass — backend live (`GET /api/mobile/subscription` → 401 unauthenticated on the scratch server, port 3200); app cold-starts on «Вход» / «Добро пожаловать» with no error surface (`integration_test/auth_validation_test.dart`, test 1).

### 2. Email/password login and register

expected: Register with a fresh email + password ≥ 8 (confirm matches) → auto-login → home screen. Logout → «Вход». Wrong password → toast «Неверный email или пароль». Short password → inline «Пароль должен быть минимум 8 символов».
result: partial — client-side validation verified on the simulator: short password → inline «Пароль должен быть минимум 8 символов», invalid email → «Неверный формат email», register password mismatch → «Пароли не совпадают» (`integration_test/auth_validation_test.dart`, 3 tests). Server-side register/login/refresh verified by the 33-assertion curl suite. NOT verified: the UI transition login → home and the wrong-password toast, because the app hardcodes `baseUrl: 'https://dash.3set.online'` (`mobile/lib/core/api/dio_client.dart:23`, `auth_interceptor.dart:99`) and there is no `--dart-define` override, so driving the real flow would create accounts on production.

### 3. Session restore across app restart

expected: While logged in, kill and relaunch the app → it skips «Вход» and shows the home screen without asking for the password again.
result: partial — restore logic verified in unit tests: `auth_notifier_test.dart` covers restore-from-stored-token on build, and `deep_link_handler_test.dart` covers tokens persisted after poll (24 tests pass). NOT verified: an actual process kill + relaunch on a device, for the same reason as test 2 (no reachable non-production backend).

### 4. Telegram deep-link round trip

expected: Tap «Войти через Telegram» → Telegram opens `t.me/set3vpn_bot?start=nonce_<nonce>` → press Start → return to the app → «Ожидание авторизации» resolves → home screen with an authenticated session.
result: fail — the handshake is not implemented end-to-end. `POST /api/mobile/auth/telegram/nonce` stores a `nonce_<32 hex>` row with `telegramId = null`, but the bot's `/start` handler only parses `login_` (`parseLoginStartPayload`) and `link_` (`parseLinkStartPayload`) payloads (`lib/bot.ts:117,133`); nothing anywhere parses `nonce_` (grep: only the nonce/poll routes mention it). Proven by executing both parsers against a real nonce: both return `null`, so no bind happens, the row keeps `telegramId = null`, and `GET /api/mobile/auth/telegram/poll` stays `202 {status:"pending"}` until the 10-minute TTL expires. The app then times out after 60 polls (3 min) and shows «Время ожидания истекло». This blocks REQ-AUTH-03.

### 5. Biometric unlock on resume

expected: With a session active, background the app and resume → Face ID / Touch ID / Android biometric prompt appears. Cancel → tokens are cleared and the app returns to «Вход». Success → session stays.
result: blocked — the iOS Simulator cannot present a real Face ID challenge for the gate, so the cancel/success branches cannot be exercised. Gating logic itself is unit-tested (`biometric_gate_test.dart`); device verification needs real hardware.

### 6. Signed deep links (Android App Links / iOS Universal Links)

expected: After release signing, `https://dash.3set.online/...` and `https://3set.online/...` open the installed app directly (no browser chooser). Requires the real `assetlinks.json` SHA-256 fingerprint and AASA Team ID.
result: blocked — `public/.well-known/assetlinks.json` still holds the placeholder fingerprint `AA:BB:CC:...` and `apple-app-site-association` holds `TEAMID.com.3set.mobile`. There is no release keystore (`mobile/android/app/*.jks` and `mobile/key.properties` absent) and no Apple Team ID in the project, so the real values cannot be produced.

### 7. Backend mobile auth curl suite

expected: `scripts/test-mobile-auth.sh` passes all 17 cases against a running server (login valid/invalid/malformed, register new/duplicate/mismatch, refresh valid/invalid, nonce, poll pending/expired, subscription valid/missing/invalid, well-known files).
result: pass — 33/33 assertions green: `BASE_URL=http://localhost:3200 bash scripts/test-mobile-auth.sh` against a fresh scratch database on `next start -p 3200`.

## Summary

total: 7
passed: 2
partial: 2
failed: 1
blocked: 2
pending: 0

## Gaps

1. **P0 — Telegram deep-link login cannot complete.** The bot never binds a mobile `nonce_` token, so poll can never return a token pair (details in test 4). Two viable handshakes:
   - (a) *Nonce-only bind* — as designed in `SEED-001` and REQ-AUTH-03: bot `/start nonce_<n>` stamps `telegramId` on the row and the poll exchanges it for a token pair, no code. Fewest moving parts; the nonce is a bearer secret, but since the mobile nonce row has `userId = null`, a leaked nonce only lets an attacker authenticate *their own* Telegram, not hijack an existing account.
   - (b) *Code-confirmed bind* — reuse the `login_` discipline (bot DMs a 6-digit code, app submits it). Strongest anti-hijack posture, but needs a new code-entry screen in the app and changes the poll contract.
2. **UAT 2/3 can only be fully verified against a non-production backend.** The app hardcodes the production base URL in two places with no override, so a real login/register/restart run would create accounts in production. Adding a `--dart-define=API_BASE_URL` override (plus an ATS exception for localhost) would make tests 2 and 3 verifiable on a simulator.
3. **Tests 5 and 6 are externally gated** — real biometric hardware, and a release keystore plus Apple Team ID.

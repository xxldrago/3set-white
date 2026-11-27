---
status: testing
phase: 18-foundation-auth-5-days
source: [18-01a-SUMMARY.md, 18-01b-SUMMARY.md, 18-01c-SUMMARY.md, 18-01d-SUMMARY.md, 18-01e-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-VERIFICATION.md]
started: 2026-11-27T10:35:00Z
updated: 2026-11-27T10:35:00Z
---

## Current Test

number: 1
name: Cold start smoke test
expected: |
  Start the backend from a clean state (Postgres up, `npm run dev`), then launch the
  Flutter app on a simulator/device. The app opens on «Вход» / «Добро пожаловать»
  with no red error screen, and the backend responds to a basic request.
awaiting: user response

## Tests

### 1. Cold start smoke test

expected: Backend boots without errors, the app launches on the login screen, and `GET /api/mobile/subscription` without a token returns 401 (server is live).
result: [pending]

### 2. Email/password login and register

expected: Register with a fresh email + password ≥ 8 (confirm matches) → auto-login → home screen. Logout → «Вход». Wrong password → toast «Неверный email или пароль». Short password → inline «Пароль должен быть минимум 8 символов».
result: [pending]

### 3. Session restore across app restart

expected: While logged in, kill and relaunch the app → it skips «Вход» and shows the home screen without asking for the password again.
result: [pending]

### 4. Telegram deep-link round trip

expected: Tap «Войти через Telegram» → Telegram opens `t.me/set3vpn_bot?start=nonce_<nonce>` → press Start → return to the app → «Ожидание авторизации» resolves → home screen with an authenticated session.
result: [pending]

### 5. Biometric unlock on resume

expected: With a session active, background the app and resume → Face ID / Touch ID / Android biometric prompt appears. Cancel → tokens are cleared and the app returns to «Вход». Success → session stays.
result: [pending]

### 6. Signed deep links (Android App Links / iOS Universal Links)

expected: After release signing, `https://dash.3set.online/...` and `https://3set.online/...` open the installed app directly (no browser chooser). Requires the real `assetlinks.json` SHA-256 fingerprint and AASA Team ID.
result: [pending]

### 7. Backend mobile auth curl suite

expected: `scripts/test-mobile-auth.sh` passes all 17 cases against a running server (login valid/invalid/malformed, register new/duplicate/mismatch, refresh valid/invalid, nonce, poll pending/expired, subscription valid/missing/invalid, well-known files).
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

[none yet]

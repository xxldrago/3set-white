---
status: testing
phase: "21-subscription-purchase-7-days"
source: [21-VERIFICATION.md]
started: "2026-11-28T05:40:00Z"
updated: "2026-11-28T05:40:00Z"
---

## Current Test

number: 1
name: Live Platega test-mode purchase end-to-end (create → hosted page → CONFIRMED webhook → key issued exactly once; CANCELED / CHARGEBACKED / DISPUTED issue nothing)
expected: |
  Order completes, `/payments/status/{id}` becomes `provisioned`, confetti + dated toast appear, subscription refresh shows the real key; non-success statuses issue nothing and clear the pending id.
awaiting: user response

## Tests

### 1. Live Platega payment + webhook key issuance
expected: Test-mode transaction through the Shop; CONFIRMED issues one key only, non-success statuses issue none; status becomes provisioned with dated toast and refreshed subscription.
result: [pending]

### 2. On-device WebView lifecycle + builds
expected: Leave WebView open through settlement — 3s poll runs with «Ожидаем оплату…» visible; kill/relaunch mid-payment resumes from stored non-secret order id without a second create; on-allowlist redirects stay in-app, off-allowlist navigation cancelled; terminal statuses clear the id; Android debug build and iOS compile succeed.
result: [pending]

### 3. Visual / prototype parity
expected: Shop screen, days/30 ring, «Истекает вскоре» banner and confetti overlay match `.planning/seeds/prototype-mobile-client.html` — dark theme, five terms with «Хит» on 1м, ten stepper dots, ring threshold colors, RU copy, status-driven confetti with real `expiresAt`, working copy-link action.
result: [pending]

### 4. Grace connection on device
expected: Real expired non-trial key at `expiresAt + 24h ± 1ms` with a live tunnel — connect allowed inside grace and denied just past it; `/servers`, `/config` and `/subscription` agree; banner reflects the server-supplied deadline.
result: [pending]

### 5. Platega host allowlist deployment check
expected: Real merchant hosted-page host (and subdomains) is in `PaymentFlow.allowedPaymentHosts` / `PLATEGA_PAYMENT_HOST`; arbitrary https hosts and suffix/label tricks are rejected.
result: [pending]

### 6. Inherited phase-19/20 UAT (D-10 changed connect gates)
expected: The 7 open items in `19-VERIFICATION.md` and 8 open items in `20-VERIFICATION.md` are resolved on-device, especially `/servers` and `/config` gates under the shared 24h grace predicate.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

None identified by static verification. Live Platega credentials, device/native builds and visual runtime remain external blockers; no simulation was performed.

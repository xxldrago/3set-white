---
status: testing
phase: "22-devices-settings-polish-5-days"
source: [22-VERIFICATION.md]
started: "2026-11-28T11:59:46Z"
updated: "2026-11-28T11:59:46Z"
---

## Current Test

number: 1
name: Live ARTEMIDA device list and deferred delete with a paid key
expected: |
  GET /api/mobile/devices shows only that user's real device rows in provider order with real labels and server deviceLimit; a five-second undo cancels before any provider call; a confirmed delete removes only that token and a refresh never resurrects it.
awaiting: user response

## Tests

### 1. Live ARTEMIDA device list and deferred delete with a paid key
expected: Real owned device rows, 5s undo cancels before provider call, confirmed delete removes only that token and never resurrects on refresh.
result: [pending]

### 2. Auto-connect single-fire with real biometric resume and live tunnel
expected: After enabling the persisted toggle, lock/relaunch/unlock biometrically → connect(tab, auto: true) fires exactly once; no second reconnect path; network change stays with existing listener.
result: [pending]

### 3. Real on-disk Drift v1 to v2 database upgrade
expected: v1 build with existing ping/selection/tab rows upgrades to v2 preserving all rows and creating the settings table.
result: [pending]

### 4. On-device Reset Demo biometric-resurrection check
expected: After reset, biometric prompt returns no access token, app stays at /auth; no server session or paid key/device affected.
result: [pending]

### 5. Live referral row on a production user with a NULL legacy referralCode
expected: ensureReferralCode touches only the authenticated user's row, produces exactly one `3SET-` prefix, copied URL contains it once.
result: [pending]

### 6. On-device network change and ping-cache invalidation with a live tunnel
expected: Read-only chip updates its label with actual connectivity (including LTE/Ethernet icons); real change invalidates Drift ping cache via existing listener; tapping chip does nothing.
result: [pending]

### 7. Local expiry notification delivery, reboot and permission dialog
expected: With app killed, T-7/T-3/T-1 fire at absolute instants, tap opens /shop only, reboot restores schedule, Android 13+ POST_NOTIFICATIONS dialog shown/granted and status row reflects answer; iOS prompts authorization.
result: [pending]

### 8. Visual parity of assembled profile/devices/settings surfaces with the prototype
expected: Dark palette, spacing, identity, device rows, kill-switch/network/referral/reset/logout rows and dynamic type match the prototype to the extent allowed by D-01/D-05/D-06/D-07/D-08.
result: [pending]

### 9. Live screen-reader pass (TalkBack/VoiceOver) over profile and pool surfaces
expected: Icon-only actions, referral/reset/logout rows, device rows and kill-switch status announced with frozen Russian labels; confetti/ring painters not announced; no token or link spoken.
result: [pending]

### 10. Owner decision on REQ-NOTIF-02 (FCM token registration)
expected: Either confirm continued deferral (no Firebase project/credentials/backend route) or supply credentials and scope a separate task; no fabricated token/route in either case.
result: [pending]

### 11. Inherited phase-19/20/21 UAT before milestone close
expected: Close open live-key, native build/tunnel, payment and visual UAT items in 19-, 20- and 21-VERIFICATION.md, re-checking connect gates changed by phase 21 D-10.
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps

No gaps identified by automated verification. All 11 items are external/device/owner decisions recorded in `22-VERIFICATION.md`; nothing was simulated.

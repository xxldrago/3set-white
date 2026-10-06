---
status: testing
phase: 06-email-auth
source: [06-VERIFICATION.md]
started: 2026-10-06T08:40:00Z
updated: 2026-10-06T08:40:00Z
---

## Current Test

number: 1
name: Bot-redirect login click-through
expected: |
  On /login tap «Войти через Telegram» → a new tab opens t.me/<bot>?start=login_<token> → press Start → the bot replies with a 6-digit code → enter it in the original tab → the original tab becomes logged in exactly once. A wrong code shows the wrong-code copy; replay/expiry show retry/expired.
awaiting: user response

## Tests

### 1. Bot-redirect login click-through
expected: The original tab becomes logged in exactly once; a wrong code shows the wrong-code copy; replay/expiry show retry/expired.
result: [pending]

### 2. Desktop Telegram widget placement
expected: At ~1440px the widget iframe is centered in normal document flow (not absolutely/fixed positioned), with no layout jump.
result: [pending]

### 3. Inline widget login + Account «link Telegram»
expected: Both the /login inline widget and the Account-section «link Telegram» widget fire their callbacks (identifier-only `data-onauth`) and complete login/link.
result: [pending]

### 4. Password reset email round-trip
expected: Reset request email arrives; the 1h one-time link sets a new password; the new password works, the old fails, and the link is single-use.
result: [pending]

### 5. Email-only trial one-per-account
expected: Claiming the trial from the cabinet issues a trial key; a second attempt is blocked cleanly server-side.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

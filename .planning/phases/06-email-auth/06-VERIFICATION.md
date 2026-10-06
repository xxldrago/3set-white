---
phase: 06-email-auth
verified: 2026-10-05T22:18:44Z
status: human_needed
score: 12/13 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/13
  gaps_closed:
    - "An unauthenticated third party cannot deny login/password-reset to an arbitrary known account — the login account-lock is no longer reachable from the unauthenticated reset route (06-14: reset throttle namespaced under __reset__:<normalizedEmail>; cross-route regression test green)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Clicking Telegram login on /login opens the bot, the user types the bot-delivered code, and the original tab returns the user logged in (06-07 truth 1, now with the 06-09 code step)"
    test: "On /login tap «Войти через Telegram»; confirm a new tab opens t.me/<bot>?start=login_<token>; press Start; copy the 6-digit code from the bot; enter it in the original tab and submit."
    expected: "A logged-in cabinet session is created exactly once; a wrong code shows the wrong-code copy; replay/expiry show retry/expired."
    why_human: "The server contract (issue/bind/consume incl. the CR-01 hijack vector and the attempt cap) is covered by tests/integration/telegram-bot-login.test.ts and the client code-entry state is present/wired, but the full browser tab->bot->code->callback round trip cannot be asserted in the vitest node environment."
coincidental_reliance_items: []
human_verification:
  - test: "Bot-redirect login click-through on /login: tap «Войти через Telegram», press Start in the bot, copy the 6-digit code, enter it in the original tab."
    expected: "The original tab becomes logged in exactly once; a wrong code shows the wrong-code copy; replay/expiry show retry/expired."
    why_human: "Server contract is integration-tested, but the browser tab->bot->code->callback round trip cannot be asserted in the vitest node environment (truth 11)."
  - test: "Open /login at ~1440px and confirm the Telegram Login Widget iframe is centered in-flow with no layout jump."
    expected: "Widget sits centered in the normal document flow (not absolutely/fixed positioned)."
    why_human: "Visual position/CLS cannot be verified by grep or node tests."
  - test: "Complete inline Telegram widget login AND the Account-section «link Telegram» widget (identifier-only data-onauth fix from 06-08)."
    expected: "Both callbacks fire and POST to /api/auth/telegram / /api/auth/email/link; session/merge succeeds."
    why_human: "Requires a real Telegram widget popup + browser; code path is unit-tested against Telegram's eval parser only."
  - test: "Request a reset on /reset, receive the email, follow the 1h one-time link, set a new password."
    expected: "The new password works, the old password fails, and the link is single-use."
    why_human: "Requires production SMTP credentials and a real mailbox."
  - test: "Claim the email-only trial from the cabinet once, then attempt it again."
    expected: "First tap issues a trial key; the second attempt is blocked cleanly (server-side)."
    why_human: "End-to-end UX confirmation; server logic is integration-tested."
---

# Phase 6: Email Auth Verification Report

**Phase Goal:** Пользователь регистрируется и входит по email, может связать Telegram-аккаунт, восстанавливает пароль по почте
**Verified:** 2026-10-05T22:18:44Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plan 06-14 (reset→login lockout DoS); overwrote the prior 06-VERIFICATION.md

## Goal Achievement

The one remaining BLOCKER from the prior verification (truth 13: an unauthenticated account-lockout DoS where the reset route bumped the shared account-wide login-lock counter) is **closed at the code level and proven by a passing cross-route behavioral test**. `lib/auth-rate-limit.ts` now exposes `checkResetRateLimit` / `recordResetAttempt`, which delegate to the existing login guard keyed on `resetKey(email) = "__reset__:" + normalizeEmail(email)`. Through `attemptKeys` the only rows the reset path can read or write are `("__reset__:<email>", <ip>)` and `("__reset__:<email>", "")`, which are provably disjoint from login's `(<email>, "")`. `app/api/auth/email/password/request/route.ts` imports and calls only the reset wrappers; a grep confirms no `checkLoginRateLimit`/`recordFailedLogin` remains on the unauthenticated reset surface. `bumpAttempt` is now a single atomic `upsert` with `attempts: { increment: 1 }`.

All other phase truths hold: the full suite is green (**52 files / 437 tests**) and `npx tsc --noEmit` is clean. The only outstanding items are human/browser verifications (the Telegram bot-login browser round-trip, widget placement/popups, real-SMTP reset letter, trial UX). Two non-blocking review Warnings (WR-01 non-atomic lock transition; WR-02 pre-existing `__register__:` test-residue leak) remain and are recorded below as warnings, not gaps.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Register email+password without verification, immediate session on the same httpOnly cookie (SC1, AUTH-01) | ✓ VERIFIED | `register/route.ts` creates user + `signSession(uid,null,…)` + shared `3set_session` cookie; `auth-flow`/`email-auth-flow` integration vectors green |
| 2 | Login email+password; wrong email and wrong password byte-identical 401; same cookie; legacy tid sessions survive (SC2 login, AUTH-02) | ✓ VERIFIED | `login/route.ts` gate-first 429 then single 401 + `dummyVerify`; `requireSession` legacy tid path; tests green |
| 3 | Link Telegram ↔ email account with merge (keys/orders/tickets, trialUsed OR) (SC2 link, AUTH-03) | ✓ VERIFIED | `lib/accounts.ts` in-transaction merge + `link-merge.test.ts`; identifier-only `data-onauth` unit-tested against Telegram's real `eval` (`telegram-widget.test.ts`) |
| 4 | Unlink (confirm + lastMethod) and change-password (current checked) (AUTH-03 support) | ✓ VERIFIED | routes + Account UI; `session-invalidation.test.ts` passes; unlink bumps the watermark |
| 5 | Reset password via email link, 1h one-time, honest no-account, only reset+welcome mails (SC3, AUTH-04) | ✓ VERIFIED | `lib/mail.ts` + request/confirm routes; reset supersession; `reset-flow.test.ts` (10 tests) green |
| 6 | Trial for email accounts protected from farming, one-per-account atomic (SC4, AUTH-05) | ✓ VERIFIED | `claimTrialByUserId` updateMany + `email:{userId}` customerRef + merge trialUsed OR; `emailCanonical UNIQUE` collapses plus/dot aliases (`register-alias.test.ts`) |
| 7 | Telegram button centered in normal flow on desktop (SC5 positioning, AUTH-06) | ✓ VERIFIED | `TelegramWidgetSlot` in-flow `flex min-h-24 items-center justify-center`; widget injected within the slot; no absolute/fixed |
| 8 | "Widget and link flows keep working exactly as before" (06-05 truth 2) | ✓ VERIFIED | `lib/telegram-widget.ts` emits `${tgAuth_…}(user)` (identifier-only direct call); `telegram-widget.test.ts` reproduces Telegram's `eval` and proves the old hyphenated shape throws |
| 9 | Bot-redirect handshake: issue token+deep link; bot Start binds + DMs code; code+claim consume mints session exactly once; replay/expiry/unknown fail closed (06-06 truths 1–3) | ✓ VERIFIED | `lib/telegram-login.ts` + 3 routes + `lib/bot.ts` code reply; `telegram-bot-login.test.ts` green |
| 10 | Bot-redirect login cannot yield another user's session (06-06 truth 4, CR-01) | ✓ VERIFIED | Device-code binding: `bindLoginToken` stores sha256(code), bot DMs it to the authorizing chat; `consumeLoginToken` requires `{token, code}`; hijack vector mints no session |
| 11 | Clicking Telegram login on /login opens the bot, then returns the user logged in (06-07 truth 1) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `TelegramBotLoginButton` + code-entry state wired and server-tested; full browser click-through not exercised (see behavior_unverified_items) |
| 12 | Email-only account lands in the cabinet (keys dashboard) with one-tap trial once, second blocked (06-07 truths 2–3, G-06-9) | ✓ VERIFIED | `app/page.tsx` email-only branch renders `SubscriptionsSectionByUserId` + `TrialButton` + Account; integration vectors pass |
| 13 | An unauthenticated third party cannot deny login/password-reset to an arbitrary known account (login account-lock not reachable from the unauthenticated reset route) | ✓ VERIFIED | 06-14 fix: reset route throttles via `__reset__:<normalizedEmail>` (disjoint row `("__reset__:<email>","")` vs login `(<email>,"")`); `reset-login-isolation.test.ts` proves 5 anon resets leave login 200 and CR-02 still locks login |

**Score:** 12/13 truths verified — 1 present/behavior-unverified (truth 11), 0 failed. The prior FAILED truth 13 is now VERIFIED with a behavioral regression test.

**06-14 plan must-haves** (declared in `06-14-PLAN.md`) all verified: (a) unauth reset requests cannot lock login — VERIFIED by `reset-login-isolation.test.ts` Vector 1; (b) five failed logins from rotating IPs still lock the account (CR-02) — VERIFIED by Vector 2 + `auth-rate-limit.test.ts`; (c) reset-mail throttle still rate-limits in its own namespace — VERIFIED (sixth reset → 429 with numeric `retryAfterSec`).

### Required Artifacts (exists / substantive / wired)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` + email-auth/telegram-login/credentials-watermark/email-canonical migrations | nullable telegramId, email unique, passwordHash, PasswordReset, LoginAttempt, TelegramLoginToken{codeHash,codeAttempts}, User{credentialsChangedAt,emailCanonical} | ✓ VERIFIED | All models/migrations present |
| `lib/password.ts` | Argon2id OWASP, never-throw, dummy path | ✓ VERIFIED | present + integration-tested |
| `lib/client-ip.ts` | trusted edge hop (X-Real-IP / last XFF) | ✓ VERIFIED | pure module + 6 unit vectors; routes import it |
| `lib/auth-rate-limit.ts` | backoff + lock + per-email account-wide counter + register throttle + **reset namespace** | ✓ VERIFIED | `RESET_NAMESPACE`/`resetKey`/`checkResetRateLimit`/`recordResetAttempt` present (lines 210-234); `bumpAttempt` atomic upsert (lines 110-115); login counter untouched |
| `app/api/auth/email/password/request/route.ts` | reset intake throttled in its own namespace | ✓ VERIFIED | imports/calls only `checkResetRateLimit`/`recordResetAttempt` (lines 24-25, 52, 67); no login-helper reference |
| `lib/telegram-widget.ts` | identifier-only `data-onauth` builder | ✓ VERIFIED | eval regression test |
| `lib/telegram-login.ts` | issue/bind/consume + device code | ✓ VERIFIED | sha256-only persistence, timing-safe compare, attempt cap |
| `lib/auth.ts` / `lib/session.ts` | userId subject + legacy tid + revocation watermark | ✓ VERIFIED | `verifySessionWithIssuedAt`; legacy `verifySession` keeps exact shape |
| `lib/accounts.ts` | link/merge + unlink, race-safe | ✓ VERIFIED | in-transaction invariants + typed P2002/P2025/P2003 mapping |
| `lib/replay.ts` | P2002-only replay, errors rethrown | ✓ VERIFIED | `replay.test.ts` green |
| `lib/email-canonical.ts` | never-throw canonicalizer | ✓ VERIFIED | plus/dot collapse; `emailCanonical UNIQUE` |
| `lib/mail.ts` | SMTP + fake seam, reset + welcome only | ✓ VERIFIED | reset/welcome vectors green |
| `app/api/auth/email/{register,login,logout,link,unlink,password/*}` | routes | ✓ VERIFIED | read in full; reset route isolated |
| `app/api/auth/telegram-bot/{request,status,consume}` | handshake contract + code | ✓ VERIFIED | code required at consume; `bad_code`→401 |
| `components/{TelegramWidgetInjector,LoginButton,LinkTelegramRow,TelegramWidgetSlot}` | in-flow widget | ✓ VERIFIED (code) | identifier-only callback; browser click-through = human item |
| `components/TelegramBotLoginButton.tsx` | code-entry state | ⚠️ PRESENT (behavior-unverified) | wired; no browser test |
| `tests/integration/reset-login-isolation.test.ts` | cross-route lock isolation regression | ✓ VERIFIED | 2 tests, pass against real `setwhite` DB |
| `app/{login,reset/*}/page.tsx`, `app/page.tsx`, Account components | UI surfaces | ✓ VERIFIED | email-only cabinet branch present |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| EmailAuthCard | `/api/auth/email/{register,login}` | fetch + typed errors | ✓ WIRED |
| Email routes | users/password_resets/login_attempts | Prisma CRUD | ✓ WIRED |
| `LinkTelegramRow` | `/api/auth/email/link` | Telegram widget payload (identifier-only callback) | ✓ WIRED |
| `LoginButton` | `/api/auth/telegram` | Telegram widget payload | ✓ WIRED |
| Password-change/confirm/unlink | `User.credentialsChangedAt` | watermark bump in the same write | ✓ WIRED |
| `requireSession`/`requireTelegramSession` | `credentialsChangedAt` | `isRevoked(issuedAt, …)` | ✓ WIRED |
| **reset request** | **`__reset__:<normalizedEmail>` counter** | `checkResetRateLimit`/`recordResetAttempt` → `resetKey` | ✓ **WIRED (fixed)** — no longer touches login's account row |
| **login route** | **`(<email>, EMAIL_ONLY_IP)` account-wide lock (CR-02)** | `checkLoginRateLimit`/`recordFailedLogin` | ✓ WIRED (byte-unchanged) |
| **`bumpAttempt`** | **`prisma.loginAttempt.upsert` `attempts:{increment:1}`** | atomic increment, lock derived from returned row | ✓ WIRED (concurrency vector green) |
| reset request | prior unused `PasswordReset` rows | `deleteMany(usedAt:null)+create` transaction | ✓ WIRED |
| bot `/start login_<token>` | `bindLoginToken` + code DM | `parseLoginStartPayload` + `bot.loginCode` | ✓ WIRED |
| `TelegramBotLoginButton` (ready) | consume `{token, code}` → `/` | fetch + redirect | ✓ WIRED (browser behavior unverified) |
| register | `emailCanonical UNIQUE` + `checkRegistrationRateLimit(clientIp)` | canonicalize + namespaced counter | ✓ WIRED |
| email-only home | `listKeysByUserId` + `startTrialByUserId` | session userId | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| register route | user.id → uid claim | `prisma.user.create` | ✓ | ✓ FLOWING |
| login route | session + tid claim | `prisma.user.findUnique` | ✓ | ✓ FLOWING |
| reset request | token → DB + mail | `randomBytes(32)` + `passwordReset.create` | ✓ | ✓ FLOWING |
| reset confirm | passwordHash rotation + watermark | `hashPassword` + `user.update` in tx | ✓ | ✓ FLOWING |
| trial (email) | userId → claim + customerRef | `claimTrialByUserId` + `startTrialByUserId` | ✓ | ✓ FLOWING |
| email-only home | keys list | `listKeysByUserId(userId)` | ✓ | ✓ FLOWING |
| Telegram widget | widget payload → POST | identifier-only global callback | ✓ | ✓ FLOWING (eval path unit-tested) |
| reset lock | `("__reset__:<email>", "")` row | `recordResetAttempt` → `resetKey` | ✓ | ✓ FLOWING — disjoint from login's `(<email>, "")` |
| login lock | `(<email>, EMAIL_ONLY_IP)` counter | `recordFailedLogin` from login only | ✓ | ✓ FLOWING (CR-02 intact) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Full suite | `DATABASE_URL=…/setwhite npx vitest run` | 52 files / 437 tests pass | ✓ PASS |
| **Reset does not lock login (DoS regression)** | `vitest run tests/integration/reset-login-isolation.test.ts` | 2 tests pass (5 anon resets → login 200; 5 bad logins → 6th 429) | ✓ PASS |
| **Atomic concurrent bump** | `vitest run tests/unit/auth-rate-limit.test.ts` | 6 tests pass (incl. concurrent burst ≥5, locked) | ✓ PASS |
| Reset-flow + session-invalidation | `vitest run tests/unit/reset-flow.test.ts tests/integration/session-invalidation.test.ts` | 13 tests pass | ✓ PASS |
| No `__reset__:` DB residue | `SELECT … WHERE email LIKE '__reset__:%'` | 0 rows | ✓ PASS |
| Widget eval regression | `vitest run tests/unit/telegram-widget.test.ts` | 4 pass | ✓ PASS |
| Trusted IP | `vitest run tests/unit/client-ip.test.ts` | 6 pass | ✓ PASS |

### Probe Execution

_No runnable probe scripts declared for this phase — Probe Execution: N/A._

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 06-01, 06-04, 06-07, 06-13 | Register email+password, no verification, immediate login | ✓ SATISFIED | register route + EmailAuthCard + throttle/canonical; integration vectors pass |
| AUTH-02 | 06-01, 06-04, 06-06, 06-07, 06-09, 06-10, 06-12, **06-14** | Login email+password, same httpOnly cookie | ✓ SATISFIED | email login route; bot login device-code; XFF hardening; login-lock DoS closed by 06-14 |
| AUTH-03 | 06-02, 06-04, 06-06, 06-08, 06-09, 06-12 | Link/unlink Telegram ↔ email, accounts merge | ✓ SATISFIED | merge service race-hardened + widget callback fixed + regression test |
| AUTH-04 | 06-03, 06-04, 06-10, 06-11, **06-14** | Reset password via email link | ✓ SATISFIED | mail + request/confirm + supersession; reset throttle now namespaced, preserving D-88/D-89 |
| AUTH-05 | 06-01, 06-02, 06-07, 06-13 | Trial for email accounts protected from farming | ✓ SATISFIED | atomic userId claim + canonical alias collapse |
| AUTH-06 | 06-04, 06-05, 06-08 | Telegram button correctly positioned on desktop | ✓ SATISFIED | in-flow slot + functional identifier-only callback (position = human item) |

**No orphaned requirements:** all 6 AUTH IDs are claimed by plans 06-01..06-14; every ID is accounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/auth-rate-limit.ts` | 117-124 | `bumpAttempt` lock transition is a second, non-monotonic `update` after the atomic increment (review WR-01) | ⚠️ WARNING | concurrent bursts can persist the shortest lock and the threshold row is momentarily visible without a lock; no brute-force bypass — lock still always engages |
| `tests/unit/reset-flow.test.ts` | 238-261 | second `describe` never removes the `__register__:<ip>` rows its 5 registrations create; no module-level `afterAll` (review WR-02, pre-existing from 06-13) | ⚠️ WARNING | observed 85 leaked `__register__:` rows; slow-burning flake risk on octet collision — test hygiene, not production code |
| `lib/auth-rate-limit.ts` | 120-123 | follow-up `update` can throw P2025 if a concurrent successful login deletes the row (review IN-03) | ℹ️ INFO | rare generic 500 instead of 401; fail-closed |
| `lib/auth-rate-limit.ts` | 97-101 | doc-comment says `attempts` counts past MAX, but the gate 429s before the bump (review IN-01) | ℹ️ INFO | comment inaccuracy; no behavioral impact |

No `TBD`/`FIXME`/`XXX` debt markers in any phase file.

### Accepted Residual (owner-approved, by design)

**CR-01-RESIDUAL** — the reset path remains account-wide lockable inside its own `__reset__:<email>` namespace (an anonymous party can still temporarily throttle reset-mail for a known email). This is the intended D-84 anti-spam behaviour, is fully isolated from login (five anonymous resets leave login 200), and was explicitly accepted by the owner in `06-14-PLAN.md`. It is not a gap.

### Human Verification Required

1. **Bot-redirect login click-through** — on `/login` tap «Войти через Telegram», Start in the bot, copy the 6-digit code, submit it in the original tab. Expected: session created exactly once; wrong/replayed/expired codes map to their copies. (Also recorded in `behavior_unverified_items`.)
2. **Desktop widget placement** — open `/login` at ~1440px; confirm the widget iframe is centered in-flow with no layout jump.
3. **Inline widget login + Account «link Telegram» widget** — complete both; the callback must fire and POST to `/api/auth/telegram` / `/api/auth/email/link`.
4. **Reset letter round-trip** — requires production SMTP; the 1h one-time link sets a new password and the old one stops working.
5. **Email-only trial** — one-tap trial once, second attempt blocked cleanly.

### Gaps Summary

**No blocking gaps remain.** The single BLOCKER from the prior verification (truth 13 / 06-REVIEW.md CR-01: unauthenticated reset requests locking the login account-wide counter) is closed:

- `app/api/auth/email/password/request/route.ts` now calls `checkResetRateLimit`/`recordResetAttempt`, which key on `"__reset__:" + normalizeEmail(email)`; grep confirms no `checkLoginRateLimit`/`recordFailedLogin` reference remains on that route.
- `("__reset__:<email>", "")` is provably disjoint from login's `(<email>, "")`, so the reset path can never address the login sentinel row.
- `tests/integration/reset-login-isolation.test.ts` proves both directions against the real DB and passes: five anonymous resets (rotating IPs) leave a correct-password login at 200, while five failed logins from distinct IPs still lock the sixth — CR-02 preserved.
- `bumpAttempt` is now an atomic `upsert` with `attempts: { increment: 1 }`; the concurrency vector passes.
- The full suite is green (52 files / 437 tests) and `tsc` is clean; no `__reset__:` DB residue.

Per the ordered status decision tree, because the human/browser verification items (truth 11 and the UI/SMTP flows) are non-empty, the status is **human_needed**, not `passed`. The two remaining review Warnings (WR-01 non-atomic lock transition; WR-02 `__register__:` test-residue leak) do not defeat any must-have and are recorded as warnings for follow-up; they are not goal blockers.

---

_Verified: 2026-10-05T22:18:44Z_
_Verifier: the agent (gsd-verifier)_

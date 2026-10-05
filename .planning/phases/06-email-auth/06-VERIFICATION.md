---
phase: 06-email-auth
verified: 2026-10-06T07:55:00Z
status: gaps_found
score: 11/13 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/12
  gaps_closed:
    - "Telegram Login Widget callback works (data-onauth regression) — AUTH-03/AUTH-06"
    - "Bot-redirect login cannot yield another user's session (CR-01 login-CSRF)"
    - "Login brute-force lock / issuance throttle cannot be bypassed by rotating X-Forwarded-For (CR-02)"
    - "Password change/reset/unlink invalidates earlier sessions (WR-01)"
    - "A new reset request supersedes older unused reset tokens (WR-03)"
    - "Replay catch-all narrowed to P2002 so DB outages are not replay 401s (WR-05)"
    - "linkAccounts merge race-hardened in-transaction with typed outcomes (WR-06)"
    - "Registration throttled + canonical-mailbox alias collapse (WR-02/WR-04)"
  gaps_remaining:
    - "Unauthenticated account-lockout DoS: the account-wide login-lock counter is shared with the unauthenticated password-reset route, so 5 anonymous reset requests lock the target account out of BOTH login and reset (new CR-01 in 06-REVIEW.md)"
  regressions:
    - "The CR-02 fix's account-wide (EMAIL_ONLY_IP) counter introduced a new Critical: it is incremented by the unauthenticated reset route, converting anonymous reset requests into persistent login denial for arbitrary known accounts"
gaps:
  - truth: "An unauthenticated third party cannot deny login and password-reset to an arbitrary known account (the login account-lock must not be reachable from the unauthenticated reset route)"
    status: failed
    reason: >-
      Closing CR-02 added an account-wide (IP-independent) counter: recordFailedLogin(email, ip)
      increments BOTH (email, ip) and (email, EMAIL_ONLY_IP), and checkLoginRateLimit denies when
      either row is locked (lib/auth-rate-limit.ts:102-141). The UNAUTHENTICATED password-reset
      request route reuses the SAME helper with the SAME raw email (app/api/auth/email/password/request/route.ts:45,59),
      so 5 anonymous reset requests from any IP(s) drive (email, "") to attempts=5 and engage the
      15-minute escalating lock (cap 2h). The victim's next POST /api/auth/email/login hits
      checkLoginRateLimit FIRST (login/route.ts:46) and returns 429 before the password is checked.
      The victim is ALSO locked out of the reset flow (same gate), so there is no self-service
      recovery. No test exercises this cross-route interaction (auth-rate-limit.test.ts calls
      recordFailedLogin directly; reset-flow.test.ts asserts the reset route 429s but never that
      login is then denied). Confirmed by reading the code and by 06-REVIEW.md CR-01 (new).
    artifacts:
      - path: "app/api/auth/email/password/request/route.ts"
        issue: "line 59 `await recordFailedLogin(email, ip)` bumps the account-wide (email, EMAIL_ONLY_IP) row shared with login"
      - path: "lib/auth-rate-limit.ts"
        issue: "recordFailedLogin/checkLoginRateLimit share the per-email sentinel (EMAIL_ONLY_IP) with the reset route — no reset namespace, no bumpAccountWide opt-out"
      - path: "app/api/auth/email/login/route.ts"
        issue: "line 46 gate consults the shared account-wide row, so the victim 429s before credential check"
    missing:
      - "Give the reset-mail throttle its own namespaced key (e.g. `__reset__:<normalizedEmail>`) so it never touches EMAIL_ONLY_IP, or add a `bumpAccountWide: boolean` parameter to recordFailedLogin and pass false from the reset route; login and reset-mailable throttles must not share lock state"
behavior_unverified_items:
  - truth: "Clicking Telegram login on /login opens the bot, the user types the bot-delivered code, and the original tab returns the user logged in (06-07 truth 1, now with the 06-09 code step)"
    test: "On /login tap «Войти через Telegram»; confirm a new tab opens t.me/<bot>?start=login_<token>; press Start; copy the 6-digit code from the bot; enter it in the original tab and submit."
    expected: "A logged-in cabinet session is created exactly once; a wrong code shows the wrong-code copy; replay/expiry show retry/expired."
    why_human: "The server contract (issue/bind/consume incl. the CR-01 hijack vector and the attempt cap) is covered by tests/integration/telegram-bot-login.test.ts and the client code-entry state is present/wired, but the full browser tab->bot->code->callback round trip cannot be asserted in the vitest node environment."
coincidental_reliance_items: []
---

# Phase 6: Email Auth Verification Report

**Phase Goal:** Пользователь регистрируется и входит по email, может связать Telegram-аккаунт, восстанавливает пароль по почте
**Verified:** 2026-10-06T07:55:00Z
**Status:** gaps_found
**Re-verification:** Yes — after the 06-08..06-13 gap-closure plans; overwrote the prior 06-VERIFICATION.md

## Goal Achievement

The email identity core (register / login / password reset) and the email-only cabinet + trial path are real, wired, and backed by passing tests. All five gaps from the previous verification are **closed at the code level with regression tests**: the Telegram widget `data-onauth` regression (06-08), the bot-redirect login-CSRF account takeover (06-09, device-code binding), the `X-Forwarded-For` rate-limit bypass (06-10, trusted edge hop + per-email lock), session/reset-token revocation (06-11, `credentialsChangedAt` watermark + reset-token supersession), replay error honesty + merge race hardening (06-12), and registration throttle + canonical-mailbox alias collapse (06-13). `tsc` is clean and the full suite (51 files / 434 tests) passes.

However, the phase is **not shippable**: the CR-02 fix introduced a **new Critical unauthenticated account-lockout DoS**. The account-wide lock counter that defeats IP rotation is shared with the unauthenticated password-reset route, so 5 anonymous reset requests against a *known* email (the reset route itself is an accepted existence oracle, D-89) lock the account out of login **and** reset, with no self-service recovery. This directly denies the phase's two core capabilities (login by email, reset password by email) to a targeted user. It must be fixed before the goal can be considered achieved.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Register email+password without verification, immediate session on the same httpOnly cookie (SC1, AUTH-01) | ✓ VERIFIED | `register/route.ts` creates user + `signSession(uid,null,…)` + shared `3set_session` cookie; integration vector green |
| 2 | Login email+password; wrong email and wrong password byte-identical 401; same cookie; legacy tid sessions survive (SC2 login, AUTH-02) | ✓ VERIFIED | `login/route.ts` gate-first 429 then single 401 + `dummyVerify`; `requireSession` legacy tid path; tests green |
| 3 | Link Telegram ↔ email account with merge (keys/orders/tickets, trialUsed OR) (SC2 link, AUTH-03) | ✓ VERIFIED | `lib/accounts.ts` in-transaction merge + `link-merge.test.ts`; the only UI trigger's `data-onauth` is now identifier-only and unit-tested against Telegram's real `eval` (06-08) |
| 4 | Unlink (confirm + lastMethod) and change-password (current checked) (AUTH-03 support) | ✓ VERIFIED | routes + Account UI; integration vectors pass; unlink bumps the watermark |
| 5 | Reset password via email link, 1h one-time, honest no-account, only reset+welcome mails (SC3, AUTH-04) | ✓ VERIFIED | `lib/mail.ts` + request/confirm routes; reset supersession; 10+ reset vectors green (availability caveat: truth 13) |
| 6 | Trial for email accounts protected from farming, one-per-account atomic (SC4, AUTH-05) | ✓ VERIFIED | `claimTrialByUserId` updateMany + `email:{userId}` customerRef + merge trialUsed OR; `emailCanonical UNIQUE` collapses plus/dot aliases (`register-alias.test.ts`) |
| 7 | Telegram button centered in normal flow on desktop (SC5 positioning, AUTH-06) | ✓ VERIFIED | `TelegramWidgetSlot` in-flow `flex min-h-24 items-center justify-center`; widget injected within the slot; no absolute/fixed |
| 8 | "Widget and link flows keep working exactly as before" (06-05 truth 2) | ✓ VERIFIED | `lib/telegram-widget.ts` emits `${tgAuth_…}(user)` (identifier-only direct call); `telegram-widget.test.ts` reproduces Telegram's `eval` and proves the old hyphenated shape throws |
| 9 | Bot-redirect handshake: issue token+deep link; bot Start binds + DMs code; code+claim consume mints session exactly once; replay/expiry/unknown fail closed (06-06 truths 1–3) | ✓ VERIFIED | `lib/telegram-login.ts` + 3 routes + `lib/bot.ts` code reply; integration vectors green |
| 10 | Bot-redirect login cannot yield another user's session (06-06 truth 4, CR-01) | ✓ VERIFIED | Device-code binding: `bindLoginToken` stores sha256(code), bot DMs it to the authorizing chat; `consumeLoginToken` requires `{token, code}`; hijack vector (attacker claim cookie, victim bind, no/wrong code) mints no session |
| 11 | Clicking Telegram login on /login opens the bot, then returns the user logged in (06-07 truth 1) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `TelegramBotLoginButton` + code-entry state wired and server-tested; full browser click-through not exercised (see behavior_unverified_items) |
| 12 | Email-only account lands in the cabinet (keys dashboard) with one-tap trial once, second blocked (06-07 truths 2–3, G-06-9) | ✓ VERIFIED | `app/page.tsx` email-only branch renders `SubscriptionsSectionByUserId` + `TrialButton` + Account; integration vectors pass |
| 13 | An unauthenticated third party cannot deny login/password-reset to an arbitrary known account (account-lock not reachable from the unauthenticated reset route) | ✗ FAILED | New CR-01: reset route calls `recordFailedLogin(email, ip)` → bumps the shared `(email, EMAIL_ONLY_IP)` account-wide row; login gate 429s the victim before checking the password; reset is locked too; no test covers it |

**Score:** 11/13 truths verified — 1 FAILED (new Critical DoS), 1 present/behavior-unverified

### Required Artifacts (exists / substantive / wired)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` + migrations `…_email_auth`, `…_telegram_login_token`, `…_telegram_login_code`, `…_user_credentials_changed_at`, `…_user_email_canonical` | nullable telegramId, email unique, passwordHash, PasswordReset, LoginAttempt, TelegramLoginToken{codeHash,codeAttempts}, User{credentialsChangedAt,emailCanonical} | ✓ VERIFIED | All models/migrations present |
| `lib/password.ts` | Argon2id OWASP, never-throw, dummy path | ✓ VERIFIED | present + integration-tested |
| `lib/client-ip.ts` | trusted edge hop (X-Real-IP / last XFF) | ✓ VERIFIED | pure module + 6 unit vectors; routes import it; nginx overwrites XFF with `$remote_addr` |
| `lib/auth-rate-limit.ts` | backoff + lock + per-email account-wide counter + register throttle | ⚠️ PRESENT (security regression) | dual-key lock works; but the account-wide key is shared with the unauthenticated reset route → DoS (truth 13) |
| `lib/telegram-widget.ts` | identifier-only `data-onauth` builder | ✓ VERIFIED | `sanitizeWidgetIdPart`/`widgetCallbackName`/`widgetOnAuthExpression`; eval regression test |
| `lib/telegram-login.ts` | issue/bind/consume + device code | ✓ VERIFIED | code generated in bind, sha256-only persistence, timing-safe compare, attempt cap |
| `lib/auth.ts` / `lib/session.ts` | userId subject + legacy tid + revocation watermark | ✓ VERIFIED | `verifySessionWithIssuedAt` added while `verifySession` keeps exact `{userId,telegramId}`; `isRevoked` second-granular |
| `lib/accounts.ts` | link/merge + unlink, race-safe | ✓ VERIFIED | in-transaction invariants + typed P2002/P2025/P2003 mapping |
| `lib/replay.ts` | P2002-only replay, errors rethrown | ✓ VERIFIED | `lib/replay.test.ts` (fresh→true, dup→false, synthetic error rejects) |
| `lib/email-canonical.ts` | never-throw canonicalizer | ✓ VERIFIED | plus/dot collapse; `emailCanonical UNIQUE` |
| `lib/mail.ts` | SMTP + fake seam, reset + welcome only | ✓ VERIFIED | present + reset/welcome vectors |
| `app/api/auth/email/{register,login,logout,link,unlink}` + `password/{change,request,confirm}` | routes | ✓ VERIFIED (reset route carries the DoS) | read in full |
| `app/api/auth/telegram-bot/{request,status,consume}` | handshake contract + code | ✓ VERIFIED | code required at consume; `bad_code`→401 |
| `components/{TelegramWidgetInjector,LoginButton,LinkTelegramRow}` | in-flow widget | ✓ VERIFIED (code) | identifier-only callback; dead globals removed; browser click-through = human item |
| `components/TelegramBotLoginButton.tsx` | code-entry state | ⚠️ PRESENT (behavior-unverified) | wired; no browser test |
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
| reset request | `LoginAttempt` account-wide counter (shared with login) | `recordFailedLogin(email, ip)` | ✗ BROKEN — cross-route lock sharing (truth 13) |
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
| login lock | shared `(email, EMAIL_ONLY_IP)` counter | `recordFailedLogin` from login AND reset | ✓ (real, but cross-wired) | ⚠️ SHARED — DoS |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Full suite | `DATABASE_URL=…/setwhite npx vitest run` | 51 files / 434 tests pass | ✓ PASS |
| Widget eval regression | `vitest run tests/unit/telegram-widget.test.ts` | 4 pass (identifier-only + negative control) | ✓ PASS |
| Trusted IP | `vitest run tests/unit/client-ip.test.ts` | 6 pass | ✓ PASS |
| Per-email lock | `vitest run tests/unit/auth-rate-limit.test.ts` | 5 pass | ✓ PASS |
| Bot-login CR-01 hijack | `vitest run tests/integration/telegram-bot-login.test.ts` | pass | ✓ PASS |
| Cross-route lockout (DoS) | (no test exists) | — | ✗ GAP — no coverage of reset→login lock interaction |

### Probe Execution

_No runnable probe scripts declared for this phase — Probe Execution: N/A._

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 06-01, 06-04, 06-07, 06-13 | Register email+password, no verification, immediate login | ✓ SATISFIED | register route + EmailAuthCard + throttle/canonical; integration vectors (caveat: WR-02 register-throttle escalation) |
| AUTH-02 | 06-01, 06-04, 06-06, 06-07, 06-09, 06-10, 06-12 | Login email+password, same httpOnly cookie | ✓ SATISFIED | email login route; bot login device-code; XFF hardening (caveat: truth 13 locks login availability) |
| AUTH-03 | 06-02, 06-04, 06-06, 06-08, 06-09, 06-12 | Link/unlink Telegram ↔ email, accounts merge | ✓ SATISFIED | merge service race-hardened + widget callback fixed + regression test |
| AUTH-04 | 06-03, 06-04, 06-10, 06-11 | Reset password via email link | ✓ SATISFIED | mail + request/confirm + supersession (caveat: truth 13 also locks reset) |
| AUTH-05 | 06-01, 06-02, 06-07, 06-13 | Trial for email accounts protected from farming | ✓ SATISFIED | atomic userId claim + canonical alias collapse |
| AUTH-06 | 06-04, 06-05, 06-08 | Telegram button correctly positioned on desktop | ✓ SATISFIED | in-flow slot + functional identifier-only callback |

**No orphaned requirements:** all 6 AUTH IDs are claimed by plans 06-01..06-13; every ID is accounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/api/auth/email/password/request/route.ts` + `lib/auth-rate-limit.ts` | 59 / 133-141 | unauthenticated reset route increments the shared account-wide login-lock counter | 🛑 BLOCKER | 5 anonymous reset requests lock an arbitrary known account out of login AND reset (new CR-01) |
| `lib/auth-rate-limit.ts` | 102-124 | `bumpAttempt` non-atomic read-modify-write (review WR-01) | ⚠️ WARNING | parallel bursts lose increments; weakens the brute-force lock |
| `lib/auth-rate-limit.ts` | 182-193 | registration throttle only increments, never resets/escalates-down (review WR-02) | ⚠️ WARNING | shared/NAT/CGNAT IPs can be throttled from registering for hours |
| `app/api/auth/email/password/request/route.ts` | 69-86 | supersede-old-tokens happens before mail send (review WR-03) | ⚠️ WARNING | a mail-transport failure after rotation destroys the prior working reset link |
| `lib/session.ts` | 66-74 | uid-path `requireSession` returns identity even when the user row is missing (review WR-04) | ⚠️ WARNING | latent stale-identity auth for deleted accounts |
| `lib/session.ts` | 46-53 | watermark same-second tokens accepted for the token's full life (review WR-05) | ⚠️ WARNING | narrow revocation gap (documented by design) |
| `lib/telegram-login.ts` | 290-303 | wrong-code increment + invalidation not atomic (review WR-06) | ⚠️ WARNING | concurrent wrong guesses can exceed the 5-attempt cap |
| `components/LinkTelegramRow.tsx` | 96-98 | fresh inline `onAuth` arrow each render re-injects the widget (review WR-07) | ⚠️ WARNING | intermittent link-flow break / flicker if the popup is open during a re-render |

No `TBD`/`FIXME`/`XXX` debt markers in any phase file.

### Human Verification Required

1. **Desktop widget placement** — open `/login` at ~1440px; confirm the widget iframe is centered in-flow with no layout jump.
2. **Inline widget login + Account "link Telegram" widget** — complete both; the callback must now fire and POST to `/api/auth/telegram` / `/api/auth/email/link` (code-level fix verified; pixels/browser unverified).
3. **Reset letter round-trip** — requires production SMTP credentials; one-time 1h link, new password works, old fails.
4. **Bot-redirect login click-through** — tap «Войти через Telegram», Start in the bot, copy the code, enter it in the browser, confirm the cabinet session is created exactly once.
5. **Email-only trial** — one-tap trial once, second attempt blocked cleanly.
6. **Account-lockout DoS (post-fix)** — after the fix, verify 5 anonymous reset requests for a known email do NOT 429 that account's login.

### Gaps Summary

The gap-closure work (06-08..06-13) genuinely closed all five previous gaps, each with a passing regression test, and the full suite is green (51 files / 434 tests) with a clean `tsc`:

- **06-08** replaced the invalid hyphenated `window.` dot-path `data-onauth` with an identifier-only direct call (`lib/telegram-widget.ts`), proven against Telegram's real `eval` parser.
- **06-09** closed the CR-01 login-CSRF account takeover with a bot-delivered sha256-only 6-digit code required at consume, with a hijack vector and a 5-attempt self-invalidation cap.
- **06-10** closed the CR-02 XFF bypass with a trusted edge-hop resolver (`lib/client-ip.ts`), an nginx XFF overwrite, and a per-email account-wide lock.
- **06-11** closed session/reset-token invalidation with `User.credentialsChangedAt` (watermark compared to token `iat` in both gates) and reset-token supersession.
- **06-12** closed WR-05/WR-06 (P2002-only replay; in-transaction, typed linkAccounts merge).
- **06-13** closed WR-02/WR-04 (registration throttle + `User.emailCanonical UNIQUE` alias collapse; residual 409 documented as a D-89-precedent disclosure).

**But one NEW Critical blocks the phase:** the account-wide lock counter introduced by 06-10 is incremented by the **unauthenticated** password-reset route using the raw email. Five anonymous reset requests against a known email (obtainable via the reset route's own accepted D-89 404 oracle) lock the account out of BOTH login and reset with escalating backoff up to 2h and no self-service recovery. This is a confirmed remote denial-of-service against the two core phase capabilities and it is uncovered by the test suite. It must be fixed (namespace the reset throttle or opt it out of the account-wide counter) before the phase goal can be considered achieved.

The remaining review Warnings (WR-01..WR-07) are quality/robustness concerns, not goal-blocking on their own, but WR-02 (register-throttle never resets) is a realistic availability regression on the primary signup path and should be addressed in the same gap-closure pass.

---

_Verified: 2026-10-06T07:55:00Z_
_Verifier: the agent (gsd-verifier)_

---
phase: 06-email-auth
verified: 2026-10-05T22:05:00Z
status: gaps_found
score: 8/12 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining:
    - "AUTH-03 link-Telegram UI (widget callback broken)"
    - "AUTH-06 widget button is positioned but non-functional"
  regressions:
    - "06-05 refactor of the Telegram widget injector broke the auth callback (data-onauth is an invalid JS expression) — classic Login Widget and Account link widget no longer deliver payloads"
gaps:
  - truth: "Telegram Login Widget callback works (classic login + Account link flows keep working exactly as before)"
    status: failed
    reason: >-
      TelegramWidgetInjector sets data-onauth to `window.telegram-login-<bot>-<rand>OnAuth(user)`.
      Telegram's widget evaluates data-onauth as a function body (`__parseFunction` -> `eval('(function(user){<value>})')`).
      The value contains hyphens in dot notation, so invoking it parses as subtraction and throws
      `ReferenceError: login is not defined`; the auth callback never runs. Reproduced against the real
      telegram-widget.js?22's __parseFunction. The iframe still renders inside the slot (positioning is fine),
      but completing Telegram auth does nothing.
    artifacts:
      - path: "components/TelegramWidgetInjector.tsx"
        issue: "line 45/49: data-onauth global name `${widgetId}OnAuth` contains hyphens and is referenced via `window.` dot notation — invalid callable expression"
      - path: "components/LoginButton.tsx"
        issue: "classic widget login never delivers the payload; the registered `window.onTelegramAuth` is now dead code (not referenced by data-onauth)"
      - path: "components/LinkTelegramRow.tsx"
        issue: "Account 'link Telegram' widget never delivers the payload; `window.onTelegramLink` is dead code"
    missing:
      - "Use a valid identifier-only global callback (e.g. a sanitized name) referenced directly in data-onauth, or keep the pre-06-05 `onTelegramAuth(user)` contract; re-verify with a browser click-through"
  - truth: "Bot-redirect login cannot yield another user's session (login-CSRF / reverse fixation resistant)"
    status: failed
    reason: >-
      The claim cookie binds the consumer to the issuer but nothing binds the Telegram user who authorizes
      (`/start login_<token>` -> bindLoginToken) to the issuer. An attacker can issue a token, send the bot
      deep link to a victim, have the victim press Start (binding the victim's Telegram id), then consume the
      token with the attacker's own claim cookie to mint the victim's session. Confirmed by reading
      lib/telegram-login.ts (issue/bind/consume), app/api/auth/telegram-bot/* and lib/bot.ts.
    artifacts:
      - path: "lib/telegram-login.ts"
        issue: "bindLoginToken binds to whoever presses Start; consume requires only the issuer's claim cookie — no authorization step ties the authorizing user to the issuing browser"
      - path: "lib/bot.ts"
        issue: "/start login_ branch binds and replies generically with no per-browser confirmation code"
    missing:
      - "Add a step the legitimate initiator alone can satisfy (e.g. a code shown in the issuing browser that must be echoed in the bot, or an explicit in-bot confirmation tied to the token) and/or document acceptance with the owner"
  - truth: "Login brute-force lock and token-issuance throttle cannot be bypassed by the client"
    status: failed
    reason: >-
      clientIp() trusts the first entry of X-Forwarded-For (client-controlled). nginx sets
      `X-Forwarded-For $proxy_add_x_forwarded_for` (prepends the client header) and also sets `X-Real-IP
      $remote_addr`, which the code never reads. Rotating a spoofed XFF defeats the LoginAttempt
      @@unique([email, ip]) counter (no per-email-only counter) and the 20/hour issuance throttle.
    artifacts:
      - path: "app/api/auth/email/login/route.ts"
        issue: "clientIp() reads x-forwarded-for first hop (line ~30-34)"
      - path: "app/api/auth/email/password/request/route.ts"
        issue: "same duplicated clientIp()"
      - path: "app/api/auth/telegram-bot/request/route.ts"
        issue: "same duplicated clientIp()"
      - path: "nginx/my.3set.online.conf"
        issue: "line 41 uses $proxy_add_x_forwarded_for; X-Real-IP set on line 40 but never used by the app"
    missing:
      - "Read the trusted hop (X-Real-IP or the last XFF entry) and persist/trust it consistently; add a per-email-only attempt counter so rotating IPs cannot reset an account lock"
  - truth: "Recovery/rotation invalidates prior credentials (sessions and older reset tokens)"
    status: partial
    reason: >-
      Password change/reset re-mints only the current request's session; other 30-day JWTs stay valid
      (no token version / iat cutoff). A new reset request does not invalidate prior unused reset tokens
      for the same user (all remain valid for the full 1h TTL).
    artifacts:
      - path: "lib/session.ts"
        issue: "stateless JWT with no session epoch/version; verifySession has no revocation hook"
      - path: "app/api/auth/email/password/confirm/route.ts"
        issue: "rotates hash but leaves other sessions valid"
      - path: "app/api/auth/email/password/request/route.ts"
        issue: "creates a new PasswordReset row without invalidating older unused rows for the user"
    missing:
      - "Add a per-user session epoch/tokenVersion bumped on password change/reset (and unlink), or reject tokens with iat < passwordChangedAt; delete/mark older unused reset tokens when issuing a new one"
  - truth: "Registration and trial cannot be trivially farmed / enumerated"
    status: partial
    reason: >-
      register returns 409 email_taken (client hides it, but the API is a second account-existence oracle
      beyond the D-89-accepted reset surface). Registration is unthrottled and email trials use
      customerRef `email:{userId}`; plus-address/dot aliases let one mailbox mint many accounts/trials.
    artifacts:
      - path: "app/api/auth/email/register/route.ts"
        issue: "409 email_taken enumeration surface; no registration rate limit"
      - path: "lib/keys-service.ts"
        issue: "email trial customerRef = email:{userId}, so a new registration is always a new provider customerRef"
    missing:
      - "Document 409-enumeration and alias-farming as accepted owner decisions, or make register non-disclosing and add a registration throttle / mailbox proof"
behavior_unverified_items:
  - truth: "Clicking Telegram login on /login opens the bot, then returns the user logged in (06-07 client end-to-end)"
    test: "On /login tap «Войти через Telegram»; confirm a new tab opens t.me/<bot>?start=login_<token>, press Start in the bot, and that the original tab polls to ready and redirects into the cabinet."
    expected: "A logged-in cabinet session is created exactly once; replay/expiry show the retry/expired copy."
    why_human: "The server contract is covered by tests/integration/telegram-bot-login.test.ts and the client logic is present/wired, but the full browser tab->bot->callback round trip cannot be asserted in the vitest node environment. NOTE: the classic inline widget path is separately FAILED (see gaps)."
human_verification:
  - test: "Open /login at ~1440px and confirm the Telegram widget iframe is centered in the normal flow under the email form (no bottom-left escape, no layout jump)."
    expected: "Widget centered in the max-w-md column; late inject does not shift layout. (Code-level containment verified; pixels need a browser.)"
    why_human: "No automated UI/layout tests in the repo."
  - test: "Complete the inline Telegram widget login (secondary entry) and the Account 'link Telegram' widget."
    expected: "Auth payload is posted to /api/auth/telegram and /api/auth/email/link respectively and the user proceeds. — EXPECTED TO FAIL until the data-onauth regression is fixed."
    why_human: "Browser-only; the code path is broken and must be re-tested after a fix."
  - test: "Request a password reset for a real account with SMTP configured and complete the letter round-trip."
    expected: "Letter arrives, link is one-time and 1h; new password logs in, old fails."
    why_human: "Requires production SMTP credentials absent from this environment; code path covered by fake-transport vectors."
  - test: "Email-only account trial: take the one-tap trial once; a second attempt is cleanly blocked."
    expected: "First POST /api/trial succeeds (key owned by userId, customerRef email:{id}); second returns 409 trial_used."
    why_human: "Covered by integration vectors; the visual flow is UAT (UAT test 8)."
---

# Phase 6: Email Auth Verification Report

**Phase Goal:** Пользователь регистрируется и входит по email, может связать Telegram-аккаунт, восстанавливает пароль по почте
**Verified:** 2026-10-05T22:05:00Z
**Status:** gaps_found
**Re-verification:** Yes — fresh verification after the 06-05/06-06/06-07 gap-closure plans; overwrote the stale 06-VERIFICATION.md (which predated the gap-closure work)

## Goal Achievement

The email identity core (register / login / password reset) and the email-only cabinet + trial path are real, wired, and backed by passing tests. Two of the phase's user-facing capabilities are **not** achieved: (1) linking Telegram to an email account via the cabinet is broken by a regression introduced in 06-05, and (2) the bot-redirect Telegram login has a confirmed account-takeover (login-CSRF) path. The inline Telegram widget button renders centered but does not authenticate.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Register email+password without verification, immediate session on the same httpOnly cookie (SC1, AUTH-01) | ✓ VERIFIED | `register/route.ts` creates user + `signSession(user.id,null,…)` + shared `3set_session` cookie; integration vector "register creates the user and mints a uid-subject session" passes |
| 2 | Login email+password; wrong email and wrong password byte-identical 401; same cookie; legacy tid sessions survive (SC2 login, AUTH-02) | ✓ VERIFIED | `login/route.ts` gate-first 429 then single 401 + `dummyVerify`; `lib/session.ts` legacy tid resolution; tests green |
| 3 | Link Telegram ↔ email account with merge (keys/orders/tickets, trialUsed OR) (SC2 link, AUTH-03) | ✗ FAILED | `lib/accounts.ts` + `/api/auth/email/link` are substantive/wired and tested, but the only UI trigger (`LinkTelegramRow` → `TelegramWidgetInjector`) has a broken `data-onauth`; the user cannot complete the link |
| 4 | Unlink (confirm + lastMethod) and change-password (current checked) (AUTH-03 support) | ✓ VERIFIED | routes + Account UI; integration vectors "unlink without confirm never unlinks", "change with wrong/right current password" pass |
| 5 | Reset password via email link, 1h one-time, honest no-account, only reset+welcome mails (SC3, AUTH-04) | ✓ VERIFIED | `lib/mail.ts` + request/confirm routes; 10 reset vectors incl. concurrent double-confirm pass |
| 6 | Trial for email accounts protected from farming, one-per-account atomic (SC4, AUTH-05) | ✓ VERIFIED | `claimTrialByUserId` updateMany + `email:{userId}` customerRef + merge trialUsed OR; tests green (alias-farming caveat in gaps) |
| 7 | Telegram button centered in normal flow on desktop (SC5 positioning, AUTH-06, 06-05 truth 1) | ✓ VERIFIED | `TelegramWidgetSlot` in-flow `flex min-h-24 items-center justify-center`; widget iframe is inserted into the slot (`insertBefore(iframe, script)`); no absolute/fixed |
| 8 | "Widget and link flows keep working exactly as before" (06-05 truth 2) | ✗ FAILED | `TelegramWidgetInjector` `data-onauth` = `window.telegram-login-<bot>-<rand>OnAuth(user)`; eval'd call throws `ReferenceError: login is not defined` (reproduced against real telegram-widget.js?22) |
| 9 | Bot-redirect handshake: issue token+deep link; bot Start binds; polling mints session exactly once; replay/expiry/unknown fail closed (06-06 truths 1–3) | ✓ VERIFIED | `lib/telegram-login.ts` + 3 routes + `lib/bot.ts`; 10/10 integration vectors green |
| 10 | Bot-redirect login cannot yield another user's session (06-06 truth 4) | ✗ FAILED | CR-01 login-CSRF confirmed: claim binds consumer↔issuer, not authorizing Telegram user↔issuer |
| 11 | Clicking Telegram login on /login opens the bot, then returns the user logged in (06-07 truth 1) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `TelegramBotLoginButton` + contract wired and server-tested; full browser click-through not exercised (see behavior_unverified_items) |
| 12 | Email-only account lands in the cabinet (keys dashboard) with one-tap trial once, second blocked (06-07 truths 2–3, G-06-9) | ✓ VERIFIED | `app/page.tsx` email-only branch renders `SubscriptionsSectionByUserId` + `TrialButton` + Account; integration vectors for trial once/409, TG path preserved, second-user isolation pass |

**Score:** 8/12 truths verified — 3 FAILED, 1 present/behavior-unverified

### Required Artifacts (exists / substantive / wired)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` + migrations `20261005054841_email_auth`, `20261005113459_telegram_login_token` | nullable telegramId, email unique, passwordHash, PasswordReset, LoginAttempt, TelegramLoginToken | ✓ VERIFIED | All models/migrations present |
| `lib/password.ts` | Argon2id OWASP, never-throw, dummy path | ✓ VERIFIED | m=19456/t=2/p=1; `verifyPassword`/`dummyVerify` never throw |
| `lib/auth-rate-limit.ts` | DB-backed backoff + lock | ✓ VERIFIED (code) | Logic present; efficacy undermined by CR-02 (see gaps) |
| `lib/auth.ts` / `lib/session.ts` | userId subject + legacy tid compat | ✓ VERIFIED | `signSession(uid,tid?,secret)`, `requireSession`→`{userId,telegramId\|null}` |
| `lib/accounts.ts` | link/merge + unlink, trialUsed OR | ✓ VERIFIED | Single transaction, re-point + delete-before-inherit |
| `lib/mail.ts` | SMTP + fake seam, 2 templates, no PII | ✓ VERIFIED | Only reset + welcome |
| `app/api/auth/email/{register,login,logout}` | 400/409/401-identical/429 | ✓ VERIFIED | Read in full |
| `app/api/auth/email/{link,unlink}` + `password/{change,request,confirm}` | routes | ✓ VERIFIED | Read in full; atomic confirm consume |
| `app/api/auth/telegram-bot/{request,status,consume}` | handshake contract | ✓ VERIFIED | Read in full; tests green |
| `lib/telegram-login.ts` | issue/bind/consume | ⚠️ PRESENT (security gap) | Functional + tested, but CR-01 attack path exists |
| `components/TelegramWidgetInjector.tsx` | in-flow widget injector | ✗ BROKEN | `data-onauth` invalid at call time — callback never fires |
| `app/{login,reset/*}/page.tsx`, `app/page.tsx`, Account components | UI surfaces | ✓ VERIFIED | Read; email-only cabinet branch present |
| `lib/i18n/messages/ru.ts` | `auth.*` keys | ✓ VERIFIED | i18n completeness tests green |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| EmailAuthCard | `/api/auth/email/{register,login}` | fetch + typed errors | ✓ WIRED |
| Email routes | users/password_resets/login_attempts | Prisma CRUD | ✓ WIRED |
| `LinkTelegramRow` | `/api/auth/email/link` | Telegram widget payload | ✗ BROKEN (widget callback fails before POST) |
| `LoginButton` | `/api/auth/telegram` | Telegram widget payload | ✗ BROKEN (same injector) |
| register/login/telegram/bot-login | `3set_session` httpOnly cookie | shared `buildSessionCookie` | ✓ WIRED |
| merge | KeyCache/Order/Ticket/PasswordReset/Notification | `updateMany` in `$transaction` | ✓ WIRED |
| bot `/start login_<token>` | `bindLoginToken` | parseLoginStartPayload | ✓ WIRED |
| `TelegramBotLoginButton` | request/status/consume → `/` | fetch + redirect | ✓ WIRED (browser behavior unverified) |
| email-only home | `listKeysByUserId` + `startTrialByUserId` | session userId | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| register route | user.id → uid claim | `prisma.user.create` | ✓ | ✓ FLOWING |
| login route | session + tid claim | `prisma.user.findUnique` | ✓ | ✓ FLOWING |
| reset request | token → DB + mail | `randomBytes(32)` + `passwordReset.create` | ✓ | ✓ FLOWING |
| reset confirm | passwordHash rotation | `hashPassword` + `user.update` in tx | ✓ | ✓ FLOWING |
| trial (email) | userId → claim + customerRef | `claimTrialByUserId` + `startTrialByUserId` | ✓ | ✓ FLOWING |
| email-only home | keys list | `listKeysByUserId(userId)` | ✓ | ✓ FLOWING |
| Telegram widget | widget payload → POST | third-party widget callback | ✗ | ✗ DISCONNECTED (callback throws) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Phase suites | `vitest run email-auth-flow telegram-bot-login reset-flow password i18n auth-session-userid` | 6 files / 55 tests pass | ✓ PASS |
| Full suite | `vitest run` (DATABASE_URL=setwhite) | 44 files / 401 tests pass | ✓ PASS |
| Debt markers | grep `TBD|FIXME|XXX` over phase files | none | ✓ PASS |
| Widget auth callback | reproduce telegram-widget.js?22 `__parseFunction` on injector's `data-onauth` | `ReferenceError: login is not defined` | ✗ FAIL |
| `next/script` removed from consumers | grep | 0 matches | ✓ PASS |

_No runnable probe scripts declared for this phase — Probe Execution: N/A._

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 06-01, 06-04, 06-07 | Register email+password, no verification, immediate login | ✓ SATISFIED | register route + EmailAuthCard + integration vector |
| AUTH-02 | 06-01, 06-04, 06-06, 06-07 | Login email+password, same httpOnly cookie | ✓ SATISFIED | email login route; bot-redirect login contract tested (classic widget path broken — secondary) |
| AUTH-03 | 06-02, 06-04, 06-06 | Link/unlink Telegram ↔ email, accounts merge | ✗ BLOCKED | Server services + tests pass, but the Account link widget (only UI trigger) is broken |
| AUTH-04 | 06-03, 06-04 | Reset password via email link | ✓ SATISFIED | mail + request/confirm routes + reset pages; 10 vectors green |
| AUTH-05 | 06-01, 06-02, 06-07 | Trial for email accounts protected from farming | ✓ SATISFIED | atomic userId claim + `email:{userId}` + merge OR (alias-farming caveat) |
| AUTH-06 | 06-04, 06-05, 06-07 | Telegram button correctly positioned on desktop | ⚠️ PARTIAL | Positioning fixed (centered in-flow); the widget button is non-functional due to the injector regression |

**No orphaned requirements:** all 6 AUTH IDs are claimed by plans 06-01..06-07; every ID is accounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/TelegramWidgetInjector.tsx` | 45, 49 | `data-onauth` uses a hyphenated global name via dot notation | 🛑 BLOCKER | Telegram widget callbacks never fire (login + link broken) |
| `app/api/auth/{email/login,email/password/request,telegram-bot/request}/route.ts` | ~30/29/18 | duplicated `clientIp()` trusting client XFF | 🛑 BLOCKER | rate-limit/throttle bypass (CR-02) |
| `lib/replay.ts` | 8–14 | catch-all maps any DB error to "replay" 401 | ⚠️ WARNING | masks DB outages; no error log |
| `lib/accounts.ts` | 69–86 | loser read outside transaction, not race-hardened | ⚠️ WARNING | small race → 500 / invariant window |

### Human Verification Required

1. **Desktop widget placement** — open `/login` at ~1440px; confirm the widget iframe is centered in-flow with no layout jump. (positioning code verified; pixels need a browser)
2. **Inline widget login + Account link widget** — EXPECTED TO FAIL until the `data-onauth` regression is fixed; re-test in a browser after fixing.
3. **Reset letter round-trip** — requires production SMTP credentials; one-time 1h link, new password works, old fails.
4. **Bot-redirect login click-through** — tap «Войти через Telegram», Start in the bot, confirm the original tab redirects into the cabinet exactly once.
5. **Email-only trial** — one-tap trial once, second attempt blocked cleanly (integration vectors pass; visual UAT).

### Gaps Summary

The email-auth **core is genuinely built and tested**: register/login on a shared httpOnly userId-subject session, Argon2id, DB-backed lock, account link/merge service with `trialUsed OR`, one-time 1h reset tokens with atomic consume and honest no-account, email-only cabinet with userId-keyed keys/trial, and the bot-redirect login server contract. `tsc` is clean and the full suite (44 files / 401 tests) passes.

However, the phase goal is **not fully achieved**:

1. **🛑 06-05 regression broke the Telegram widget callback (BLOCKER).** `TelegramWidgetInjector` sets `data-onauth` to a hyphenated identifier referenced via dot notation. Telegram evaluates the attribute as a function body; invoking it throws `ReferenceError: login is not defined` (reproduced against the real `telegram-widget.js?22`). Consequently the classic Telegram login widget on `/login` and the Account "link Telegram" widget never deliver their payloads. AUTH-03's user-visible link flow is therefore non-functional, and the AUTH-06 button is positioned but dead. The pre-06-05 implementation used a valid `onTelegramAuth(user)` callback — this is a regression introduced by the gap-closure work, and it is not covered by any test (no browser tests) so it slipped past the summaries.

2. **🛑 CR-01 bot-redirect login account takeover (login-CSRF).** Confirmed by reading `lib/telegram-login.ts`, the bot-login routes, and `lib/bot.ts`: the claim cookie binds the consumer to the issuer, but nothing binds the Telegram user who presses Start to the issuer. An attacker can issue a token, have the victim bind it, and consume it into the victim's session. Serious for a money-handling service.

3. **🛑 CR-02 X-Forwarded-For trust.** nginx uses `$proxy_add_x_forwarded_for` (client-controlled first hop) and the app trusts it; `X-Real-IP` is set but unused. Rotating a spoofed header defeats the login lock (`@@unique([email, ip])`, no per-email counter) and the 20/hour issuance throttle.

4. **Warnings** (WR-01/03): password change/reset does not invalidate other sessions, and a new reset request does not invalidate older unused tokens. (WR-02/04): `register` 409 is a second existence oracle beyond D-89 and registration is unthrottled with alias-capable email trial farming. (WR-05/06): replay catch-all masks DB errors; `linkAccounts` reads the loser outside the transaction.

All five gap groups are structured in the frontmatter for `/gsd-plan-phase --gaps`.

---

_Verified: 2026-10-05T22:05:00Z_
_Verifier: the agent (gsd-verifier)_

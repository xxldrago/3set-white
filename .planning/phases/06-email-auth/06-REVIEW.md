---
phase: 06-email-auth
reviewed: 2026-10-05T11:53:22Z
depth: standard
files_reviewed: 48
files_reviewed_list:
  - .env.example
  - app/api/auth/email/link/route.ts
  - app/api/auth/email/login/route.ts
  - app/api/auth/email/logout/route.ts
  - app/api/auth/email/password/change/route.ts
  - app/api/auth/email/password/confirm/route.ts
  - app/api/auth/email/password/request/route.ts
  - app/api/auth/email/register/route.ts
  - app/api/auth/email/unlink/route.ts
  - app/api/auth/telegram-bot/consume/route.ts
  - app/api/auth/telegram-bot/request/route.ts
  - app/api/auth/telegram-bot/status/route.ts
  - app/api/auth/telegram/route.ts
  - app/api/trial/route.ts
  - app/login/page.tsx
  - app/page.tsx
  - app/reset/confirm/page.tsx
  - app/reset/page.tsx
  - components/AccountSection.tsx
  - components/ChangePasswordForm.tsx
  - components/EmailAuthCard.tsx
  - components/LinkTelegramRow.tsx
  - components/LoginButton.tsx
  - components/PasswordField.tsx
  - components/ResetConfirmForm.tsx
  - components/ResetRequestForm.tsx
  - components/TelegramBotLoginButton.tsx
  - components/TelegramWidgetInjector.tsx
  - components/TelegramWidgetSlot.tsx
  - components/UnlinkConfirmPanel.tsx
  - lib/accounts.ts
  - lib/auth-rate-limit.ts
  - lib/auth.ts
  - lib/bot.ts
  - lib/env.ts
  - lib/i18n/messages/ru.ts
  - lib/keys-service.ts
  - lib/mail.ts
  - lib/password.ts
  - lib/session.ts
  - lib/telegram-login.ts
  - prisma/migrations/20261005113459_telegram_login_token/migration.sql
  - prisma/schema.prisma
  - tests/integration/email-auth-flow.test.ts
  - tests/integration/telegram-bot-login.test.ts
  - tests/unit/auth-session-userid.test.ts
  - tests/unit/password.test.ts
  - tests/unit/reset-flow.test.ts
findings:
  critical: 2
  warning: 6
  info: 6
  total: 14
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-10-05T11:53:22Z
**Depth:** standard
**Files Reviewed:** 48
**Status:** issues_found

## Summary

Reviewed the Phase 6 email + Telegram-bot-login auth surface at standard depth: 9 email BFF routes, 3 bot-login routes, the shared Telegram route, the trial route, 12 client components, 11 `lib/` modules, the Prisma schema/migration, and 5 test suites.

The implementation is generally strong: no-enumeration discipline on login/change/link, Argon2id with equal-cost dummy verify, timing-safe hex comparisons, atomic `updateMany` single-winner consumes for both reset tokens and bot-login tokens, zod boundaries on every route, and clean generic error mapping. The trial atomic-claim and cache-ownership filters are carried over correctly.

Two issues rise to **Critical**: (1) the bot-redirect handshake is exploitable as a login-CSRF/account-takeover — the claim cookie binds the *consumer* to the *issuer*, but nothing binds the authorizing Telegram user to the issuing browser, so an attacker can issue a token, trick a victim into pressing Start, and consume the resulting session; (2) every IP-derived rate limit trusts a client-controlled `X-Forwarded-For` first hop that nginx appends to, which defeats both the login brute-force lock (per `(email, ip)` unique) and the token-issuance throttle. Several Warnings follow on session invalidation, enumeration-via-registration, and stale Telegram claims.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Bot-redirect login is exploitable as account takeover (login CSRF / reverse fixation)

**Files:** `lib/telegram-login.ts:133-162` (issue), `lib/telegram-login.ts:224-255` (consume), `app/api/auth/telegram-bot/request/route.ts:41-51`, `app/api/auth/telegram-bot/consume/route.ts:32-59`, `lib/bot.ts:80-94`

**Issue:** The handshake's stated fixation defense is that consume requires the httpOnly claim cookie set on the issuing browser (`consumeLoginToken` checks `safeEqualHex(claimFor(token, secret), claimCookie)`). That binds the **consumer** to the **issuer**, but nothing binds the **Telegram user who authorizes** (`bindLoginToken` via `/start login_<token>`) to the issuer. Exploit:

1. Attacker's browser calls `POST /api/auth/telegram-bot/request` → receives token `T`, `botUrl` = `https://t.me/<bot>?start=login_<T>`, and the claim cookie in its own jar.
2. Attacker sends `botUrl` to the victim (chat, group, phishing page). Victim opens Telegram and presses **Start**.
3. `lib/bot.ts` `/start` calls `bindLoginToken(T, victimTelegramId)`, successfully binding the victim's Telegram identity to `T`.
4. Attacker (still holding the claim cookie) polls `status` → `ready`, then calls `consume` with token `T` and their valid claim cookie → the route mints a session for the victim's Telegram id.

This is a classic login-CSRF/account-takeover. The victim never visits the site, so there is no chance for the browser to establish a binding, and the bot's only confirmation is "Готово! Вернитесь в кабинет", which does not identify the requesting device. For a paid VPN service this grants the attacker full access to the victim's subscriptions, orders, and support threads. The threat is not covered by D-79..D-94; only the fixation direction (issuer-wins) was mitigated, not the reverse.

**Fix:** Add an authorization step that only the legitimate initiating human can complete and that the attacker's browser cannot satisfy. Options, in order of preference:
- Display a short confirmation code in the *issuing browser* and require the user to type/send that code in the bot before binding (`/start login_<T>` only opens the prompt; `bindLoginToken` refuses until the code matches). The attacker's browser would show the code, but the attacker would have to relay it to the victim, and the victim would see a code that does not correspond to anything they initiated.
- At minimum, change the bot flow to echo the requesting browser's session fingerprint and require an explicit "Yes, it's me" inline-button confirmation tied to the issued token, and have the bot warn when a link was opened unsolicited.
- Document explicitly that this vector is accepted if the owner declines a code step.

---

### CR-02: Client-controlled `X-Forwarded-For` defeats login brute-force lock and issuance throttle

**Files:** `app/api/auth/email/login/route.ts:30-34,48`, `app/api/auth/email/password/request/route.ts:29-33,47`, `app/api/auth/telegram-bot/request/route.ts:18-22,25`, `lib/auth-rate-limit.ts:38-83`, `nginx/my.3set.online.conf:41`

**Issue:** `clientIp()` returns `req.headers.get("x-forwarded-for")?.split(",")[0]`. nginx is configured with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, which **prepends the client-supplied header** to the real address: `X-Forwarded-For: <attacker-spoofed>, <real-ip>`. The code trusts the first element, so the IP used for rate limiting is fully attacker-controlled. (nginx also sets `X-Real-IP $remote_addr`, which the code never reads.)

Consequences:
- `LoginAttempt` is keyed `@@unique([email, ip])` (`prisma/schema.prisma:275-285`) and `checkLoginRateLimit` looks up `email_ip`. Because there is **no per-email-only counter**, an attacker brute-forcing a single email can send a fresh `X-Forwarded-For` value on every attempt, resetting the counter each time. The `MAX_ATTEMPTS=5` lock never engages — unlimited password guesses against any known email.
- The same spoofing bypasses the per-IP issuance throttle in `issueLoginToken` (`THROTTLE_MAX=20`), enabling unbounded `TelegramLoginToken` creation.

This directly undermines D-84 ("exponential backoff + temp lock") and the token-abuse control.

**Fix:**
1. Read the trusted hop, not the client-controlled one. With the current nginx config that is `X-Real-IP` (`$remote_addr`), or the **last** entry of `X-Forwarded-For` — never index 0:
```ts
function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  const parts = xff?.split(",").map((p) => p.trim()).filter(Boolean) ?? [];
  return parts.length > 0 ? parts[parts.length - 1] : "direct";
}
```
2. Add an **email-only** attempt counter (separate unique key or a second table column) so rotating IPs cannot reset a per-account lock, e.g. `@@unique([email])` alongside the existing pair, or count failures per email via a dedicated row.
3. Extract the duplicated `clientIp` into one shared helper (see IN-02).

---

## Warnings

### WR-01: Password change/reset does not invalidate existing sessions

**Files:** `lib/session.ts:40-54`, `app/api/auth/email/password/change/route.ts:65-70`, `app/api/auth/email/password/confirm/route.ts:88-99`, `lib/auth.ts:116-147`

**Issue:** Sessions are stateless 30-day JWTs with no token version, `iat` cutoff, or server-side revocation. Changing or resetting a password re-mints a session for the *current* request only; every other session (other devices, or an attacker's stolen cookie) remains valid for up to 30 days. Password reset is the intended compromise-recovery path, so this gap is material for a money-handling service.

**Fix:** Add a per-user `sessionEpoch`/`tokenVersion` integer; include it in the JWT and compare in `verifySession`/`requireSession`; bump it on password change, password reset, and unlink. Alternatively reject tokens with `iat < passwordChangedAt`.

### WR-02: Registration discloses account existence (409), contradicting the "reset-only" enumeration decision

**File:** `app/api/auth/email/register/route.ts:36-43,56-67`

**Issue:** `register` returns HTTP 409 `{ error: "email_taken" }` for an existing email and 200 for a new one. D-89 states the honest no-account answer is the **one accepted enumeration surface**, and login deliberately returns byte-identical 401s. The raw API of `register` is therefore a second, undocumented account-existence oracle (the client hides it, but attackers call the API directly). The `email-auth-flow.test.ts` suite even asserts the 409.

**Fix:** Either accept and document registration as a second enumeration surface, or make it non-disclosing: return 200 and send a "this email is already registered" notification email (or no email) instead of a distinguishable status. Do not rely on the client hiding the code.

### WR-03: A new reset request does not invalidate previously issued reset tokens

**File:** `app/api/auth/email/password/request/route.ts:70-77`

**Issue:** Each request creates a fresh `PasswordReset` row and never invalidates older unused rows for the same user. If a reset link is intercepted/leaked, requesting a new one does not revoke the old token — all outstanding tokens remain valid for the full 1h TTL. This weakens the recovery flow.

**Fix:** Before creating the new token, mark/delete existing unused tokens for `user.id` (e.g. `deleteMany({ where: { userId: user.id, usedAt: null } })`) inside the same operation so only the newest link works.

### WR-04: Trial farming — no registration throttle, no mailbox proof, and `customerRef` derived from our userId

**Files:** `app/api/auth/email/register/route.ts:22-87`, `lib/keys-service.ts:458-483`, `app/api/trial/route.ts:34-37`

**Issue:** Registration is unthrottled and unverified (D-79), and the email trial uses `customerRef = email:{userId}` where `userId` is a freshly auto-incremented row per registration. The provider's "one trial per customerRef" enforcement therefore cannot help: each new registration is a new customerRef. With plus-addressing/dot aliases, a single mailbox can mint unlimited accounts and thus unlimited trials. The test (`email-auth-flow.test.ts:520-537`) documents "N emails need N mailboxes", but that assumption does not hold for alias-capable providers.

**Fix:** Add a registration rate limit (reuse the D-84 counter keyed by trusted IP + a global cap), and/or gate the trial behind a mailbox-proof step (the reset-mail flow already demonstrates the transport). If accepted as-is, record it explicitly in CONTEXT so it is an owner decision, not an oversight.

### WR-05: `consumeWidgetHash` swallows all DB errors and reports them as replay

**File:** `lib/replay.ts:8-14`

**Issue:** The `try/catch` around `prisma.replayCache.create` catches **any** error (connection loss, timeout, etc.) and returns `false`, which both callers (`app/api/auth/telegram/route.ts:117`, `app/api/auth/email/link/route.ts:63`) map to a generic auth failure (401). A database outage during login is indistinguishable from a replayed payload, so it fails closed but silently and without an error-level log — masking incidents and making diagnosis hard. (The catch also masks genuine duplicate-key P2002, which is the only case it should handle.)

**Fix:** Catch only the unique-violation code and rethrow/log everything else:
```ts
try {
  await prisma.replayCache.create({ data: { hash } });
  return true;
} catch (err) {
  if (isUniqueViolation(err)) return false; // P2002 → duplicate replay
  logger.error({ route: "replay", outcome: "error" });
  throw err; // let the caller map to 500, not 401
}
```

### WR-06: `linkAccounts` merge reads the loser row outside the transaction and is not race-hardened

**File:** `lib/accounts.ts:69-86,88-141`

**Issue:** `loser` is fetched before `prisma.$transaction` (line 69/81). Between that read and the transaction, a concurrent unlink/delete/merge can remove the row; `tx.user.delete({ where: { id: loser.id } })` then throws (P2025) and the route maps the whole link to a generic 500. Conversely, if the loser's `email` changes after the pre-check `if (loser.email !== null) throw new AccountConflictError()`, the merge could attach an identity to an account that now has an email, violating T-06-05. The read-then-act window is small but the invariant (never merge a TG identity onto a conflicting email account) is not enforced inside the transaction.

**Fix:** Re-read the loser and re-assert `loser.email === null && loser.id !== survivor.id && survivor.telegramId === null` **inside** the transaction, and handle Prisma P2025/P2003 by returning a typed conflict/no-op result instead of an uncaught 500.

---

## Info

### IN-01: Dead timing-safe comparison in reset-confirm

**File:** `app/api/auth/email/password/confirm/route.ts:34-44,64-71`

**Issue:** The row is fetched with `findUnique({ where: { token } })`, so a returned row's token always equals the supplied token; `tokensEqual(row.token, token)` can never be `false`. The comment ("token comparison is timing-safe") overstates the protection. It is harmless (token entropy is 256-bit) but misleading. Keep the shape check and drop the redundant compare, or use a hash lookup (`where: { token: sha256(token) }`) if you want a compare with a real purpose.

### IN-02: `clientIp()` duplicated verbatim in three routes

**Files:** `app/api/auth/email/login/route.ts:30-34`, `app/api/auth/email/password/request/route.ts:29-33`, `app/api/auth/telegram-bot/request/route.ts:18-22`

**Issue:** Identical helpers copy-pasted. Given CR-02 requires changing the trust logic, a single shared `lib/client-ip.ts` prevents divergence. Also see `lib/telegram-login.ts` receives an already-resolved `ip` string, so the inconsistency is easy to miss.

### IN-03: Inconsistent IP PII handling

**Files:** `lib/auth-rate-limit.ts:60-83` (stores raw `email` + `ip`), `lib/telegram-login.ts:137` (stores `sha256(ip)` only)

**Issue:** The login/reset attempt table persists the raw client IP alongside the plaintext email, while the bot-login token table hashes the IP specifically for PII discipline. Align on `ipHash` (or document why the attempt table needs the raw value).

### IN-04: Unit test does not test what its name claims

**File:** `tests/unit/auth-session-userid.test.ts:34-40`

**Issue:** `"non-finite claims are rejected"` only feeds garbage token strings; it never forges a token with a non-finite `uid`/`tid`. The `toFiniteNumber` guard in `lib/auth.ts:157-159` is therefore untested. Either rename the test or mint a token with `uid: "abc"`/`NaN` and assert rejection.

### IN-05: Renew term is hardcoded to 30 days while the copy promises 7/30/90

**File:** `lib/bot.ts:309,326-331`

**Issue:** `KEY_DAYS = 30` with the comment "the cabinet renew panel offers 7/30/90". Bot renew always uses 30 regardless of what the user may want; if the cabinet offers a choice, the channels diverge. Confirm this is intended (fixed renew term) and update the comment, or thread the days through the renew callback.

### IN-06: `signSession` 2-arg overload is a silent footgun

**File:** `lib/auth.ts:116-147`

**Issue:** `signSession(userId, secret)` silently mints a **legacy `tid`** token because the overload branch keys off the *type* of the second argument. A future caller intending `(userId, telegramId)` but omitting the secret will produce a token whose `uid` is absent. This legacy path exists only for pre-Phase-6 compatibility; mark it deprecated and consider narrowing it to a distinctly named `signLegacyTelegramSession` so no new call site can select it accidentally.

---

_Reviewed: 2026-10-05T11:53:22Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

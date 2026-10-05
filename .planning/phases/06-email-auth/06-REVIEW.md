---
phase: 06-email-auth
reviewed: 2026-10-05T21:47:31Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - app/api/auth/email/login/route.ts
  - app/api/auth/email/password/change/route.ts
  - app/api/auth/email/password/confirm/route.ts
  - app/api/auth/email/password/request/route.ts
  - app/api/auth/email/register/route.ts
  - app/api/auth/email/unlink/route.ts
  - app/api/auth/telegram-bot/consume/route.ts
  - app/api/auth/telegram-bot/request/route.ts
  - components/LinkTelegramRow.tsx
  - components/LoginButton.tsx
  - components/TelegramBotLoginButton.tsx
  - components/TelegramWidgetInjector.tsx
  - lib/accounts.ts
  - lib/auth-rate-limit.ts
  - lib/auth.ts
  - lib/bot.ts
  - lib/client-ip.ts
  - lib/email-canonical.ts
  - lib/replay.ts
  - lib/session.ts
  - lib/telegram-login.ts
  - lib/telegram-widget.ts
  - nginx/my.3set.online.conf
  - prisma/schema.prisma
  - tests/integration/link-merge.test.ts
  - tests/integration/register-alias.test.ts
  - tests/integration/session-invalidation.test.ts
  - tests/integration/telegram-bot-login.test.ts
  - tests/unit/auth-rate-limit.test.ts
  - tests/unit/client-ip.test.ts
  - tests/unit/replay.test.ts
  - tests/unit/telegram-widget.test.ts
findings:
  critical: 1
  warning: 7
  info: 6
  total: 14
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-10-05T21:47:31Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Fresh adversarial review of the **gap-closure** changes for phase 06 (plans 06-09…06-13) plus the 06-08 Telegram-widget `data-onauth` regression fix. I traced each claimed fix end-to-end (route → service → schema) and evaluated it for new defects introduced alongside the fix.

**Fix verdicts (confirm/refute):**

- **CR-01 (bot-login account takeover) — CONFIRMED FIXED.** The confirmation code is generated in `bindLoginToken` (`lib/telegram-login.ts:210-240`), stored only as `sha256` (`codeHash`), and delivered by the bot exclusively to the authorizing chat (`lib/bot.ts:90-92`). `consumeLoginToken` now requires `{ token, code }` and compares `sha256(code)` against the stored hash with a timing-safe compare (`lib/telegram-login.ts:290`), rate-caps wrong codes, and self-invalidates at 5 attempts (`:293-303`). A reverse-fixation hijack (attacker claim cookie + victim-bound token) can no longer mint a session because the attacker never learns the code. `tests/integration/telegram-bot-login.test.ts:282-344` exercises exactly this. **Resolved.**
- **CR-02 (X-Forwarded-For rate-limit bypass) — CONFIRMED FIXED.** `lib/client-ip.ts` now prefers the nginx-overwritten `X-Real-IP` and otherwise takes the **last** XFF hop (`:16-28`); nginx overwrites `X-Forwarded-For` with `$remote_addr` (`nginx/my.3set.online.conf:44`); every IP-consuming auth route (login, password-request, register, telegram-bot request) imports the shared helper; and a per-email account-wide counter (`EMAIL_ONLY_IP`) makes the lock immune to IP rotation (`lib/auth-rate-limit.ts:47-61,133-141`). **Resolved** — but see CR-01 below for an availability regression the account-wide counter introduces.
- **WR-01 (session revocation) — substantially closed** via the `credentialsChangedAt` watermark at change/reset/unlink (`lib/session.ts:46-53`), with a residual same-second gap (WR-05).
- **WR-02/WR-04 (registration enumeration + alias trial farming) — closed as documented/accepted** (per-IP register throttle + `emailCanonical UNIQUE`), with two residual issues (WR-02, IN-03).
- **WR-03 (reset-token supersession) — closed**, but the supersede-then-mail ordering creates a new failure mode (WR-03).
- **WR-05 (replay P2002 narrowing) — closed** (`lib/replay.ts:18-23`).
- **WR-06 (linkAccounts transaction race) — closed**: merge invariants are re-read inside the transaction and Prisma codes map to typed outcomes (`lib/accounts.ts:124-202`).
- **06-08 `data-onauth` regression — closed**: the emitted callback name is identifier-only and the expression is a direct call (`lib/telegram-widget.ts:25-46`); the unit test reproduces Telegram's `eval` byte-for-byte.

One new **Critical** issue was found: the account-wide login lock added to close CR-02 is also incremented by the **unauthenticated password-reset route**, enabling remote account-lockout denial of service against any known email.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Password-reset requests can remotely lock any account out of login (account-lockout DoS)

**Files:** `app/api/auth/email/password/request/route.ts:45-59`, `lib/auth-rate-limit.ts:57-61`, `lib/auth-rate-limit.ts:78-95`, `lib/auth-rate-limit.ts:133-141`

**Issue:** Closing CR-02 added an **IP-independent, account-wide** counter: `recordFailedLogin(email, ip)` increments `(email, EMAIL_ONLY_IP)` in addition to `(email, ip)` (`lib/auth-rate-limit.ts:57-61,136-139`), and `checkLoginRateLimit` denies when **either** row is locked (`:78-95`). That is correct for login brute-force.

However the password-reset route — which is **unauthenticated** and deliberately discloses account existence with a 404 (`reset_no_account`, the owner-accepted D-89 surface) — calls the *same* counter:

```ts
// app/api/auth/email/password/request/route.ts
const gate = await checkLoginRateLimit(email, ip);   // :45
...
await recordFailedLogin(email, ip);                  // :59  ← bumps (email, EMAIL_ONLY_IP)
```

Exploit: an attacker who knows a victim's email (trivially obtainable via the accepted 404 oracle, or by guessing) sends **5 reset requests from any IP** (even 5 different IPs). The account-wide row reaches `attempts = 5` and locks (`lib/auth-rate-limit.ts:108-116`). The victim's next `POST /api/auth/email/login` hits the gate first and returns **429 — before the password is even checked**. The victim is also locked out of the reset flow itself (same gate), so there is no self-service recovery; locks escalate to the 2h cap (`LOCK_CAP_MS`) and re-engage on every attempt. This converts an anonymous request into a persistent denial of login for arbitrary accounts.

**Fix:** Do not let the reset-mail throttle feed the login account lock. Give the reset route its own namespaced keys (mirroring the registration namespace) and never touch `EMAIL_ONLY_IP` for it:

```ts
// lib/auth-rate-limit.ts
const RESET_NAMESPACE = "__reset__:";
export function checkResetRateLimit(email: string, ip: string) {
  return checkLoginRateLimit(`${RESET_NAMESPACE}${normalizeEmail(email)}`, ip);
}
export function recordResetAttempt(email: string, ip: string) {
  return recordFailedLogin(`${RESET_NAMESPACE}${normalizeEmail(email)}`, ip);
}
```

Alternatively, add a `bumpAccountWide: boolean` parameter to `recordFailedLogin` and pass `false` from the reset route. Either way, login and reset-mailable throttles must not share lock state.

## Warnings

### WR-01: `bumpAttempt` is a non-atomic read-modify-write — concurrent failures lose increments

**File:** `lib/auth-rate-limit.ts:102-124`

**Issue:** `bumpAttempt` reads `attempts` with `findUnique`, computes `attempts + 1` in JS, then writes the literal value back via `upsert({ update: { attempts } })`. Under concurrency every request in a burst reads the same starting value and writes the same result, so N parallel failures can net only **+1**. This directly weakens the brute-force lock the CR-02 fix is built on: an attacker can issue a large parallel burst of guesses per increment and reach `MAX_ATTEMPTS` far later than 5 serial guesses. Because it applies to both the per-IP row and the account-wide row, the CR-02 mitigation is partially defeated by parallelism.

**Fix:** Use an atomic increment and derive the lock from the returned value inside one transactional statement:

```ts
const row = await prisma.loginAttempt.upsert({
  where: { email_ip: key },
  update: { attempts: { increment: 1 } },
  create: { ...key, attempts: 1 },
  select: { attempts: true },
});
const attempts = row.attempts;
// then, if attempts >= MAX_ATTEMPTS, set lockedUntil with an atomic update
```

### WR-02: Registration throttle never resets and escalates — shared/NAT IPs become permanently unable to register

**Files:** `lib/auth-rate-limit.ts:182-193`, `app/api/auth/email/register/route.ts:47-55`

**Issue:** `recordRegistrationAttempt` is called unconditionally on every register request (`healthy, duplicate, or alias`) and only ever increments. There is no success-reset and no window reset before the retry-hint math; once an IP reaches `attempts = 5`, each subsequent request re-locks with a doubling backoff up to the 2h cap (`:108-116`). A household, office NAT, or mobile-carrier CGNAT that legitimately registers five accounts is then throttled from that IP essentially indefinitely (one attempt per 2h at best). This is a realistic availability regression for the primary signup path.

**Fix:** Key registration by trusted IP **and** reset the counter on success (or on successful window expiry), and/or cap total escalation. At minimum, clear the window when `updatedAt` is older than the throttle window so a returning NAT can register again.

```ts
// after a successful user.create in register/route.ts
await prisma.loginAttempt.deleteMany({ where: { email: registrationKey(ip), ip: EMAIL_ONLY_IP } });
```

### WR-03: A mail-transport failure after token rotation destroys the user's previously working reset link

**File:** `app/api/auth/email/password/request/route.ts:69-86`

**Issue:** The WR-03 fix deletes all prior unused reset tokens and creates the new row in a transaction (`:69-78`), **then** attempts `sendResetMail` (`:80`). If mail delivery throws `MailError`, the route returns 500 `reset_error` — but the deletion has already committed and the replacement token was never delivered. The user's previously received reset link has been invalidated by a request that produced no replacement, leaving them unable to reset until SMTP recovers. The WR-03 fix thus introduced a new failure mode.

**Fix:** Order the side effects so delivery precedes supersession, or make the supersession recoverable: send the mail first and only `deleteMany` the old tokens after a successful send; on `MailError`, roll back (delete the new row) before returning 500. An outbox/retry is the robust form.

### WR-04: `requireSession` authenticates a session whose user row no longer exists (uid path)

**File:** `lib/session.ts:66-74`

**Issue:** For `userId`-subject tokens the gate loads the user only to read `credentialsChangedAt`; if `findUnique` returns `null` it falls through and **returns the identity anyway** (`:71-74`). A session for a deleted account is therefore treated as authenticated. `requireTelegramSession` has the same shape (`:105-112`) and the legacy-tid branch of `requireSession` is the only one that throws on a missing row (`:78-82`). Today every session-gated route re-validates the user, so this is latent rather than exploitable, but it is exactly the kind of stale-identity assumption that becomes a bug when a new route trusts `requireSession` alone.

**Fix:** Throw `SessionError` when the resolved row is missing:

```ts
const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { id: true, credentialsChangedAt: true } });
if (!user) throw new SessionError();
if (isRevoked(claims.issuedAt, user.credentialsChangedAt)) throw new SessionError();
```

### WR-05: Watermark same-second tokens are accepted *permanently*, not just for the bump second

**File:** `lib/session.ts:46-53`

**Issue:** `isRevoked` returns true only when `issuedAt < Math.floor(credentialsChangedAt.getTime()/1000)`. jose `iat` is second-granular, so any token whose `iat` equals the floored watermark second passes **forever** (there is no subsequent re-evaluation against a moving bound). The plan documents this as a one-second window for the *re-minted* session (`:44-45`, test comment `session-invalidation.test.ts:6-10`), but the actual behavior is that a token issued in the bump's exact second is never revoked for its full 30-day life. Practical exploitability is low (the attacker must have obtained a token in the same wall-clock second as the victim's password change), but it is a real revocation gap and the documented behavior understates it.

**Fix:** Replace `iat`-vs-timestamp with a monotonically increasing per-user token version/epoch embedded in the JWT and compared for equality (bump the version on credential change). This removes clock-granularity ambiguity entirely:

```ts
// sign: claims.ver = user.sessionVersion;  verify: reject if claims.ver !== user.sessionVersion
```

### WR-06: Wrong-code attempt cap is not atomic with token invalidation

**File:** `lib/telegram-login.ts:290-303`

**Issue:** On a wrong code the handler increments `codeAttempts` (`:293-297`) and, separately, invalidates the token if the incremented value reached the cap (`:298-303`). These are two statements outside the consume transaction. Concurrent wrong guesses all pass the pre-read `consumedAt === null` check, so a burst can exceed `LOGIN_CODE_MAX_ATTEMPTS` guesses before invalidation lands — violating the "5 attempts per token" contract that CR-01's brute-force defense relies on. The 6-digit space still makes this impractical to crack, but the cap is not actually enforced under concurrency.

**Fix:** Make the increment and the conditional invalidation a single atomic operation, e.g. `updateMany({ where: { token, consumedAt: null, codeAttempts: { lt: LOGIN_CODE_MAX_ATTEMPTS } }, data: { codeAttempts: { increment: 1 } } })` and invalidate when `count` reflects the reaching attempt; or wrap both in one transaction with a row lock.

### WR-07: `LinkTelegramRow` re-injects the Telegram widget on every render (unstable `onAuth` identity)

**Files:** `components/LinkTelegramRow.tsx:94-100`, `components/TelegramWidgetInjector.tsx:25-65`

**Issue:** `TelegramWidgetInjector`'s effect lists `onAuth` among its dependencies (`:65`) and tears down/re-creates the `<script>` and the global callback whenever it changes (`:58-64`). `LinkTelegramRow` passes a fresh inline arrow every render (`:96-98`), and its own state changes (`linkPending`, `linkError`) plus `router.refresh()` trigger re-renders. Every such render removes the current widget callback and injects a *new* widget (with a new random callback name). If this happens while the Telegram popup is open, the callback the iframe was initialized with is deleted and the completed auth can fail with `ReferenceError` — an intermittent break of the link flow, plus visible widget flicker.

**Fix:** Stabilize the callback identity (wrap in `useCallback`) or, better, have the injector keep the latest `onAuth` in a ref and drop it from the effect deps so the script is injected once per `botUsername`:

```ts
const onAuthRef = useRef(onAuth);
onAuthRef.current = onAuth;
// register: (window)[callbackName] = (u: unknown) => onAuthRef.current(u);
// deps: [botUsername, buttonSize, cornerRadius, requestAccess, lang]
```

## Info

### IN-01: Dead timing-safe comparison in reset-confirm (carried over from prior review)

**File:** `app/api/auth/email/password/confirm/route.ts:64-71`

**Issue:** The row is fetched with `findUnique({ where: { token } })`, so `row.token` always equals the supplied `token`; `tokensEqual(row.token, token)` can never be false. It is harmless (the shape check at `:60` is the real gate) but misleadingly documented. Unchanged from the previous review; the gap-closure plans did not touch it.

**Fix:** Drop the redundant compare, or store/lookup `sha256(token)` so the compare has a purpose.

### IN-02: `consumeWidgetHash` rethrow is not explicitly mapped to 500 by its callers

**Files:** `lib/replay.ts:18-23`, `app/api/auth/telegram/route.ts:117`, `app/api/auth/email/link/route.ts:63`

**Issue:** WR-05's narrowing now correctly rethrows non-P2002 DB errors, but both call sites invoke `consumeWidgetHash` **outside** their `try/catch` blocks, so a DB outage becomes an unhandled route exception rather than an explicit generic 500. Behavior is acceptable (Next returns 500) but it does not match the module comment's "callers map it to a generic 500".

**Fix:** Wrap the `consumeWidgetHash` call in the existing try/catch (or add one) so the 500 is deliberate and logged.

### IN-03: `email_canonical` migration has no backfill

**File:** `prisma/migrations/20261005213833_user_email_canonical/migration.sql`

**Issue:** The column is added nullable with a unique index but existing email-bearing rows are left `NULL`. Alias collapse only arbitrates for rows written *after* this migration, so any pre-existing email account can still be duplicated via a plus/dot alias. Low impact for a not-yet-launched service, but the schema comment claims pre-migration accounts are handled ("keep NULL") without noting they are excluded from dedupe.

**Fix:** Add a backfill in the migration (`UPDATE users SET email_canonical = <canonicalized email> WHERE email IS NOT NULL`) or document the exclusion explicitly.

### IN-04: `bindLoginToken` rebind path returns a `bound` code without confirming the write matched

**File:** `lib/telegram-login.ts:234-240`

**Issue:** The idempotent rebind branch calls `updateMany(...)` but ignores the returned `count`; if the token expired or was consumed between the pre-read (`:198-204`) and the update, no `codeHash` is written yet the function still returns `{ kind: "bound", code }`. The bot then DMs a code that `consume` will always reject. Fail-closed, but a confusing dead end for the user.

**Fix:** Check `count === 1` and return `{ kind: "invalid" }` otherwise (the null-bind branch at `:216-233` already models this pattern).

### IN-05: Duplicated Prisma error-code helpers

**Files:** `lib/accounts.ts:221-232`, `lib/replay.ts:26-32`

**Issue:** `isErrorCode`/`isUniqueViolation` are defined independently in both modules (and a third inline P2002 check exists in `app/api/auth/email/register/route.ts:97-102`). Divergence risk for a security-relevant predicate.

**Fix:** Extract a shared `lib/prisma-errors.ts` (`isErrorCode`, `isUniqueViolation`) and import it everywhere.

### IN-06: Consume-route code regex duplicates `LOGIN_CODE_LENGTH`

**File:** `app/api/auth/telegram-bot/consume/route.ts:23`

**Issue:** `z.string().regex(/^\d{6}$/)` hardcodes the 6-digit length instead of deriving it from `LOGIN_CODE_LENGTH` (`lib/telegram-login.ts:32`). If the constant changes, the route silently rejects valid codes (the client component also hardcodes `CODE_LENGTH = 6`).

**Fix:** Build the regex (or a length check) from `LOGIN_CODE_LENGTH` so the contract has one source of truth.

---

_Reviewed: 2026-10-05T21:47:31Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

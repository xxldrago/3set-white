# Phase 6: Email Auth - Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 18 new/modified
**Analogs found:** 15 / 18

No RESEARCH.md exists for this phase (research skipped). All assignments derive from CONTEXT.md (D-79..D-94) + UI-SPEC + verified codebase analogs. Every analog path below is git-TRACKED (verified via `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `prisma/schema.prisma` (MODIFY) | model/migration | CRUD | itself (`User` model, lines 17-48) | exact |
| `lib/auth.ts` (MODIFY) | service (pure auth) | request-response | itself (HMAC verifiers + jose session, lines 1-152) | exact |
| `lib/session.ts` (MODIFY) | middleware/guard | request-response | itself (`requireSession`, lines 1-38) + `lib/admin-auth.ts` (`requireRole` pattern) | exact |
| `lib/env.ts` (MODIFY) | config | transform | itself (zod fail-fast schema, lines 1-61) | exact |
| `lib/mail.ts` (NEW) | service (SMTP sender) | request-response | `lib/logger.ts` (server-only singleton discipline) + `lib/artemida.ts` (external-client error mapping) | role-match |
| `lib/password.ts` (NEW) | utility (argon2id) | transform | `lib/auth.ts` (`timingSafeEqualHex`, lines 34-48 — never-throw compare discipline) | role-match |
| `lib/auth-rate-limit.ts` (NEW) | middleware/service | request-response | `lib/replay.ts` (one-time consume via UNIQUE insert) + `lib/worker.ts:92` (backoff honoring Retry-After) | role-match |
| `lib/accounts.ts` (NEW, link/merge service) | service | CRUD/batch | `lib/keys-service.ts` (`claimTrial`/`releaseTrialOnFailure`/`startTrial`, lines 296-389) | role-match |
| `app/api/auth/email/*` routes (NEW: register/login/logout/reset-link/unlink/change-password) | route/controller | request-response | `app/api/auth/telegram/route.ts` (lines 1-146) + `app/api/trial/route.ts` (lines 1-52) | exact |
| `app/login/page.tsx` (MODIFY) | component (server page) | request-response | itself (lines 1-26) + `app/page.tsx:20` (PRIMARY/SECONDARY recipes) | exact |
| `components/EmailAuthCard.tsx` + `PasswordField.tsx` + `TelegramWidgetSlot.tsx` (NEW) | component (client islands) | request-response | `components/LoginButton.tsx` (lines 1-109) + `components/CreateTicketForm.tsx` (INPUT/FIELD_LABEL/PRIMARY/SECONDARY, lines 22-29) | exact |
| `app/reset/page.tsx` + `app/reset/confirm/page.tsx` + `ResetRequestForm` + `ResetConfirmForm` (NEW) | component + route | request-response | `components/CreateTicketForm.tsx` (form-state discipline) + `app/api/trial/route.ts` (typed-error mapping) | role-match |
| `components/AccountSection.tsx` + `LinkTelegramRow.tsx` + `UnlinkConfirmPanel.tsx` + `ChangePasswordForm.tsx` (NEW) | component | CRUD | `components/ConfirmPanel.tsx` (lines 1-150, inline-confirm anatomy) | exact |
| `lib/i18n/messages/ru.ts` (MODIFY) | config (strings) | transform | itself (`auth`-adjacent `login` block lines 16-22; `flattenMessages`/`allKeys` lines 331-348) + `lib/i18n/index.ts` (`t`/`tp`, lines 21-38) | exact |
| `tests/unit/password.test.ts` + `tests/unit/reset-flow.test.ts` + `tests/integration/email-auth-flow.test.ts` (NEW) | test | request-response | `tests/unit/session.test.ts` (lines 1-35) + `tests/integration/auth-flow.test.ts` (lines 1-88) + `tests/unit/i18n.test.ts` (completeness spec) | exact |
| `lib/bot.ts` (UNTOUCHED) | — | — | itself (`/start` upsert lines 48-86) — DO NOT MODIFY per D-94 | exact (negative analog) |

## Pattern Assignments

### `prisma/schema.prisma` (MODIFY — model/migration, CRUD)

**Analog:** `prisma/schema.prisma` itself (`User` model lines 17-48, `AdminUser` lines 259-267)

**Migration discipline** — follow the existing `@map`/`@@map` snake_case convention. `telegramId` goes nullable; new fields mirror the trial-field comment style:

```prisma
// Phase 6 email identity (D-79/D-80): telegramId nullable, email unique,
// passwordHash argon2id. Trial stays one-per-account (trialUsed OR on merge).
model User {
  id           Int      @id @default(autoincrement())
  telegramId   BigInt?  @unique @map("telegram_id")
  email        String?  @unique
  passwordHash String?  @map("password_hash")
  // ... existing chatId/firstName/trialUsed/trialKeyId/orders/keys/tickets unchanged
  @@map("users")
}
```

**New reset-token model** — copy the `ReplayCache` one-time-guard shape (lines 151-156), but with expiry + used flag per D-88:

```prisma
// Phase 6 password reset (D-88): one-time, 1h TTL, invalidated after use.
model PasswordReset {
  token     String   @id
  userId    Int      @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId, expiresAt])
  @@map("password_resets")
}
```

**Rules for planner:** keep `@@unique([userId, keyId])` on `KeyCache`, `onDelete: Cascade` on all user relations (merge re-points rows, never orphans). Partial unique on `email` is automatic (Prisma `String? @unique` → nullable-unique, multiple NULLs allowed in Postgres). Migration is one-way per D-79 — flag it.

---

### `lib/auth.ts` (MODIFY — pure service, request-response)

**Analog:** `lib/auth.ts` itself (lines 1-152)

**Purity contract** (lines 1-9) — KEEP: `node:crypto + jose` only, secrets as params, no `next/headers`, no env import. Unit tests import this without a Next runtime:

```typescript
// lib/auth.ts:1-9
// Pure module by design: node:crypto + jose only, secrets passed as params.
// No next/headers, no env import — unit tests and the integration flow import
// this without a Next runtime.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
```

**Session subject change** (D-82) — extend `signSession`/`verifySession` (lines 115-139) from `tid`-only to `{ uid, tid? }`. Copy the never-throw + explicit-HS256-allowlist discipline exactly:

```typescript
// lib/auth.ts:115-122 — mint pattern to extend
export async function signSession(telegramId: number, secret: string): Promise<string> {
  return new SignJWT({ tid: telegramId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(new TextEncoder().encode(secret));
}

// lib/auth.ts:128-139 — verify pattern: allow-list + type-guard + null-never-throw
export async function verifySession(token: string, secret: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return typeof payload.tid === "number" && Number.isFinite(payload.tid)
      ? payload.tid
      : null;
  } catch {
    return null;
  }
}
```

Planner direction: new signature `signSession(userId: number, telegramId: number | null, secret)` → claims `{ uid, tid? }`; `verifySession` returns `{ userId, telegramId | null } | null` and MUST still accept legacy `{ tid }` tokens (resolve userId via `User.telegramId` lookup in `lib/session.ts`, not here — keep this module pure). `SESSION_COOKIE = "3set_session"` (line 14), `AUTH_MAX_AGE_SEC = 86_400` (line 12), `buildSessionCookie` (lines 142-152, HttpOnly + SameSite=Lax + Secure-in-prod-only) are UNCHANGED.

**Compare discipline for tokens** — reuse `timingSafeEqualHex` (lines 34-48) for reset-token comparison: length-guarded, garbage → false, never throws.

---

### `lib/session.ts` (MODIFY — guard, request-response)

**Analog:** `lib/session.ts` itself (lines 1-38) + `lib/admin-auth.ts` (`requireRole` lines 89-96)

**Current gate** (copy the shape, change the subject per D-82):

```typescript
// lib/session.ts:1-9 — thin-wrapper comment + imports (keep structure)
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
import { env } from "./env";

// lib/session.ts:11-17 — typed 401 signal, routes map to generic 401
export class SessionError extends Error {
  constructor() {
    super("session_required");
    this.name = "SessionError";
  }
}

// lib/session.ts:32-38 — gate: server-resolved id, never client-supplied
export async function requireSession(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const telegramId = await verifySession(token, env.SESSION_SECRET);
  if (telegramId === null) throw new SessionError();
  return telegramId;
}
```

Planner direction: `requireSession()` returns `{ userId: number; telegramId: number | null }` (or at minimum `userId`), resolving legacy `tid` sessions via a `User.telegramId` DB lookup. Keep `SessionError`/`AdminError` classes untouched — every route maps `SessionError→401`, `AdminError→404` (never 403). For the `requireRole` composition pattern (admin routes call `requireSession` then resolve), copy `lib/admin-auth.ts:89-96`.

---

### `lib/env.ts` (MODIFY — config, transform)

**Analog:** `lib/env.ts` itself (lines 1-61)

**Fail-fast zod pattern** — add SMTP keys to `envSchema`, server-only (never `NEXT_PUBLIC_*`), following the Platega/ARTEMIDA comment style:

```typescript
// lib/env.ts:7-9 — pattern: min(1) with actionable message
BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required (prod bot via BotFather)"),

// lib/env.ts:50-61 — loadEnv throws at boot, never logs values
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  return parsed.data;
}
export const env = loadEnv();
```

Planner direction (D-87): `SMTP_HOST` (min 1), `SMTP_PORT` (coerce number, default 587), `SMTP_USER`, `SMTP_PASS` (min 1), `SMTP_FROM` (email string), `APP_BASE_URL` already exists (line 24) — reuse for reset-link construction. Optional `SMTP_SECURE` boolean default false. Follow `ARTEMIDA_BASE_URL` `.default(...)` style for port.

---

### `lib/mail.ts` (NEW — service, request-response)

**Analog:** `lib/logger.ts` (server-only singleton discipline) + `lib/artemida.ts` (external-client error mapping)

```typescript
// lib/logger.ts:1-8 — singleton + PII discipline to copy
import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
});
```

```typescript
// lib/artemida.ts:100 — typed-code mapping pattern (never proxy provider text)
// case 429: → { code: "rate_limited", retryAfterSec }
```

Planner direction (D-87/D-90): single `sendMail({ to, subject, text })` export, SMTP transport from `env` (import `env`, never `process.env` directly). Log `{ to-domain-only, outcome }` via `logger` — never the token/link (credential-bearing, cf. bot.ts key-link comment). Throw typed `MailError` with `code: "send_failed"`; routes map to generic `auth.resetError` (never SMTP text). Only two templates: reset + welcome (D-90). **New dependency:** `nodemailer` is NOT in `package.json` — planner must add it (pin version, verify API at plan time).

---

### `lib/password.ts` (NEW — utility, transform)

**Analog:** `lib/auth.ts` `timingSafeEqualHex` (lines 34-48)

```typescript
// lib/auth.ts:34-48 — never-throw compare discipline to mirror
function timingSafeEqualHex(computed: Buffer, receivedHex: unknown): boolean {
  if (typeof receivedHex !== "string" || receivedHex.length === 0) return false;
  // ... garbage input → false, never a throw
}
```

Planner direction (D-83/D-85): `hashPassword(plain: string): Promise<string>` + `verifyPassword(hash, plain): Promise<boolean>` over **argon2id** (OWASP). Enforce `min 8` server-side (zod `z.string().min(8)` at route boundary AND inside the service as defense-in-depth). `verifyPassword` returns boolean, never throws on garbage hash. **New dependency:** `argon2` (or `@node-rs/argon2`) is NOT in `package.json` — planner must add it. No timing-oracle: wrong-email and wrong-password paths must cost the same (run a dummy verify on unknown email — document in plan).

---

### `lib/auth-rate-limit.ts` (NEW — middleware/service, request-response)

**Analog:** `lib/replay.ts` (lines 1-15) + `lib/worker.ts:92` (backoff) + `app/page.tsx:42` (rate-limit copy mapping)

```typescript
// lib/replay.ts:7-15 — UNIQUE-insert consume pattern (race-safe, no read-then-write)
export async function consumeWidgetHash(hash: string): Promise<boolean> {
  try {
    await prisma.replayCache.create({ data: { hash } });
    return true; // first use
  } catch {
    return false; // duplicate → reject as replay
  }
}
```

Planner direction (D-84): per-email + per-IP attempt counter with exponential backoff + temporary lock after N failures, NO captcha. Store in Postgres (new `LoginAttempt` model or in-memory-safe table — planner's choice, but DB survives restart unlike memory). On lock: route returns **429 with server-computed `retryAfterSec`**; client renders `auth.rateLimited` («Слишком много попыток. Повторите через {n} сек.») with that number (UI-SPEC §1 — never fabricate client-side). Existing precedent: `app/api/trial/route.ts:37-47` maps `rate_limited → 429 + retryAfter`; `app/page.tsx:42` maps to `common.errorRateLimit`. Successful login resets the counter.

---

### `lib/accounts.ts` (NEW — link/merge service, CRUD/batch)

**Analog:** `lib/keys-service.ts` (`claimTrial` lines 296-302, `releaseTrialOnFailure` lines 309-314, `startTrial` lines 363-389)

```typescript
// lib/keys-service.ts:296-302 — atomic claim: ONE updateMany, branch on count
export async function claimTrial(telegramId: bigint): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { telegramId, trialUsed: false },
    data: { trialUsed: true },
  });
  return count === 1;
}

// lib/keys-service.ts:309-314 — guarded rollback: never clobber a success
export async function releaseTrialOnFailure(telegramId: bigint): Promise<void> {
  await prisma.user.updateMany({
    where: { telegramId, trialUsed: true, trialKeyId: null },
    data: { trialUsed: false },
  });
}
```

Planner direction (D-80/D-81): `linkAccounts({ userId, telegramId })` and `unlinkTelegram(userId)` in one server-only module; both bot and BFF call it (shared-path discipline per `lib/bot.ts:91-94` comment). Merge = single `prisma.$transaction`: re-point `KeyCache`/`Order`/`Ticket` rows from loser → survivor (`updateMany` per table), `trialUsed = OR`, `trialKeyId ??=`, then delete loser row. Email-registration trial uses the same `claimTrial`-by-userId shape (planner adapts the `where` from `telegramId` to `id` — trial is one-per-account per D-80). Unlink-last-method is ALLOWED (D-93) — service does not block; UI warns via `auth.unlinkLastBody`.

---

### `app/api/auth/email/*` routes (NEW — controllers, request-response)

**Analog:** `app/api/auth/telegram/route.ts` (lines 1-146) + `app/api/trial/route.ts` (lines 1-52)

**BFF skeleton to copy** (telegram route lines 12-24 + 44-50; trial route lines 15-25):

```typescript
// app/api/auth/telegram/route.ts:12-24 — imports: zod + pure auth + env + logger + prisma + replay
import { z } from "zod";
import { buildSessionCookie, signSession, verifyInitData, verifyWidget } from "../../../../lib/auth";
import { env } from "../../../../lib/env";
import { logger } from "../../../../lib/logger";
import { prisma } from "../../../../lib/prisma";
import { consumeWidgetHash } from "../../../../lib/replay";

export const dynamic = "force-dynamic";

// app/api/auth/telegram/route.ts:44-50 — body parse: garbage → 400, never 500
let raw: unknown;
try {
  raw = await req.json();
} catch {
  return Response.json({ error: "bad_request" }, { status: 400 });
}

// app/api/trial/route.ts:15-25 — session gate FIRST, SessionError → generic 401
let telegramId: number;
try {
  telegramId = await requireSession();
} catch (err) {
  if (err instanceof SessionError) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  logger.error({ route: "trial", outcome: "session_error" });
  return Response.json({ error: "internal" }, { status: 500 });
}
```

**Response discipline** (telegram route lines 42, 88-100): `unauthorized()` helper → `{ error: "unauthorized" }` 401 with NO reason oracle; success mints cookie via `buildSessionCookie(token, env.NODE_ENV === "production")` as raw `Set-Cookie` header; unexpected → `{ error: "internal" }` 500 with no details. Login failures (wrong email AND wrong password) → identical 401 `auth.invalidCredentials` analog (no enumeration; D-89 exception applies ONLY to reset-request). PII log discipline: `logger.warn({ route, outcome: "rejected" })` — never email/hash/token.

Routes to create (all follow this skeleton): `POST /api/auth/email/register` (zod email+password min 8 → hash → create → signSession → welcome mail async, never blocks 200), `POST /api/auth/email/login` (rate-limit check → verify → session; 429 with `retryAfterSec`), `POST /api/auth/email/logout` (clear cookie — copy `buildSessionCookie` with `Max-Age=0` variant), `POST /api/auth/email/password/request` (honest no-account per D-89 → distinct 404 `auth.resetNoAccount`), `POST /api/auth/email/password/confirm` (token compare timing-safe → expiry/used checks → set hash + invalidate token), `POST /api/auth/email/link` + `/unlink` (requireSession → accounts service), `POST /api/auth/email/password/change` (requireSession → verify current → set new).

---

### `app/login/page.tsx` (MODIFY — server page, request-response)

**Analog:** itself (lines 1-26) + `app/page.tsx:20-22` (PRIMARY/SECONDARY)

```tsx
// app/login/page.tsx:1-26 — current shape: server page, t() metadata, shell + LoginButton
import LoginButton from '@/components/LoginButton';
import InstallPrompt from '@/components/InstallPrompt';
import { t } from '@/lib/i18n';
export const metadata = { title: `${t('login.title')} — ${t('app.name')}`, };
export default function LoginPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            {t('login.title')}
          </h1>
          ...
        <LoginButton />
        <InstallPrompt />
```

Planner direction (D-91/AUTH-06): narrow column to `mx-auto flex w-full max-w-md flex-col gap-6`; order: `EmailAuthCard` → divider (`auth.orContinue`) → `TelegramWidgetSlot` (wrapping existing `LoginButton` VERBATIM — `postPayload` + httpOnly discipline unchanged) → `InstallPrompt`. Slot: `flex min-h-24 flex-col items-center justify-center gap-3` — NO absolute/fixed positioning. Heading copy updates to `login.title`/`login.text` new values from UI-SPEC copy table.

---

### Client islands `EmailAuthCard` / `PasswordField` / `TelegramWidgetSlot` (NEW — components, request-response)

**Analog:** `components/LoginButton.tsx` (lines 1-109) + `components/CreateTicketForm.tsx` (lines 22-29)

```tsx
// components/LoginButton.tsx:34-52 — postPayload discipline: fetch → error flag → redirect
const postPayload = useCallback(async (payload: unknown) => {
  setError(false);
  let res: Response;
  try {
    res = await fetch(AUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { setError(true); return; }
  if (!res.ok) { setError(true); return; }
  window.location.href = '/';
}, []);
```

```tsx
// components/CreateTicketForm.tsx:22-29 — recipes EmailAuthCard MUST reuse verbatim
const INPUT =
  'h-12 w-full rounded-2xl border border-black/[.08] bg-white px-4 text-base text-black placeholder:text-zinc-500 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500';
const FIELD_LABEL = 'text-sm text-zinc-600 dark:text-zinc-400';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';
```

Planner direction (UI-SPEC §1): `EmailAuthCard` = `'use client'`, mode switch (`?mode=register` deep-link), email trim + `[^@\s]+@[^@\s]+\.[^@\s]+` client check only, `minLength=8`, show/hide 44px toggle, in-flight lock + loading labels, field errors `role="alert"` + `border-red-600/50` ring (no layout shift), generic failure identical for both causes, 429 → `auth.rateLimited` with server `{n}`, success → `window.location.href = '/'`. Client islands NEVER touch the session cookie.

---

### Reset pages + `AccountSection` group (NEW — components, CRUD)

**Analog:** `components/ConfirmPanel.tsx` (lines 1-150) for unlink; `CreateTicketForm` state discipline for reset forms

```tsx
// components/ConfirmPanel.tsx:26-31 — SECONDARY + DESTRUCTIVE recipes for UnlinkConfirmPanel
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';
const DESTRUCTIVE =
  'flex h-11 items-center justify-center rounded-full bg-red-600 px-4 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-400 dark:text-black dark:hover:bg-red-300';

// components/ConfirmPanel.tsx:56-84 — Escape-dismiss + focus-trap; mutation ONLY on second tap
const confirm = useCallback(async () => {
  setPending(true); setError(false);
  try {
    const res = await fetch(url, { method });
    if (!res.ok) throw new Error('device_mutation_failed');
    close(); router.refresh();
  } catch { setError(true); setPending(false); }
}, [close, router, url, method]);
```

Planner direction (UI-SPEC §2-3): `ResetRequestForm`/`ResetConfirmForm` follow CreateTicketForm in-flight/error/retain discipline; token states map to `auth.resetInvalid/resetExpired/resetUsed` panels + `auth.requestNewLink` action; reset-confirm success does NOT auto-login. `AccountSection` is server-rendered with `SkeletonRows` loading + `common.errorLoad`+`common.retry` section-scoped error; `UnlinkConfirmPanel` copies ConfirmPanel anatomy with last-method copy swap (`auth.unlinkLastBody`/`auth.unlinkLastConfirm`); never `window.confirm`. Email row has NO change/remove affordance.

---

### `lib/i18n/messages/ru.ts` (MODIFY — config, transform)

**Analog:** itself + `lib/i18n/index.ts` + `tests/unit/i18n.test.ts`

```typescript
// lib/i18n/messages/ru.ts:16-22 — block pattern new auth.* block follows
login: {
  title: 'Вход через Telegram',
  text: 'Нажмите кнопку ниже, чтобы войти через Telegram. Сессия сохраняется в защищённой cookie.',
  widgetNote: 'Вход через виджет Telegram для браузера.',
  webappNote: 'При входе из бота данные передаются автоматически.',
  error: 'Не удалось войти. Попробуйте ещё раз.',
},

// lib/i18n/index.ts:21-27 — t() with {token} interpolation; tp() for plurals
export function t(key: I18nKey, params?: Record<string, string | number>): string {
```

Planner direction: add FULL `auth.*` block with EXACT keys + RU copy from UI-SPEC Copywriting Contract (§ copy table: `auth.loginCta` … `auth.currentPasswordWrong`, ~50 keys) + update `login.title`/`login.text`. Constraint: `tests/unit/i18n.test.ts:73-77` FAILS on unused keys and `67-71` on missing keys — every added key MUST be referenced by a `t('...')` literal in source, and every `t()` literal must exist. `{n}`/`{id}` via `t()` params only.

---

### Tests (NEW — test, request-response)

**Analog:** `tests/unit/session.test.ts` (lines 1-35) + `tests/integration/auth-flow.test.ts` (lines 1-88)

```typescript
// tests/unit/session.test.ts:1-8 — throwaway-secret vector pattern (never real secrets)
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../../lib/auth";
const SECRET = "unit-vector-throwaway-secret-32ch!!";
const WRONG_SECRET = "wrong-throwaway-secret-32-chars!!!!";

// tests/integration/auth-flow.test.ts:39-47 — direct POST-import route test + cleanup
function postJson(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost/api/auth/telegram", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}
// beforeAll/afterAll cleanup via prisma.deleteMany
```

Planner direction: `tests/unit/password.test.ts` (hash-verify roundtrip, wrong-password reject, garbage-hash → false, min-8 enforcement), `tests/unit/auth-session-userid.test.ts` (new `{uid,tid?}` roundtrip + legacy `{tid}` back-compat), `tests/integration/email-auth-flow.test.ts` (register → login → session cookie → users row; replay/double-register → 409; wrong-password → 401 identical; rate-limit → 429 with retryAfter; reset request/confirm incl. expiry/used paths; link merge incl. trialUsed OR). DB `setwhite` per CONTEXT conventions; dummy env throwaways only.

---

### `lib/bot.ts` (UNTOUCHED — negative analog, D-94)

**Analog:** `lib/bot.ts` `/start` upsert (lines 48-86). Bot stays TG-only: NO email form, reset link, or linking UI in the bot. Trial/money paths keep calling `startTrial(BigInt(telegramId))` / `createOrder({ telegramId })` — planner must ensure the accounts layer resolves `telegramId → userId` internally so bot call-sites do NOT change.

```typescript
// lib/bot.ts:53-68 — upsert-by-telegramId pattern bot keeps using
await prisma.user.upsert({
  where: { telegramId: BigInt(telegramId) },
  update: { ... },
  create: { telegramId: BigInt(telegramId), ... },
});
```

Note: with nullable `telegramId`, this `upsert(where: { telegramId })` still works (non-null value in where). Planner must NOT rewrite bot handlers to userId.

## Shared Patterns

### Authentication (all email routes + session consumers)
**Source:** `lib/auth.ts` + `lib/session.ts` + `app/api/auth/telegram/route.ts`
- Same httpOnly cookie (`SESSION_COOKIE`, `buildSessionCookie`, Secure-in-prod) for email and Telegram (D-86); logout is shared (clear-cookie).
- Gate FIRST (`requireSession` → `SessionError→401`); zod body second; service call third; typed-error map fourth; generic 500 last.
- `export const dynamic = "force-dynamic"` on every auth route.

### Error Handling (all routes + services)
**Source:** `app/api/trial/route.ts:34-51` + `app/api/auth/telegram/route.ts:42`
- Typed codes only (`trial_used`, `unauthorized`, `internal`, `rate_limited`+`retryAfter`); NEVER raw provider/SMTP/DB text, HTTP codes, hashes, or token values in responses (D-19/D-24, UI-SPEC copy contract).
- RU user copy lives ONLY in `ru.ts` under `auth.*`; components reference keys.
- PII-safe logs: `logger.warn({ route, outcome })` / ids only — never email/token/hash/JWT (cf. `lib/logger.ts:1-4` comment).

### Validation (all POST routes)
**Source:** `app/api/auth/telegram/route.ts:28-40` (`z.looseObject` for Telegram-signed payloads; strict `z.object` elsewhere)
- Email routes use strict zod: `z.string().trim().email().max(254)`, `z.string().min(8).max(256)`; malformed → 400 `bad_request`, auth failures → 401 (never 400-vs-401 oracle beyond shape).
- Client-side checks are UX-only (shape + non-blank); server re-validates everything.

### Atomic DB Claims (trial, link/merge, reset consume, rate-limit)
**Source:** `lib/keys-service.ts:296-314` (`claimTrial` + guarded rollback)
- One-statement `updateMany` + `count === 1` branch for every one-time claim (trial, reset-token use, rate-limit lock).
- Token/flag invalidation inside the same transaction as the effect (reset: set-hash + mark-used atomically; merge: re-point + delete-loser in `$transaction`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/mail.ts` SMTP transport internals | service | request-response | No SMTP/mail code exists; `nodemailer` not in `package.json`. Planner uses STACK.md + nodemailer docs; keep the `sendMail` seam narrow so provider swap (D-87 costly) is contained. |
| Argon2id hash parameters | utility | transform | No hashing lib installed (`argon2`/`@node-rs/argon2` absent from `package.json`). Planner pins OWASP params (memory/time/parallelism) at plan time. |
| Login backoff persistence shape | middleware | request-response | No per-email attempt table exists; closest is `ReplayCache` consume + `worker.ts` backoff. Planner designs the new table/model. |

**New dependencies required (none in `package.json` today):** `argon2` (or `@node-rs/argon2`) for D-83, `nodemailer` (+ `@types/nodemailer`) for D-87. Planner pins versions and verifies APIs.

## Metadata

**Analog search scope:** `lib/`, `app/api/auth/`, `app/api/trial/`, `app/login/`, `components/`, `prisma/`, `tests/unit/`, `tests/integration/`
**Files scanned:** ~30 (3–5 strong matches per new file; stopped per early-stopping rule)
**Pattern extraction date:** 2026-10-05

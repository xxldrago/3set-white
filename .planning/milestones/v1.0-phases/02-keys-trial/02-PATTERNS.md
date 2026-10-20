# Phase 2: Keys & Trial - Pattern Map

**Mapped:** 2026-10-01
**Files analyzed:** 35 (new + modified)
**Analogs found:** 33 / 35 — Phase 1 shipped a real, tracked shell; only `lib/artemida.ts` and `lib/qr.ts` have no role+flow peer (both are server-only externals, mapped to `lib/auth.ts` + RESEARCH verbatim recipes).

> **Tracked-source gate (#3645):** every analog path below was verified tracked with
> `git ls-files -- tests lib app components prisma` (non-empty output). No gitignored
> install/runtime mirror is named. `lib/artemida.ts` has no repo analog by design —
> COPY the researched contract from `02-RESEARCH.md`, not a mirror.

> **API-key reality:** `ARTEMIDA_API_KEY` is absent from the environment. Every ARTEMIDA
> response schema in this phase is `[ASSUMED]` until the `checkpoint:human-verify` live
> probe runs. Field-name mismatches must fail in ONE file (`lib/artemida.ts`) — never leak
> into routes/UI. Keep the checkpoint as the first executable task (RESEARCH Open Q1).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/artemida.ts` | service (HTTP client) | request-response + CRUD | `lib/auth.ts` (server-only typed module) | role-match |
| `lib/keys-service.ts` | service | CRUD + request-response | `lib/replay.ts` + `lib/bot.ts` (prisma) | role-match |
| `lib/session.ts` (route-side `requireSession`) | middleware | request-response | `lib/auth.ts` (`verifySession`/`SESSION_COOKIE`) | role-match |
| `lib/qr.ts` | utility | transform | none (external `qrcode` contract) | no-analog |
| `lib/i18n/index.ts` (modify) | utility | transform | itself | exact |
| `lib/i18n/messages/ru.ts` (modify) | utility | static dict | itself | exact |
| `lib/env.ts` (modify) | utility (config) | boot validation | itself | exact |
| `lib/bot.ts` (modify) | service | event-driven | itself | exact |
| `prisma/schema.prisma` (modify) | model | DDL | itself | exact |
| `prisma/migrations/<ts>_keys_trial/migration.sql` (new) | migration | DDL | `prisma/migrations/20260930125017_foundation/migration.sql` | exact |
| `app/api/pricing/route.ts` | route (controller) | request-response | `app/api/auth/telegram/route.ts` | exact |
| `app/api/trial/route.ts` | route (controller) | request-response | `app/api/auth/telegram/route.ts` | exact |
| `app/api/keys/route.ts` | route (controller) | request-response + background reval | `app/api/auth/telegram/route.ts` | exact |
| `app/api/keys/[id]/route.ts` | route (controller) | request-response | `app/api/auth/telegram/route.ts` | exact |
| `app/api/keys/[id]/subscription/route.ts` | route (controller) | request-response | `app/api/auth/telegram/route.ts` | exact |
| `app/api/keys/[id]/devices/route.ts` | route (controller) | request-response | `app/api/auth/telegram/route.ts` | exact |
| `app/api/keys/[id]/devices/[token]/route.ts` | route (controller) | request-response (DELETE) | `app/api/telegram/webhook/[secret]/route.ts` (async params) | role-match |
| `app/api/keys/[id]/devices/clear/route.ts` | route (controller) | request-response (POST) | `app/api/auth/telegram/route.ts` | exact |
| `app/page.tsx` (modify) | component (page) | request-response (RSC) | itself | exact |
| `app/keys/[id]/page.tsx` | component (page) | request-response (RSC) | `app/guides/page.tsx` | role-match |
| `components/SubscriptionCard.tsx` | component (presentational) | transform | card markup in `app/page.tsx` | role-match |
| `components/TariffPicker.tsx` | component (client) | request-response | `components/LoginButton.tsx` | exact |
| `components/TrialButton.tsx` | component (client) | request-response | `components/LoginButton.tsx` | exact |
| `components/QrSvg.tsx` | component (server) | transform | `components/InstallPrompt.tsx` (shape) | role-match |
| `components/ConfirmPanel.tsx` | component (client) | event-driven | `components/InstallPrompt.tsx` | role-match |
| `package.json` (modify) | config | build | itself | exact |
| `.env.example` (modify) | config | — | itself | exact |
| `app/globals.css` (modify) | config (style) | — | itself | exact |
| `tests/unit/artemida-client.test.ts` | test | unit | `tests/unit/session.test.ts` | role-match |
| `tests/unit/trial-claim.test.ts` | test | unit (integration w/ Prisma) | `tests/integration/auth-flow.test.ts` | role-match |
| `tests/unit/pricing-route.test.ts` | test | unit (route) | `tests/integration/auth-flow.test.ts` | role-match |
| `tests/unit/keys-service.test.ts` | test | unit | `tests/integration/auth-flow.test.ts` | role-match |
| `tests/unit/qr.test.ts` | test | unit | `tests/unit/session.test.ts` | role-match |
| `tests/unit/devices-route.test.ts` | test | unit (route) | `tests/integration/auth-flow.test.ts` | role-match |
| `tests/unit/i18n.test.ts` (modify) | test | unit | itself | exact |

## Pattern Assignments

### `lib/artemida.ts` (service, request-response + CRUD)

**Analog:** `lib/auth.ts` — the only existing server-only, dependency-light, typed module
with graceful failure semantics. **Copy its shape** (single responsibility, pure-ish, no
`next/headers`, secrets passed via `env`), then apply RESEARCH Pattern 1 for the transport.

**Module header / server-only discipline** (`lib/auth.ts:1-9`):
```typescript
// Pure module by design: node:crypto + jose only, secrets passed as params.
// No next/headers, no env import — unit tests and the integration flow import
// this without a Next runtime.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
```

**Never-throw boundary helpers** (`lib/auth.ts:34-48`, `128-139`) — adapt to the
envelope parser: garbage → typed failure, not an exception:
```typescript
function timingSafeEqualHex(computed: Buffer, receivedHex: unknown): boolean {
  if (typeof receivedHex !== "string" || receivedHex.length === 0) return false;
  // ... length guard + try/catch, returns false
}

export async function verifySession(token: string, secret: string): Promise<number | null> {
  try { /* ... */ return typeof payload.tid === "number" ? payload.tid : null; }
  catch { return null; }
}
```

**Core transport (COPY VERBATIM from `02-RESEARCH.md` lines 248-288, Pattern 1):**
`ArtemidaError{code,status,retryAfterSec,requestId}`, `errorEnvelope` accepting BOTH
`error:{code,message}` AND `error:"string"` (404 shape), `mapStatus()` for
401/402/409/429/502/503, `crypto.randomUUID()` `Idempotency-Key` on POST/DELETE,
`p-retry` retrying only 429/502/503 and honoring `Retry-After`. This is the ONE place all
guessed field names live; use tolerant `.passthrough()` zod schemas + a normalized internal
model until the probe confirms.

**Config access:** `import { env } from "./env"` (see `lib/env.ts` pattern below); never
`process.env.ARTEMIDA_API_KEY` inline.

---

### `lib/keys-service.ts` (service, CRUD + request-response)

**Analog:** `lib/replay.ts` (tiny Prisma service, try/catch → semantic boolean) +
`lib/bot.ts:28-43` (Prisma upsert shape).

**Service-over-Prisma pattern** (`lib/replay.ts:5-14`):
```typescript
import { prisma } from "./prisma";

export async function consumeWidgetHash(hash: string): Promise<boolean> {
  try {
    await prisma.replayCache.create({ data: { hash } });
    return true;
  } catch {
    return false; // duplicate → reject as replay
  }
}
```

**Upsert-by-unique pattern to copy for `revalidateKeys` cache writes** (`lib/bot.ts:28-43`):
```typescript
await prisma.user.upsert({
  where: { telegramId: BigInt(telegramId) },
  update: { /* ... */ },
  create: { /* ... */ },
});
```

**Atomic trial claim + rollback (COPY from `02-RESEARCH.md` lines 296-327, Pattern 2):**
`claimTrial` → `updateMany({ where:{ telegramId, trialUsed:false }, data:{ trialUsed:true } })`
branch on `count === 1`; `releaseTrialOnFailure` guarded by `trialKeyId: null` so a recorded
success can never be reopened; `startTrial` orchestrates claim → `artemida.createTrial` →
persist `trialKeyId`, rollback on failure. **This module is the single read/write path
shared by bot and BFF routes** (RESEARCH "Bot + PWA shared path").

**Cache-first list with background revalidation** — see `app/api/keys/route.ts` below for the
`after()` wiring; `listKeys` reads `keys_cache` and derives status from `expiresAt` vs `now`
(RESEARCH Pattern 3 + Pitfall 6), never from a stale `status` string.

---

### `lib/session.ts` (middleware, request-response) — route-side `requireSession`

**Analog:** `lib/auth.ts` (`verifySession` + `SESSION_COOKIE`). **No `requireSession` exists
today** — RESEARCH lines 547 flags this. Add a thin route-side helper; do NOT change the pure
`lib/auth.ts` module.

**Cookie read → verify → throw 401** (built from `lib/auth.ts:14,128-139`):
```typescript
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
import { env } from "./env";

/** Resolve the caller's telegram id or throw a typed 401 for the route to map. */
export async function requireSession(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const telegramId = await verifySession(token, env.SESSION_SECRET);
  if (telegramId === null) throw new SessionError();
  return telegramId;
}
```
Every BFF route calls this first and resolves `telegramId` server-side — never trust a
client-supplied id (Security Domain V4).

---

### `lib/qr.ts` (utility, transform)

**Analog:** none in repo — pure function. Follow `lib/auth.ts` module style (single exported
async fn, no side effects) but the body is the RESEARCH-verified external contract.

**COPY from `02-RESEARCH.md` lines 357-369 (Pattern 4):**
```typescript
import QRCode from "qrcode";

export async function renderSubscriptionQr(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 256 });
}
```
**Correction to UI-SPEC:** there is no `QRCode.toSvg()` — use `toString(..., { type: "svg" })`
(RESEARCH Pitfall 3). `qrcode` main entry is CommonJS with `moduleResolution: "bundler"`
(`tsconfig.json:11`) — default import works.

---

### `lib/i18n/index.ts` (modify — utility, transform)

**Analog:** itself. Extend, don't replace.

**Current shape** (lines 20-22):
```typescript
export function t(key: I18nKey): string {
  return lookup(key) ?? key;
}
```

**Extend to interpolation + RU plurals** (RESEARCH lines 490-505):
```typescript
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const raw = lookup(key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}
export function tp(base: string, n: number): string {
  const cat = new Intl.PluralRules("ru").select(n); // one|few|many|other
  const suffix = cat === "one" ? "One" : cat === "few" ? "Few" : "Many";
  return t(`${base}${suffix}` as I18nKey, { n });
}
```
`lookup`/`flattenMessages`/`allKeys` stay as-is (lines 6-13, 62-79).

---

### `lib/i18n/messages/ru.ts` (modify — utility, static dict)

**Analog:** itself. Add the full Phase 2 catalog from `02-UI-SPEC.md` lines 131-187 as nested
keys, matching the existing object convention (lines 5-46) so `LeafPaths`/`I18nKey`
(line 50-59) auto-extends. Pluralized keys must be declared as `One`/`Few`/`Many` triplets
(e.g. `subs.countOne/Few/Many`) for `tp()` to resolve. **Every** new visible string goes here
first; components reference keys only.

---

### `lib/env.ts` (modify — utility, boot validation)

**Analog:** itself. Add two fields to the existing zod schema (lines 7-18), fail-fast intact.

**Current schema pattern** (lines 7-18):
```typescript
const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required (prod bot via BotFather)"),
  // ...
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
```
**Add (D-20):** `ARTEMIDA_API_KEY: z.string().min(1, "ARTEMIDA_API_KEY is required")` and
`ARTEMIDA_BASE_URL: z.string().url().default("https://artemida.cc/v1")`. Server-only — never
`NEXT_PUBLIC_*`. Add matching placeholders in `.env.example` (lines 1-16 convention:
comment + `placeholder-here`).

---

### `lib/bot.ts` (modify — service, event-driven)

**Analog:** itself. Existing `/start` handler (lines 23-58) is the template for new
inline-keyboard branches.

**Handler + i18n + PII-safe logging pattern** (lines 44-57):
```typescript
logger.info({ updateId: ctx.update.update_id, telegramId, outcome: "start-upserted" });
await ctx.reply(t("bot.welcome"), {
  reply_markup: {
    keyboard: [[{ text: t("bot.menuKeys") }], [{ text: t("bot.menuGuides") }, { text: t("bot.menuHelp") }]],
    resize_keyboard: true,
  },
});
```
Phase 2 adds "Попробовать" (→ `startTrial`), "Мои ключи" (→ `listKeys` + `revalidateKeys`),
and tariff inline-keyboard callbacks. **These call the SAME `lib/keys-service.ts` functions as
the BFF routes — no duplicate Prisma or `fetch` in the bot.** Keep the polling-launch guard
(lines 60-70) untouched.

---

### `prisma/schema.prisma` (modify — model, DDL)

**Analog:** itself. Extend `User` and `KeyCache` in place.

**Current baseline to extend** (`schema.prisma:19-44`):
```prisma
model User {
  id         Int      @id @default(autoincrement())
  telegramId BigInt   @unique @map("telegram_id")
  chatId     BigInt?  @map("chat_id")
  firstName  String?  @map("first_name")
  lastName   String?  @map("last_name")
  username   String?
  createdAt  DateTime @default(now()) @map("created_at")
  keys       KeyCache[]
  @@map("users")
}
model KeyCache {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  keyId     String   @map("key_id")
  status    String
  expiresAt DateTime? @map("expires_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@unique([userId, keyId])
  @@map("keys_cache")
}
```
**Add per RESEARCH lines 445-484:** `User.trialUsed Boolean @default(false) @map("trial_used")`
+ `User.trialKeyId String? @map("trial_key_id")`; `KeyCache.{name,isTrial,deviceLimit,devices,
trafficUsedBytes,trafficLimitBytes,subscriptionUrl,customerRef,lastSyncedAt}`. Keep
`@@unique([userId, keyId])` and `onDelete: Cascade`.

---

### `prisma/migrations/<ts>_keys_trial/migration.sql` (new — migration, DDL)

**Analog:** `prisma/migrations/20260930125017_foundation/migration.sql` (tracked).

**Pattern** (foundation migration lines 1-41): `ALTER TABLE ... ADD COLUMN` for `users`;
`ALTER TABLE` / `CREATE TABLE` changes for `keys_cache`; `CREATE UNIQUE INDEX` for any new
unique; `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE CASCADE ON UPDATE
CASCADE` if the relation changes. **Generate via `prisma migrate dev`, never hand-author**
(RESEARCH Environment Availability), and commit the generated SQL alongside `schema.prisma`.
Prod deploy uses `prisma migrate deploy` (Dockerfile pattern).

---

### `app/api/pricing/route.ts` (route, request-response)

**Analog:** `app/api/auth/telegram/route.ts` — the BFF contract all new routes copy.

**Imports + dynamic** (lines 12-24):
```typescript
import { z } from "zod";
// relative imports in routes (no @/ alias used in existing routes):
import { env } from "../../../../lib/env";
import { logger } from "../../../../lib/logger";

export const dynamic = "force-dynamic";
```
> Note: existing routes use **relative** `../../..` imports, not `@/` (only pages/components
> use `@/`). Match whichever the file's existing peers use; new API routes should mirror the
> auth route's relative style for consistency.

**Validation + try/catch + generic errors** (lines 42-50, 98-100):
```typescript
const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
// ...
try {
  /* ... */
} catch {
  return Response.json({ error: "internal" }, { status: 500 });
}
```
**Full route body:** COPY from `02-RESEARCH.md` lines 511-545 (BFF route shape) — `requireSession`
first, `z.coerce` for query `days` (∈ 7/30/90) + `devices` (1–10), `artemida.getPricing`
returning the exact value (D-28), `ArtemidaError` → status mapping + `logger.warn({route,code,
requestId})` (never the provider message).

---

### `app/api/trial/route.ts` (route, request-response)

**Analog:** `app/api/auth/telegram/route.ts`.

**Same BFF discipline** (auth route lines 1-24, 42). Body per RESEARCH lines 551-563:
```typescript
export async function POST() {
  const telegramId = await requireSession();
  const result = await startTrial(BigInt(telegramId));
  if (result.kind === "already_used")
    return Response.json({ ok: false, reason: "trial_used" }, { status: 409 });
  if (result.kind === "created")
    return Response.json({ ok: true, key: result.key });
}
```
**D-24:** map `reason: "trial_used"` to `t('trial.usedHeading')`/`t('trial.usedBody')` in the UI;
never proxy the provider error. On 502/429 the service rolls back `trialUsed` (D-23).

---

### `app/api/keys/route.ts` (route, request-response + background revalidation)

**Analog:** `app/api/auth/telegram/route.ts` for the route shell; `after()` wiring is new.

**COPY from `02-RESEARCH.md` lines 335-349 (Pattern 3):**
```typescript
import { after } from "next/server";
import { requireSession } from "@/lib/session";
import { listKeys, revalidateKeys } from "@/lib/keys-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const telegramId = await requireSession();
  const cached = await listKeys(telegramId);
  after(async () => { await revalidateKeys(telegramId); });
  return Response.json({ keys: cached });
}
```
`after` runs post-response and survives response failure; it does not itself force the route
dynamic (`force-dynamic` does). Scope every query by the session's `userId` (V4).

---

### `app/api/keys/[id]/route.ts` + `.../subscription/route.ts` + `.../devices/route.ts` + `.../devices/clear/route.ts` (routes, request-response)

**Analog:** `app/api/auth/telegram/route.ts` (route shell) + `app/api/telegram/webhook/[secret]/route.ts` (async `params`).

**Async params pattern** (webhook route lines 18-22):
```typescript
export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
): Promise<Response> {
  const { secret } = await params;
```
Phase 2 routes use `{ params }: { params: Promise<{ id: string }> }` (Next 16 requires
`await params` — RESEARCH State of the Art). Validate `id`/query with zod; `requireSession()`
first; ownership join on every detail/device read (IDOR mitigation, V4); `ArtemidaError` →
typed JSON, generic 500 otherwise (auth route lines 42, 98-100). Destructive `delete`/`clear`
are POST/DELETE through the BFF — client confirmation is UI-only (D-32).

---

### `app/api/keys/[id]/devices/[token]/route.ts` (route, request-response DELETE)

**Analog:** `app/api/telegram/webhook/[secret]/route.ts` (two-segment async params).

Same as above but `{ params }: { params: Promise<{ id: string; token: string }> }`; zod-validate
both segments before any provider call; DELETE requires session + ownership. No body.

---

### `app/page.tsx` (modify — page, RSC)

**Analog:** itself + card/button classes reused.

**Session branch + shell** (lines 9-16):
```typescript
const store = await cookies();
const session = store.get('3set_session')?.value;
const loggedIn = Boolean(session);
```
Replace cookie-presence stub with `verifySession` (via `requireSession`/graceful variant) and
render «Мои подписки» from `listKeys` (cache-first). Keep the wrapper and card tokens exactly
(UI-SPEC reuse list, lines 44-48):
```
wrapper: flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black
main:    flex flex-1 w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-16
card:    rounded-2xl border border-black/10 p-6 dark:border-white/15
primary: h-12 rounded-full bg-foreground px-5 text-background transition-colors
```
Pull card markup into `components/SubscriptionCard.tsx` rather than duplicating. Empty/loading/
error states per UI-SPEC "UI Considerations" (lines 202-218).

---

### `app/keys/[id]/page.tsx` (new — page, RSC)

**Analog:** `app/guides/page.tsx` (`app/guides/page.tsx:9-43`) — static RSC shell with header,
card sections, back-link.

**Shell + card section pattern** (guides lines 10-24, 34-41):
```tsx
<div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
  <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
        {t('...')}
      </h1>
    </header>
    <section className="flex flex-col gap-2 rounded-2xl border border-black/10 p-6 dark:border-white/15">
      ...
    </section>
    <Link href="/" className="...">{t('guides.back')}</Link>
  </main>
</div>
```
This page is `async` (await `params`, resolve session, `getSubscription` + `renderSubscriptionQr`).
Render the server-produced SVG via `components/QrSvg.tsx`; never an empty QR (UI-SPEC partial
state, line 212). Deep-link `key.guidesCta` → `/guides` (TRIAL-03).

---

### `components/TariffPicker.tsx` (new — client, request-response)

**Analog:** `components/LoginButton.tsx` — the canonical client fetch/state/error pattern.

**Copy this structure** (LoginButton lines 1-4, 30-52, 102-106):
```tsx
'use client';
import { useCallback, useState } from 'react';
import { t } from '@/lib/i18n';

export default function TariffPicker() {
  const [error, setError] = useState(false);
  // ...
  const fetchPrice = useCallback(async (days: number, devices: number) => {
    setError(false);
    let res: Response;
    try {
      res = await fetch(`/api/pricing?days=${days}&devices=${devices}`);
    } catch { setError(true); return; }
    if (!res.ok) { setError(true); return; }
    /* setPrice(...) */
  }, []);
  // ...
  {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('pricing.error')}</p>}
}
```
**D-27/D-28:** live price on device change (no submit); debounce + cancel in-flight requests
(RESEARCH Pitfall 7 — 429 retry storms); display the provider number verbatim with
`tabular-nums`. Use UI-SPEC tokens: primary CTA `h-12`, secondary `h-11`, 44px min touch.

---

### `components/TrialButton.tsx` (new — client, request-response)

**Analog:** `components/LoginButton.tsx`.

Same `'use client'` + `useState` + fetch + `role="alert"` pattern. In-flight lock disables the
CTA and swaps to `t('trial.ctaLoading')` (UI-SPEC loading, line 208); on `409`
`{reason:"trial_used"}` render `t('trial.usedHeading')`/`t('trial.usedBody')` + `t('key.buyCta')`
CTA (D-24) — never raw API text. Disable renew/upgrade on a trial key (PITFALLS §6).

---

### `components/SubscriptionCard.tsx` (new — presentational component, transform)

**Analog:** card markup in `app/page.tsx:26-38` + small-button layout in `InstallPrompt.tsx:34-53`.

Presentational RSC: name, status badge, expiry, device usage. Status derives from `expiresAt` vs
`now` (Pitfall 6), neutral `status.unknown` when absent. Trial cards render the amber `trial.badge`
chip on every occurrence (UI-SPEC color, lines 114-123). Order active→expiring→expired→pending.
Reuse the card class token exactly; badges are tinted text chips, never icon-only.

---

### `components/QrSvg.tsx` (new — server component, transform)

**Analog:** `components/InstallPrompt.tsx` for component shape (props → conditional render →
null-safe). No client directive — server-only.

```tsx
export default function QrSvg({ svg }: { svg: string }) {
  // svg is trusted, locally generated by lib/qr.ts; inert inline markup.
  return <div className="..." dangerouslySetInnerHTML={{ __html: svg }} />;
}
```
Never accepts a URL to fetch (no third-party image URL — UI-SPEC contract, line 31). If
`subscriptionUrl` is missing, the parent hides this and shows `t('key.linkUnavailable')`.

---

### `components/ConfirmPanel.tsx` (new — client, event-driven)

**Analog:** `components/InstallPrompt.tsx` (local `useState` dismiss/confirm, conditional
render, two-button row) — lines 13-33, 34-53.

**D-32:** inline confirmation panel **inside** the affected card/row — not `window.confirm`,
not `<dialog>`, not an alert. Manual `open` state, `Escape`/Cancel closes with **no request**;
only the second (red) tap fires the mutation. Focus stays in the panel while open. Reuse
InstallPrompt's two-button layout (secondary `h-11` border + red-filled confirm).

---

### `package.json` + `.env.example` + `app/globals.css` (modify — config)

- **`package.json`** (existing shape lines 13-38): add deps `qrcode@^1.5.4`, `p-retry@^7.1.1`;
  dev dep `@types/qrcode@^1.5.6`. **Never bare-install `prisma`** (v8-RC). Keep
  `"test": "vitest run tests/unit"` (line 10).
- **`.env.example`** (lines 1-16 convention: `# comment` + placeholder): append
  `ARTEMIDA_API_KEY=your-artemida-api-key-here` and
  `ARTEMIDA_BASE_URL=https://artemida.cc/v1`. Placeholders only; never real values.
- **`app/globals.css`**: remove the `font-family: Arial, Helvetica, sans-serif` body override
  that silently beats the loaded Geist face (UI-SPEC "Font rationale", lines 29) and apply Geist
  via the existing `--font-sans`/`font-sans` token.

---

### Tests (`tests/unit/*.test.ts` — new + modify)

**Analogs:** pure-vector style from `tests/unit/session.test.ts`; route/Prisma integration
style from `tests/integration/auth-flow.test.ts`.

**Pure-function vectors** (`tests/unit/session.test.ts:1-27`): throwaway secret constant,
`describe/it`, `await expect(...).resolves.toBe...`, forged-input cases. Use for
`artemida-client.test.ts` (envelope parsing, status→code, no-retry-on-4xx, retry on 429/502/503,
`Retry-After`) with an injected fake `fetch`, and `qr.test.ts` (`renderSubscriptionQr` returns
`<svg`, encodes the URL, and `toSvg` is NOT called).

**Route/flow integration** (`tests/integration/auth-flow.test.ts:7,34-47,54-56,73-78`): import
the route's `POST` and call it with a `new Request(...)`; `beforeAll/afterAll` DB cleanup via
`prisma.deleteMany`; assert status + JSON + persisted rows. Use for `trial-claim.test.ts`
(concurrent `claimTrial` → one winner; rollback guarded by `trialKeyId: null`),
`pricing-route.test.ts` (query validation + 401 without session),
`keys-service.test.ts` (cache→render mapping, status from `expiresAt`, trial badge),
`devices-route.test.ts` (session required, token path param validated).

**Extend `tests/unit/i18n.test.ts`** — current scanner regex (line 35) only matches `t('key')`:
```typescript
const re = /\bt\(\s*['"]([A-Za-z0-9_.]+)['"]\s*\)/g;   // ← BREAKS on t('key', {n})
```
Widen to allow an optional params argument (`t\(\s*['"]([A-Za-z0-9_.]+)['"][^)]*\)`) and add
interpolation + RU plural-category assertions, or the "no unused keys" test goes red the moment
`lib/i18n/index.ts` gains params (RESEARCH Pitfall 2).

## Shared Patterns

### Session-gated BFF (apply to all `app/api/**/*.ts`)
**Source:** `app/api/auth/telegram/route.ts` (lines 12-24, 42-50) + `lib/auth.ts:14,128-139`.
- Every route: `export const dynamic = "force-dynamic"`, `requireSession()` first, zod on
  query/body AND on every ARTEMIDA response, `Response.json(...)` with generic
  `{error:"unauthorized"|"bad_request"|"internal"}` — no reason oracle; unexpected errors are
  `catch { return ... 500 }` (not a thrown 500). Resolve `telegramId` server-side; scope all
  data by `userId` (V4 IDOR).
- Async route `params` are Promises — `const { id } = await params` (`webhook route:20-22`).

### Error mapping + logging (apply to `lib/artemida.ts` + all routes)
**Source:** `lib/logger.ts:4-8` (pino, no `console.*`) + RESEARCH Pattern 1 / Security V7.
- Branch on `ArtemidaError.code`, never parse provider text; map 401/402/409/429/502/503.
- Log `{route, code, requestId, outcome}` only — never `ARTEMIDA_API_KEY`, `Authorization`,
  or full provider bodies (RESEARCH Pitfall 8). `logger.warn` on expected failures,
  `logger.error` on unexpected.

### Prisma access (apply to `lib/keys-service.ts`, `lib/bot.ts`, integration tests)
**Source:** `lib/prisma.ts` singleton (lines 14-20), `lib/replay.ts:5-14`, `lib/bot.ts:28-43`.
- Import the shared `prisma` singleton; never `new PrismaClient()` in a route/test.
- Reads for the cabinet go through `keys_cache` (cache-first, D-29); ARTEMIDA owns the truth.
- Atomic writes use `updateMany({where:{...guard}})` + branch on `count` (D-22), never
  read-then-write.

### i18n (apply to every user-visible string in routes, bot, components, pages)
**Source:** `lib/i18n/index.ts:20-22`, `lib/i18n/messages/ru.ts:5-59`, `tests/unit/i18n.test.ts:35`.
- Add the key to `ru.ts` first, reference by key only; never a hardcoded RU/EN literal and
  never a raw API/status string (D-19/D-24).
- Extending `t()` to take params REQUIRES widening the i18n test regex in the same wave.

### UI shell / tokens (apply to all pages + card components)
**Source:** `app/page.tsx:14-16,26-38`, `app/guides/page.tsx:10-24`, `components/InstallPrompt.tsx:34-53`.
- Reuse the exact wrapper/main/card/primary/secondary class tokens (UI-SPEC reuse list). New
  controls use `h-11`/`h-12` (not `h-10`) and the declared type scale (`text-sm/base/xl/3xl`);
  `font-medium` is legacy — emphasis is `font-semibold`. `tabular-nums` on price/traffic figures.

## No Analog Found

Files with no close match; planner MUST use `02-RESEARCH.md` recipes instead:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/artemida.ts` | service (HTTP client) | request-response | No HTTP client exists in the repo; transport/idempotency/retry contract is RESEARCH Pattern 1 (lines 248-288). Closest *shape* peer is `lib/auth.ts`. |
| `lib/qr.ts` | utility | transform | No transform util in repo; `QRCode.toString(...,{type:'svg'})` is an external API contract (RESEARCH Pattern 4, lines 357-369). |

> `lib/artemida.ts` still gets a role-match analog (`lib/auth.ts`) for module/error-shape
> discipline; the transport body itself is RESEARCH-sourced because no first-party peer exists.

## Metadata

**Analog search scope:** `lib/`, `app/`, `components/`, `prisma/`, `tests/` (tracked tree only).
**Files scanned:** 14 first-party source files read in full + `02-RESEARCH.md` (verbatim recipes).
**Tracked-source gate:** verified — `git ls-files -- tests lib app components prisma` lists every
named analog; no mirror paths emitted.
**Pattern extraction date:** 2026-10-01
**Valid until:** 2026-10-31 (ARTEMIDA response shapes are `[ASSUMED]`; re-probe at execution;
Prisma/Next pins may drift — re-check `dist-tags` at Phase 2 execution).

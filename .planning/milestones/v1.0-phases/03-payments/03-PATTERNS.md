# Phase 3: Payments - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 34 (18 new, 16 modified, incl. Wave-0 tests)
**Analogs found:** 30 / 34 (4 have no close analog — worker/instrumentation class)

> **Tracked-source gate (#3645):** every analog path below is git-TRACKED source (verified with `git ls-files`). No `.gsd/capabilities/**` install mirrors are referenced. New paths (e.g. `lib/platega.ts`) are deliberately named as the files to create, not as existing analogs.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/platega.ts` | service (external client) | request-response | `lib/artemida.ts` | exact |
| `lib/orders-service.ts` | service | CRUD + state machine | `lib/keys-service.ts` | role-match |
| `lib/outbox.ts` | service (queue helper) | DB queue / atomic claim | `lib/keys-service.ts` (`claimTrial`) | role-match |
| `lib/worker.ts` | service (worker loop) | event-driven / batch | `lib/bot.ts` (singleton guard) + `lib/keys-service.ts` (claim) | partial |
| `instrumentation.ts` (root) | config / bootstrap | startup hook | `lib/bot.ts` launch guard (lines 272-283) | partial |
| `lib/artemida.ts` (MODIFY: `createKey` + `idempotencyKey`) | service | request-response | itself (`renewKey`, `request()`) | exact |
| `lib/env.ts` (MODIFY: Platega + APP_BASE_URL) | config | fail-fast parse | itself | exact |
| `lib/qr.ts` (MODIFY: `renderSubscriptionQrPng`) | utility | transform (PNG) | itself (`renderSubscriptionQr`) | exact |
| `lib/i18n/messages/ru.ts` (MODIFY: pay/renew/upgrade/bot keys) | config (i18n) | static dictionary | itself | exact |
| `lib/bot.ts` (MODIFY: pay/renew/upgrade/history + QR push) | component (bot) | event-driven | itself | exact |
| `app/api/orders/route.ts` | controller (BFF) | request-response / CRUD | `app/api/trial/route.ts` + `app/api/pricing/route.ts` | exact |
| `app/api/orders/[orderId]/route.ts` | controller (BFF) | request-response | `app/api/keys/[id]/route.ts` | exact |
| `app/api/platega/callback/route.ts` | controller (public webhook) | event-driven / webhook | `app/api/telegram/webhook/[secret]/route.ts` | role-match |
| `app/api/pricing/route.ts` (MODIFY: renew/upgrade quote) | controller (BFF) | request-response | itself | exact |
| `app/payments/page.tsx` | page (RSC) | CRUD read | `app/page.tsx` (`SubscriptionsSection`) | exact |
| `app/payments/[orderId]/page.tsx` | page (RSC) | request-response read | `app/keys/[id]/page.tsx` | exact |
| `components/PayCta.tsx` | client component | request-response | `components/TrialButton.tsx` | exact |
| `components/OrderStatusPanel.tsx` | component (server + client island) | polling | `app/keys/[id]/page.tsx` + `TariffPicker` poll | role-match |
| `components/PaymentStatusChip.tsx` | presentational component | transform (status→label) | `components/SubscriptionCard.tsx` | exact |
| `components/PaymentHistoryList.tsx` | presentational component | CRUD list render | `components/SubscriptionCard.tsx` | role-match |
| `components/RenewPanel.tsx` | client component | request-response | `components/TariffPicker.tsx` | exact |
| `components/UpgradePanel.tsx` | client component | request-response | `components/TariffPicker.tsx` | exact |
| `components/TariffPicker.tsx` (MODIFY: add PayCta) | client component | request-response | itself | exact |
| `components/SubscriptionCard.tsx` (MODIFY: renew/upgrade btns) | presentational component | conditional render | itself | exact |
| `prisma/schema.prisma` (MODIFY: Order/Outbox) | model | relational | itself (`KeyCache` model) | exact |
| `prisma/migrations/<ts>_payments/migration.sql` | migration | DDL | `prisma/migrations/20261002010428_keys_trial/migration.sql` | exact |
| `scripts/artemida-probe.mjs` (MODIFY: `--create-key`) | script | diagnostic | itself (`--confirm-trial` flag) | exact |
| `tests/helpers/fake-fetch.ts` (EXTEND / `fake-platega.ts`) | test helper | fixture inject | itself | exact |
| `tests/unit/platega-client.test.ts` | test | unit (injected fetch) | `tests/unit/artemida-client.test.ts` | exact |
| `tests/unit/callback-route.test.ts` | test | unit (route) | `tests/unit/pricing-route.test.ts` (session mock) + `devices-route.test.ts` (DB) | role-match |
| `tests/unit/order-service.test.ts` | test | unit (DB-backed) | `tests/unit/keys-service.test.ts` | exact |
| `tests/unit/outbox-worker.test.ts` | test | unit (DB-backed) | `tests/unit/keys-service.test.ts` | role-match |
| `tests/unit/order-route.test.ts` | test | unit (DB-backed route) | `tests/unit/devices-route.test.ts` | exact |
| `tests/unit/pricing-upgrade-quote.test.ts` | test | unit (route) | `tests/unit/pricing-route.test.ts` | exact |
| `tests/unit/order-history.test.ts` | test | unit (DB-backed) | `tests/unit/keys-service.test.ts` | exact |

---

## Pattern Assignments

### `lib/platega.ts` (service, request-response / external client)

**Analog:** `lib/artemida.ts` — the single external-network client pattern. Copy this structure almost verbatim; it is the closest possible match (typed error class + zod + fetch injection + p-retry only for safe GETs + tolerant normalizer + default singleton).

**Imports pattern** (`lib/artemida.ts:16-19`):
```typescript
import { randomUUID } from "node:crypto";
import pRetry from "p-retry";
import { z } from "zod";
import { env } from "./env";
```

**Typed error class** (`lib/artemida.ts:21-42`) — mirror as `PlategaError` with `code: "bad_request" | "unauthorized" | "not_found" | "server_error" | "network"`:
```typescript
export type ArtemidaCode = "unauthorized" | "payment_required" | "conflict" | ...;
export class ArtemidaError extends Error {
  constructor(
    readonly code: ArtemidaCode,
    readonly status: number,
    readonly retryAfterSec?: number,
    readonly requestId?: string,
  ) { super(`artemida:${code}`); this.name = "ArtemidaError"; }
}
```

**Injectable-fetch factory** (`lib/artemida.ts:389-392`) — tests inject a fake fetch; default singleton uses global fetch:
```typescript
export function createArtemidaClient(options: ArtemidaClientOptions = {}): ArtemidaClient {
  const retry: Required<ArtemidaRetryOptions> = { ...DEFAULT_RETRY, ...options.retry };
  const doFetch: typeof globalThis.fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init);
```

**Core request + selective retry** (`lib/artemida.ts:435-457`) — **CRITICAL DIVERGENCE for Platega:** retry is safe ONLY for `GET /transaction/{id}`. Do **NOT** auto-retry `createTransaction` (RESEARCH "No documented idempotency key"). Model the request helper so retry is opt-in per call:
```typescript
return pRetry(attempt, {
  retries: retry.retries, minTimeout: retry.minTimeout, maxTimeout: retry.maxTimeout,
  factor: retry.factor, randomize: true,
  shouldRetry: ({ error }) => error instanceof ArtemidaError && RETRYABLE.has(error.code),
});
```

**Success envelope + tolerant normalize** (`lib/artemida.ts:82-88`, `191-203`, `294-297`) — Platega returns a **bare** object (`{transactionId,status,url}`), NOT the `{ok,data}` envelope. Keep `normalizePricing`'s `asRecord`/`pickNumber` style for the `url ?? redirect` normalization:
```typescript
export interface Pricing { price: number; currency: string; days: number; devices: number; }
function pickNumber(...values: unknown[]): number | null { /* first finite number */ }
function asRecord(value: unknown): Record<string, unknown> { /* {} unless object */ }
```

**Timing-safe header verification** (RESEARCH §Code Examples; mirrors `lib/auth.ts:34-48`):
```typescript
import { timingSafeEqual } from 'node:crypto';
function safeEq(a: string | null, b: string): boolean {
  if (!a) return false;
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}
export function verifyPlategaHeaders(h: Headers): boolean {
  return safeEq(h.get('x-merchantid'), env.PLATEGA_MERCHANT_ID)
      && safeEq(h.get('x-secret'), env.PLATEGA_SECRET);
}
```

**Endpoints (RESEARCH §Platega API Contract):**
- `POST /v2/transaction/process` (no `paymentMethod` — payer chooses МИР/СБП) → normalize `url ?? redirect`.
- `GET /transaction/{id}` → `TransactionStatusResponse` (`status` enum incl. `CHARGEBACKED`; `paymentDetails.{amount,currency}`).
- Headers `X-MerchantId` + `X-Secret` on every call; body JSON over HTTPS.

---

### `lib/orders-service.ts` (service, CRUD + state machine)

**Analog:** `lib/keys-service.ts` — the single shared read/write path with Prisma + ownership joins + atomic `updateMany` claim.

**Service module header + imports** (`lib/keys-service.ts:11-13`):
```typescript
import { ArtemidaError, artemida, type Device, type NormalizedKey } from "./artemida";
import { t } from "./i18n";
import { prisma } from "./prisma";
```

**Atomic claim (the load-bearing primitive for D-39 `pending → paid`)** (`lib/keys-service.ts:296-302`):
```typescript
export async function claimTrial(telegramId: bigint): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { telegramId, trialUsed: false },
    data: { trialUsed: true },
  });
  return count === 1;
}
```
Apply the same shape for `transitionOrder`:
```typescript
await prisma.order.updateMany({ where: { id, status: 'pending' }, data: { status: 'paid', paidAt: new Date() } });
```

**Ownership-joined read** (`lib/keys-service.ts:167-175`, `254-261`) — history/status MUST scope by `user: { telegramId }`; a non-owned order is indistinguishable from missing:
```typescript
const row = await prisma.keyCache.findFirst({ where: { keyId, user: { telegramId } } });
return row ? toRenderedKey(row) : null;
```

**Compensating guarded rollback** (`lib/keys-service.ts:309-314`) — pattern for reverting a transition without clobbering a concurrent success:
```typescript
await prisma.user.updateMany({
  where: { telegramId, trialUsed: true, trialKeyId: null },
  data: { trialUsed: false },
});
```

**Formatting helper** (`lib/keys-service.ts:88-96`) — reuse `Intl.DateTimeFormat('ru-RU')` style for payment dates; UI-SPEC wants `DD.MM.YYYY · HH:mm` (add hour/minute):
```typescript
export function formatKeyDate(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
```

---

### `lib/outbox.ts` (service, DB queue / atomic claim)

**Analog:** `lib/keys-service.ts` (`claimTrial` atomic pattern).

**Idempotent enqueue** (RESEARCH Pattern 2) — UNIQUE `(orderId, type)` enforces one job per order+type:
```typescript
await prisma.outbox.upsert({
  where: { orderId_type: { orderId: order.id, type: 'fulfill-order' } },
  update: {},
  create: { orderId: order.id, type: 'fulfill-order' },
});
```

**Atomic claim of the next job** (RESEARCH §Worker claim; same shape as `claimTrial`):
```typescript
const claim = await prisma.outbox.updateMany({ where: { id: job.id, status: 'pending' }, data: { status: 'processing' } });
if (claim.count !== 1) continue; // another tick won
```

---

### `lib/worker.ts` (service, worker loop) — **partial analog**

**Analogs:** `lib/bot.ts:272-283` (global singleton launch guard) + `lib/keys-service.ts` (`claimTrial`) + `lib/artemida.ts:435-457` (p-retry policy). No existing worker exists — this is the one genuinely new control-flow class.

**Singleton guard** (`lib/bot.ts:274-283`):
```typescript
const g = globalThis as unknown as { __setwhiteBotLaunched?: boolean };
if (!g.__setwhiteBotLaunched) {
  g.__setwhiteBotLaunched = true;
  void bot.launch().then(...).catch(...);
}
```
Apply as `g.__setwhiteWorker` in `startWorker()` (RESEARCH §Worker claim + singleton start).

**Retry/backoff + terminal `failed`** — reuse `ArtemidaError.code` branch and `p-retry`; map 402 → `failed` + admin alert (Pitfall 4 / D-41). Log via `logger` (`lib/logger.ts`):
```typescript
setInterval(() => void drainOutbox().catch((e) => logger.error({ outcome: 'worker-outbox', e })), 5_000);
```

**Deterministic Idempotency-Key** (RESEARCH Pattern 4) — REQUIRES the `lib/artemida.ts` change below:
```typescript
await artemida.renewKey(order.keyId, { days: order.days, devices: order.devices },
  { idempotencyKey: `order:${order.id}:renew` });
```

---

### `instrumentation.ts` (root, config/bootstrap) — **partial analog**

**Analog:** `lib/bot.ts:272-283` (guarded startup that never runs during `next build`) + `next.config.ts`.

**Pattern** (RESEARCH Pattern 3, verified against Next 16.3.8 docs):
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startWorker } = await import('./lib/worker');
  startWorker();
}
```
Guard rejects edge runtime + build phase exactly as `lib/bot.ts:274` checks `NEXT_PHASE !== "phase-production-build"`.

---

### `lib/artemida.ts` (MODIFY: add `createKey` + caller `idempotencyKey`)

**Analog:** itself. Two surgical changes:

1. **`idempotencyKey` option** — `request()` at `lib/artemida.ts:405-411` currently mints a fresh UUID:
```typescript
interface RequestOptions<T> { query?: ...; body?: unknown; normalize: (data: unknown) => T; }  // line 130-134
// line 409-411 today:
if (method === "POST" || method === "DELETE") {
  headers["Idempotency-Key"] = randomUUID();
}
// target: add `idempotencyKey?: string` to RequestOptions and use:
headers["Idempotency-Key"] = opts.idempotencyKey ?? randomUUID();
```
Then thread the option through `renewKey`/`upgradeKey`/`createKey` (current signatures `lib/artemida.ts:510-520`).

2. **`createKey`** — new method on `ArtemidaClient` (`lib/artemida.ts:360-382`) using the `normalizeKeyResponse` helper (`lib/artemida.ts:294-297`). **BLOCKED upstream (RESEARCH Open Q1):** exact method/path/body must be locked by the owner probe first; author the method to the probed shape, not an assumed one.

**Normalizer helper to reuse** (`lib/artemida.ts:276-291`): `normalizeKey(raw, fallbackId)` handles `id|keyId|key_id`, `isTrial|is_trial`, camel+snake fields.

---

### `lib/env.ts` (MODIFY: Platega + APP_BASE_URL)

**Analog:** itself (`lib/env.ts:7-21`). Add server-only zods; never `NEXT_PUBLIC_*` (D-37, UI-SPEC):
```typescript
PLATEGA_MERCHANT_ID: z.string().min(1, "PLATEGA_MERCHANT_ID is required"),
PLATEGA_SECRET: z.string().min(1, "PLATEGA_SECRET is required"),
APP_BASE_URL: z.string().url().default("http://localhost:3000"),
```
Keep the existing fail-fast `safeParse` + throw (`lib/env.ts:25-34`). Secrets stay out of `.env.example` real values (AGENTS.md).

---

### `lib/qr.ts` (MODIFY: add PNG renderer)

**Analog:** itself (`lib/qr.ts:9-23`). Add, alongside the existing SVG export:
```typescript
export async function renderSubscriptionQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 256 });
}
```
`toSvg` does **not** exist (existing comment lines 5-8); `toBuffer` confirmed present in `qrcode@1.5.4` (RESEARCH §Code Examples).

---

### `lib/i18n/messages/ru.ts` (MODIFY: pay/renew/upgrade/bot keys)

**Analog:** itself. Append a `pay:`, `renew:`, `upgrade:` block and extend `bot:` per the UI-SPEC Copywriting Contract (lines 263-306). The `I18nKey` union derives automatically from the const shape (`ru.ts:127-138`); `t()`/`tp()` need no change (`lib/i18n/index.ts:21-37`). **Every visible string registers here first** — a `tests/unit/i18n.test.ts` completeness spec fails on missing/unused keys.

---

### `lib/bot.ts` (MODIFY: pay/renew/upgrade + history + QR push)

**Analog:** itself. Reuse the established handler patterns:
- Menu keyboard (`bot.ts:58-67`) → add `bot.menuPayments`.
- Inline callback routing by index (`bot.ts:203-209`, `bot.action(/^key:link:(\d+)$/)` at `221`) → payment/renew/upgrade entry.
- SAMED shared service call (`bot.ts:151` uses `artemida.getPricing`; `233` uses `getSubscriptionForUser`) → call `orders-service` functions, not Prisma directly.
- Reply-size cap (`.slice(0, 4000)` at `bot.ts:207`) → apply to history rows.
- QR push (RESEARCH §Bot QR photo):
```typescript
const png = await renderSubscriptionQrPng(subscriptionUrl);
await bot.telegram.sendPhoto(chatId, { source: png }, { caption: `${t('key.linkTitle')}\n${subscriptionUrl}` });
```
Follow the reply-with-i18n-only error discipline (`bot.ts:129-132`): never raw provider text.

---

### `app/api/orders/route.ts` (controller, request-response / CRUD)

**Analogs:** `app/api/trial/route.ts` (POST BFF shape) + `app/api/pricing/route.ts` (zod query/body + provider error mapping).

**Route skeleton + session gate** (`app/api/trial/route.ts:8-25`) — copy verbatim structure:
```typescript
import { z } from "zod";
import { ArtemidaError } from "../../../lib/artemida";
import { logger } from "../../../lib/logger";
import { requireSession, SessionError } from "../../../lib/session";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let telegramId: number;
  try { telegramId = await requireSession(); }
  catch (err) {
    if (err instanceof SessionError) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error({ route: "orders", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
```

**Zod-at-boundary body** (`app/api/pricing/route.ts:17-23`) — `createOrderSchema` with `kind: z.enum(['new','renew','upgrade'])`, `days ∈ {7,30,90}`, `devices`, optional `keyId`.

**Server re-quote + never trust client price** (RESEARCH Pattern 1, D-43):
```typescript
const quote = await artemida.getPricing({ days, devices });
// persist order.amount = Math.round(quote.price) BEFORE calling Platega
```

**Provider error mapping** (`app/api/trial/route.ts:35-48` / `pricing/route.ts:50-61`) — map codes to HTTP, log `code`+`requestId` only, return `{ error: code, retryAfter }`. Never echo provider text.

**No `requireSession` for callback only** — all order routes ARE session-gated (ASVS V2/V4).

---

### `app/api/orders/[orderId]/route.ts` (controller, request-response)

**Analog:** `app/api/keys/[id]/route.ts` — the ownership-joined detail route.

**Path-param zod + no-oracle 404** (`app/api/keys/[id]/route.ts:15`, `52-61`):
```typescript
const idSchema = z.string().min(1).max(200);
const { id } = await params;
const parsed = idSchema.safeParse(id);
if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
const key = await getKeyForUser(BigInt(telegramId), parsed.data);
if (!key) return Response.json({ error: "not_found" }, { status: 404 });
```
Return the order status only if `order.user.telegramId === telegramId` (T-02-17 IDOR). This route is what the 3 s poller hits (UI-SPEC §2).

---

### `app/api/platega/callback/route.ts` (controller, public webhook) — **role-match**

**Analog:** `app/api/telegram/webhook/[secret]/route.ts` — the existing **public, header/path-verified, fast-ack** webhook. Divergence: Platega has no path secret and no HMAC; verify `X-MerchantId`/`X-Secret` via timing-safe compare instead.

**Fast-ack + never throw into the ack** (`telegram/webhook/route.ts:24`, `33-43`):
```typescript
if (secret !== WEBHOOK_SECRET || header !== WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });
// ... handler wrapped in try/catch, always ack 200 to stop redelivery
return Response.json({ ok: true });
```
Platega version (RESEARCH Pattern 2): verify headers → `if (!verifyPlategaHeaders(req.headers)) return new Response('Unauthorized', { status: 401 })` → zod-parse body → resolve order by `plategaTxId` else `payload` → **D-34 re-query** `platega.getTransaction(id)` → **D-35** amount+currency equality vs stored order (mismatch → mark review + alert, still 200) → atomic `pending→paid` → enqueue outbox → `return new Response('OK')` (<60 s, always).

**Zod body** (from RESEARCH §Callback): `{ id: uuid, amount: number, currency: string, status: enum, paymentMethod?: number, payload?: string }`. Schema **must accept `CHARGEBACKED`** (schema enum lists only CONFIRMED/CANCELED; prose adds CHARGEBACKED — RESEARCH A4) and map it → `refunded`.

---

### `app/api/pricing/route.ts` (MODIFY: renew/upgrade quote modes)

**Analog:** itself. Keep the session gate (`pricing/route.ts:27-34`), the `ALLOWED_DAYS` refine (`15-23`), and the provider-error mapping (`49-64`). Extend the zod query to accept `kind: 'new' | 'renew' | 'upgrade'`, optional `keyId`, `addDevices`; route to an upgrade-quote path. **BLOCKED (RESEARCH Open Q2):** the prorated upgrade delta formula must be confirmed against a live probe; if only computable locally, mirror `apiPricing.upgradeRule` exactly + a recorded fixture test.

---

### `app/payments/page.tsx` (page RSC, CRUD read)

**Analog:** `app/page.tsx` (`SubscriptionsSection`) — the session-gated RSC list with skeleton/error/empty states.

**Shell + states** (`app/page.tsx:15-33`, `56-109`):
```typescript
export const dynamic = 'force-dynamic';
function SkeletonRows() { /* 3 × h-16 animate-pulse rounded-2xl */ }
```
- `requireSession()` in the page (redirect to `/login` on `SessionError`, as `app/keys/[id]/page.tsx:64-70`).
- Empty → `pay.historyEmpty` + tariff CTA; ≥2 rows → count header via `tp` (`app/page.tsx:87-91`).
- Map provider/db errors to `common.errorLoad|errorUnavailable|errorRateLimit` (`app/page.tsx:36-54`), never raw.
- Reuse shell wrapper + `CARD` class (`app/page.tsx:17`, `121-122`).

---

### `app/payments/[orderId]/page.tsx` (page RSC, request-response read)

**Analog:** `app/keys/[id]/page.tsx` — async RSC ownership-scoped detail with delivered-key surface.

**Session + notFound** (`app/keys/[id]/page.tsx:64-74`):
```typescript
let telegramId: number;
try { telegramId = await requireSession(); }
catch (err) { if (err instanceof SessionError) redirect('/login'); throw err; }
const { id } = await params;
const key = await getKeyForUser(BigInt(telegramId), id);
if (!key) notFound();
```

**Provisioned surface reuses the EXACT key-detail markup** (UI-SPEC §2): `code.line-clamp-2 break-all` + `CopyButton` + `QrSvg` + `key.qrCaption` (`app/keys/[id]/page.tsx:143-162`). Partial rule: unreadable sub-link → `key.linkUnavailable`, hide copy + QR. Include the client poller island (`OrderStatusPanel`).

---

### `components/PayCta.tsx` (client component)

**Analog:** `components/TrialButton.tsx` — in-flight CTA lock + label swap + `role="alert"` error.

**In-flight lock + label swap** (`TrialButton.tsx:19-42`, `55-62`):
```typescript
const [state, setState] = useState<TrialState>('idle');
const requestTrial = useCallback(async () => {
  if (state === 'loading') return; // in-flight lock
  setState('loading');
  ...
}, [state]);
<button disabled={state === 'loading'} className={PRIMARY}>
  {state === 'loading' ? t('pay.ctaLoading') : t('pay.cta')}
</button>
```
Divergence: on success `window.location.assign(body.url)` (same-tab redirect, UI-SPEC §1), not reload. `PRIMARY`/`SECONDARY` class constants copied from `TrialButton.tsx:14-17`. Error → `pay.createError` + `common.retry`.

---

### `components/OrderStatusPanel.tsx` (server + poller island) — **role-match**

**Analogs:** `app/keys/[id]/page.tsx` (server panel markup) + `components/TariffPicker.tsx` (client fetch/poll lifecycle).

**Poll lifecycle** (`TariffPicker.tsx:24-66`) — `AbortController` + `useEffect` cleanup; apply a 3 s interval that stops on terminal state + 2 min cap (UI-SPEC §2). Loading bar: `absolute inset-x-0 top-0 h-0.5 animate-pulse bg-foreground` (`TariffPicker.tsx:79-83`).

---

### `components/PaymentStatusChip.tsx` (presentational)

**Analog:** `components/SubscriptionCard.tsx` — the status→label+tint mapper (single registration point, no interpolated i18n keys).

**Badge mapping** (`SubscriptionCard.tsx:11-21`, `36-41`):
```typescript
const BADGE_BASE = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold';
const STATUS_BADGE: Record<StatusKind, string> = {
  active: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400', ...
};
<span className={`${BADGE_BASE} ${STATUS_BADGE[item.statusKind]}`}>{statusLabel(...)}</span>
```
Map every order state (UI-SPEC color table lines 244-254): provisioned→green, paid/provisioning→amber, pending/canceled/unknown→zinc, failed/refunded→red. Never render a raw `order.status` string.

---

### `components/PaymentHistoryList.tsx` (presentational)

**Analog:** `components/SubscriptionCard.tsx` (presentational, no fetch) + `app/page.tsx:103-105` (list map). Row anatomy per UI-SPEC §6: amount (`pay.amount`, `tabular-nums`) · `PaymentStatusChip` · date `DD.MM.YYYY · HH:mm` · `{kind} · {keyName|keyId}`. Newest first; long key name truncates with `title` (UI-SPEC backstop).

---

### `components/RenewPanel.tsx` / `components/UpgradePanel.tsx` (client components)

**Analog:** `components/TariffPicker.tsx` — the live-quote picker with debounce, AbortController, disable-until-price, clear-stale-on-error.

**Controls disabled until price lands; clear stale on error** (`TariffPicker.tsx:39-53`, `70`):
```typescript
if (!res.ok) throw new Error('pricing_request_failed');
...
setPrice(null); setError(true); // clear last-good, never show stale
const controlsDisabled = price === null;
```
- Renew: period selector `7/30/90` reusing `pricing.days*`; `devices` fixed at key's current limit (UI-SPEC §3).
- Upgrade: ± stepper `1 … (10 − currentDeviceLimit)` reusing `TariffPicker.tsx:125-146` (`h-11 w-11 rounded-full` + `tabular-nums`).
- **Trial keys: controls DOM-absent** (D-44 / UI-SPEC §5) — the parent conditionally renders none.

---

### `components/TariffPicker.tsx` (MODIFY: add pay CTA)

**Analog:** itself. Add `<PayCta kind="new" days={days} devices={devices} disabled={price === null} />` below the price block (`TariffPicker.tsx:149-161`). Keep the live-price controls untouched (D-27/D-28).

---

### `components/SubscriptionCard.tsx` (MODIFY: renew/upgrade buttons)

**Analog:** itself. Add a conditional action area: non-trial → `renew.cta` + `upgrade.cta`; trial → `key.buyCta` only (DOM-absent renew/upgrade, D-44). Keep the trial badge (`SubscriptionCard.tsx:37`) so paid/trial never conflate.

---

### `prisma/schema.prisma` (MODIFY: Order/Outbox + enums)

**Analog:** itself — follow `KeyCache` (`schema.prisma:40-60`) conventions: `@map` snake_case columns, `@@unique`, `@@index`, `@@map`, `onDelete: Cascade` relation.

Add (RESEARCH §Order/Outbox models, verbatim shape): enums `OrderKind`/`OrderStatus`/`OutboxStatus`; `Order` with `plategaTxId String? @unique` (D-39 tx-id dedupe), `amount Int`, state machine, `attempts`/`nextAttemptAt`, `@@index([userId, createdAt])`, `@@index([status, nextAttemptAt])`, `@@map("orders")`; `Outbox` with `@@unique([orderId, type])` (D-38 idempotent enqueue), `@@map("outbox")`. Add `orders Order[]` to `User` (`KeyCache` relation at `schema.prisma:27`, `42-43`). `KeyCache` unchanged (ASSUMPTION: still valid as per RESEARCH line 543).

---

### `prisma/migrations/<ts>_payments/migration.sql` (migration)

**Analog:** `prisma/migrations/20261002010428_keys_trial/migration.sql`. Generate with `npx prisma migrate dev --name payments` (never hand-SQL). Deploy uses `migrate deploy` (AGENTS.md).

---

### `scripts/artemida-probe.mjs` (MODIFY: add `--create-key`)

**Analog:** itself — mirror the guarded `--confirm-trial <ref>` flag flow (`artemida-probe.mjs:22-49`): add `--confirm-create-key`, validate its arg, add to the unexpected-arg guard, never print the API key. This is the Wave-0 owner-gated probe that unblocks `createKey` (RESEARCH Open Q1 first task).

---

### Wave-0 test files

**Helper** — extend `tests/helpers/fake-fetch.ts` (or add `fake-platega.ts`): reuse `jsonResponse` (`fake-fetch.ts:11-17`), `success`/`objectError` (`20-31`), and `sequenceFetch` (`63-73`); add a `capturingFetch` for header/body assertions (copy from `tests/unit/artemida-client.test.ts:30-46`).

**`tests/unit/platega-client.test.ts`** — analog `tests/unit/artemida-client.test.ts`: `createPlategaClient({ fetch: seq.fetch, retry: FAST })` (lines 15-21), assert `url ?? redirect`, typed error codes, and **no retry on `createTransaction`** (assert call count === 1).

**`tests/unit/callback-route.test.ts`** — analog `tests/unit/pricing-route.test.ts` (mock `next/headers` via `vi.hoisted` at lines 6-13; `signSession` auth) + `devices-route.test.ts` (real Postgres). Assert forged headers → 401 & no key; duplicate CONFIRMED → one transition + one outbox; amount mismatch → no issue; fast 200.

**`tests/unit/order-service.test.ts` / `outbox-worker.test.ts` / `order-history.test.ts`** — analog `tests/unit/keys-service.test.ts`: real local Postgres, `vi.spyOn(artemida, ...)`, cleanup helpers (lines 37-68), ownership vectors (194-304). Assert deterministic Idempotency-Key, retry/backoff, `failed` after max attempts, and history reads only caller's orders.

**`tests/unit/order-route.test.ts`** — analog `tests/unit/devices-route.test.ts`: mock `next/headers` (lines 10-17), DB owner/other users, `vi.spyOn(artemida, ...)`, assert 401 without session & no provider call, 404 non-owned, trial renew/upgrade 409-family.

**`tests/unit/pricing-upgrade-quote.test.ts`** — analog `tests/unit/pricing-route.test.ts`: session gate + device bounds + provider-error mapping (lines 38-121).

---

## Shared Patterns

### Authentication / Session Gate
**Source:** `lib/session.ts` (`requireSession`, lines 24-30) + `app/api/trial/route.ts:16-25`
**Apply to:** `app/api/orders/route.ts`, `app/api/orders/[orderId]/route.ts`, `app/payments/*` pages.
```typescript
try { telegramId = await requireSession(); }
catch (err) {
  if (err instanceof SessionError) return Response.json({ error: "unauthorized" }, { status: 401 });
  logger.error({ route: "...", outcome: "session_error" });
  return Response.json({ error: "internal" }, { status: 500 });
}
```
**Exception:** `/api/platega/callback` is **public** — authenticates by `X-MerchantId`/`X-Secret` timing-safe compare + mandatory re-query, never session.

### Timing-safe secret compare
**Source:** `lib/auth.ts:34-48` (`timingSafeEqualHex`)
**Apply to:** `lib/platega.ts` callback header verification. Never `===`; guard length; never throw.

### Ownership-joined reads (IDOR / ASVS V4)
**Source:** `lib/keys-service.ts:167-175`, `254-261`
**Apply to:** order status, order history, renew/upgrade pre-checks.
```typescript
where: { keyId, user: { telegramId } }   // non-owned === missing; 404 no oracle
```

### Atomic state transition
**Source:** `lib/keys-service.ts:296-302` (`claimTrial`)
**Apply to:** `pending→paid` (callback) and outbox claim. `updateMany({where:{...status}})` + `count === 1`.

### Typed provider errors + no raw text
**Source:** `lib/artemida.ts:21-42` (`ArtemidaError`) + route mapping `app/api/pricing/route.ts:50-61`
**Apply to:** `PlategaError`, all order/pricing routes, worker.
Callers branch on `.code`; UI strings resolve through `t()`; log `code`+`requestId` only (D-19/D-24).

### Zod at every boundary
**Source:** `lib/artemida.ts:73-88`, `lib/env.ts:7-21`, route schemas `app/api/pricing/route.ts:17-23`
**Apply to:** env, Platega create/status, callback body, order body, path `orderId`.

### Environment secrets single point
**Source:** `lib/env.ts:7-34`
**Apply to:** `PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET`, `APP_BASE_URL`. Never `NEXT_PUBLIC_*`; never in `.env.example` real values.

### i18n-only user strings
**Source:** `lib/i18n/index.ts:21-37` + `lib/i18n/messages/ru.ts`
**Apply to:** every new component/bot/page/status label. Add keys to `ru.ts` first; `I18nKey` auto-derives; completeness spec enforces.

### Structured logging
**Source:** `lib/logger.ts:6-8`
**Apply to:** routes, worker, bot. Log ids/outcomes only — never tokens, full updates, transaction ids, or sub-links.

### In-process singleton startup guard
**Source:** `lib/bot.ts:274-283`
**Apply to:** `instrumentation.ts` → `lib/worker.ts` `startWorker()` (`globalThis.__setwhiteWorker` + `NEXT_PHASE`/`NEXT_RUNTIME` guards).

### Server-only QR rendering
**Source:** `lib/qr.ts:9-23` (SVG) + RESEARCH §Bot QR photo (`toBuffer` PNG)
**Apply to:** cabinet (`renderSubscriptionQr` → `QrSvg`) and bot (`renderSubscriptionQrPng` → `sendPhoto`). Never a remote image URL.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/worker.ts` | service | event-driven / batch | No background worker/queue exists in the repo; compose from `lib/bot.ts` singleton guard + `keys-service` atomic claim + `artemida` p-retry policy (RESEARCH Pattern 3/4). |
| `instrumentation.ts` | config/bootstrap | startup hook | No such file exists; use RESEARCH Pattern 3 (verified Next 16 docs). |
| `app/api/platega/callback/route.ts` | controller | webhook | Closest analog is the Telegram webhook route (public + verified + fast-ack), but Platega differs: no path secret, no HMAC — headers + re-query instead (RESEARCH Pattern 5). Treated as role-match. |
| `lib/artemida.ts::createKey` | service | request-response | **BLOCKED upstream (RESEARCH Open Q1):** no paid create-key method/endpoint observed. MUST be owner-probe-gated before implementation; mirror `renewKey` shape (`lib/artemida.ts:510-514`) + `normalizeKeyResponse` once the live shape is locked. |

---

## Metadata

**Analog search scope:** `lib/`, `app/`, `components/`, `tests/`, `prisma/`, `scripts/`, `docs/`
**Files scanned:** 24 source/test/route/component files + 2 spec docs (full reads for all analogs; `lib/artemida.ts` and `lib/keys-service.ts` read end-to-end)
**Pattern extraction date:** 2026-10-03
**Tracked-source verification:** all analog paths confirmed via `git ls-files` — no `.gsd/capabilities/**` mirrors referenced.
**Highest-risk gaps carried from RESEARCH:** Open Q1 (ARTEMIDA `createKey` shape — blocks PAY-01 `kind:'new'`), Open Q2 (prorated upgrade quote — blocks PAY-03), A6 (`instrumentation.ts` in standalone build — worker drain risk). These are called out inline above so the planner can gate the affected tasks.

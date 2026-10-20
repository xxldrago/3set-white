# Phase 5: Admin & Deploy - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 48 (30 new code files, 13 new infra/docs, 5 modified)
**Analogs found:** 42 / 48 (6 with no close analog — infra/DNS/ops shell)

> **Read along with:** `05-CONTEXT.md` (D-64..D-78), `05-RESEARCH.md` (Patterns 1–6, Pitfalls 1–9), `05-UI-SPEC.md` (sections 1–7). This file tells the executor **which existing file to copy from and exactly what to copy** — it does not restate the requirements.

> **Convention note:** `components/**` and `app/**/page.tsx` import via the `@/` path alias (e.g. `@/lib/i18n`, `@/components/...`). `app/api/**/route.ts` handlers use **relative** imports (`../../../../lib/session`). Follow the file's existing style; do not introduce `@/` into route handlers that already use relative paths.

---

## File Classification

### New server-side lib modules

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/admin-auth.ts` | middleware/guard (DAL) | request-response | `lib/session.ts` | exact (extend) |
| `lib/admin-service.ts` | service (read models) | CRUD/aggregate | `lib/keys-service.ts` + `lib/orders-service.ts` + `lib/tickets-service.ts` | role-match |
| `lib/broadcast.ts` | service (dispatch) | event-driven/pub-sub | `lib/ticket-notify.ts` | exact |
| `lib/balance-alert.ts` | utility (pure classifier) | transform | `lib/keys-service.ts` `deriveStatusKind` | role-match |
| `lib/whitelabel.ts` | utility (host verify) | transform | `lib/keys-service.ts` `getSubscriptionForUser` | partial |

### New admin pages / layout

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/admin/layout.tsx` | layout/guard | request-response | `app/page.tsx` (guard) + `app/keys/[id]/page.tsx` | role-match |
| `app/admin/page.tsx` | page (RSC) | aggregate/request-response | `app/page.tsx` | exact |
| `app/admin/users/page.tsx` | page (RSC) | request-response | `app/page.tsx` | exact |
| `app/admin/users/[id]/page.tsx` | page (RSC) | CRUD/aggregate | `app/keys/[id]/page.tsx` | exact |
| `app/admin/broadcast/page.tsx` | page (RSC) | request-response | `app/payments/page.tsx` | role-match |
| `app/admin/roles/page.tsx` | page (RSC) | CRUD | `app/payments/page.tsx` | role-match |
| `app/admin/tickets/page.tsx` | page (RSC) | request-response | `app/support/page.tsx` + `components/TicketList.tsx` | exact (reuse) |
| `app/admin/tickets/[id]/page.tsx` | page (RSC) | request-response | `app/support/[id]/page.tsx` + `components/TicketThread.tsx` | exact (reuse) |

### New admin BFF routes

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/admin/users/search/route.ts` | route (BFF) | request-response | `app/api/admin/tickets/[id]/reply/route.ts` | exact |
| `app/api/admin/users/[id]/route.ts` | route (BFF) | request-response | `app/api/admin/tickets/[id]/reply/route.ts` | exact |
| `app/api/admin/broadcast/route.ts` | route (BFF) | event-driven (enqueue) | `app/api/admin/tickets/[id]/reply/route.ts` | exact |
| `app/api/admin/roles/route.ts` | route (BFF) | CRUD | `app/api/admin/tickets/[id]/close/route.ts` | exact |
| `app/api/health/route.ts` | route (infra) | request-response | `app/api/cron/reconcile/route.ts` | partial |

### New components (`components/admin/**`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `components/admin/AdminNav.tsx` | component (RSC) | presentational | `components/TicketList.tsx` (link rows) | role-match |
| `components/admin/RoleChip.tsx` | component | presentational | `components/PaymentStatusChip.tsx` | exact |
| `components/admin/BalanceChip.tsx` | component | presentational | `components/PaymentStatusChip.tsx` | exact |
| `components/admin/BroadcastStatusChip.tsx` | component | presentational | `components/PaymentStatusChip.tsx` | exact |
| `components/admin/BalanceAlert.tsx` | component | presentational | `components/SubscriptionCard.tsx` (tinted card) | role-match |
| `components/admin/StatsPanel.tsx` | component (RSC) | presentational | `app/page.tsx` (card grid) | role-match |
| `components/admin/AdminKeyRow.tsx` | component | presentational | `components/SubscriptionCard.tsx` (minus panels) | exact |
| `components/admin/UserSearchResults.tsx` | component | presentational | `components/TicketList.tsx` | role-match |
| `components/admin/UserProfileCard.tsx` | component | presentational | `components/SubscriptionCard.tsx` (header) | role-match |
| `components/admin/PeriodSelector.tsx` | component (client) | request-response | `components/TariffPicker.tsx` (segmented) | role-match |
| `components/admin/UserSearchForm.tsx` | component (client) | request-response | `components/TariffPicker.tsx` | exact |
| `components/admin/BroadcastComposer.tsx` | component (client) | event-driven | `components/ConfirmPanel.tsx` (confirm) | role-match |
| `components/admin/RolesManager.tsx` | component (client) | CRUD | `components/ConfirmPanel.tsx` | role-match |
| `components/admin/AdminConfirmPanel.tsx` | component (client) | request-response | `components/ConfirmPanel.tsx` | exact |

### Modified existing files

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `prisma/schema.prisma` (+ migration) | model | CRUD/event-driven | `Notification`/`Outbox` models | exact |
| `lib/session.ts` | guard (legacy) | request-response | itself (replace `requireAdminSession`) | exact |
| `lib/outbox.ts` | service (queue) | event-driven | itself (add `BROADCAST` + bulk enqueue) | exact |
| `lib/worker.ts` | worker | event-driven | itself (add broadcast drain + balance tick) | exact |
| `lib/env.ts` | config | transform | itself (add `ARTEMIDA_LOW_BALANCE_RUB`) | exact |
| `lib/tickets-service.ts` | service | CRUD | itself (`getOwnedAttachment` isAdminUser → role set) | exact |
| `app/api/tickets/[id]/attachments/[attachmentId]/route.ts` | route | file-I/O | itself (swap `isAdmin` for role set) | exact |
| `lib/i18n/messages/ru.ts` | config (i18n) | transform | itself (add `admin` block) | exact |
| `Dockerfile` | infra | — | itself (add build env + `COPY generated`) | exact |
| `next.config.ts` | config | — | itself (tracing include for `generated`) | partial |

### New tests (`tests/unit/**`)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `tests/unit/admin-auth.test.ts` | test | unit/DB | `tests/unit/order-status-route.test.ts` (session mock) | role-match |
| `tests/unit/admin-search.test.ts` | test | DB-backed | `tests/unit/tickets-service.test.ts` | role-match |
| `tests/unit/admin-stats.test.ts` | test | DB-backed | `tests/unit/order-service.test.ts` | role-match |
| `tests/unit/broadcast.test.ts` | test | DB-backed | `tests/unit/ticket-notify.test.ts` | exact |
| `tests/unit/whitelabel.test.ts` | test | pure | `tests/unit/pricing-upgrade-quote.test.ts` | role-match |
| `tests/unit/health-route.test.ts` | test | route | `tests/unit/order-status-route.test.ts` | role-match |

### New infra/docs (no code analog)

| New File | Role | Data Flow | Analog | Match Quality |
|----------|------|-----------|--------|---------------|
| `docker-compose.prod.yml` | infra | — | `docker-compose.yml` | role-match |
| `nginx/my.3set.online.conf` | infra | — | none | no analog |
| `scripts/deploy.sh` | infra | — | `scripts/` (existing) | partial |
| `scripts/backup.sh` / `scripts/rollback.sh` | infra | — | none | no analog |
| `docs/DEPLOY.md` (runbook) | doc | — | `README.md` | partial |

---

## Pattern Assignments

### `lib/admin-auth.ts` (guard/DAL, request-response)

**Analog:** `lib/session.ts` (74 lines — extend this module, do not fork it)

This is the single most important pattern: Phase 4's `requireAdminSession` is a *thin wrapper* over the pure `lib/auth.ts`. Phase 5 adds a **role resolution** layer in the same module. Keep `lib/auth.ts` pure (it is imported by unit tests with no Next runtime).

**Imports pattern** (`lib/session.ts:7-9`):
```typescript
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
import { env } from "./env";
```

**Typed error signals** (`lib/session.ts:11-29`) — `SessionError` → 401, `AdminError` → **404** (no route enumeration, D-51):
```typescript
export class SessionError extends Error {
  constructor() { super("session_required"); this.name = "SessionError"; }
}
export class AdminError extends Error {
  constructor() { super("admin_required"); this.name = "AdminError"; }
}
```

**Session resolution** (`lib/session.ts:36-42`) — the id is resolved server-side from the signed cookie; never trust a client id (T-02-08):
```typescript
export async function requireSession(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const telegramId = await verifySession(token, env.SESSION_SECRET);
  if (telegramId === null) throw new SessionError();
  return telegramId;
}
```

**Allow-list parsing** (`lib/session.ts:49-64`) — reuse this exact comma-split/`Number.isSafeInteger` discipline for the **bootstrap-only** `ADMIN_TELEGRAM_IDS` reader (D-67): substring from here, do not re-invent:
```typescript
function adminIdSet(): Set<number> {
  const raw = env.ADMIN_TELEGRAM_IDS;
  if (!raw) return new Set();
  const ids = raw.split(",").map((p) => p.trim()).filter((p) => p.length > 0)
    .map((p) => Number(p)).filter((n) => Number.isSafeInteger(n));
  return new Set(ids);
}
export function isAdmin(telegramId: number): boolean { return adminIdSet().has(telegramId); }
```

**Legacy guard to replace** (`lib/session.ts:70-73`) — keep the function name exported for the attachment route until the swap lands, then map all callers to `requireRole`:
```typescript
export async function requireAdminSession(): Promise<number> {
  const telegramId = await requireSession();
  if (!isAdmin(telegramId)) throw new AdminError();
  return telegramId;
}
```

**New shape to add** (from RESEARCH Pattern 1 / 05-RESEARCH.md:204-221) — `getAdminRole` wrapped in React `cache()`, **bootstrap create-only** (`update: {}` never re-elevates, Pitfall 4):
```typescript
import { cache } from "react";
export const getAdminRole = cache(async (telegramId: number): Promise<AdminRole | null> => {
  const existing = await prisma.adminUser.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (existing) return existing.role;                       // UI is source of truth (D-66)
  if (!isBootstrapAdmin(telegramId)) return null;           // env = bootstrap only (D-67)
  const created = await prisma.adminUser.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: {},                                             // NEVER re-elevate
    create: { telegramId: BigInt(telegramId), role: "administrator" },
  });
  return created.role;
});
export async function requireRole(...allowed: AdminRole[]) {
  const telegramId = await requireSession();                // SessionError → 401
  const role = await getAdminRole(telegramId);
  if (!role || !allowed.includes(role)) throw new AdminError(); // → 404
  return { telegramId, role };
}
```
Pure matrix `can(role, section)` (testable without Next) — literal arrays per 05-UI-SPEC §1 role table (05-RESEARCH.md:195-202).

> **Why a separate module vs extending `session.ts`:** `lib/session.ts` currently only imports `next/headers` + `auth` + `env`. Adding `prisma` + `react` cache keeps it server-only but is fine. If the planner prefers isolation, `lib/admin-auth.ts` imports `{ AdminError, requireSession, SessionError, isAdmin }` from `./session`. Either is acceptable; the RESEARCH recommendation is a **new** `lib/admin-auth.ts`.

---

### `lib/admin-service.ts` (service, CRUD/aggregate)

**Analog:** `lib/keys-service.ts` (read models) + `lib/orders-service.ts` (pure mapper) + `lib/tickets-service.ts` (list joins)

The admin read models are the **owner-scoped reads without the owner filter** — same Prisma shape, same provider-free mapping, but authorized by the admin role instead of the join. Copy the module discipline: no Next imports, `prisma` singleton, typed literal unions for the UI.

**Ownership-joined read to de-scope** (`lib/keys-service.ts:121-129`):
```typescript
export async function listKeys(telegramId: bigint): Promise<RenderedKey[]> {
  const rows = await prisma.keyCache.findMany({
    where: { user: { telegramId } },          // admin variant: by user row id, no telegram join
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toRenderedKey).sort(...);
}
```

**Provider-free mapper to reuse** (`lib/orders-service.ts:257-267`) — the admin profile payments sub-section must consume `OrderHistoryRow`, never `Order`:
```typescript
export function toHistoryRow(order: Order): OrderHistoryRow {
  return { id: order.id, amount: order.amount, currency: order.currency,
    status: order.status as OrderStatus, kind: order.kind as OrderKind,
    keyId: order.keyId ?? null, createdAt: order.createdAt };
}
export async function listOrdersForUser(telegramId: bigint): Promise<OrderHistoryRow[]> {
  const orders = await prisma.order.findMany({
    where: { user: { telegramId } }, orderBy: { createdAt: "desc" },
  });
  return orders.map(toHistoryRow);
}
```

**List join to copy for admin "all tickets"** (`lib/tickets-service.ts:121-142`) — the admin queue drops the `where: { user: { telegramId } }`:
```typescript
const rows = await prisma.ticket.findMany({
  where: { user: { telegramId } },
  orderBy: { lastMessageAt: "desc" },
  include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } } },
});
return rows.map((row) => ({ id: row.id, subject: row.subject, status: row.status,
  unreadForUser: row.unreadForUser, lastMessageAt: row.lastMessageAt,
  preview: row.messages[0]?.body ?? null }));
```

**Search (`q`):** copy the `findFirst`-with-nested-join idiom (`lib/keys-service.ts:171-175`, `:203-207`), but join `keyCache → user` and de-dupe by user; exact telegram-id branch (`/^\d+$/`) first (05-RESEARCH.md:228). Cap 50; return only `{ userId, telegramId, displayName, staffRole? }` — never `chatId`, tokens, sub-links.

**Stats (our DB, A1):** single `prisma.order.aggregate({ _sum: { amount: true }, _count: true, where: { paidAt: { gte }, status: { in: ["paid","provisioning","provisioned"] } } })` + `prisma.user.count()`. Render `Intl.NumberFormat('ru-RU')` (see `components/PaymentHistoryList.tsx:21`).

---

### `lib/broadcast.ts` (service, event-driven/pub-sub)

**Analog:** `lib/ticket-notify.ts` (175 lines) — **exact match**; the broadcast dispatcher is structurally `dispatchTicketNotification`.

**Imports pattern** (`lib/ticket-notify.ts:13-21`):
```typescript
import { BOT_REPLY_CAP, TELEGRAM_MAX_CHARS, type NotifyDispatchResult, type TelegramSender } from "./bot-payments";
import { t } from "./i18n";
import { prisma } from "./prisma";
```
Constants live in `lib/bot-payments.ts:20-25`: `TELEGRAM_MAX_CHARS = 4096`, `BOT_REPLY_CAP = 4000`, `TelegramSender` interface (`:149-160`), `NotifyDispatchResult` (`:162-164`).

**Dispatch + owning-chat resolution + retryable contract** (`lib/ticket-notify.ts:43-75`) — copy verbatim, then add the 403/400-terminal branch (Pitfall 5):
```typescript
export async function dispatchTicketNotification(
  notificationId: string, send: TelegramSender,
): Promise<NotifyDispatchResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }, select: { ticketMessageId: true },
  });
  if (!notification?.ticketMessageId) return { outcome: "skipped" };

  const message = await prisma.ticketMessage.findUnique({ ... });
  const owner = message?.ticket.user;
  if (!message || !owner) return { outcome: "skipped" };

  const chatId = String(owner.chatId ?? owner.telegramId);   // NEVER another chat
  try {
    await send.sendMessage(chatId, buildTicketReplyPush(message.body ?? ""));
    return { outcome: "pushed" };
  } catch {
    return { outcome: "retryable_error" };                   // worker reschedules
  }
}
```
Broadcast variant (05-RESEARCH.md:413-440): resolve `Notification.userId → User.chatId ?? telegramId`, look up `Broadcast.body`, `send.sendMessage(chatId, body)` with **no `parse_mode`**, slice to `BOT_REPLY_CAP`; classify `err.response?.error_code` — `403`/`400` → `{ outcome: "skipped" }` (worker marks done; caller increments `failed`), everything else → `retryable_error`. TODO marker: Telegraf error shape is unverified (RESEARCH Tertiary) — cover with a stubbed sender test.

**Queue primitives to reuse unchanged** (`lib/outbox.ts`):
- `enqueueNotification` (`:155-168`) — single idempotent enqueue; for broadcast use **bulk** `prisma.notification.createMany({ skipDuplicates: true })` instead of N upserts (05-RESEARCH.md:400-407).
- `claimNextNotification` (`:187-214`) — atomic single-winner claim; do not re-implement.
- `markNotificationDone`/`rescheduleNotification`/`markNotificationFailed` (`:221-250`) — use `updateMany` semantics.

**Worker wiring** (`lib/worker.ts`) — `drainNotificationType` (`:295-319`) is the exact harness to register the broadcast dispatcher; add it to `drainDeliveryNotifications` (`:327-330`):
```typescript
async function drainDeliveryNotifications(telegram: TelegramSender): Promise<void> {
  await drainNotificationType(NOTIFY_TICKET_REPLY, dispatchTicketNotification, telegram);
  await drainNotificationType(REMIND_EXPIRY, dispatchReminder, telegram);
  // Phase 5: await drainNotificationType(BROADCAST, dispatchBroadcast, telegram);
}
```
Pacing is already sufficient: `DRAIN_BATCH = 10` (`lib/worker.ts:76`) per `DRAIN_INTERVAL_MS = 5_000` (`:65`) ≈ 2 msg/s vs Telegram ≈30/s. **Do not add a second fast loop** (05-RESEARCH.md:276).

---

### `lib/balance-alert.ts` (utility, pure classifier)

**Analog:** `lib/keys-service.ts` `deriveStatusKind` (`:51-61`) — copy the **pure-classifier + literal-union** shape:
```typescript
export type StatusKind = "active" | "expiring" | "expired" | "pending" | "unknown";
export function deriveStatusKind(status: string, expiresAt: Date | null): StatusKind {
  if (expiresAt) { const remaining = expiresAt.getTime() - Date.now(); ... }
  if (status === "pending") return "pending";
  if (status === "expired") return "expired";
  return "unknown";
}
```
New classifier maps `Balance` + threshold → `"ok" | "low" | "critical" | "unknown"` (05-RESEARCH.md:236-245). Keep pure (no Prisma/Next) so the test needs no DB.

**Balance read + types** (`lib/artemida.ts`): `getBalance(): Promise<Balance>` (`:473`, impl `:641`), `interface Balance { balance: number; currency: string; unlimited: boolean }` (`:312-316`), `interface ArtemidaError` with `.code`/`.retryAfterSec` (`:32-42`). The stats page must wrap the read in a short module-level cache (~60 s) and degrade to `—`/`unknown` on `ArtemidaError` (Pitfall 9).

---

### `app/api/admin/**/route.ts` (route/BFF, request-response)

**Analog:** `app/api/admin/tickets/[id]/reply/route.ts` (71 lines) — **exact** template for every new admin route. This is the canonical admin-route skeleton: `requireRole` → zod body → service → enqueue.

**Imports + dynamic** (`app/api/admin/tickets/[id]/reply/route.ts:8-14`):
```typescript
import { z } from "zod";
import { logger } from "../../../../../../lib/logger";
import { NOTIFY_TICKET_REPLY, enqueueNotification } from "../../../../../../lib/outbox";
import { AdminError, requireAdminSession, SessionError } from "../../../../../../lib/session";
export const dynamic = "force-dynamic";
```

**Gate + 401/404/500 mapping** (`:23-34`) — copy exactly; replace `requireAdminSession()` with `requireRole("administrator")` etc. (05-RESEARCH.md:376-390). `AdminError → 404` is load-bearing (no enumeration):
```typescript
try {
  await requireAdminSession();
} catch (err) {
  if (err instanceof SessionError) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (err instanceof AdminError)  return Response.json({ error: "not_found" }, { status: 404 });
  logger.error({ route: "admin-ticket-reply", outcome: "session_error" });
  return Response.json({ error: "internal" }, { status: 500 });
}
```

**Zod boundary + enqueue-only** (`:16-17`, `:42-66`):
```typescript
const idSchema = z.string().min(1).max(200);
const bodySchema = z.string().trim().min(1).max(4000);
// ...
await enqueueNotification({
  type: NOTIFY_TICKET_REPLY,
  dedupeKey: `ticket:${parsedId.data}:${message.id}`,
  ticketId: parsedId.data, ticketMessageId: message.id,
});
return Response.json({ ok: true });
```
Broadcast route mirrors this: `requireRole("administrator")`, `bodySchema = z.string().trim().min(1).max(4000)`, create `Broadcast` + bulk `createMany` notifications, return the derived status (never the message text). Roles route mirrors `close/route.ts` (`:19-45`) — `requireRole("administrator")`, zod enum payload, conditional service write returning boolean → 404.

For body-parsing a JSON object (roles/broadcast), copy the `req.json()` + `safeParse` idiom from `app/api/orders/route.ts:78-87`.

---

### Admin pages / layout (RSC, request-response)

**Analog:** `app/page.tsx` (guard + Suspense + cards) and `app/keys/[id]/page.tsx` (notFound/redirect + per-section degradation).

**Session gate + redirect** (`app/keys/[id]/page.tsx:64-70`; sign-out variant `app/payments/page.tsx:56-63`):
```typescript
let telegramId: number;
try {
  telegramId = await requireSession();
} catch (err) {
  if (err instanceof SessionError) redirect('/login');
  throw err;
}
export const dynamic = 'force-dynamic';
```
Admin variant: after `requireSession`, resolve `requireRole`/`getAdminRole`; no role or wrong role → `notFound()` (05-UI-SPEC §1, §4). **Every page re-checks — the layout is UX only** (Pitfall 3 / 05-RESEARCH.md:302,340).

**Card + button recipes** (`app/page.tsx:19-23`) — copy verbatim into admin stats/profile/roles:
```typescript
const CARD = 'flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const PRIMARY = 'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]';
const SECONDARY = 'flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';
```

**Suspense + SkeletonRows + per-section degradation** (`app/page.tsx:26-35`, `:58-83`; `app/payments/page.tsx:38-54`):
```typescript
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
      ))}
    </section>
  );
}
// each card group is its own async component; its own try/catch → common.errorLoad + retry
```
The `AdminShell` layout (`app/admin/layout.tsx`) renders header + `AdminNav` + `{children}`; `getAdminRole` wrapped in `cache()` so layout + page share one DB read in a render.

---

### Components

**Status chips — `RoleChip` / `BalanceChip` / `BroadcastStatusChip`** — copy `components/PaymentStatusChip.tsx` (79 lines) exactly:
- `BADGE_BASE` (`:15`), `CHIP_TINT: Record<Kind,string>` (`:27-36`), `chipStatus()` narrower (`:39-52`), literal `chipLabel()` switch (`:55-74`) — **never an interpolated i18n key, never a raw status string** (D-19/D-24).
- `RoleChip` uses neutral zinc for all three roles (UI-SPEC §1). `BalanceChip` maps ok/low/critical/unknown → green/amber/red/zinc. `BroadcastStatusChip` maps queued/sending/sent/failed/unknown.

**`AdminConfirmPanel` (client)** — copy `components/ConfirmPanel.tsx` (150 lines): `'use client'` (`:1`), trigger→panel state (`:41-45`), Escape + Tab focus trap effect (`:58-84`), `fetch(url, { method })` on explicit second tap then `router.refresh()` (`:86-98`), `DESTRUCTIVE` red recipe (`:30-31`). Extend with a `primary` variant (non-destructive confirm for broadcast/role-raise) per UI-SPEC §5/§6.

**`AdminKeyRow`** — copy `components/SubscriptionCard.tsx:42-63` (card + name + chip + `dl`), **drop** the `RenewPanel`/`UpgradePanel` block (`:65-77`). Read-only (UI-SPEC §4).

**`UserSearchResults` row / `UserProfileCard`** — copy `components/TicketList.tsx:25-67` link-row anatomy (`<article className={CARD}>` + `<Link>` + truncate+`title` + chip), and `PaymentHistoryList` count-header/empty/one-many idiom (`:51-69` with `tp()`).

**`UserSearchForm` / `PeriodSelector` / `BroadcastComposer` / `RolesManager` (client islands)** — copy `components/TariffPicker.tsx`:
- `'use client'` (`:1`), `useState`/`useCallback`/`useRef` (`:6`, `:19-26`)
- in-flight abort via `AbortController` (`:31-33`) and cleanup (`:67`)
- `fetch` → `if (!res.ok) throw` → typed state, error clears last-good value (`:37-53`)
- debounce via `setTimeout` ref (`:57-65`)
- segmented-control pill recipe (`:93-118`)
`BroadcastComposer`/`RolesManager` add the confirm-panel gate from `ConfirmPanel` before the mutation.

**`StatsPanel` / `AdminNav` / `BalanceAlert`** — server-rendered; `StatsPanel` is a card grid (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`) of the `CARD` recipe; `BalanceAlert` is a tinted card (`SubscriptionCard` `BADGE`/tint vocabulary at `:21-29`) using `role="status"` (UI-SPEC §2).

---

### `prisma/schema.prisma` (model)

**Analog:** `Notification` (`:226-243`) + `Outbox` (`:109-124`) — same status enum reuse (`OutboxStatus`), same `@map` snake_case discipline, same `@@index` pattern.

New models (05-RESEARCH.md:252-266):
- `enum AdminRole { administrator support manager }`
- `model AdminUser { id; telegramId BigInt @unique @map("telegram_id"); role AdminRole; createdAt; updatedAt; @@map("admin_users") }`
- `enum BroadcastStatus { queued sending sent failed }`
- `model Broadcast { id String @id @default(cuid()); authorTelegramId BigInt @map("author_telegram_id"); body String; status BroadcastStatus @default(queued); total Int @default(0); sent Int @default(0); failed Int @default(0); createdAt; finishedAt DateTime?; @@map("broadcasts") }`

Migration: add via `prisma migrate dev --name phase5_admin` (never `migrate dev` in prod; prod runs `migrate deploy` in the image entrypoint — `Dockerfile:34`). Existing migrations live in `prisma/migrations/`.

---

### `lib/worker.ts` (worker, event-driven) + `lib/outbox.ts`

**Analog:** the files themselves. Add, do not refactor:
- `lib/outbox.ts`: `export const BROADCAST = "broadcast";` beside `NOTIFY_TICKET_REPLY` (`:135`) / `REMIND_EXPIRY` (`:137`). Add a bulk enqueue helper using `createMany({ skipDuplicates: true })`.
- `lib/worker.ts`: import `BROADCAST` + `dispatchBroadcast`; register in `drainDeliveryNotifications` (`:327-330`). Add `startBalanceAlertTick()` mirroring `startReconcileTick` (`:385-387`) — `unref(setInterval(guard(...), HOURLY)))` — and add it to the `startWorker` timer set + `stop()` (`:438-464`). The `guard()` wrapper (`:372-376`) keeps a rejection from crashing the server. Also update the `drainDeliveryNotifications` doc-comment (`:321-326`).

---

### `Dockerfile` (infra) — two HIGH-severity gaps

**Analog:** the file itself.

**Gap 1 — build-stage env.** Builder runs `RUN npm run build` (`Dockerfile:19`) with `.env*` excluded (`.dockerignore:6`), while `lib/env.ts` is fail-fast (`:42-50`) and imported at module scope by `lib/session.ts` (`:9`) → `app/page.tsx` (`:13`) (05-RESEARCH.md:327-331). Add placeholder (non-secret) `ENV` in the `builder` stage, e.g. `ENV BOT_TOKEN=build-placeholder BOT_TEST_TOKEN=build-placeholder DATABASE_URL=postgresql://build:build@localhost:5432/build SESSION_SECRET=build-placeholder-session-secret-32ch WEBHOOK_SECRET=build-placeholder ARTEMIDA_API_KEY=build-placeholder PLATEGA_MERCHANT_ID=build-placeholder PLATEGA_SECRET=build-placeholder`. Runtime values still come from container `.env`.

**Gap 2 — generated Prisma client.** Runner (`:21-31`) copies `.next/standalone`, static, public, `prisma`, `prisma7.config.ts`, full `node_modules`, but **not `/app/generated`** where the `prisma-client` generator emits (`prisma/schema.prisma:8-11`; runtime import `lib/prisma.ts:12`). Add `COPY --from=builder /app/generated ./generated`. Consider a `next.config.ts` `outputFileTracingIncludes` entry (mirroring `next.config.ts:9-11`) as insurance.

---

### `docker-compose.prod.yml` (infra)

**Analog:** `docker-compose.yml` (45 lines) — same service shape, add `nginx` + `certbot`, remove published `web:3000` and `db` ports, add `logging` caps.
- `web`: `build: .`, `env_file: [.env]`, `environment` overrides (`:16-20`), `volumes: [uploads:/data/uploads]`, `depends_on db condition: service_healthy` (`:23-25`), `restart: unless-stopped` (`:26`).
- `db`: `image: postgres:17-alpine` (`:29`), healthcheck `pg_isready` (`:36-40`) — **no `ports:`**.
- Add `logging: { driver: json-file, options: { max-size: 10m, max-file: "3" } }` (Pitfall 8) and the healthcheck from 05-RESEARCH.md:460-465.

---

### Tests

**Route/auth tests** — copy `tests/unit/order-status-route.test.ts`:
- `vi.hoisted` session holder + `vi.mock("next/headers", ...)` **before** importing the route (`:7-18`)
- `signSession` to authorize (`:82-84`), request builder passing `params: Promise.resolve(...)` (`:86-90`)
- DB seed/cleanup with a unique telegram-id prefix and `beforeAll`/`afterAll`/`beforeEach` (`:41-114`)
- assert 401 signed-out, 404 wrong-role/missing (identical body — no oracle) (`:147-160`, `:171-178`)

**Dispatch tests** — copy `tests/unit/ticket-notify.test.ts`: seed real Postgres rows, use `fakeSender()` from `tests/helpers/fake-sender.ts` (`:25-40`), assert owning-chat targeting and `retryable_error` on failure. Extend `fakeSender` (or add a variant) to throw a shaped `403`/`429` for the broadcast terminal/backoff branches.

**Pure classifier tests** — copy the no-DB style of `tests/unit/pricing-upgrade-quote.test.ts` / `tests/unit/session.test.ts` for `balance-alert` and `whitelabel`.

Add `ADMIN_TELEGRAM_IDS` and `ARTEMIDA_LOW_BALANCE_RUB` to `vitest.config.ts` `env` (`:17-32`).

---

## Shared Patterns

### Authentication / Authorization (deny-by-default)
**Source:** `lib/session.ts:11-42` + new `lib/admin-auth.ts`
**Apply to:** every `/admin/**` page, every `/api/admin/**` route, and the attachment serve route.
```typescript
try { const { telegramId, role } = await requireRole("administrator"); }
catch (err) {
  if (err instanceof SessionError) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (err instanceof AdminError)  return Response.json({ error: "not_found" }, { status: 404 });
  ...
}
```
Rule: layouts do not gate RSC payloads — re-check in the page/route (Pitfall 3). `AdminError → 404`, never 403 (D-51).

### Error handling / no provider leakage
**Source:** `app/api/orders/route.ts:101-129` + `lib/artemida.ts:21-42`
**Apply to:** all admin routes and read models.
Typed codes only; map `ArtemidaError.code` → status (`rate_limited`→429, `payment_required`→402, `bad_gateway|unavailable`→502); never echo provider text (D-19/D-24). Admin reads degrade to `—`/`unknown`, never a raw error.

### Structured logging
**Source:** `lib/logger.ts:6`
**Apply to:** all new lib/route/worker code. `logger.warn/error({ route, outcome, code })` — log ids/outcomes only, never tokens, sub-links, chat ids, or message bodies.

### i18n (every visible string)
**Source:** `lib/i18n/index.ts:21-38` + `lib/i18n/messages/ru.ts`
**Apply to:** all admin UI. Add an `admin` block to `ru.ts` (leaf keys, `as const` — `:226`) and reference literal `t('admin.…')` / `tp('admin.searchCount', n)`. The i18n completeness test (`tests/unit/i18n.test.ts`) fails on any unused key — only add keys actually referenced. Chips use literal switch labels (never interpolation).

### Queue claim/backoff discipline
**Source:** `lib/outbox.ts:187-250`, `lib/worker.ts:295-319`
**Apply to:** broadcast delivery. Reuse `claimNextNotification`, `rescheduleNotification`, `markNotificationDone/Failed`; per-recipient dedupe key `broadcast:{id}:{userId}` (UNIQUE); 403/400 terminal, 429/5xx retry.

### Prisma status transition (single-writer)
**Source:** `lib/orders-service.ts:190-201` (`transitionOrder`), `lib/tickets-service.ts:336-351` (`transitionTicket`)
**Apply to:** broadcast status writes and role changes. Conditional `updateMany` with `where: { id, status: from }`; `count === 1` wins, `count === 0` is a no-op — never `update()`.

### Secret / env discipline
**Source:** `lib/env.ts:42-53`
**Apply to:** new `ARTEMIDA_LOW_BALANCE_RUB` (`z.coerce.number().nonnegative().default(...)`), `ADMIN_TELEGRAM_IDS` (already present, `:34`). Server-only; never `NEXT_PUBLIC_*`. Build stage uses placeholders only (D-77).

---

## No Analog Found

Files with no close match in the codebase — planner should use `05-RESEARCH.md` Pattern 5/6 guidance:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `nginx/my.3set.online.conf` | infra | — | No reverse-proxy config exists; author from 05-RESEARCH.md:280-285 (TLS, `proxy_read_timeout ≥ 75s`, `client_max_body_size 8m`) |
| `scripts/backup.sh` / `scripts/rollback.sh` | infra | — | No ops scripts exist; author from 05-RESEARCH.md:288-289 (`pg_dump`/`psql`, retention, restore runbook) |
| `docs/DEPLOY.md` (runbook) | doc | — | No runbook; compose from D-76/D-78 + 05-RESEARCH.md Pattern 5 (migration rollback caveat, Pitfall 7) |
| `app/api/health/route.ts` | route | request-response | No health endpoint exists (verified). Shallow payload `{ status, uptime, worker }`; no DB round-trip (Pitfall 8 / RESEARCH) |
| `docker-compose.prod.yml` | infra | — | Partial analog only (`docker-compose.yml`); Nginx/Certbot services are new |

---

## Metadata

**Analog search scope:** `lib/`, `app/` (pages + api routes), `components/`, `tests/`, `prisma/`, repo root infra (`Dockerfile`, `docker-compose.yml`, `next.config.ts`, `instrumentation.ts`, `vitest.config.ts`, `.dockerignore`, `.env.example`).
**Files scanned:** ~35 read in full/targeted; 22 analog paths verified `git ls-files`-tracked (no gitignored mirror paths emitted).
**Pattern extraction date:** 2026-10-04
**Key insight for planner:** Phase 5 is ~90% composition — every new file mirrors an existing one. When a task starts rebuilding the queue, session, ARTEMIDA client, read services, or UI primitives, the plan has drifted (05-RESEARCH.md:312-323).

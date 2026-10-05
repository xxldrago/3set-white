# Phase 4: Support & Retention - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 34 (21 new, 13 modified)
**Analogs found:** 30 / 34 (4 use RESEARCH.md patterns — sharp pipeline, multipart, gated file serving, admin gate)

> All analog paths below are **git-tracked source** (verified with `git ls-files --`). No
> gitignored install/runtime mirrors are referenced.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/tickets-service.ts` | service | CRUD + thread | `lib/keys-service.ts` / `lib/orders-service.ts` | exact |
| `lib/attachments.ts` | service | file-I/O + transform | `lib/qr.ts` (server-only Buffer) | partial (sharp is new) |
| `lib/ticket-notify.ts` | service (pure) | event-driven | `lib/bot-payments.ts` | exact |
| `lib/reminders-service.ts` | service | batch/scan | `lib/keys-service.ts` (expiring window) | role-match |
| `lib/outbox.ts` (MOD) | service queue | event-driven | itself | exact |
| `lib/worker.ts` (MOD) | service worker | event-driven | itself | exact |
| `lib/env.ts` (MOD) | config | — | itself | exact |
| `lib/session.ts` (MOD) | middleware | request-response | itself (`requireSession`) | exact |
| `lib/bot.ts` (MOD) | provider | event-driven | itself | exact |
| `prisma/schema.prisma` (MOD) | model | CRUD | itself (Order/Outbox/KeyCache) | exact |
| `app/support/page.tsx` | component (RSC) | request-response | `app/page.tsx` | exact |
| `app/support/new/page.tsx` | component (RSC) | request-response | `app/page.tsx` | role-match |
| `app/support/[id]/page.tsx` | component (RSC) | request-response | `app/keys/[id]/page.tsx` | exact |
| `app/api/tickets/route.ts` | controller | CRUD + multipart | `app/api/trial/route.ts` + `devices/route.ts` | role-match (multipart new) |
| `app/api/tickets/[id]/messages/route.ts` | controller | CRUD | `app/api/keys/[id]/devices/clear/route.ts` | exact |
| `app/api/tickets/[id]/read/route.ts` | controller | CRUD | `app/api/keys/[id]/devices/clear/route.ts` | exact |
| `app/api/tickets/[id]/attachments/[attachmentId]/route.ts` | controller | file-I/O | `app/api/keys/[id]/devices/route.ts` | role-match (stream new) |
| `app/api/admin/tickets/[id]/reply/route.ts` | controller | event-driven | `app/api/keys/[id]/devices/route.ts` | role-match |
| `app/api/admin/tickets/[id]/close/route.ts` | controller | CRUD | `app/api/keys/[id]/devices/clear/route.ts` | role-match |
| `app/api/cron/remind/route.ts` | controller | batch | `app/api/cron/reconcile/route.ts` | exact |
| `components/TicketStatusChip.tsx` | component | transform | `components/PaymentStatusChip.tsx` | exact |
| `components/TicketList.tsx` | component | transform | `components/PaymentHistoryList.tsx` | exact |
| `components/TicketThread.tsx` | component | transform | `components/PaymentHistoryList.tsx` / `SubscriptionCard.tsx` | role-match |
| `components/AttachmentImage.tsx` | component | file-I/O | `components/QrSvg.tsx` / `CopyButton.tsx` | role-match |
| `components/CreateTicketForm.tsx` | component (client) | CRUD + multipart | `components/PayCta.tsx` + `ConfirmPanel.tsx` | role-match |
| `components/TicketComposer.tsx` | component (client) | CRUD | `components/PayCta.tsx` | exact |
| `components/MarkReadOnOpen.tsx` | component (client) | request-response | `components/ConfirmPanel.tsx` | role-match |
| `components/SupportEntry.tsx` | component | — | `components/SubscriptionCard.tsx` nav | role-match |
| `docker-compose.yml` (MOD) | config | — | itself (`pgdata` volume) | exact |
| `.env.example` (MOD) | config | — | itself | exact |
| `next.config.ts` (MOD) | config | — | itself | exact |
| `lib/i18n/messages/ru.ts` (MOD) | config | transform | itself | exact |
| `tests/unit/tickets-service.test.ts` | test | DB-backed | `tests/unit/keys-service.test.ts` | exact |
| `tests/unit/ticket-attachments.test.ts` | test | unit (real sharp) | `tests/unit/qr.test.ts` | role-match |
| `tests/unit/ticket-notify.test.ts` | test | unit + fake sender | `tests/unit/bot-payments.test.ts` | exact |
| `tests/unit/reminder-cron.test.ts` | test | DB + fake sender | `tests/unit/outbox-worker.test.ts` | role-match |
| `tests/unit/tickets-route.test.ts` | test | route unit | `tests/unit/devices-route.test.ts` | exact |
| `tests/unit/notifications-queue.test.ts` | test | DB unit | `tests/unit/outbox-worker.test.ts` | role-match |

---

## Pattern Assignments

### `lib/tickets-service.ts` (service, CRUD + thread)

**Analog:** `lib/keys-service.ts` (single shared write path) + `lib/orders-service.ts` (atomic transitions, ownership joins)

**Module header / single-path discipline** (`lib/keys-service.ts:1-13`):
```ts
// Keys/trial service — the SINGLE read/write path shared by the bot and the
// BFF routes (RESEARCH "Bot + PWA shared path"). Both call `startTrial`, so
// there is no duplicated Prisma or fetch logic between channels.
import { ArtemidaError, artemida, type Device, type NormalizedKey } from "./artemida";
import { t } from "./i18n";
import { prisma } from "./prisma";
```

**Import conventions** (`lib/orders-service.ts:9-16`): import `type { Order, Outbox }` from `"../generated/prisma/client"`, services from `./prisma`, logger from `./logger`.

**Ownership join — non-owned ≡ null/404** (`lib/orders-service.ts:227-234`):
```ts
export async function loadOrderForUser(
  telegramId: bigint,
  orderId: string,
): Promise<Order | null> {
  return prisma.order.findFirst({
    where: { id: orderId, user: { telegramId } },
  });
}
```
Mirror for tickets: `prisma.ticket.findFirst({ where: { id, user: { telegramId } } })` (RESEARCH [VERIFIED: lib/keys-service.ts:167-175, lib/orders-service.ts:227-234]).

**Atomic status transition (single-winner)** (`lib/orders-service.ts:184-201`):
```ts
export async function transitionOrder(
  id: string,
  from: OrderStatus,
  to: OrderStatus,
  data: Partial<Pick<Order, "paidAt" | "provisionedKeyId" | "errorCode" | "attempts" | "nextAttemptAt">> = {},
): Promise<boolean> {
  const { count } = await prisma.order.updateMany({
    where: { id, status: from },
    data: { status: to, ...data },
  });
  return count === 1;
}
```
Apply to `answered`/`closed`/reopen transitions; unread bump `unreadForUser: { increment: 1 }` once, in the same create transaction (RESEARCH §Data Model status rules; Pitfall 6).

**Idempotent enqueue delegated to outbox** (`lib/orders-service.ts:289-308`):
```ts
export async function enqueueFulfillOrder(orderId: string): Promise<Outbox> {
  return enqueueFulfillJob(orderId);
}
```
Tickets-service should enqueue `notify-ticket-reply` via `enqueueNotification` (see `lib/outbox.ts` section below), never send Telegram inline (D-57).

**Enum type + typed result shape** (`lib/orders-service.ts:18-26, 65-67`):
```ts
export type OrderStatus = "pending" | "paid" | ...;
export type CreateOrderResult =
  | { kind: "created"; order: Order; url: string }
  | { kind: "provider_error"; code: PlategaError["code"] };
```
Mirror as `export type CreateTicketInput` / `TicketWithMessages` and literal `TicketStatus`/`TicketAuthor` unions for the UI.

---

### `lib/attachments.ts` (service, file-I/O + transform)

**Analog:** `lib/qr.ts` for the server-only Buffer idiom (lines 1-9, 36-49); the sharp pipeline + volume I/O have **no codebase analog** — use RESEARCH.md §Attachment Pipeline verbatim.

**Server-only module header** (`lib/qr.ts:1-9`):
```ts
// Server-only QR renderer (D-30 / UI-SPEC "QR is a locally-rendered SVG").
// ... never leave the server ...
import QRCode from "qrcode";
```

**Buffer return convention** (`lib/qr.ts:36-49`) — `renderSubscriptionQrPng` returns `Promise<Buffer>`; `lib/attachments.ts` should follow the same `Promise<Buffer>`/`Promise<string>` signatures with no Next imports.

**Sharp recipe + path-escape guard:** copy from RESEARCH.md §Attachment Pipeline (sharp `metadata().format` allow-list `jpeg/png/webp`, `limitInputPixels`, `animated:false`, `.rotate().resize({fit:"inside",withoutEnlargement:true}).webp({quality:80})`, `randomUUID()` storage name, `path.resolve(UPLOAD_DIR, stored).startsWith(UPLOAD_DIR + path.sep)`). Must `import sharp from "sharp"`; routes touching it declare `export const runtime = "nodejs"`.

**Env access convention** (`lib/env.ts:47`): `export const env = loadEnv();` → `const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR);`.

---

### `lib/ticket-notify.ts` (service, pure builders + dispatch)

**Analog:** `lib/bot-payments.ts` — EXACT structural match.

**Module intent / no Telegraf wiring** (`lib/bot-payments.ts:1-18`):
```ts
// This module is deliberately free of any Telegraf handler wiring: it holds the
// PURE message builders ... and the notify-row DISPATCH function the outbox
// worker calls. The thin handlers in `lib/bot.ts` compose these ...
import { getSubscriptionForUser } from "./keys-service";
import { t } from "./i18n";
import type { OrderHistoryRow } from "./orders-service";
```

**Injectable sender interface** (`lib/bot-payments.ts:148-164`):
```ts
export interface TelegramSender {
  sendMessage(
    chatId: number | string,
    text: string,
    extra?: Record<string, unknown>,
  ): Promise<unknown>;
  sendPhoto(
    chatId: number | string,
    photo: { source: Buffer },
    extra?: { caption?: string },
  ): Promise<unknown>;
}
export interface NotifyDispatchResult {
  outcome: "pushed" | "skipped" | "retryable_error";
}
```

**Dispatch + owning-chat resolution (fan-out anchor)** (`lib/bot-payments.ts:175-221`):
```ts
export async function dispatchNotification(
  orderId: string,
  type: string,
  send: TelegramSender,
): Promise<NotifyDispatchResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { telegramId: true, chatId: true } } },
  });
  if (!order) return { outcome: "skipped" };

  // The owning chat: prefer the stored chat id, else the telegram id ...
  const chatId = String(order.user.chatId ?? order.user.telegramId);
  ...
  } catch {
    return { outcome: "retryable_error" };
  }
}
```
Copy this shape for `dispatchTicketNotification(job, send)` and `dispatchReminder(job, send)`; the owning chat is always `String(user.chatId ?? user.telegramId)` (SUP-03, T-03-sublink-leak).

**Length cap constants** (`lib/bot-payments.ts:20-25`): reuse `TELEGRAM_MAX_CHARS = 4096` / `BOT_REPLY_CAP = 4000`; `buildReminderPush` and `buildTicketReplyPush` must slice to `BOT_REPLY_CAP` (RESEARCH §Copy builders).

**Keyed copy — no raw status/provider strings** (`lib/bot-payments.ts:54-86`): the `kindLabel`/`statusLabel` switch pattern is the model for `TicketStatusChip` label mapping and reminder copy; literal `t(...)` calls only.

---

### `lib/reminders-service.ts` (service, batch/scan)

**Analog:** `lib/keys-service.ts` expiring-window logic + `lib/outbox.ts` enqueue.

**Expiring window constant (reuse exactly to stay consistent with the cabinet badge)** (`lib/keys-service.ts:33-35`):
```ts
const DAY_MS = 86_400_000;
// A key with ≤3 days of validity is "expiring" (UI-SPEC status.expiring).
const EXPIRING_WINDOW_MS = 3 * DAY_MS;
```

**Ownership-joined read with include** (`lib/keys-service.ts:121-129`):
```ts
export async function listKeys(telegramId: bigint): Promise<RenderedKey[]> {
  const rows = await prisma.keyCache.findMany({
    where: { user: { telegramId } },
    orderBy: { updatedAt: "desc" },
  });
  ...
}
```
`listExpiringKeys` uses `prisma.keyCache.findMany({ where: { expiresAt: { gt: now, lte: horizon } }, include: { user: { select: { telegramId: true, chatId: true } } } })` — includes trial keys (D-63).

**Per-day dedupe key:** `remind:${keyId}:${now.toISOString().slice(0,10)}` then `enqueueNotification` (RESEARCH §Expiry Reminders). `formatKeyDate` (`lib/keys-service.ts:88-96`) formats the reminder date.

---

### `lib/outbox.ts` (MODIFIED — Notification queue helpers)

**Analog:** itself. Add a sibling `Notification` queue using the same claim discipline without touching `Outbox`.

**Idempotent enqueue (`upsert`, no-op on duplicate)** (`lib/outbox.ts:24-30`):
```ts
export async function enqueueOrderJob(orderId: string, type: string): Promise<Outbox> {
  return prisma.outbox.upsert({
    where: { orderId_type: { orderId, type } },
    update: {},
    create: { orderId, type },
  });
}
```
New: `enqueueNotification({ type, dedupeKey, ... })` → `prisma.notification.upsert({ where: { dedupeKey }, update: {}, create: {...} })`.

**Atomic single-winner claim** (`lib/outbox.ts:65-81`):
```ts
export async function claimNextJob(type: string = FULFILL_JOB): Promise<ClaimedJob | null> {
  const candidates = await prisma.outbox.findMany({
    where: { status: "pending", type, nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const job of candidates) {
    const { count } = await prisma.outbox.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "processing" },
    });
    if (count === 1) {
      return { id: job.id, orderId: job.orderId, type: job.type, attempts: job.attempts };
    }
  }
  return null;
}
```

**Job-state writers must use `updateMany` (vanished row = no-op)** (`lib/outbox.ts:83-121`):
```ts
// All three job-state writes use `updateMany` (not `update`): a job row that
// vanished ... must never throw into the worker loop — a missing row is a no-op.
export async function markJobDone(jobId: string): Promise<void> {
  await prisma.outbox.updateMany({
    where: { id: jobId },
    data: { status: "done", processedAt: new Date(), lastError: null },
  });
}
export async function rescheduleJob(jobId, nextAttemptAt, reason): Promise<void> {
  await prisma.outbox.updateMany({ where: { id: jobId }, data: {
    status: "pending", nextAttemptAt, attempts: { increment: 1 }, lastError: reason } });
}
```
Duplicate `markJobDone`/`rescheduleJob`/`markJobFailed` for the `notification` delegate, or generalize over a delegate (RESEARCH §Generic claim helper).

---

### `lib/worker.ts` (MODIFIED — notification drain + reminder tick)

**Analog:** itself.

**Drain dispatch + reschedule/backoff taxonomy** (`lib/worker.ts:245-263`):
```ts
async function drainNotifications(telegram: TelegramSender): Promise<void> {
  for (const type of [NOTIFY_PROVISIONED, NOTIFY_FAILED]) {
    for (let i = 0; i < DRAIN_BATCH; i += 1) {
      const job = await claimNextJob(type);
      if (!job) break;
      try {
        const result = await dispatchNotification(job.orderId, type, telegram);
        if (result.outcome === "retryable_error") {
          await rescheduleJob(job.id, new Date(Date.now() + backoffMs(job.attempts + 1)), "telegram");
        } else {
          await markJobDone(job.id);
        }
      } catch {
        logger.error({ route: "worker", outcome: "notify_job_error", jobId: job.id });
        await markJobFailed(job.id, "unexpected");
      }
    }
  }
}
```
Add a parallel `drainDeliveryNotifications(telegram)` for `NOTIFY_TICKET_REPLY` / `REMIND_EXPIRY`. Sender-less drain must leave rows `pending` (never drop) — proven safe (`drainOutbox` returns early at `lib/worker.ts:234`).

**Backoff helper + guard/unref + lazy bot sender** (`lib/worker.ts:67-74, 305-330`):
```ts
export function backoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1_000, BACKOFF_MAX_MS);
  }
  const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(exp, BACKOFF_MAX_MS);
}
...
async function botSender(): Promise<TelegramSender> {
  const { bot } = await import("./bot");
  return bot.telegram as unknown as TelegramSender;
}
```
Reuse `backoffMs`, `guard`, `unref`.

**Tick pattern (unref'd interval + boot run) + singleton `startWorker`** (`lib/worker.ts:317-374`):
```ts
export function startReconcileTick(): NodeJS.Timeout {
  return unref(setInterval(guard("reconcile", () => reconcileOnce()), RECONCILE_INTERVAL_MS));
}
...
export function startWorker(): WorkerHandle {
  const g = globalThis as unknown as WorkerGlobal;
  if (g.__setwhiteWorker) return g.__setwhiteWorker;
  const drainTimer = unref(setInterval(guard("drain", async () => drainOutbox({ telegram: await botSender() })), DRAIN_INTERVAL_MS));
  const reconcileTimer = startReconcileTick();
  ...
  logger.info({ outcome: "worker-started" });
}
```
Add `REMINDER_INTERVAL_MS = 24*60*60*1000`; `startReminderTick()` runs `runReminderScan()` once on boot then daily; add it to `startWorker()`. Add one drain call to `drainOutbox` after the order-notify loops (RESEARCH §Worker additions).

---

### `lib/session.ts` (MODIFIED — requireAdminSession)

**Analog:** itself (`requireSession`, lines 12-30).

```ts
export class SessionError extends Error {
  constructor() { super("session_required"); this.name = "SessionError"; }
}
export async function requireSession(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new SessionError();
  const telegramId = await verifySession(token, env.SESSION_SECRET);
  if (telegramId === null) throw new SessionError();
  return telegramId;
}
```
Add `AdminError` + `requireAdminSession(): Promise<number>` that calls `requireSession()` then checks `env.ADMIN_TELEGRAM_IDS` (comma-separated → `Set<number>`); non-admin → throw `AdminError` (route maps to 404/403). Env added to `lib/env.ts` (see below), never a `NEXT_PUBLIC_*`.

---

### `lib/env.ts` (MODIFIED)

**Analog:** itself. Add to `envSchema` (`lib/env.ts:7-32`):
```ts
UPLOAD_DIR: z.string().min(1).default("/data/uploads"),
ADMIN_TELEGRAM_IDS: z.string().optional(), // comma-separated; empty = no admins
```
Follow the existing `CRON_SECRET` optional pattern (`lib/env.ts:28`), and keep the server-only comment convention (`lib/env.ts:15`). `.env.example`: add placeholder lines matching the file's style (`.env.example:1-20`) — never real values (AG-3).

---

### `lib/bot.ts` (MODIFIED — support intake + reminder callbacks)

**Analog:** itself.

**`/start` upsert captures `chatId` (fan-out anchor)** (`lib/bot.ts:39-59`):
```ts
bot.start(async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const telegramId = from.id;
  const chatId = ctx.chat?.id;
  await prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: { ...(chatId === undefined ? {} : { chatId: BigInt(chatId) }), ... },
    create: { telegramId: BigInt(telegramId), ... },
  });
  ...
});
```

**Keyed menu / branch conventions** (`lib/bot.ts:65-76, 119-141`): `bot.hears(t("bot.menuTrial"), ...)` with try/catch → `ctx.reply(t("...error"))`, log `{ updateId, telegramId, outcome }` only. Add `bot.hears(t("bot.menuSupport"), ...)` setting `awaitingSupport=true, supportPromptAt=now` via `prisma.user.updateMany` (RESEARCH §Bot support intake).

**Text/photo intake handler placeholder** (`lib/bot.ts:320-369` key handler shape): a `bot.on(["text","photo"], ...)` reads the user row, checks `awaitingSupport` + TTL (< 30 min), downloads via `ctx.telegram.getFileLink(largest.file_id)` → `fetch` → `normalizeImage` → `createTicket(...)`, clears the flag. Must `return` early when not awaiting so other handlers still match.

**Inline callback + ownership precheck** (`lib/bot.ts:266-314`):
```ts
bot.action(/^key:renew:(\d+)$/, async (ctx) => {
  const from = ctx.from;
  await ctx.answerCbQuery();
  if (!from) return;
  const index = Number(ctx.match?.[1]);
  const keys = await listKeys(BigInt(from.id));
  const key = keys[index];
  ...
  const precheck = await precheckOwnedKey(from.id, key.id);
  ...
  await createBotOrderAndReply(ctx, { kind: "renew", days: KEY_DAYS, devices: keyDeviceLimit(precheck.key), keyId: precheck.key.id });
});
```
**Callback-data migration required (A7):** existing `key:renew:(\d+)`/`key:upgrade:(\d+)` are index-based (`lib/bot.ts:266,291,403-405`) and stale for async reminders. Add `key:renew:{keyId}` (RESEARCH §Callback-data migration) and keep trial CTA `tariff:start` → `tariffDaysKeyboard()` (`lib/bot.ts:96-106`). Trial keys must never show renew (D-63).

**Singleton + polling guard + webhook wiring:** `lib/bot.ts:35, 438-448`; webhook route `app/api/telegram/webhook/[secret]/route.ts:37-42` calls `bot.handleUpdate`.

---

### `prisma/schema.prisma` (MODIFIED — Ticket/TicketMessage/Attachment/Notification + User fields)

**Analog:** itself (enum/relation/index/cascade conventions).

**Enum + relation + `@map` + cascade conventions** (`prisma/schema.prisma:51-116`):
```prisma
enum OrderStatus { pending paid provisioning provisioned failed canceled refunded }
enum OutboxStatus { pending processing done failed }

model Outbox {
  id            String       @id @default(cuid())
  orderId       String       @map("order_id")
  order         Order        @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type          String
  status        OutboxStatus @default(pending)
  attempts      Int          @default(0)
  lastError     String?      @map("last_error")
  nextAttemptAt DateTime     @default(now()) @map("next_attempt_at")
  createdAt     DateTime     @default(now()) @map("created_at")
  processedAt   DateTime?    @map("processed_at")

  @@unique([orderId, type])
  @@index([status, nextAttemptAt])
  @@map("outbox")
}
```
Add `Ticket`, `TicketMessage`, `Attachment` (+ enums `TicketStatus`, `TicketAuthor`) and `Notification` (`dedupeKey String @unique`, `status OutboxStatus`, `@@index([status, nextAttemptAt])`, `@@map("notifications")`) — full DDL in RESEARCH §Data Model. `User` additions: `tickets Ticket[]`, `awaitingSupport Boolean @default(false) @map("awaiting_support")`, `supportPromptAt DateTime?` (additive migration; `User.id` is autoincrement so defaults backfill safely).

**`KeyCache.expiresAt`/`isTrial` are the reminder inputs** (`prisma/schema.prisma:126-127`).

---

### `app/api/cron/remind/route.ts` (controller, batch)

**Analog:** `app/api/cron/reconcile/route.ts` — EXACT copy.

**Timing-safe secret gate + closed-when-unset** (`app/api/cron/reconcile/route.ts:13-45`):
```ts
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

function safeEq(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export async function POST(req: Request): Promise<Response> {
  const { env } = await import("../../../../lib/env");
  const { logger } = await import("../../../../lib/logger");
  const expected = env.CRON_SECRET;
  if (!expected) {
    logger.warn({ route: "cron_reconcile", outcome: "disabled" });
    return Response.json({ error: "disabled" }, { status: 503 });
  }
  if (!safeEq(req.headers.get("x-cron-secret"), expected)) {
    logger.warn({ route: "cron_reconcile", outcome: "unauthorized" });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { reconcileOnce } = await import("../../../../lib/worker");
  const result = await reconcileOnce();
  logger.info({ route: "cron_reconcile", outcome: "ok", ...result });
  return Response.json({ ok: true, ...result });
}
```
Swap `reconcileOnce` for `runReminderScan`; keep lazy imports + `route: "cron_remind"`.

---

### `app/api/tickets/route.ts` (controller, CRUD + multipart)

**Analog:** `app/api/trial/route.ts` for session gate + typed errors; `app/api/keys/[id]/devices/route.ts` for zod/ownership; multipart is new.

**Session gate + typed error mapping** (`app/api/trial/route.ts:15-51`):
```ts
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
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
  try { ... } catch (err) {
    if (err instanceof ArtemidaError) { ... }
    logger.error({ route: "trial", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
```

**zod-validated path/body + ownership-join 404** (`app/api/keys/[id]/devices/route.ts:7-69`): `const idSchema = z.string().min(1).max(200);`, `parsed = idSchema.safeParse(id)`, then `listDevices(...) === null → 404`. Apply to body fields (subject ≤120, body ≤4000; RESEARCH §Security Domain).

**Multipart (NEW — no analog):** `export const runtime = "nodejs";` then `const form = await req.formData(); const file = form.get("attachment"); if (file instanceof File) { ... File.size ≤ 5MiB → 413; Buffer.from(await file.arrayBuffer()); await normalizeImage(bytes); }` (RESEARCH §Attachment Pipeline / cabinet).

---

### `app/api/tickets/[id]/messages/route.ts` and `.../[id]/read/route.ts` (controller, CRUD)

**Analog:** `app/api/keys/[id]/devices/clear/route.ts` (POST, session-gated, ownership 404).

Same header/gate shape as `devices/route.ts:37-69`; messages route calls `appendUserMessage(telegramId, id, body)` (reopens if answered/closed, D-59); read route calls `markTicketRead(telegramId, id)` → `unreadForUser = 0` (D-58). Non-owned ≡ 404. Both `dynamic = "force-dynamic"`.

---

### `app/api/tickets/[id]/attachments/[attachmentId]/route.ts` (controller, file-I/O)

**Analog:** `app/api/keys/[id]/devices/route.ts` for session gate + zod + 404; streamed `Response` body is **new** — use RESEARCH §Gated serving route.

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const telegramId = await requireSession();                  // 401 on failure
  const { id, attachmentId } = await params;
  const att = await getOwnedAttachment(BigInt(telegramId), id, attachmentId); // owner OR admin
  if (!att) return Response.json({ error: "not_found" }, { status: 404 });
  const bytes = await readAttachment(att.path);
  return new Response(bytes, {
    headers: {
      "Content-Type": att.mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```
Non-owned/unauthorized ≡ 404 (D-56). Admin path uses `isAdmin(session)` / `requireAdminSession`.

---

### `app/api/admin/tickets/[id]/reply/route.ts` and `.../close/route.ts` (controller)

**Analog:** `app/api/keys/[id]/devices/route.ts` gate + **new** `requireAdminSession()`. Reply calls `addSupportMessage(ticketId, body)` which bumps `unreadForUser` once and calls `enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: "ticket:{ticketId}:{messageId}" })` — **never** `sendMessage` inline (D-57, RESEARCH Anti-Patterns). Close calls `transitionTicket(id, "closed")`.

---

### RSC pages

#### `app/support/page.tsx`, `app/support/new/page.tsx`

**Analog:** `app/page.tsx` (session gate, Suspense, list section).

**RSC session gate + login/redirect convention** (`app/page.tsx:112-118`) and the stronger detail-page variant (`app/keys/[id]/page.tsx:64-70`):
```tsx
let telegramId: number;
try {
  telegramId = await requireSession();
} catch (err) {
  if (err instanceof SessionError) redirect('/login');
  throw err;
}
```
List uses `<Suspense fallback={<SkeletonRows />}>` + an async section that calls the service and renders error states (`app/page.tsx:23-61, 130-139`). `export const dynamic = 'force-dynamic';` on every page. Support list page composes `TicketList` + `TicketStatusChip` + `SupportEntry`/new-ticket link.

#### `app/support/[id]/page.tsx`

**Analog:** `app/keys/[id]/page.tsx` — EXACT structural match.

**Session gate + notFound + section cards** (`app/keys/[id]/page.tsx:59-127`):
```tsx
export const dynamic = 'force-dynamic';
export default async function KeyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let telegramId: number;
  try {
    telegramId = await requireSession();
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }
  const { id } = await params;
  const key = await getKeyForUser(BigInt(telegramId), id);
  if (!key) notFound();
  ...
}
```
Use `getTicketForUser(...)` → `notFound()`; render `TicketThread` + `TicketComposer` + `MarkReadOnOpen` island. Styling constants `CARD`/`PRIMARY`/`SECONDARY` (`app/keys/[id]/page.tsx:36-40`) are reused across the phase.

---

### Components

#### `components/TicketStatusChip.tsx`
**Analog:** `components/PaymentStatusChip.tsx` — EXACT. Copy the `BADGE_BASE`/`CHIP_TINT` maps + `chipStatus`/`chipLabel` switch pattern (lines 15-78). Map `open`→? , `answered`→green, `closed`→zinc; literal `t("ticket.status…")` calls only, never interpolate the raw status.

#### `components/TicketList.tsx`
**Analog:** `components/PaymentHistoryList.tsx` — EXACT. Empty→keyed empty state; ≥2→`tp("ticket.count", n)`; row article `key={row.id}` with `TicketStatusChip`; long ids truncate with `title` (lines 51-111).

#### `components/TicketThread.tsx`
**Analog:** `components/PaymentHistoryList.tsx` row layout + `components/SubscriptionCard.tsx` article/card chrome (lines 43-63). Presentational only — server passes messages; author bubbles use keyed labels, never raw `author`.

#### `components/AttachmentImage.tsx`
**Analog:** `components/QrSvg.tsx` (server-injected inert content) / `CopyButton.tsx` (client island). Must render `<img src={"/api/tickets/" + ticketId + "/attachments/" + attachmentId}>` — the gated same-origin route (D-56), never a filesystem path. `loading="lazy"`, bounded size.

#### `components/CreateTicketForm.tsx`
**Analog:** `components/PayCta.tsx` (client island: in-flight lock, keyed error + retry, fetch BFF) + `components/ConfirmPanel.tsx` (pending/error state).
```tsx
const [state, setState] = useState<PayState>('idle');
const createOrder = useCallback(async () => {
  if (state === 'loading') return; // in-flight lock
  setState('loading');
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...}) });
    if (!res.ok) throw new Error('order_create_failed');
    ...
  } catch { setState('error'); }
}, [state, ...]);
```
New detail: build `FormData` (do **not** set `Content-Type`) with `subject`, `body`, `attachment` (File) → `fetch('/api/tickets', { method:'POST', body: form })`; enforce 5 MiB client-side too; `router.push`/`router.refresh()` on success (D-53/D-55).

#### `components/TicketComposer.tsx`
**Analog:** `components/PayCta.tsx` — EXACT. Posts text (and optional attachment) to `/api/tickets/[id]/messages`, in-flight lock, keyed error + retry, `router.refresh()` on success.

#### `components/MarkReadOnOpen.tsx`
**Analog:** `components/ConfirmPanel.tsx` client `useEffect` + `router.refresh()` (lines 40, 58-98).
```tsx
'use client';
useEffect(() => {
  if (sent.current) return;
  sent.current = true;
  void fetch(`/api/tickets/${ticketId}/read`, { method: 'POST' })
    .then(() => router.refresh())
    .catch(() => {/* silent — retries on next open */});
}, [ticketId, router]);
```
Must fire once on mount (not on server render) and clear the badge exactly once (D-58/Pitfall 6).

#### `components/SupportEntry.tsx`
**Analog:** `components/SubscriptionCard.tsx` card + nav `Link` (`app/keys/[id]/page.tsx:218-225`). A link/card to `/support` with keyed copy; optional unread badge count.

---

### Config files

#### `docker-compose.yml` (MOD)
**Analog:** itself. Add a named `uploads` volume + `UPLOAD_DIR: /data/uploads` to the `web` service, mirroring the existing `pgdata` volume (`docker-compose.yml:9-41`):
```yaml
services:
  web:
    environment:
      UPLOAD_DIR: /data/uploads
    volumes:
      - uploads:/data/uploads
volumes:
  pgdata:
  uploads:
```

#### `next.config.ts` (MOD)
**Analog:** itself (`next.config.ts:1-8`). Add the sharp tracing include:
```ts
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: { "/api/tickets/**": ["node_modules/sharp/**/*", "node_modules/@img/**/*"] },
};
```

#### `lib/i18n/messages/ru.ts` (MOD)
**Analog:** itself. Add `ticket.*`, `support.*`, `bot.ticket*`, `bot.expiryReminder*` keys under the existing namespaces (`ru.ts:5-181`), using the same keyed/interpolated style (`status.expiring`, `bot.payProvisioned`). The completeness gate (`tests/unit/i18n.test.ts:67-77`) fails on **any missing or unused** key — every new key must be referenced in a `t()`/`tp()` call, and every new string must be registered here (AG-6). `flattenMessages`/`allKeys`/`I18nKey` are automatic (`ru.ts:183-213`).

---

### Tests

#### `tests/unit/tickets-service.test.ts` (DB-backed)
**Analog:** `tests/unit/keys-service.test.ts` — EXACT. Pattern: real local Postgres + spied provider, `cleanup()` helper, `beforeAll` creates owner + other user, `afterAll` restores mocks + cleans up.
```ts
const TELEGRAM_ID = BigInt('200000040');
const OTHER_TELEGRAM_ID = BigInt('200000041');
async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
  if (user) await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { telegramId } });
}
beforeAll(async () => { await cleanup(); ... });
afterAll(async () => { vi.restoreAllMocks(); await cleanup(); });
```
Cases: create→open, status transitions, reopen-in-thread (no new ticket), unread increment once/clear, non-owner→null (RESEARCH Validation Map SUP-01).

#### `tests/unit/ticket-attachments.test.ts` (unit, real sharp)
**Analog:** `tests/unit/qr.test.ts` — pure/vector style, no DB/network. Test `normalizeImage` accepts jpeg/png/webp, rejects other bytes (`UnsupportedImageError`), downscales ≤1600, returns webp, enforces size cap + path-stays-under-`UPLOAD_DIR`.

#### `tests/unit/ticket-notify.test.ts` (unit + fake sender)
**Analog:** `tests/unit/bot-payments.test.ts` — EXACT. Builders + `dispatchTicketNotification` with an inline fake `TelegramSender`, asserting owning-chat targeting and reschedule on send failure.

#### `tests/unit/reminder-cron.test.ts` (DB + fake sender)
**Analog:** `tests/unit/outbox-worker.test.ts` cleanup/`makeOrder`/`beforeEach` truncation style (lines 39-96). Assert `listExpiringKeys` window (includes trial, ≤3d, excludes expired/>3d), per-day idempotency, and correct button per trial/non-trial.

#### `tests/unit/tickets-route.test.ts` (route unit)
**Analog:** `tests/unit/devices-route.test.ts` — EXACT. Mock `next/headers`, `vi.hoisted` session token, `signSession`, `authorize()`, `idContext`, `request() = new Request('http://localhost')`. Add multipart `FormData`/`File` cases (Node 24 globals): 401, 413 >5 MiB, 400 bad type, 404 non-owner, 200 owner/admin + `nosniff` header.

#### `tests/unit/notifications-queue.test.ts` (DB unit)
**Analog:** `tests/unit/outbox-worker.test.ts` + `trial-claim.test.ts`. Assert `enqueueNotification` idempotency (second call = no-op) and single-winner `claimNextNotification`.

---

## Shared Patterns

### Session gate (all user BFF routes + RSC pages)
**Source:** `lib/session.ts:24-30`, `app/api/trial/route.ts:15-25`, `app/keys/[id]/page.tsx:64-70`
**Apply to:** `app/api/tickets/**`, `app/support/**`, `app/api/admin/**` (via `requireAdminSession`)
```ts
let telegramId: number;
try {
  telegramId = await requireSession();
} catch (err) {
  if (err instanceof SessionError) return Response.json({ error: "unauthorized" }, { status: 401 });
  logger.error({ route: "<route>", outcome: "session_error" });
  return Response.json({ error: "internal" }, { status: 500 });
}
```

### Ownership join — non-owned ≡ 404/null (no oracle)
**Source:** `lib/orders-service.ts:227-234`, `lib/keys-service.ts:167-175`
**Apply to:** every ticket read/reply/read route and the gated attachment route
```ts
prisma.ticket.findFirst({ where: { id, user: { telegramId } } });
```

### Idempotent queue + atomic claim
**Source:** `lib/outbox.ts:24-30` (upsert), `lib/outbox.ts:65-81` (claim), `lib/outbox.ts:83-121` (updateMany writers)
**Apply to:** `Notification` enqueue/claim/state-writers in `lib/outbox.ts`; drained by `lib/worker.ts`. UNIQUE `dedupeKey` gives exactly-once (ticket reply: `ticket:{id}:{messageId}`; reminder: `remind:{keyId}:{YYYY-MM-DD}`).

### Outbox-driven delivery — never sync Telegram send
**Source:** `lib/bot-payments.ts:175-221` (`dispatchNotification`), `lib/worker.ts:245-263` (drain), D-57
**Apply to:** support reply fan-out + expiry reminders. Admin routes enqueue only; worker resolves `String(user.chatId ?? user.telegramId)`.

### Keyed RU copy via `t()`/`tp()` + i18n completeness gate
**Source:** `lib/i18n/messages/ru.ts`, `lib/i18n/index.ts`, `tests/unit/i18n.test.ts:67-77`, `lib/keys-service.ts:68-85`
**Apply to:** all new visible strings (components, bot, notify builders). Literal keys only — never `t(\`prefix.${x}\`)` (i18n scanner misses them).

### PII-safe logging
**Source:** `lib/logger.ts` header + `lib/orders-service.ts:149`, `lib/worker.ts:120`, AG-8
**Apply to:** all new code — log `ticketId`/`attachmentId`/`outcome`/typed `code` only; never log message bodies, attachment paths/bytes, or subscription URLs.

### Singleton guards (worker / bot / polling)
**Source:** `lib/worker.ts:350-352`, `lib/bot.ts:441-448`, `instrumentation.ts:11-20`
**Apply to:** `startWorker` extension (reminder tick) and `instrumentation.ts` bootstrap. Lazy imports keep `next build` from evaluating runtime secrets.

### Presentational chip / list / card styling
**Source:** `components/PaymentStatusChip.tsx:15`, `PaymentHistoryList.tsx:51-111`, `SubscriptionCard.tsx:13-29`, `app/keys/[id]/page.tsx:36-40`
**Apply to:** `TicketStatusChip`, `TicketList`, `TicketThread`, `SupportEntry`. Reuse `BADGE_BASE`, `CARD`, `PRIMARY`, `SECONDARY`, `tabular-nums`, dark-mode pairs, ≥44px (`h-11`) touch targets.

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/attachments.ts` (sharp half) | service | file-I/O + transform | No image-decode/`sharp` or filesystem-write code exists; only `lib/qr.ts` produces an in-memory Buffer. Use RESEARCH §Attachment Pipeline verbatim. |
| `app/api/tickets/route.ts` (multipart half) | controller | multipart upload | Every existing route is JSON-only; `req.formData()`/`File` handling is new. Use RESEARCH §Attachment Pipeline (cabinet). |
| `app/api/tickets/[id]/attachments/[attachmentId]/route.ts` (stream half) | controller | file-I/O | No route streams bytes from disk; existing routes return JSON only. Use RESEARCH §Gated serving route. |
| `lib/admin.ts` / `requireAdminSession` | middleware | request-response | No role/admin concept exists yet (Phase 5 owns roles). Use RESEARCH Open Q1 recommendation (`ADMIN_TELEGRAM_IDS` env allow-list). |

---

## Metadata

**Analog search scope:** `lib/`, `app/`, `components/`, `tests/`, `prisma/`, root config (`next.config.ts`, `docker-compose.yml`, `.env.example`).
**Files scanned:** 30 analog source/test/config files read this session (all `git ls-files`-verified tracked).
**Pattern extraction date:** 2026-10-03
**Tracked-source gate:** PASS — every analog path prints under `git ls-files --`; zero gitignored-mirror paths emitted.

*Phase: 04-support-retention*

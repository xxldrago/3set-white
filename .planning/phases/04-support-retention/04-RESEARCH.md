# Phase 4: Support & Retention — Research

**Researched:** 2026-10-03
**Domain:** Ticket/thread support (bot + PWA), image attachments on a local volume, outbox-driven reply fan-out, daily expiry-reminder cron (Telegram push with inline renew button)
**Confidence:** MEDIUM (in-repo discrete values read this session are HIGH; official Next.js / Telegram Bot API / Telegraf docs are CITED; sharp package recommendation is ASSUMED due to a SUS legitimacy verdict — see audit)

> Provenance tags used below: `[VERIFIED: path:lines]` = opened the source-of-truth file with Read this session (quote included). `[CITED: url]` = official documentation fetched this session. `[ASSUMED]` = training/codebase-pattern knowledge not proven this session.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ticket model**

- **D-49:** Тикет = thread-диалог: `Ticket` + `TicketMessage` (сообщения внутри); не плоские обращения — **Reversibility:** costly — переход к плоской модели ломает историю и очередь
- **D-50:** Статусы `open → answered → closed`; ответ пользователя в answered/closed тикет переоткрывает его (`reopens`) — **Reversibility:** costly — смена семантики статусов затрагивает очередь, UI и fan-out
- **D-51:** Ответы поддержки в Phase 4 — только через admin/API (session-gated admin-эндпоинты/бот); полноценная панель в Phase 5 — не строим reply-UI для агентов сейчас
- **D-52:** Простая модель v1: subject (тема/первое сообщение), без категорий и приоритетов

**Attachments**

- **D-53:** Хранение — локальный volume на сервере (single-server), в БД путь/метаданные; не S3 — **Reversibility:** costly — переезд на объектное хранилище затрагивает upload/download/миграцию файлов
- **D-54:** Только изображения (jpg/png/webp), лимит 5 МБ, downscale через `sharp` перед сохранением
- **D-55:** Бот получает вложение через Telegram Bot API (`getFile` по file_id); кабинет — multipart upload; оба пути ведут в один attachment-контракт
- **D-56:** Отдача вложений — gated: авторизованный роут отдаёт файл только владельцу тикета или админу; публичных URL нет — **Reversibility:** costly — публичные URL = утечка PII/скриншотов

**Reply fan-out**

- **D-57:** Доставка ответа поддержки в оба канала — через outbox-worker (существующий `lib/outbox.ts`): Telegram push + отражение в кабинете; синхронной отправки нет — **Reversibility:** costly — sync-send теряет ответы при Bot API сбое
- **D-58:** Учёт непрочитанных: счётчик/бейдж в кабинете + пуш в бот; отметка `read` при открытии тикета
- **D-59:** Ответ пользователя в answered/closed тикет → сообщение в тот же thread, статус `reopens` (не новый тикет)

**Expiry reminders (PAY-05)**

- **D-60:** Триггер — ежедневный cron-джоб (через `instrumentation.ts`, как reconcile Phase 3); сканирует ключи с истечением ≤ 3 дней
- **D-61:** Напоминать ежедневно до истечения (не однократно) — **Reversibility:** costly — смена частоты затрагивает дедуп/идемпотентность и качество UX (риск спама)
- **D-62:** Напоминание содержит inline-кнопку «Продлить» → renew-flow Phase 3
- **D-63:** Напоминаем и по trial-ключам (include trial), несмотря на запрет renew — CTA для trial ведёт к покупке полного

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

---

## Project Constraints (from AGENTS.md)

Actionable directives from `./AGENTS.md` that this phase must honor (treated with locked-decision authority):

| # | Directive | Impact on Phase 4 |
|---|-----------|-------------------|
| AG-1 | Tech stack: Node + Next.js + Telegraf (user decision). | Keep ticket/attachment/reminder logic in the existing Next process + Telegraf singleton; no new service. |
| AG-2 | API limits: trial cannot renew/upgrade; permanent delete returns no funds; handle 401/402/409/429/502/503 and `Retry-After`. | Reminders for trial keys must offer **buy**, never renew (D-63); attachment pipeline is offline (no ARTEMIDA calls); no new ARTEMIDA writes this phase. |
| AG-3 | Security: `ARTEMIDA_API_KEY`, Platega secrets, SSH/root password — env/secrets only; **no secret commits**. | New config (`UPLOAD_DIR`, `ADMIN_TELEGRAM_IDS`) goes to `.env`/`.env.example` placeholders + `lib/env.ts`; never commit real values. |
| AG-4 | Compatibility: installable PWA, Telegram Bot API + Login Widget. | New cabinet routes must not break the PWA shell; bot attachment flow uses Bot API only. |
| AG-5 | Infrastructure: single server, domain `my.3set.online`; HTTPS required. | Attachment volume is a single-host Docker volume; gated serving is same-origin HTTPS only; no public URL (D-56). |
| AG-6 | Compliance: RU/RUB, unlimited default. | All new strings via `t()`/`tp()` in RU; no English; no raw provider text to users (D-19/D-24). |
| AG-7 | GSD workflow enforcement; do not edit outside a GSD workflow. | Executor must work through the planned GSD tasks. |
| AG-8 | PII discipline (AGENTS.md + `lib/logger.ts` header): log ids/outcomes only. | Never log attachment bytes/paths, support message bodies, or the reminder's sub-link; log `ticketId`/`attachmentId`/`outcome` only. |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUP-01 | Пользователь создает обращение в поддержку из бота и из кабинета, все падают в единую очередь со статусами open/answered/closed | §Data Model (Ticket/TicketMessage, status enum, ownership join), §Architecture Patterns (one `lib/tickets-service.ts` write path for both channels), §Code Examples (create + bot intake) |
| SUP-02 | Пользователь может прикрепить фото/скриншот к тикету из обоих каналов | §Attachment Pipeline (getFile → Buffer → sharp → volume), §Code Examples (sharp recipe, multipart route, gated serve), §Security Domain (magic-byte, path traversal, nosniff) |
| SUP-03 | Ответ поддержки доставляется и в бот, и в кабинет (fan-out по `chat_id`) | §Reply Fan-out (Notification queue + `drainOutbox` consumer, owning `chatId` resolution, `dispatchNotification` pattern) |
| PAY-05 | Пользователь получает push-напоминание в Telegram за 3 дня до истечения с кнопкой продления | §Expiry Reminders (`listExpiringKeys`, daily tick, per-day dedupe, inline `key:renew`/trial buy button) |
</phase_requirements>

---

## Summary

Phase 4 adds the two remaining user-facing capabilities on top of the Phase 3 foundation: a **support thread system** reachable from both the Telegram bot and the PWA cabinet, and a **daily expiry-reminder push** with an inline renew button. Every capability is a composition of patterns this codebase already owns: one shared service module per domain, session-gated BFF routes, ownership joins where non-owned ≡ 404, an idempotent outbox queue drained by the in-process worker started from `instrumentation.ts`, and all user-visible copy resolved through `t()`/`tp()`.

The ticket model is a two-table thread (`Ticket` 1→N `TicketMessage`), with attachments as a third table keyed to a message. Both creation channels call the **same** `lib/tickets-service.ts` function, so the "единая очередь" (SUP-01) is a property of the write path, not a synchronization job. Attachments converge on one contract: Bot API `getFile` → `getFileLink` → `fetch` → `Buffer`, and cabinet `multipart/form-data` → `File` → `Buffer`; both then run through the same `sharp` validate/downscale pipeline and land on a local volume with DB metadata only. Serving is a gated same-origin BFF route that authorizes owner-or-admin and never exposes a stored path or public URL (D-56).

Reply fan-out and reminders reuse the outbox/worker spine. The existing `Outbox` table is **order-scoped** (`orderId` required, `@@unique([orderId, type])`), so ticket replies and expiry reminders cannot be represented in it without overloading a money-path table. The recommended design is a sibling **`Notification` delivery queue** (same status enum + single-winner conditional-claim discipline) with queue helpers added to `lib/outbox.ts` and consumed by the existing `drainOutbox` loop — this honors D-57 ("через outbox-worker, существующий `lib/outbox.ts`") while keeping the order outbox byte-for-byte intact. Reminder idempotency is a UNIQUE `dedupeKey` (`remind:{keyId}:{YYYY-MM-DD}`), which makes "daily until expiry" (D-61) exactly-once per key per day even if the tick fires twice.

**Primary recommendation:** Build one `lib/tickets-service.ts` (shared write/read path), one `lib/attachments.ts` (sharp + volume), one `lib/ticket-notify.ts` (pure copy builders + dispatch), a `Notification` queue drained by `lib/worker.ts`, and a daily reminder tick in `lib/worker.ts`; add `sharp` as a direct dependency and mount a named uploads volume in `docker-compose.yml`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ticket lifecycle (create, status, reopen, unread) | API / Backend (`lib/tickets-service.ts`) | Database (`Ticket`/`TicketMessage`) | One shared write path so bot and cabinet cannot diverge (SUP-01/SUP-03). |
| Ticket list / thread / composer | Frontend Server (RSC) | Client islands (composer, mark-read) | Session-gated RSC reads through the service; small client islands own submit/refresh (UI-SPEC §1–§3). |
| Attachment ingest (bot) | Bot process (Telegraf) | API / Backend (`lib/attachments.ts`) | Bot is a client of the same service; `getFile` download happens in-process, then the shared pipeline runs. |
| Attachment ingest (cabinet) | API / Backend (BFF multipart route) | — | Session-gated route validates + hands bytes to the shared pipeline. |
| Attachment validation / downscale | API / Backend (`sharp`, server-only) | — | Native image library must run server-side; magic-byte detection is the security boundary. |
| Attachment storage | Filesystem volume (server) | Database (metadata) | D-53: local volume + DB path/metadata; never S3, never a public path. |
| Gated attachment serving | API / Backend (BFF route) | — | D-56: owner-or-admin authorization, streamed from disk, no public URL. |
| Reply fan-out | Outbox worker (async backend) | Telegram client + cabinet read | D-57: durable delivery through the queue; bot push + cabinet read both project the same row. |
| Unread badge | Backend (counter) | Client (render) | Counter is written on support reply, cleared on read-on-open (D-58). |
| Expiry reminder scan | Backend worker (`instrumentation.ts` cron) | Database (`keys_cache`) | D-60: daily scan of keys expiring ≤3 days; enqueue delivery. |
| Reminder delivery + inline button | Outbox worker | Telegram client | D-62/D-63: durable push with an inline renew/buy button. |
| Admin/support reply + close | API / Backend (admin-gated routes) | — | D-51: replies only via admin/API this phase; no agent UI. |

---

## Standard Stack

### Core (already in the project — no change)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | `16.3.7` `[VERIFIED: package.json:16]` | RSC support pages + BFF routes (`/api/tickets`, gated attachment serve) | Already the single process for cabinet + bot (AGENTS.md). |
| React | `19.2.8` `[VERIFIED: package.json:21]` | Client islands (composer, mark-read) | Peer of Next 16. |
| Telegraf | `4.16.3` `[VERIFIED: package.json:23]` | Bot support intake + reminder push + `getFile`/`sendMessage` | Mandated stack; `getFileLink` is the documented download path. |
| Prisma | `^7.10.0` `[VERIFIED: package.json:36]` / `@prisma/client 7.10.0` `[VERIFIED: package.json:27]` | `Ticket`/`TicketMessage`/`Attachment` + `Notification` migration | Existing ORM; `migrate deploy` in the container entrypoint. |
| zod | `4.6.5` `[VERIFIED: package.json:24]` | Route-boundary validation (form fields, ids, admin gate) | Every BFF boundary already uses zod. |
| pino | `10.3.1` `[VERIFIED: package.json:19]` | Structured logs (PII-safe) | Existing `lib/logger.ts`. |
| vitest | `5.0.3` `[VERIFIED: package.json:40]` | Unit/integration tests | Existing runner; DB-backed on `setwhite`. |

### Supporting (new direct dependency)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sharp` | `^0.35.5` `[ASSUMED — see Package Legitimacy Audit]` | Server-side image validation (magic-byte format) + downscale before storage | Every attachment from both channels (D-54). Must be a **direct** dep (it is currently only a transitive optional dep of `next`). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sharp` | `jimp` (pure JS) | Pure JS avoids native binaries but is much slower and weaker at format detection/metadata; `sharp` is already present in the image. Use `jimp` only if native install is impossible. |
| `sharp.metadata().format` for type checks | `file-type` (magic-byte sniff) | `file-type` is a viable magic-byte checker, but `sharp` already reads the header and is needed anyway for downscale — adding `file-type` is redundant. |
| DB `User.awaitingSupport` flag for bot state | Telegraf `session` middleware | A session store adds a dependency and is lost on webhook/restart; a persisted flag survives restarts and is testable. |
| Separate `Notification` queue | Generalize the `Outbox` table (nullable `orderId` + `dedupeKey`) | Overloading the money-path outbox is riskier; a sibling table with the same claim discipline is additive and cannot regress Phase 3. |

**Installation:**
```bash
npm install sharp@^0.35.5
```

**Version verification:** `npm view sharp version` → `0.35.5`; `engines: { node: '>=20.9.0' }` (runtime is Node `v24.15.0`); `time.modified 2026-09-27`. `sharp` is already installed at `0.35.5` (`[VERIFIED: node_modules/sharp/package.json]`) as `next@16.3.7`'s optional dependency (`[VERIFIED: npm view next@16.3.7 optionalDependencies]` → `{ sharp: '^0.35.4' }`), but it must be promoted to a direct dependency so `npm ci` guarantees it on the deploy platform.

---

## Package Legitimacy Audit

> Run via `gsd_run query package-legitimacy check --ecosystem npm sharp`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `sharp` | npm | latest patch `0.35.5` published 2026-09-27 (lineage: 0.34.x, 0.33.x, years old) | 128,296,148/wk | `git+https://github.com/lovell/sharp.git` | **SUS** (reported reason: `too-new`) | **Flagged** — keep, but planner MUST add `checkpoint:human-verify` before install; pin `^0.35.5` |

**Assessment of the SUS verdict:** the only reported signal is `too-new`, which the seam derives from the **latest patch publish date** (0.35.5, four days before research). The remaining signals are all clean/strong: 128M weekly downloads, an official `lovell/sharp` GitHub repo, `deprecated: false`, and `postinstall: null`. This is a **false positive on release recency**, not evidence of a slopsquatted package. Per the SUS protocol it is still flagged and gated behind a human checkpoint.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `sharp` — planner inserts `checkpoint:human-verify` before the install task.

*`sharp` was discovered from the project's own `.planning/research/STACK.md` and from `next@16.3.7`'s `optionalDependencies`, confirmed on the npm registry, and inspected (`engines`, `postinstall: null`, repo URL). Because the legitimacy seam returns `SUS` (not `OK`), it is tagged `[ASSUMED]` per the package-name provenance rule and the planner must gate its install behind a human checkpoint. No other external packages are added this phase.*

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────────────┐
   Telegram user ───► │ Bot webhook (Telegraf)   │
                      │  /api/telegram/webhook/  │
                      │  [secret] → handleUpdate  │
                      └────────────┬─────────────┘
                          menuSupport / awaitingSupport
                                   │
        PWA cabinet (browser)      ▼
   /support, /support/new,  ┌──────────────────────────┐
   /support/[id]  ────────► │ lib/tickets-service.ts   │◄── admin reply/close
   (RSC + client islands)   │  create / append / read  │    /api/admin/tickets/*
        │                   └───────┬──────────────────┘
        │ multipart                 │ write
        ▼                           ▼
   /api/tickets (create/reply)   Postgres: Ticket ──< TicketMessage ──< Attachment
        │                                           (status, unreadForUser)
        │ bytes                        │ metadata            ▲
        ▼                              │                     │ path
   lib/attachments.ts                  │                     │
   (magic-byte + sharp downscale) ─────┼──────────► local volume (UPLOAD_DIR)
        ▲                              │
        │ getFileLink → fetch(Buffer)  │ enqueue delivery (dedupeKey UNIQUE)
   Bot photo ──────────────────┘       ▼
                                 lib/outbox.ts :: Notification queue
                                        │ claimNextJob (single winner)
                                        ▼
                              lib/worker.ts :: drainOutbox
                              ├── notify-ticket-reply → owning chatId (Telegram push)
                              └── remind-expiry       → keyed copy + inline button
                                        ▲
   instrumentation.ts ── daily tick ────┘ (listExpiringKeys ≤3d → enqueue)
                                        ▲
   /api/cron/remind (secret-gated fallback, mirrors /api/cron/reconcile)
```

**Trace the primary use case:** cabinet user submits `/support/new` → `POST /api/tickets` → `lib/attachments.ts` (sharp) → volume + DB → admin replies via `/api/admin/tickets/[id]/reply` → `Notification` row (`dedupeKey=ticket:{ticketId}:{messageId}`) → `drainOutbox` pushes to `chatId` and the cabinet thread shows the same message with an unread badge. Reminder path: daily tick scans `keys_cache` → enqueues `remind:{keyId}:{date}` → worker sends the keyed copy with an inline renew/buy button.

### Recommended Project Structure (new/changed files)

```
app/
├── support/page.tsx                    # NEW RSC ticket list (session-gated)
├── support/new/page.tsx                # NEW RSC shell + CreateTicketForm island
├── support/[id]/page.tsx               # NEW RSC thread + MarkReadOnOpen island
└── api/
    ├── tickets/route.ts                # NEW POST create (multipart)
    ├── tickets/[id]/messages/route.ts  # NEW POST user reply (reopen, D-59)
    ├── tickets/[id]/read/route.ts      # NEW POST mark read (D-58)
    ├── tickets/[id]/attachments/[attachmentId]/route.ts  # NEW GET gated serve (D-56)
    ├── admin/tickets/[id]/reply/route.ts  # NEW admin reply (D-51)
    ├── admin/tickets/[id]/close/route.ts  # NEW admin close (D-51)
    └── cron/remind/route.ts            # NEW secret-gated reminder fallback (A6 pattern)
components/
├── TicketStatusChip.tsx  TicketList.tsx  TicketThread.tsx  AttachmentImage.tsx
├── CreateTicketForm.tsx  TicketComposer.tsx  MarkReadOnOpen.tsx  SupportEntry.tsx
lib/
├── tickets-service.ts     # NEW shared write/read path (both channels)
├── attachments.ts         # NEW sharp + volume pipeline (server-only)
├── ticket-notify.ts       # NEW pure builders + dispatch (testable)
├── reminders-service.ts   # NEW listExpiringKeys + enqueue
├── outbox.ts              # MODIFIED — Notification queue helpers
├── worker.ts              # MODIFIED — notification drain + reminder tick
├── env.ts                 # MODIFIED — UPLOAD_DIR, ADMIN_TELEGRAM_IDS
├── session.ts             # MODIFIED — requireAdminSession (or lib/admin.ts)
└── bot.ts                 # MODIFIED — menuSupport, awaitingSupport intake, reminder callbacks
prisma/schema.prisma       # MODIFIED — Ticket/TicketMessage/Attachment/Notification + User.awaitingSupport
docker-compose.yml         # MODIFIED — uploads named volume + UPLOAD_DIR
.env.example               # MODIFIED — UPLOAD_DIR, ADMIN_TELEGRAM_IDS placeholders
```

### Pattern 1: One write path, two channel heads (SUP-01/SUP-03)

**What:** bot and cabinet both call `lib/tickets-service.ts`; neither touches Prisma for tickets directly.
**When to use:** every ticket create/reply/read.
**Example (shape):**
```ts
// lib/tickets-service.ts — shared by bot handlers and BFF routes
export async function createTicket(input: {
  telegramId: bigint;
  subject: string;
  body: string;
  attachment?: NormalizedAttachment | null;
}): Promise<{ id: string }> {
  // resolve user, create Ticket + first TicketMessage (+ Attachment) in one transaction
}
```
This mirrors `lib/keys-service.ts` / `lib/orders-service.ts`, the established single-path discipline (`[VERIFIED: lib/keys-service.ts:1-13]`).

### Pattern 2: Atomic single-winner claim (idempotent queue)

**What:** the notification queue reuses the exact claim discipline of `lib/outbox.ts`.
**When to use:** all ticket-reply and reminder deliveries.
**Example (established, `[VERIFIED: lib/outbox.ts:65-81]`):** `findMany` candidates → per-row `updateMany({ where: { id, status: 'pending' } })`; `count === 1` wins. A generic `claimNextJob(delegate, type)` lets both `Outbox` and `Notification` share it.

### Pattern 3: Pure builders + injectable Telegram sender

**What:** copy/rows/button construction and `dispatchNotification` live in a pure module with an injectable `TelegramSender`; handlers stay thin.
**When to use:** ticket-reply fan-out and reminder push.
**Source:** established in `lib/bot-payments.ts` (`[VERIFIED: lib/bot-payments.ts:148-221]`), including the `sendMessage(chatId, text, extra?)` signature needed for inline keyboards.

### Pattern 4: Gated same-origin file serving

**What:** `GET /api/tickets/[id]/attachments/[attachmentId]` resolves attachment → message → ticket → owner, authorizes owner-or-admin, then streams the file from the local volume with `Content-Type` from DB, `X-Content-Type-Options: nosniff`, and a private cache header. Non-owned ≡ 404.
**When to use:** all attachment display (UI-SPEC §4).

### Pattern 5: Daily cron via `instrumentation.ts` (D-60)

**What:** `startWorker()` already starts a 5 s drain and an hourly reconcile tick (`[VERIFIED: lib/worker.ts:350-374]`). Add a daily reminder tick the same way (unref'd `setInterval`), plus an early run on boot so a container restart does not skip a day, plus a secret-gated `/api/cron/remind` fallback mirroring `app/api/cron/reconcile/route.ts` (`[VERIFIED: app/api/cron/reconcile/route.ts:26-45]`).

### Anti-Patterns to Avoid

- **Sync-sending support replies inside the admin request.** D-57 forbids it; a Bot API blip loses the reply. Always enqueue and let the worker deliver (`[VERIFIED: lib/bot.ts` / `lib/worker.ts` notification consumer pattern`]`).
- **Trusting the client `File.type` or the bot filename.** Spoofable. Detect format from bytes via `sharp.metadata().format` and reject anything not jpeg/png/webp.
- **Storing or serving an absolute/user-controlled path.** A filename like `../../etc/passwd` must never reach `fs`. Always generate the storage name (`randomUUID()`), store a relative path, and re-validate `path.resolve(UPLOAD_DIR, stored).startsWith(path.resolve(UPLOAD_DIR))` before reading.
- **Public attachment URLs / third-party image hosts.** D-56: the only URL is the gated same-origin route.
- **Overloading the order `Outbox`** (nullable `orderId` on a money-path table) when a sibling `Notification` queue is additive and risk-free.
- **Rendering raw status/provider strings.** `TicketStatusChip` maps `open/answered/closed` to literal keyed labels; never interpolate the raw status (UI-SPEC color table).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image decode/validate/downscale | A custom header parser + manual resize | `sharp` (`metadata()`, `resize()`, `rotate()`, `toBuffer({resolveWithObject:true})`) | Correct format detection, EXIF auto-orient, decompression-bomb guard (`limitInputPixels`), format encoders — all hard to replicate. |
| Durable async delivery | Direct `sendMessage` in the request; ad-hoc retry timers | Existing outbox claim/reschedule + `lib/worker.ts` loop | Survives restarts, honors backoff, single-winner claim (Phase 3 proven). |
| Idempotent reminders | A boolean `remindedAt` on the key | UNIQUE `dedupeKey` (`remind:{keyId}:{date}`) | A per-day unique key gives exactly-once per day with no extra state and no double-send on tick overlap. |
| Telegram file download | Hand-built Bot API URLs / parsing | `ctx.telegram.getFileLink(file_id)` then `fetch(link)` | Telegraf builds the `…/file/bot<token>/<file_path>` URL, including local-API-server and test-env variants `[CITED: github.com/telegraf/telegraf/blob/master/src/telegram.ts]`. |
| Session/admin authorization | Per-route ad-hoc checks | `requireSession()` + a `requireAdminSession()` helper | Existing discipline; one place to change when Phase 5 adds real roles. |
| Standing up a job queue (BullMQ/Redis) | A new broker | Existing `Notification` table + `setInterval` worker | Matches Phase 3's deliberate no-broker v1 decision; single server. |

**Key insight:** every one of these is already solved in this repo or by a single well-established native library; the phase is composition, not invention.

---

## Data Model (Prisma 7)

The existing schema is the working template for enums, relations, indexes, `@map`, and cascades (`[VERIFIED: prisma/schema.prisma:51-116]`, quoted values: `enum OrderKind { new renew upgrade }`, `enum OrderStatus { pending paid provisioning provisioned failed canceled refunded }`, `enum OutboxStatus { pending processing done failed }`, `@@unique([orderId, type])`, `@@index([status, nextAttemptAt])`). Apply the same conventions:

```prisma
// prisma/schema.prisma (ADD)

enum TicketStatus {
  open
  answered
  closed
}

enum TicketAuthor {
  user
  support
}

model Ticket {
  id            String          @id @default(cuid())
  userId        Int             @map("user_id")
  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject       String
  status        TicketStatus    @default(open)
  unreadForUser Int             @default(0) @map("unread_for_user")
  lastMessageAt DateTime        @default(now()) @map("last_message_at")
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")
  messages      TicketMessage[]

  @@index([userId, lastMessageAt])
  @@index([status, lastMessageAt])
  @@map("tickets")
}

model TicketMessage {
  id          String       @id @default(cuid())
  ticketId    String       @map("ticket_id")
  ticket      Ticket       @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author      TicketAuthor
  body        String?      // nullable: an image-only message is valid (UI-SPEC §2)
  createdAt   DateTime     @default(now()) @map("created_at")
  attachments Attachment[]

  @@index([ticketId, createdAt])
  @@map("ticket_messages")
}

model Attachment {
  id        String        @id @default(cuid())
  messageId String        @map("message_id")
  message   TicketMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  path      String        // relative to UPLOAD_DIR only — never absolute
  mime      String
  sizeBytes Int           @map("size_bytes")
  width     Int?
  height    Int?
  createdAt DateTime      @default(now()) @map("created_at")

  @@index([messageId])
  @@map("ticket_attachments")
}
```

**User additions** (for the bot intake state and relations):
```prisma
model User {
  // …existing…
  tickets         Ticket[]
  awaitingSupport Boolean   @default(false) @map("awaiting_support")
  supportPromptAt DateTime? @map("support_prompt_at") // TTL for the awaiting flag
}
```

**Delivery queue** (recommended sibling to `Outbox`, same status enum):
```prisma
model Notification {
  id              String       @id @default(cuid())
  type            String       // notify-ticket-reply | remind-expiry
  dedupeKey       String       @unique @map("dedupe_key")
  userId          Int?         @map("user_id")
  ticketId        String?      @map("ticket_id")
  ticketMessageId String?      @map("ticket_message_id")
  keyId           String?      @map("key_id")
  status          OutboxStatus @default(pending)
  attempts        Int          @default(0)
  lastError       String?      @map("last_error")
  nextAttemptAt   DateTime     @default(now()) @map("next_attempt_at")
  createdAt       DateTime     @default(now()) @map("created_at")
  processedAt     DateTime?    @map("processed_at")

  @@index([status, nextAttemptAt])
  @@map("notifications")
}
```

**Status transition rules:**
- create (user) → `open`; `unreadForUser = 0`.
- admin reply → `answered`; `unreadForUser += 1`; `lastMessageAt = now`.
- admin close → `closed`.
- user reply in `answered`/`closed` → same thread, `status = open`, `lastMessageAt = now` (D-59; never a new ticket).
- read-on-open → `unreadForUser = 0`.

**Ownership join:** `prisma.ticket.findFirst({ where: { id, user: { telegramId } } })` — mirrors `getKeyForUser`/`loadOrderForUser` (`[VERIFIED: lib/orders-service.ts:227-234]`, `[VERIFIED: lib/keys-service.ts:167-175]`). Non-owned ≡ 404 (no oracle).

**Important migration note:** `User.awaitingSupport` must be added in an additive migration; the API uses `id Int @id @default(autoincrement())` so a `Boolean @default(false)` backfills existing rows safely.

---

## Attachment Pipeline (D-53..D-56, SUP-02)

### Unified contract

Both channels converge on `NormalizedAttachment { data: Buffer; mime: string; width: number; height: number; sizeBytes: number }` produced by `lib/attachments.ts`.

**Cabinet (multipart):**
```ts
// app/api/tickets/route.ts (excerpt)
export const runtime = "nodejs"; // sharp must not run on edge
const form = await req.formData();
const file = form.get("attachment");
if (file instanceof File) {
  if (file.size > MAX_ATTACHMENT_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const normalized = await normalizeImage(bytes); // throws on bad type
}
```
Next.js App Router Route Handlers accept `req.formData()`; there is no pages-router `bodyParser` limit, but the server **must** enforce the 5 MiB cap itself using `File.size` and the byte length.

**Bot (Bot API):**
```ts
// lib/bot.ts (excerpt) — inside the awaitingSupport text/photo handler
const photos = ctx.message.photo;                 // PhotoSize[] ascending size
const largest = photos?.[photos.length - 1];
if (largest) {
  const link = await ctx.telegram.getFileLink(largest.file_id); // URL
  const res = await fetch(link);                                // global fetch (Node 24)
  const bytes = Buffer.from(await res.arrayBuffer());
  const normalized = await normalizeImage(bytes);
}
```
Source: Telegraf `getFileLink` + `fetch(link)` `[CITED: telegraf.js.org/classes/Telegram.html]`, `[CITED: github.com/telegraf/telegraf/discussions/1655]`.

### Sharp recipe (server-only)

```ts
// lib/attachments.ts
import sharp from "sharp";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MiB (D-54)
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_DIMENSION = 1600;
const MAX_INPUT_PIXELS = 4096 * 4096; // decompression-bomb guard

export class UnsupportedImageError extends Error {}

export async function normalizeImage(input: Buffer): Promise<{
  data: Buffer; mime: string; width: number; height: number; sizeBytes: number;
}> {
  if (input.byteLength === 0 || input.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new UnsupportedImageError();
  }
  const pipeline = sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false, // first frame only — avoids animated-webp bombs
  });
  const meta = await pipeline.metadata();
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new UnsupportedImageError();

  const { data, info } = await pipeline
    .rotate() // honor EXIF orientation
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return { data, mime: "image/webp", width: info.width, height: info.height, sizeBytes: data.byteLength };
}
```
`info.width`/`info.height` come from `toBuffer({ resolveWithObject: true })` `[CITED: sharp.pixelplumbing.com/api-output]`. Encoding to WebP normalizes all three accepted inputs into one served MIME and strips metadata.

### Local volume storage

```ts
// lib/attachments.ts (storage half)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR);

export async function saveAttachment(ticketId: string, n: NormalizedAttachment): Promise<string> {
  const name = `${randomUUID()}.webp`;
  const abs = path.join(UPLOAD_DIR, ticketId, name);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, n.data, { flag: "wx" });
  return path.relative(UPLOAD_DIR, abs); // store RELATIVE path only
}

export async function readAttachment(relPath: string): Promise<Buffer> {
  const abs = path.resolve(UPLOAD_DIR, relPath);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) throw new Error("attachments:path_escape");
  return readFile(abs);
}
```

**Docker volume** — `docker-compose.yml` currently mounts only `pgdata` (`[VERIFIED: docker-compose.yml:31-41]`). Add:
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
`lib/env.ts` gains `UPLOAD_DIR: z.string().min(1).default("/data/uploads")`. `UPLOAD_DIR` is server-only, never `NEXT_PUBLIC_*`.

### Sharp availability in the Next standalone image

- `next@16.3.7` lists `sharp` in `serverExternalPackages` by default (auto opt-out from bundling), so it is `require`d from `node_modules` at runtime `[CITED: nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages]`.
- The Dockerfile runner copies the **full** `node_modules` from the deps stage (`[VERIFIED: Dockerfile:31]`), and the deps stage runs `npm ci` on Linux (`[VERIFIED: Dockerfile:10-13]`), so the Linux `@img/sharp-linux-*` binaries install there.
- Official Next output docs list `node_modules/sharp/**/*` as a common `outputFileTracingIncludes` pattern for native assets `[CITED: nextjs.org/docs/app/api-reference/config/next-config-js/output]`. Because the runner copies node_modules wholesale, tracing is not strictly required; adding a narrow include is cheap insurance:
```ts
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: { "/api/tickets/**": ["node_modules/sharp/**/*", "node_modules/@img/**/*"] },
};
```
- Routes using sharp must declare `export const runtime = "nodejs";`.

### Gated serving route (D-56)

```ts
// app/api/tickets/[id]/attachments/[attachmentId]/route.ts (shape)
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
`getOwnedAttachment` authorizes `ticket.user.telegramId === session` **OR** `isAdmin(session)`; otherwise `null` → 404.

---

## Reply Fan-out & Notification Queue (D-57..D-59, SUP-03)

### Queue design (recommendation — resolves a real schema gap)

The existing `Outbox.orderId` is required with `@@unique([orderId, type])` (`[VERIFIED: prisma/schema.prisma:101-116]`), so ticket/reminder deliveries cannot be added without either overloading a money-path table or introducing a sibling. **Recommendation:** add the `Notification` table above and add generic queue helpers to `lib/outbox.ts`:

```ts
// lib/outbox.ts (ADD — same module, same claim discipline)
export const NOTIFY_TICKET_REPLY = "notify-ticket-reply";
export const REMIND_EXPIRY = "remind-expiry";

export async function enqueueNotification(input: {
  type: string; dedupeKey: string; userId?: number; ticketId?: string;
  ticketMessageId?: string; keyId?: string;
}): Promise<void> {
  await prisma.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},                       // idempotent — a second enqueue is a no-op
    create: { ...input },
  });
}

export async function claimNextNotification(type: string): Promise<ClaimedNotification | null> {
  const candidates = await prisma.notification.findMany({
    where: { status: "pending", type, nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" }, take: 10,
  });
  for (const job of candidates) {
    const { count } = await prisma.notification.updateMany({
      where: { id: job.id, status: "pending" }, data: { status: "processing" },
    });
    if (count === 1) return { id: job.id, ...job };
  }
  return null;
}
```
`markJobDone` / `rescheduleJob` / `markJobFailed` can be generalized over a delegate, or duplicated for `notification` (both use `updateMany` so a vanished row is a no-op — the Phase 3 hardening at `[VERIFIED: lib/outbox.ts:83-120]`).

### Worker additions (`lib/worker.ts`)

```ts
// drainOutbox: after the order fulfill + order-notify loops, drain the notification queue
await drainDeliveryNotifications(opts.telegram); // no sender → leave rows pending (never drop)

// delivery dispatch (mirrors dispatchNotification)
const result = await dispatchTicketNotification(job, telegram);
if (result.outcome === "retryable_error") {
  await rescheduleNotification(job.id, new Date(Date.now() + backoffMs(job.attempts + 1)), "telegram");
} else {
  await markNotificationDone(job.id);
}
```
The worker already lazily imports the bot singleton for its `TelegramSender` (`[VERIFIED: lib/worker.ts:326-330]`); reuse it. A sender-less drain must leave delivery rows `pending` (proven safe pattern from 03-07).

### Owning-chat resolution

```ts
const chatId = String(user.chatId ?? user.telegramId); // never another chat
```
Established in `dispatchNotification` (`[VERIFIED: lib/bot-payments.ts:186-190]`); `users.chatId` is refreshed on every `/start` and is the fan-out anchor (`[VERIFIED: prisma/schema.prisma:22]`, `[VERIFIED: lib/bot.ts:44-59]`).

### Copy builders (all literal keyed, RU)

```ts
// lib/ticket-notify.ts
export function buildTicketReplyPush(body: string): string {
  return `${t("bot.ticketReply")}\n${body}`.slice(0, BOT_REPLY_CAP);
}
export function buildReminderPush(key: { isTrial: boolean; expiresAt: Date | null }): {
  text: string; keyboard: InlineKeyboardMarkup; 
} {
  const date = formatKeyDate(key.expiresAt!.toISOString()); // DD.MM.YYYY
  if (key.isTrial) {
    return { text: t("bot.expiryReminderTrial", { date }),
             keyboard: { inline_keyboard: [[{ text: t("key.buyCta"), callback_data: "tariff:start" }]] } };
  }
  return { text: t("bot.expiryReminder", { date }),
           keyboard: { inline_keyboard: [[{ text: t("renew.cta"), callback_data: `key:renew:${keyId}` }]] } };
}
```
Reuse `BOT_REPLY_CAP`/`TELEGRAM_MAX_CHARS` and the 4096-cap slicing pattern (`[VERIFIED: lib/bot-payments.ts:20-23]`).

### Callback-data migration (needed for reminders)

The existing renew/upgrade callbacks are **index-based** (`key:renew:(\d+)`, `key:upgrade:(\d+)`) and re-resolve the key from `listKeys` by position (`[VERIFIED: lib/bot.ts:266-314]`). A reminder is delivered asynchronously, so an index may be stale. Recommend accepting the **key id** in the callback payload (`key:renew:{keyId}`), which fits Telegram's 64-byte `callback_data` limit for a cuid (`key:renew:` + ~25 chars ≈ 35 bytes), and re-resolving through `precheckOwnedKey` (ownership + trial), then updating the existing handler (and the key-list buttons) accordingly. This is a compatibility change to review, not a locked decision.

---

## Expiry Reminders (PAY-05, D-60..D-63)

### Scan

```ts
// lib/reminders-service.ts
const WINDOW_DAYS = 3;
export async function listExpiringKeys(now = new Date()): Promise<ExpiringKey[]> {
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
  return prisma.keyCache.findMany({
    where: { expiresAt: { gt: now, lte: horizon } }, // includes trial keys (D-63)
    include: { user: { select: { telegramId: true, chatId: true } } },
  });
}
```
`expiresAt`/`isTrial` are the reminder inputs (`[VERIFIED: prisma/schema.prisma:127,126]`). `deriveStatusKind` uses the same 3-day window (`EXPIRING_WINDOW_MS`, `[VERIFIED: lib/keys-service.ts:33-36]`), so the reminder window is consistent with the cabinet's «Истекает N дн.» badge.

### Enqueue (per key per day, exactly once)

```ts
export function reminderDedupeKey(keyId: string, now: Date): string {
  return `remind:${keyId}:${now.toISOString().slice(0, 10)}`; // YYYY-MM-DD (UTC)
}
// for each expiring key → enqueueNotification({ type: REMIND_EXPIRY, dedupeKey, keyId, userId })
```
D-61 ("daily until expiry") becomes a consequence of the date in the key. A second tick on the same day hits the UNIQUE constraint and is a no-op. Choose one timezone consistently (UTC is simplest; Europe/Moscow aligns "day" with users — document the choice). Expired keys (`expiresAt <= now`) are excluded so reminders stop at expiry.

### Tick

```ts
// lib/worker.ts
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export function startReminderTick(): NodeJS.Timeout {
  // run once shortly after boot (restart resilience), then daily
  void runReminderScan().catch(() => logger.error({ route: "worker", outcome: "reminder_scan_failed" }));
  return unref(setInterval(guard("reminders", runReminderScan), REMINDER_INTERVAL_MS));
}
```
Add `startReminderTick()` to `startWorker()` (alongside the existing drain + reconcile timers, `[VERIFIED: lib/worker.ts:354-360]`), and add a secret-gated `POST /api/cron/remind` fallback copied from the reconcile route (`[VERIFIED: app/api/cron/reconcile/route.ts:26-45]`) for the A6 case where `instrumentation.register()` may not fire in the standalone image.

### Buttons (D-62/D-63)

- Non-trial: `renew.cta` → `key:renew:{keyId}` → Phase 3 renew flow (`createBotOrderAndReply({ kind: "renew", … })`). Trial keys must **never** show renew (D-44).
- Trial: `key.buyCta` → `tariff:start` callback that replies the days keyboard (`tariffDaysKeyboard()`, `[VERIFIED: lib/bot.ts:96-106]`).

---

## Common Pitfalls

### Pitfall 1: Duplicate reminder spam on overlapping ticks
**What goes wrong:** the daily tick runs on boot and again on the interval; the same key is reminded twice in one day.
**Why it happens:** no per-day identity for a reminder.
**How to avoid:** UNIQUE `dedupeKey = remind:{keyId}:{YYYY-MM-DD}`; enqueue with `upsert` (no-op on duplicate).
**Warning signs:** two identical reminder pushes minutes apart in the bot.

### Pitfall 2: Attachment path traversal / stored-XSS
**What goes wrong:** a crafted upload filename escapes `UPLOAD_DIR`, or an SVG is uploaded and later rendered as an image, executing script.
**Why it happens:** trusting `File.name`/`file.type`; allowing `image/svg+xml`.
**How to avoid:** generate storage names (`randomUUID()`), allow only jpeg/png/webp by `sharp.metadata().format`, re-validate the resolved path stays under `UPLOAD_DIR`, serve with `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`.
**Warning signs:** DB rows whose `path` contains `..` or an absolute prefix; `image/svg` in `mime`.

### Pitfall 3: Decompression-bomb / oversized upload DoS
**What goes wrong:** a tiny file expands to gigabytes in `sharp`, or a 500 MB upload exhausts memory/disk.
**Why it happens:** no pixel/size ceiling before decoding.
**How to avoid:** enforce `File.size ≤ 5 MiB` and `buffer.byteLength ≤ 5 MiB` before `sharp`; set `limitInputPixels`; `animated: false`; reject on `failOn: "error"`.
**Warning signs:** sharp worker memory spikes; very small files with huge dimensions.

### Pitfall 4: Cross-channel divergence
**What goes wrong:** the bot creates a ticket slightly differently from the cabinet (different status, missing unread bump, no attachment), so the "единая очередь" is not actually unified.
**Why it happens:** duplicated Prisma writes in each channel.
**How to avoid:** only `lib/tickets-service.ts` writes tickets; bot and BFF both call it (the `keys-service`/`orders-service` discipline).
**Warning signs:** `prisma.ticket.create` appearing in more than one module.

### Pitfall 5: Support reply delivered to the wrong chat / lost on a Bot API blip
**What goes wrong:** the reply is sent synchronously and lost, or targeted at a guessed chat id.
**Why it happens:** sync-send (forbidden by D-57) or not resolving `chatId ?? telegramId` from the owner row.
**How to avoid:** enqueue a `Notification`; the worker resolves the owning chat and reschedules on failure (never drops).
**Warning signs:** `sendMessage` calls inside admin route handlers; delivery rows stuck `processing`.

### Pitfall 6: Unread badge never clears / double-counts
**What goes wrong:** the badge shows forever, or increments twice per reply.
**Why it happens:** incrementing on both enqueue and dispatch, or marking read on server render.
**How to avoid:** increment exactly once when the support message is created (in the service transaction); clear in `POST /api/tickets/[id]/read` from the `MarkReadOnOpen` island (not on server render — UI-SPEC §2).
**Warning signs:** badge reappears after refresh; count > number of support messages.

### Pitfall 7: `instrumentation.register()` not firing in the standalone image
**What goes wrong:** the daily reminder tick (and Phase 3 worker) never starts in prod.
**Why it happens:** standalone image bootstrap can differ (the A6 concern already recorded in STATE.md).
**How to avoid:** keep the `/api/cron/remind` secret-gated fallback (mirrors `/api/cron/reconcile`) so an external scheduler can trigger the scan.
**Warning signs:** no `worker-started` log line in prod; no reminders ever delivered.

### Pitfall 8: `sharp`/`next build` edge-runtime mismatch
**What goes wrong:** importing `sharp` into a route without `runtime = "nodejs"` fails at build/run.
**Why it happens:** default runtime assumptions.
**How to avoid:** `export const runtime = "nodejs"` on every route/service that touches sharp; import sharp only from server-only `lib/`.
**Warning signs:** build error about native module / edge runtime.

---

## Code Examples

### Bot support intake (state-gated, no session middleware)

```ts
// lib/bot.ts — menu tap sets the awaiting flag; the next text/photo creates the ticket
bot.hears(t("bot.menuSupport"), async (ctx) => {
  const from = ctx.from; if (!from) return;
  await prisma.user.updateMany({
    where: { telegramId: BigInt(from.id) },
    data: { awaitingSupport: true, supportPromptAt: new Date() },
  });
  await ctx.reply(t("bot.supportPrompt"));
});

bot.on(["text", "photo"], async (ctx) => {
  const from = ctx.from; if (!from) return;
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) } });
  const fresh = user?.supportPromptAt && Date.now() - user.supportPromptAt.getTime() < 30 * 60_000;
  if (!user?.awaitingSupport || !fresh) return; // not a support message — fall through to other handlers
  // download photo (if any) → normalizeImage → createTicket({telegramId, subject, body, attachment})
  // clear awaitingSupport; reply bot.ticketCreated / bot.ticketError
});
```
Source pattern: DB-backed state avoids a Telegraf session dependency; handlers otherwise mirror existing `t()`-keyed branches (`[VERIFIED: lib/bot.ts:119-141]`).

### Mark-read island (once on mount)

```tsx
'use client';
// components/MarkReadOnOpen.tsx — POST exactly once, then refresh (D-58 / UI-SPEC §2)
useEffect(() => {
  if (sent.current) return;
  sent.current = true;
  void fetch(`/api/tickets/${ticketId}/read`, { method: 'POST' })
    .then(() => router.refresh())
    .catch(() => {/* silent — retries on next open */});
}, [ticketId, router]);
```

### Generic claim helper (shared by order + notification queues)

```ts
// generalized from lib/outbox.ts:65-81 (VERIFIED) — both tables use the same discipline
async function claim<T extends { id: string }>(
  findCandidates: () => Promise<T[]>,
  claimOne: (id: string) => Promise<number>,
): Promise<T | null> {
  for (const row of await findCandidates()) if ((await claimOne(row.id)) === 1) return row;
  return null;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages-router API `bodyParser` size limit for uploads | App Router Route Handlers use `req.formData()`; enforce your own cap | Next 13+ | Must validate `File.size`/bytes server-side explicitly. |
| `sharp` bundled by Next | `sharp` in `serverExternalPackages` default allow-list | Next 15 stable | `require`d at runtime; ensure it is copied into the standalone output / node_modules. |
| Telegraf `Input.fromBuffer` helper | Pass `{ source: Buffer }` directly to `sendPhoto` | Telegraf v4 | Matches the existing `renderSubscriptionQrPng` push (`[VERIFIED: lib/bot-payments.ts:202-205]`). |
| Ad-hoc polling for reminders | Daily tick + durable per-day dedupe key | This phase | Exactly-once per key per day, restart-safe. |

**Deprecated/outdated:**
- Public/hotlinked attachment URLs — replaced by gated same-origin BFF serving (D-56).
- `next-pwa` / `@ducanh2912/next-pwa` — already rejected in STACK.md; not used here.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sharp` is safe/legitimate despite the `SUS` verdict (false positive on latest-patch recency; 128M weekly downloads, official `lovell/sharp` repo, no postinstall). | Package Legitimacy Audit / Standard Stack | If wrong, a compromised image dependency ships server-side. Mitigation: planner adds `checkpoint:human-verify` before install; pin `^0.35.5`. |
| A2 | A sibling `Notification` table is the right queue (vs generalizing `Outbox`) and satisfies D-57's "reuse `lib/outbox.ts`". | Reply Fan-out | If the user intended the literal `Outbox` table, a migration redesign is needed (reversible, additive either way). |
| A3 | Replies are submitted this phase via a minimal **admin env-allowlist** (`ADMIN_TELEGRAM_IDS` + `requireAdminSession`), since Phase 5 owns real roles. | Security Domain / Open Q1 | If a role model is required now, add a `User.role` enum instead — larger scope. |
| A4 | Bot support intake uses a persisted `User.awaitingSupport` flag (+ TTL) rather than Telegraf session middleware. | Data Model / Bot intake | If a session store is preferred, add `@telegraf/session` (new dep) instead. |
| A5 | WebP at quality 80, max 1600px, is an acceptable downscale target (format/quality not locked in D-54). | Attachment Pipeline | If a specific target is desired, only `lib/attachments.ts` changes. |
| A6 | Reminder "day" key uses UTC (or Europe/Moscow) consistently; not specified in CONTEXT. | Expiry Reminders | A tz choice affects which calendar day a reminder lands on — minor UX. |
| A7 | The renew/upgrade callback payload should move from index to key id to support async reminders. | Reply Fan-out / callbacks | If left index-based, reminders may open the wrong key when the list shifts. |

**If this table is empty:** N/A — see rows above. All `[ASSUMED]` claims need confirmation before becoming locked decisions.

---

## Open Questions

1. **How are support replies authenticated in Phase 4 (D-51)?** — **(RESOLVED — LOCKED: `ADMIN_TELEGRAM_IDS` env allow-list behind `requireAdminSession()`; Phase 5 replaces it with the ADM-01 role model. Implemented in plan 04-04.)**
   - What we know: replies are "admin/API only" this phase; Phase 5 builds the role model (ADM-01).
   - What's unclear: no role/`isAdmin` field exists today.
   - Recommendation: an `ADMIN_TELEGRAM_IDS` env allow-list (comma-separated) + `requireAdminSession()` returning the admin telegram id (non-admin → 404/403), to be replaced by the Phase 5 role model. Confirm.

2. **Which queue shape for non-order deliveries?** — **(RESOLVED — LOCKED: sibling `Notification` table with helpers in `lib/outbox.ts`, drained by `lib/worker.ts`. Implemented in plans 04-01/04-03.)**
   - What we know: `Outbox` is order-scoped (`[VERIFIED: prisma/schema.prisma:101-116]`).
   - What's unclear: extend `Outbox` (nullable `orderId` + `dedupeKey`) vs sibling `Notification`.
   - Recommendation: sibling `Notification` (additive, cannot regress the money path), helpers in `lib/outbox.ts`, drained by `lib/worker.ts`. Confirm.

3. **Bot user replies to an existing ticket.** — **(RESOLVED — OUT OF SCOPE for Phase 4: bot is create-only; reply/reopen is a cabinet action (D-59). Locked in plan 04-07.)**
   - What we know: UI-SPEC §6 bot flow only *creates* a ticket; §2 cabinet handles reply/reopen (D-59).
   - What's unclear: whether a bot user can append to an open ticket.
   - Recommendation: out of scope for Phase 4 — bot = create only; replies/reopen via cabinet. Confirm with the UI-SPEC.

4. **Reminder dedupe timezone and whether one combined message per user (multiple expiring keys) is acceptable.** — **(RESOLVED — LOCKED: one message per key, per-day dedupe in a single fixed timezone (UTC, A6). Implemented in plan 04-08.)**
   - Recommendation: one message per key (UI-SPEC §5), per-day dedupe in a single fixed timezone.

5. **`outputFileTracingIncludes` for sharp.** — **(RESOLVED — LOCKED: add the narrow include as insurance; verified by the container build check. Implemented in plan 04-02 Task 3.)**
   - What we know: the runner copies full `node_modules`, so sharp binaries are present.
   - Recommendation: add the narrow include as insurance; verify with a container build that `sharp` loads.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime for routes/bot/worker | ✓ | `v24.15.0` | — |
| npm | Install `sharp` | ✓ | `11.12.1` | — |
| PostgreSQL (local) | DB-backed services/tests | ✓ | accepting connections at `/tmp:5432`; `setwhite` DB queries OK | — |
| `sharp` (installed) | Attachment pipeline | ✓ | `0.35.5` (`node_modules/sharp`) | Pure-JS `jimp` if native install ever fails |
| Docker / docker-compose | Prod volume mount | ✓ (project has Dockerfile/compose) | — | Run Postgres + uploads dir on host (dev) |
| `ffmpeg` | — | not needed | — | — |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** none. `npm install sharp@^0.35.5` is a required setup task.

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` (`[VERIFIED: .planning/config.json:24]`), so this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest `5.0.3` `[VERIFIED: package.json:40]` |
| Config file | `vitest.config.ts` (dummy env; `fileParallelism: false` for shared Postgres) `[VERIFIED: vitest.config.ts:11-32]` |
| Quick run command | `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run tests/unit/tickets-service.test.ts` |
| Full suite command | `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run tests/unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUP-01 | Bot and cabinet both create via `token createTicket`; ticket lands `open` in one queue; ownership join returns null for non-owner | integration (DB) | `npx vitest run tests/unit/tickets-service.test.ts` | ❌ Wave 0 |
| SUP-01 | Status transitions `open→answered→closed`; user reply reopens in-thread (no new ticket); unread counter increments once and clears on read | integration (DB) | `npx vitest run tests/unit/tickets-service.test.ts` | ❌ Wave 0 |
| SUP-02 | `normalizeImage` accepts jpeg/png/webp, rejects other bytes (`UnsupportedImageError`), downscales ≤1600 and returns webp; size cap enforced; resolved path stays under `UPLOAD_DIR` | unit | `npx vitest run tests/unit/ticket-attachments.test.ts` | ❌ Wave 0 |
| SUP-02 | Multipart `POST /api/tickets` rejects >5 MiB (413) and bad type (400); session missing → 401 | unit | `npx vitest run tests/unit/tickets-route.test.ts` | ❌ Wave 0 |
| SUP-03 | Support reply enqueues exactly one `notify-ticket-reply`; worker dispatches to `chatId ?? telegramId`; send failure reschedules; sender-less drain leaves it pending | integration (DB) + fake sender | `npx vitest run tests/unit/ticket-notify.test.ts` | ❌ Wave 0 |
| SUP-03 | Gated attachment route returns 404 for non-owner, 200 for owner/admin; `nosniff` + private cache headers set | unit | `npx vitest run tests/unit/tickets-route.test.ts` | ❌ Wave 0 |
| PAY-05 | `listExpiringKeys` includes trial keys, includes `≤3d`, excludes already-expired and `>3d`; enqueue is idempotent per day; worker sends `bot.expiryReminder`/`bot.expiryReminderTrial` with the right button | integration (DB) + fake sender | `npx vitest run tests/unit/reminder-cron.test.ts` | ❌ Wave 0 |
| PAY-05 | Trial reminder button is buy (`tariff:start`), never renew; non-trial button is renew | unit | `npx vitest run tests/unit/ticket-notify.test.ts` | ❌ Wave 0 |
| — | Every new `ticket.*`/`bot.*`/`support.*` key is referenced; no missing/no unused | unit | `npx vitest run tests/unit/i18n.test.ts` | ✅ exists |

### Sampling Rate
- **Per task commit:** the focused command above (or the full unit suite for i18n/DB changes).
- **Per wave merge:** `DATABASE_URL=… npx vitest run tests/unit`.
- **Phase gate:** full suite green + `npx tsc --noEmit` clean + `npm run build` clean before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/tickets-service.test.ts` — SUP-01 create/list/reply/reopen/unread (DB-backed, cleanup pattern from `tests/unit/outbox-worker.test.ts`).
- [ ] `tests/unit/ticket-attachments.test.ts` — SUP-02 sharp pipeline (uses real sharp on darwin).
- [ ] `tests/unit/ticket-notify.test.ts` — SUP-03 builders + fake-sender dispatch + PAY-05 button logic.
- [ ] `tests/unit/reminder-cron.test.ts` — PAY-05 scan window + per-day dedupe.
- [ ] `tests/unit/tickets-route.test.ts` — session/ownership/upload validation (construct `FormData`/`File` from Node globals).
- [ ] `tests/unit/notifications-queue.test.ts` — queue idempotency + single-winner claim.
- [ ] No new fixtures needed: reuse `tests/helpers/fake-fetch.ts`; add a small `fake-telegram` sender inline.

---

## Security Domain

> `workflow.security_enforcement: true`, `security_asvs_level: 1` (`[VERIFIED: .planning/config.json:47-49]`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse `requireSession()` (jose HS256 cookie) `[VERIFIED: lib/session.ts:24-29]`. |
| V3 Session Management | yes | Existing 30-day httpOnly session; no change. |
| V4 Access Control | yes | Ownership joins (non-owned ≡ 404) + `requireAdminSession()` env allow-list; gated attachment serve (owner OR admin). |
| V5 Input Validation | yes | zod at every route boundary; sharp magic-byte format check; subject ≤120 / body ≤4000 (UI-SPEC); `id` zod-validated. |
| V6 Cryptography | no new | No hand-rolled crypto; no new keys. |
| V12 Files & Resources | yes | 5 MiB cap, `limitInputPixels`, path-escape guard, `nosniff`, private cache, no public URL (D-56). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on ticket/attachment ids | Information Disclosure | Ownership join `(userId, ticketId)`; non-owned ≡ 404 (mirrors `getKeyForUser`). |
| Path traversal via filename/path | Tampering / Elevation | Generate `randomUUID()` names; store relative path; `resolve().startsWith(UPLOAD_DIR)` guard. |
| Stored XSS via SVG/HTML upload | Tampering / XSS | Allow only jpeg/png/webp by magic bytes; serve `nosniff` + `Content-Disposition: inline`; no SVG. |
| Decompression bomb / oversized upload | DoS | Size cap before decode; `limitInputPixels`; `animated: false`. |
| Wrong-chat support push / PII leak | Information Disclosure | Resolve `chatId ?? telegramId` from the owner row; never log bodies/paths/sub-links. |
| Reminder spam / duplicate sends | DoS (UX) | UNIQUE per-day `dedupeKey`; single-winner claim. |
| Forged `/api/cron/remind` trigger | Spoofing | Timing-safe `x-cron-secret`; closed (503) when `CRON_SECRET` unset (A6 pattern, `[VERIFIED: app/api/cron/reconcile/route.ts:31-40]`). |
| Raw provider/error text to users | Information Disclosure | All copy via `t()`; typed codes only (D-19/D-24). |

---

## Sources

### Primary (HIGH confidence — in-repo, read this session)
- `prisma/schema.prisma:1-148` — enums, relations, indexes, cascades, `User.chatId`/`KeyCache.expiresAt`/`isTrial`.
- `lib/outbox.ts:1-121` — idempotent enqueue, atomic claim, `updateMany` job-state writers.
- `lib/worker.ts:1-375` — `startWorker` singleton, drain loop, `drainNotifications`, `startReconcileTick`, `botSender`.
- `lib/bot-payments.ts:148-221` — `TelegramSender`, `dispatchNotification`, owning-chat resolution, 4096 cap.
- `lib/bot.ts:39-314` — bot singleton, `/start` chatId capture, menu/tariff/renew callbacks.
- `lib/keys-service.ts:33-96,167-175,199-238` — expiring window, ownership joins, `formatKeyDate`.
- `lib/orders-service.ts:227-234,275-281` — ownership-joined reads.
- `lib/session.ts:24-29`, `lib/auth.ts:128-152` — session gate.
- `lib/env.ts:7-45`, `app/api/cron/reconcile/route.ts:26-45` — env schema + secret-gated cron.
- `Dockerfile:1-34`, `docker-compose.yml:1-41`, `next.config.ts:1-8` — standalone image, node_modules copy, volumes.
- `package.json:13-41`, `vitest.config.ts:1-34`, `tests/unit/outbox-worker.test.ts:1-229`, `tests/helpers/fake-fetch.ts` — stack + test patterns.
- `lib/i18n/messages/ru.ts:1-214`, `lib/i18n/index.ts:1-38`, `tests/unit/i18n.test.ts:61-95` — keyed RU copy + completeness gate.
- `.planning/config.json:24,47-49` — nyquist + security enforcement.

### Secondary (MEDIUM confidence — official docs fetched)
- `nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages` — `sharp` in the default external list `[CITED]`.
- `nextjs.org/docs/app/api-reference/config/next-config-js/output` — `outputFileTracingIncludes`, `node_modules/sharp/**/*` example `[CITED]`.
- `core.telegram.org/bots/api#getfile` — `getFile`/`file_path`/file-size limits; Bot API conventions `[CITED]`.
- `telegraf.js.org/classes/Telegram.html` + `github.com/telegraf/telegraf/blob/master/src/telegram.ts` — `getFileLink`, `sendPhoto`, `{source: Buffer}` `[CITED]`.

### Tertiary (LOW confidence — needs validation)
- npm registry `sharp@0.35.5` (version/engines/modified) — confirmed via `npm view`, but legitimacy seam returned `SUS`; tagged `[ASSUMED]` for package approval `[CITED: npm registry]`.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for existing pins (read from `package.json`); MEDIUM/LOW for `sharp` (registry-confirmed but SUS verdict → `[ASSUMED]`, gated).
- Architecture: MEDIUM-HIGH — all patterns are direct extensions of files read this session; the one genuine design gap (queue shape) is called out with a recommendation and open question.
- Pitfalls: MEDIUM — grounded in the domain (attachments/PII, queue idempotency) and the repo's established ownership/idempotency disciplines.

**Research date:** 2026-10-03
**Valid until:** 2026-11-02 (30 days — stable stack; re-check `sharp`/Next versions before install).

---

*Phase: 04-support-retention*
*Researched: 2026-10-03*

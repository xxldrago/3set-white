# Phase 5: Admin & Deploy - Research

**Researched:** 2026-10-04
**Domain:** RBAC admin panel · Telegram broadcast delivery · single-VPS Docker/TLS deploy · White Label DNS
**Confidence:** MEDIUM-HIGH (in-repo facts HIGH via source reads; external best-practice MEDIUM via official docs)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-64:** Роли хранятся в таблице `admin_users` (привязка к `telegram_id` + поле `role`), не в env — one-way; перенос ролей в другое хранилище требует миграции и перепривязки доступов.
- **D-65:** Стандартная матрица прав: администратор (всё), техподдержка (тикеты + просмотр ключей), менеджер (финансы + статистика) — как в PROJECT.
- **D-66:** Управление ролями — только администратор (вход в админку по Telegram identity); роли других меняет админ из UI.
- **D-67:** Bootstrap первого админа — из `ADMIN_TELEGRAM_IDS` (env) при первом входе; далее управление через UI/БД. Phase 4's `requireAdminSession` заменяется на ролевую проверку.
- **D-68:** ADM-02 — поиск по `telegram-id` / ключу (`q`, `customerRef`) + карточка пользователя (ключи, платежи, тикеты).
- **D-69:** Статистика ADM-03/04 — из нашей БД (платежи/выручка/пользователи) и из ARTEMIDA API (баланс `GET /balance`, ключи, устройства).
- **D-70:** Алерт низкого баланса ARTEMIDA — порог в env; показ в админке + лог/пуш.
- **D-71:** Broadcast — через outbox-worker батчами (учитывает rate limits/блокировки), не синхронно — costly; sync-рассылка ломает доставку при сбое Bot API и не масштабируется.
- **D-72:** Subscription-ссылки — через поддомен `sub.my.3set.online` (A-запись на `144.31.93.193`, без AAAA, DNS Only в Cloudflare, сертификат авто) — costly; смена бренд-домена затрагивает выданные ссылки и владельцев ключей.
- **D-73:** Настройка бренда — ручной шаг владельца в кабинете ARTEMIDA + документированный чек-лист; код только читает/использует домен из provider-ответа.
- **D-74:** Проверка на деплое: доступность sub-ссылки по HTTPS; fallback на дефолтный домен ARTEMIDA при сбое.
- **D-75:** Docker Compose (web + db + nginx) на 64.188.97.106; Nginx терминирует HTTPS (Let's Encrypt); секреты только в `.env` на сервере — one-way; смена модели хостинга затрагивает домены/вебхуки/секреты.
- **D-76:** Деплой — `git pull` → `docker compose build/up` → `prisma migrate deploy`; деплой-скрипт/чек-лист (без CI/CD в v1).
- **D-77:** Секреты и доступ — `.env` на сервере (не в git); root-пароль ротируется и в менеджер секретов; SSH-ключ вместо пароля.
- **D-78:** Бэкап БД + скрипт отката + healthcheck; мониторинг баланса ARTEMIDA и воркера.

### the agent's Discretion
None — все развилки закрыты явным выбором пользователя.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

## Summary

Phase 5 is an **operational-maturity phase with almost no new runtime dependencies**: the admin panel, roles, user search, stats, broadcast, and low-balance alerting are all built from the existing Next 16 / Prisma 7 / zod 4 / Telegraf 4 / outbox-worker stack, and the deploy ships the existing `Dockerfile` + a new prod Compose file plus Nginx/Certbot. The only *new data* is two Prisma models — `AdminUser` (D-64) and a broadcast parent row — mounted on one migration. Everything else is new read models over `User`/`KeyCache`/`Order`/`Ticket`, a role-aware replacement for Phase 4's `requireAdminSession`, and four infra artifacts (`docker-compose.prod.yml`, Nginx conf, deploy/backup/rollback scripts, `.env` on server).

The highest-value research finding is a **deploy-time Dockerfile gap, not an RBAC one**: the current `Dockerfile` runs `npm run build` in the builder stage with **no `.env`** (`.dockerignore` excludes `.env*`), while `lib/env.ts` is a fail-fast zod schema imported at module scope by `lib/session.ts` and therefore by `app/page.tsx`. `next build` imports route/page modules during data collection, so the image build is likely to throw on missing env unless build-stage placeholder env is supplied. Second gap: the runner stage copies `.next/standalone`, `static`, `public`, `prisma`, `prisma7.config.ts`, and full `node_modules` but **never copies `/app/generated`**, where Prisma 7's `prisma-client` generator emits the runtime client (`generator client { output = "../generated/prisma" }`) — the standalone trace *may* carry it, but an explicit `COPY --from=builder /app/generated ./generated` is the robust fix. Both must be resolved in the deploy plan's first task or the first `docker compose build` fails.

The second-highest finding is an **authorization-architecture constraint from Next.js's own docs**: App Router **layouts are not a security boundary** (partial rendering means route segments/RSC payloads can be fetched without re-running the layout), so the UI-SPEC's `AdminShell` "gate server-side before any section renders" must be treated as UX/nav filtering only. Role enforcement must live in the **Data Access Layer and every page/route handler** (deny-by-default), with the layout calling the same cached guard for correctness but never as the sole check. For broadcast, Telegram's documented limits (≈30 msgs/sec bulk, ≈20/min per group, 1/sec per chat) sit comfortably above the worker's existing `DRAIN_BATCH = 10` per `5_000 ms` tick (~2 msg/s), so the outbox worker can carry a broadcast without new pacing machinery — but per-recipient 403 (blocked/deactivated) must be terminal, and 429 must back off, or the queue will spin forever on dead chats.

**Primary recommendation:** One migration adds `AdminUser`/`AdminRole` + `Broadcast`; a new `lib/admin-auth.ts` provides `getAdminRole`/`requireRole`/`can` with **create-only** bootstrap from `ADMIN_TELEGRAM_IDS` (so env never re-elevates a UI-downgraded admin); broadcast reuses the `Notification` queue (`type: "broadcast"`, dedupe `broadcast:{id}:{userId}`) plus a `Broadcast` status row; ARTEMIDA stats/balance are read server-side with a short cache and degrade to `—`/`unknown`; deploy = `docker-compose.prod.yml` (web+db+nginx+certbot) + Nginx TLS + `pg_dump` cron + rollback runbook, with the two Dockerfile fixes above.

## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support |
|----|-------------------------------|------------------|
| ADM-01 | Админ-панель с ролями: администратор (всё), техподдержка (тикеты + просмотр ключей), менеджер (финансы + статистика) | `AdminUser`/`AdminRole` model + `lib/admin-auth.ts` `requireRole`/`can`; role matrix from UI-SPEC §1; Next.js DAL enforcement (Pattern 1) |
| ADM-02 | Админ ищет пользователя по telegram-id / ключу (`q`, `customerRef`), видит его ключи и платежи | `lib/admin-service.ts` search (`User.telegramId`, `KeyCache.keyId`/`customerRef`) + profile joins (Pattern 2) |
| ADM-03 | Админ видит статистику выручки/пользователей и делает broadcast-рассылку | DB aggregates (`Order`/`User`) + `Broadcast`/`Notification` outbox broadcast (Patterns 2, 4) |
| ADM-04 | Админ видит всю статистику из ARTEMIDA API (баланс `GET /balance`, ключи, устройства) + алерты о низком балансе | `artemida.getBalance()`/`listKeys()`/`getDevices()` server-side, cached + degradable; threshold env + `BalanceChip`/`BalanceAlert` (Pattern 3) |
| OPS-01 | Весь стек деплоится на один сервер 64.188.97.106 (Docker Compose + Nginx + HTTPS), webhooks Platega и Telegram на `my.3set.online` | `docker-compose.prod.yml` + Nginx TLS + webhook host config (Pattern 5) |
| OPS-02 | Subscription-ссылки используют White Label домен `my.3set.online` (настройки бренда ARTEMIDA) | `sub.my.3set.online` DNS checklist + provider-returned URL verification/fallback (Pattern 6) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Role storage (`admin_users`) | Database / Storage | — | D-64 requires durable, UI-managed roles; relational table beside `User` |
| Role gate (`requireRole`, `can`) | API / Backend (DAL) | Browser (redirect/nav UX only) | Next.js App Router: layouts are not a security boundary; enforce in DAL/pages/routes [CITED: nextjs.org/docs/app/guides/authentication] |
| Admin panel UI (`/admin/**`) | Frontend Server (RSC/SSR) | Browser / Client (search & composer islands) | Server-rendered role-filtered sections; small client islands for input/broadcast state |
| User search / profile | API / Backend | Database / Storage | Admin-scoped read models over `User`/`KeyCache`/`Order`/`Ticket` |
| Revenue/user stats | Database / Storage | Frontend Server | Aggregate queries on our DB; server-rendered cards |
| ARTEMIDA balance/keys/devices | API / Backend (server-only client) | External provider | `ARTEMIDA_API_KEY` must never reach the browser; read + degrade server-side |
| Low-balance alert | Background worker | Frontend Server (banner) | Threshold classification in worker/log + banner read on `/admin` |
| Broadcast delivery | Background worker (outbox) | Database / Storage | D-71: queue + batched worker, never synchronous send |
| Broadcast enqueue/status | API / Backend | Database / Storage | Route validates + creates `Broadcast` + enqueues; UI shows derived status |
| TLS termination / reverse proxy | Infrastructure (edge) | — | Nginx + Let's Encrypt on the single VPS (D-75) |
| Webhook routing (Telegram/Platega) | Infrastructure / API | — | Same public HTTPS origin `my.3set.online` |
| White Label DNS | Infrastructure (external) | — | Owner-managed DNS record `sub.my.3set.online` → ARTEMIDA IP; code only verifies/reads |
| DB backup / rollback / healthcheck | Infrastructure | — | `pg_dump` cron, restore runbook, health endpoint/worker monitor (D-78) |

## Standard Stack

**No new npm runtime or dev dependencies are required for Phase 5.** Every library below already exists in `package.json`; the phase adds code and infra config only. This keeps the supply-chain surface unchanged.

### Core (existing — reuse verbatim)

| Library | Version | Purpose in Phase 5 | Why this one |
|---------|---------|--------------------|--------------|
| Next.js | 16.3.7 | `app/admin/**` route group + admin BFF route handlers | Already the whole app; App Router RSC gives server-side role sectioning |
| React | 19.2.8 | Server Components + small client islands (`UserSearchForm`, `BroadcastComposer`) | Peer of Next 16 |
| Prisma | 7.10.0 | `AdminUser`/`Broadcast` models + migration | Existing ORM; `prisma migrate deploy` already runs in the image entrypoint |
| zod | 4.6.5 | Validate `q`, role-change body, broadcast body | Boundary validation is already the project convention |
| Telegraf | 4.16.3 | `bot.telegram` sender used by the worker for broadcast delivery | Existing `TelegramSender` surface (`lib/bot-payments.ts:149-160`) |
| pino | 10.3.1 | Admin action + worker + deploy logging (JSON) | Existing logger |
| jose | 6.2.12 | Session cookie verify (unchanged) | Existing `lib/auth.ts` |

### Supporting / infra (images, not installed locally)

| Dependency | Version / tag | Purpose | Notes |
|------------|---------------|---------|-------|
| PostgreSQL | `postgres:17-alpine` | Prod DB | Already the compose `db` image (`docker-compose.yml:29`) |
| Nginx | `nginx:alpine` (or pinned `1.27-alpine`) | TLS termination + reverse proxy | New in Phase 5 (D-75) |
| Certbot | `certbot/certbot` | Issue/renew Let's Encrypt certs | Sidecar service or host cron (Pattern 5) |
| Node | `node:24-bookworm-slim` | App image base | Already pinned in `Dockerfile:3` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `Broadcast` + `Notification` rows | A dedicated BullMQ/Redis queue | Over-engineering for a single VPS; the existing DB outbox already provides durable claim/reschedule semantics (STACK.md "What NOT to Use") |
| Nginx + Certbot sidecar in Compose | Host-level `certbot` + systemd timer | Host-level is simpler ops but leaks the renewal logic outside the compose file; both valid — D-75 only fixes Nginx+HTTPS, not the cert driver |
| New `admin_users` separate from `users` | Add `role` column to `users` | D-64 locks a separate `admin_users` table so staff roles are not entangled with the customer identity table |
| `middleware.ts` RBAC | — | Next.js docs: middleware/Proxy is *optimistic only*; DB-backed role checks belong in the DAL, not middleware [CITED: nextjs.org/docs/app/guides/authentication] |

**Installation:** none. No `npm install` task in this phase.

**Version verification:** no package additions, so no registry verification is needed. Existing versions are pinned in `package.json` and were verified in prior-phase research (STACK.md). If the planner adds any package, it must run the Package Legitimacy Gate.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages** and adds no shadcn registry blocks (UI-SPEC §Registry Safety: `Tool: none`, no third-party registries). All new code imports packages already present in `package.json`. Container images used by the deploy (`postgres:17-alpine`, `nginx:alpine`, `certbot/certbot`, `node:24-bookworm-slim`) are official/official-adjacent Docker Hub images and are pulled by tag, not vendored.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| (none added) | — | — | — |

**Packages removed due to SLOP verdict:** none
**Packages flagged suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                          Internet
                             │
              ┌──────────────┴───────────────┐
              │  Nginx  (64.188.97.106:80/443)│
              │  TLS (Let's Encrypt)          │
              │  server_name my.3set.online   │
              └──────────────┬───────────────┘
                             │ proxy_pass http://web:3000
                             ▼
        ┌───────────────────────────────────────────────────┐
        │  Next.js standalone process (web)                 │
        │                                                   │
        │  /admin/** (RSC)                                  │
        │    AdminShell ──> requireRole()  (nav filter)     │
        │    page/route ──> requireRole()  (ENFORCEMENT)    │
        │         │                                         │
        │         ▼                                         │
        │  lib/admin-service.ts  (search / stats / roles)  │
        │         │                    │                    │
        │         ▼                    ▼                    │
        │  Prisma (DB)         lib/artemida.ts (cache+degrade)
        │         ▲                    │                    │
        │         │                    ▼                    │
        │  lib/worker.ts ──────► Telegram Bot API (30/s cap)│
        │    drainNotifications                             │
        │      ├─ broadcast rows                            │
        │      ├─ notify-* rows                             │
        │      └─ remind-expiry rows                        │
        │    balance-alert tick ──► log / (optional admin DM)│
        └─────────────────┬─────────────────────────────────┘
                          │
     ┌────────────────────┼───────────────────────┐
     ▼                    ▼                       ▼
 Postgres 17         ARTEMIDA API            Platega.io
 users/orders/       /balance /keys           callback
 keys_cache/         /keys/{id}/devices       ──► /api/platega/callback
 admin_users/        (WL sub-link host)
 tickets/notifications
```

**Data flow for a broadcast:** admin submit → `POST /api/admin/broadcast` (requireRole administrator) → create `Broadcast`(queued) + bulk-enqueue `Notification` rows (`type:"broadcast"`, dedupe `broadcast:{id}:{userId}`) → return status → worker `drainNotificationType("broadcast", dispatchBroadcast, telegram)` sends one message per recipient, honoring 429 backoff and terminating 403 → UI derives status (queued/sending/sent/failed) from counts.

### Pattern 1: Role-aware DAL + deny-by-default enforcement (ADM-01)

**What:** A new server-only `lib/admin-auth.ts` (or `lib/session.ts` extension) resolves the caller's admin role and exposes `requireRole(...roles)` and a pure `can(role, section)`. Roles live in `admin_users` (D-64); `ADMIN_TELEGRAM_IDS` is a **bootstrap-only** allow-list.

**When to use:** every `/admin/**` page, every `/api/admin/**` route, and the existing Phase-4 admin ticket routes (which currently call `requireAdminSession`, `[VERIFIED: app/api/admin/tickets/[id]/reply/route.ts:24]`).

**Key design points:**
- `getAdminRole(telegramId): Promise<AdminRole | null>` — read `admin_users`; **if no row exists and the id is in `ADMIN_TELEGRAM_IDS`, create it once as `administrator`** (create-only; never update an existing row's role). This prevents env membership from re-elevating a user an admin downgraded in the UI (a privilege-escalation foothold).
- `requireRole(...allowed)` — calls `requireSession()` (401 → `SessionError`), then resolves the role; wrong/no role → `AdminError` (403) which routes map to **404** (D-51, no route enumeration; matches existing `AdminError` handling).
- `can(role, section)` — a pure literal matrix (testable without Next):
  - `administrator`: overview, users, profileKeys, profilePayments, profileTickets, tickets, broadcast, roles
  - `support`: users, profileKeys, profileTickets, tickets
  - `manager`: overview, users, profilePayments
- `AdminShell` uses `can()` to filter the nav (unpermitted sections **absent from the DOM**, UI-SPEC §1) and the same guard for UX; **every page/route re-checks** because layouts do not gate RSC payloads.

**Next.js authority [CITED: nextjs.org/docs/app/guides/authentication]:** the official Authentication guide (published 2026-08-25) states layouts are not reliable for authorization due to partial rendering and that "the majority of security checks should be performed as close as possible to your data source"; route handlers must do their own role check. Wrap `getAdminRole` with React `cache()` so layout + page in one render share a single DB read.

**Example (source: nextjs.org/docs/app/guides/authentication — adapted to this codebase):**
```ts
// lib/admin-auth.ts (server-only; imports next/headers via session)
import { cache } from "react";
import { AdminError, requireSession, SessionError } from "./session";

export type AdminRole = "administrator" | "support" | "manager";
export type AdminSection =
  | "overview" | "users" | "profileKeys" | "profilePayments"
  | "profileTickets" | "tickets" | "broadcast" | "roles";

const MATRIX: Record<AdminRole, readonly AdminSection[]> = {
  administrator: ["overview","users","profileKeys","profilePayments","profileTickets","tickets","broadcast","roles"],
  support:       ["users","profileKeys","profileTickets","tickets"],
  manager:       ["overview","users","profilePayments"],
};

export const can = (role: AdminRole, section: AdminSection): boolean =>
  MATRIX[role].includes(section);

export const getAdminRole = cache(async (telegramId: number): Promise<AdminRole | null> => {
  const existing = await prisma.adminUser.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (existing) return existing.role;                       // UI is source of truth (D-66)
  if (!isBootstrapAdmin(telegramId)) return null;           // env = bootstrap only (D-67)
  const created = await prisma.adminUser.upsert({           // create-only, idempotent
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

### Pattern 2: Admin read models (search + profile + stats) (ADM-02/03/04)

**What:** New admin-scoped read functions (in `lib/admin-service.ts`) that, unlike the owner-scoped `listKeys`/`listOrdersForUser`/`listTicketsForUser`, are **not** filtered by the caller's telegram id. They are still server-only and never trust a client id for authorization — the admin role is the authorization.

**Search (`q`):** trim; if `/^\d+$/` treat as exact `User.telegramId` (plus a `KeyCache.keyId`/`customerRef` contains match); otherwise match `KeyCache.keyId` or `KeyCache.customerRef` with `contains`. Join key → `User`; dedupe by user; **exact matches first**; cap 50 (UI-SPEC §3 `admin.searchMore`). Return `{ userId, telegramId, displayName, staffRole? }` only — never `chatId`, tokens, or sub-links.

**Profile (`/admin/users/[id]`):** three independent reads — keys (`KeyCache` for the user), payments (`Order` rows for the user via the provider-free `toHistoryRow` shape), tickets (`Ticket` rows). Each card degrades independently (UI-SPEC §4); header + other cards still render. `AdminKeyRow` is read-only (no renew/upgrade).

**Stats (our DB):** aggregate over `orders` within the selected period (7/30/90, default 30). Recommended semantics (see Assumptions A1): revenue = `SUM(amount)` of orders whose `paidAt` falls in the period and whose status ∈ `paid|provisioning|provisioned`; orders = count of the same; users = total `User` count (all-time). Render with `Intl.NumberFormat('ru-RU') + ' ₽'`, `tabular-nums`.

**Stats (ARTEMIDA, ADM-04):** `getBalance()` (`[VERIFIED: lib/artemida.ts:641]`) gives `{ balance, currency, unlimited }` (`[VERIFIED: lib/artemida.ts:312-316]`); `listKeys()` gives `items[]` each with a `devices` count; devices total = sum of key device counts from that one list call (avoid N per-key `getDevices` calls). Wrap the read in a short module-level cache (~60 s) and on any `ArtemidaError` render `—` + `unknown` while DB cards still render (UI-SPEC §2 degradation).

### Pattern 3: Low-balance classification + alert (ADM-04/D-70)

**What:** A pure classifier maps `Balance` + threshold env → `"ok" | "low" | "critical" | "unknown"`. Env var (recommended) `ARTEMIDA_LOW_BALANCE_RUB` added to `lib/env.ts` as `z.coerce.number().nonnegative().default(...)`. Threshold from env per D-70.

- `unknown` — ARTEMIDA read threw (no provider text/code rendered).
- `ok` — `unlimited === true` OR `balance > threshold`.
- `low` — `0 < balance <= threshold`.
- `critical` — `balance <= 0` (depleted / issuance at risk). *(See Assumption A2 for the exact boundary.)*

Surfacing: `BalanceChip` + `BalanceAlert` on `/admin` (server-rendered, `role="status"` for the standing condition), plus a worker tick (`startBalanceAlertTick`, hourly) that reads the balance and logs `warn`/`error`. D-70 says "лог/пуш" — a Telegram DM to `ADMIN_TELEGRAM_IDS` is optional; the admin banner + log is the minimum. Never call `getBalance` on every request (rate-limit pitfall); cache it.

### Pattern 4: Broadcast via the Notification queue (ADM-03/D-71)

**What:** Reuse the sibling `Notification` delivery queue and its exact claim discipline. Add `BROADCAST = "broadcast"` next to the existing `[VERIFIED: lib/outbox.ts:135] "notify-ticket-reply"` and `[VERIFIED: lib/outbox.ts:137] "remind-expiry"` types.

**Model (new):**
```prisma
enum BroadcastStatus { queued sending sent failed }
model Broadcast {
  id             String          @id @default(cuid())
  authorTelegramId BigInt        @map("author_telegram_id")
  body           String
  status         BroadcastStatus @default(queued)
  total          Int             @default(0)
  sent           Int             @default(0)
  failed         Int             @default(0)
  createdAt      DateTime        @default(now()) @map("created_at")
  finishedAt     DateTime?       @map("finished_at")
  @@map("broadcasts")
}
```
Recipients: `Notification` rows `type:"broadcast"`, `dedupeKey:"broadcast:{broadcastId}:{userId}"` (UNIQUE → exactly-once per recipient), `userId` set to the owning row. Enqueue with `prisma.notification.createMany({ data, skipDuplicates: true })` for bulk (do not loop `enqueueNotification` for N recipients). Recipient set = `User` rows with a non-null `chatId` (only users who have messaged the bot are reachable).

**Dispatch (`lib/broadcast.ts`, mirroring `lib/ticket-notify.ts`):** resolve the `Notification` → `Broadcast` body + owning `User.chatId ?? telegramId`; `sendMessage(chatId, body)` **without parse_mode** (plain text avoids Markdown/HTML injection + parse failures); slice to `BOT_REPLY_CAP = 4000` / `TELEGRAM_MAX_CHARS = 4096` (`[VERIFIED: lib/bot-payments.ts:21-23]`). Return:
- `pushed` → mark done, increment `sent`.
- `retryable_error` (network/5xx/429) → worker `rescheduleNotification` with backoff. On 429, honor `retry_after` if the thrown error exposes it.
- **terminal per-recipient** (403 "bot was blocked"/"user is deactivated", 400 "chat not found") → mark notification `failed` (never reschedule), increment `failed`, and optionally null the stale `chatId`.

**Status derivation:** total = count of broadcast notifications; sent/failed from their statuses; overall `queued` if none processed, `sending` if some pending, `sent` if none pending and `failed === 0`, `failed` if none pending and all failed (see Assumptions A3 for mixed case).

**Pacing:** the worker drains `DRAIN_BATCH = 10` (`[VERIFIED: lib/worker.ts:76]`) per `DRAIN_INTERVAL_MS = 5_000` (`[VERIFIED: lib/worker.ts:65]`) ≈ 2 msg/s, an order of magnitude under Telegram's ≈30/s bulk limit [CITED: core.telegram.org/bots/faq]. Do not add a separate fast loop; wire `broadcast` into `drainDeliveryNotifications` (`[VERIFIED: lib/worker.ts:327-330]`). The UI shows queue state only — no percentage progress bar (UI-SPEC §5).

### Pattern 5: Prod topology — Compose + Nginx + Certbot (OPS-01/D-75..D-78)

**What:** `docker-compose.prod.yml` with four services: `web` (build `.`), `db` (`postgres:17-alpine`, internal network only — **do not publish 5432**), `nginx` (publishes 80/443, reverse-proxies `web:3000`), and either a `certbot` sidecar + renewal loop or a documented host `certbot` cron. Nginx conf lives in `nginx/my.3set.online.conf` (mounted read-only).

- **TLS:** Let's Encrypt with the HTTP-01 (webroot) challenge requires the domain to be reachable on port 80 **without a Cloudflare proxy** on first issuance — Cloudflare's own docs [CITED: developers.cloudflare.com/dns/proxy-status/] confirm proxied (orange-cloud) records answer with Cloudflare IPs and that "DNS-only is only recommended for records that do not serve web traffic", but for cert issuance the proxy must be off; the community consensus [CITED: github.com/eugene-khyst/letsencrypt-docker-compose] is DNS-only for first issuance then optional re-proxy. **Decision surface:** `my.3set.online` (our origin 64.188.97.106) and `sub.my.3set.online` (ARTEMIDA's 144.31.93.193) are different origins — a proxied `my.3set.online` also breaks Platega/Telegram webhook origin-IP expectations less, but breaks HTTP-01. Recommend DNS-only (grey cloud) for the A record used by the cert.
- **Nginx essentials:** `client_max_body_size 8m` (ticket uploads are capped at 5 MiB, `MAX_ATTACHMENT_BYTES`); `proxy_set_header Host/X-Real-IP/X-Forwarded-For/X-Forwarded-Proto`; keep the Platega callback under its 60 s / 3×5 min retry contract (handler already acks fast; Nginx default `proxy_read_timeout 60s` is borderline — set ≥ 75s); no websockets needed.
- **Prod env (server `.env`, never git):** all vars in `lib/env.ts` plus `APP_BASE_URL=https://my.3set.online` (used for Platega `returnUrl`/`failedUrl`), `BOT_MODE=webhook`, `WEBHOOK_SECRET`, `ADMIN_TELEGRAM_IDS`, `UPLOAD_DIR=/data/uploads`, optional `CRON_SECRET`, and `ARTEMIDA_LOW_BALANCE_RUB`.
- **Webhooks:** Telegram `setWebhook` → `https://my.3set.online/api/telegram/webhook/{WEBHOOK_SECRET}` with `secret_token=WEBHOOK_SECRET` (route verifies both, `[VERIFIED: app/api/telegram/webhook/[secret]/route.ts:22-26]`); Platega callback URL set in the LK to `https://my.3set.online/api/platega/callback`.
- **Migrations:** the image entrypoint already runs `prisma migrate deploy` before `node server.js` (`[VERIFIED: Dockerfile:34]`), so `docker compose up -d --build` applies migrations. For a single container this is acceptable; Prisma's docs [CITED: prisma.io/docs/orm/prisma-migrate/workflows/development-and-production] warn against `migrate dev` in prod and note advisory locking serializes concurrent runners.
- **Healthcheck (D-78):** add `app/api/health/route.ts` (none exists today — verified) returning `{ status:"ok", uptime, worker: started? }`; reference it from a Dockerfile/compose `HEALTHCHECK` (`wget --spider` or `curl -f`). Keep it shallow (no DB round-trip in the health check) per best practice.
- **Backups (D-78):** host cron `docker compose exec -T db pg_dump -U setwhite setwhite | gzip > .../db-$(date +\%F).sql.gz` with retention (7 daily/4 weekly) and an off-box copy; **also back up the `uploads` volume** (ticket attachments). Restore runbook: `gunzip -c file.sql.gz | docker compose exec -T db psql -U setwhite setwhite`.
- **Rollback (D-78):** app image rollback does **not** roll back migrations (Prisma has no automatic prod rollback [CITED: prisma.io/docs/orm/prisma-migrate/workflows/development-and-production]). Document: restore the pre-deploy DB backup + deploy the previous git commit image, or apply a forward-fix migration.
- **Logging:** Docker `json-file` with `max-size`/`max-file` (e.g. 10m × 3) so the single server's disk cannot fill (PITFALLS performance trap).

### Pattern 6: White Label DNS + verify/fallback (OPS-02/D-72..D-74)

**What:** `sub.my.3set.online` is an **A record in our Cloudflare zone pointing at ARTEMIDA's IP `144.31.93.193`** (not our server), with **no AAAA**, **DNS Only (grey cloud)**. Cert is auto-provisioned by ARTEMIDA (D-72). The owner configures the brand domain manually in the ARTEMIDA cabinet (D-73); our code **reads** the provider-returned `subscriptionUrl`/`customSubscriptionUrl` and never constructs the WL host itself.

**Observed provider fields (VERIFIED):** `docs/artemida-v1-contract.md` records the create/get key shape as including `subscriptionUrl, customSubscriptionUrl` (`[VERIFIED: docs/artemida-v1-contract.md:88]`, verbatim: `subscriptionUrl, customSubscriptionUrl, createdAt, updatedAt, revokedAt, trial }`), and `GET /keys/{id}/subscription-links` returns `data.subscriptionUrl` (`[VERIFIED: docs/artemida-v1-contract.md:56]`).

**Deploy verification (D-74):** a checklist/script step that (1) `curl -sI https://sub.my.3set.online/...` the returned sub-link, (2) asserts the URL host equals the WL host, (3) on failure logs a warning and uses the provider's default domain as returned — i.e. **never rewrite/fabricate a host**. Pitfall 9 adds a manual check that the fetched content parses as a valid VLESS/Trojan config.

### Anti-Patterns to Avoid

- **Layout-only authorization.** `AdminShell` filtering nav is UX; a route/page fetched as RSC payload skips it. Enforce in the DAL/each page/route [CITED: nextjs.org/docs/app/guides/authentication].
- **`middleware.ts` doing DB role lookups.** Optimistic only; a per-request DB hit is a performance burden and still not the security boundary [CITED: nextjs.org/docs/app/guides/authentication].
- **Env allow-list as an ongoing grant.** If `getAdminRole` re-asserts `ADMIN_TELEGRAM_IDS` over `admin_users`, an admin cannot demote a bootstrap admin. Bootstrap **create-only**.
- **Synchronous broadcast.** Sending N messages inside the request violates D-71 and the Bot API 30 s/60 s expectations; always enqueue.
- **Per-recipient infinite retry on 403.** A blocked bot is permanent; rescheduling forever starves the queue.
- **Polling ARTEMIDA `getBalance` per page view / per recipients loop.** Rate-limit risk; cache.
- **Publishing the DB port.** Compose `db` must stay on the internal Docker network only.
- **`git pull` deploy without a migration/rollback plan.** Migrations are not reversible automatically.
- **Secrets in the image or git.** Build stage must use *placeholder* env, runtime uses real `.env` (D-77).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable broadcast/notify delivery with retry | A new in-memory queue or `setInterval` sending directly | Existing `Notification` table + `claimNextNotification`/`rescheduleNotification` (`lib/outbox.ts`) | Atomic single-winner claim, dedupe by UNIQUE key, survives restart (03/04 pattern) |
| Role/session verification | Custom JWT/cookie parsing | Existing `lib/auth.ts` (`verifySession`, `SESSION_COOKIE`) | Already timing-safe, HS256 allow-listed, 30-day cookie |
| TLS cert issuance/renewal | Hand-rolled ACME | Certbot (sidecar or host cron) | Renewal, staging, rate-limit handling are solved |
| DB backup/restore | Custom dump logic | `pg_dump`/`psql` in a cron | Standard, restorable, testable |
| Money rounding/formatting | Manual string math | `Intl.NumberFormat('ru-RU')` + stored verbatim | UI-SPEC formatting rule; never recompute/re-round |
| Pluralisation | `n + " результатов"` | `tp()` (`lib/i18n/index.ts:34`) | RU plural rules already centralized |

**Key insight:** Phase 5 is mostly *composition* — the queue, session, ARTEMIDA client, read services, i18n, and UI primitives already exist. The genuine new work is the role model, the admin read layer, the broadcast parent/status, and the deploy runbook. Any task that starts rebuilding one of the above is a signal the plan drifted.

## Common Pitfalls

### Pitfall 1: Docker image build fails on missing env (HIGH — first-deploy blocker)
**What goes wrong:** `docker compose build` runs `RUN npm run build` in the builder stage (`[VERIFIED: Dockerfile:19]`) in an image that excludes `.env` (`.dockerignore` line `!.env.example`), while `lib/env.ts` is a fail-fast zod schema (`[VERIFIED: lib/env.ts:42-50]`) imported at module scope by `lib/session.ts` (`[VERIFIED: lib/session.ts:9]`). Next.js build-time data collection imports page modules; `app/page.tsx` imports `requireSession` from `lib/session` (`[VERIFIED: app/page.tsx:13]`). The prior-phase SUMMARY records that `npm run build` needs a full env set locally — the image build has none.
**Why it happens:** Build-time env and runtime env were conflated; `.dockerignore` correctly excludes secrets, leaving the builder with nothing.
**How to avoid:** In the `builder` stage, set **placeholder (non-secret)** env values (`ENV BOT_TOKEN=build-placeholder` …) or pass build ARGs, just enough to satisfy the schema; runtime values still come from the container `.env`. Alternatively add a `next.config.ts` guard, but placeholder build env is simpler and does not leak secrets.
**Warning signs:** `Invalid environment configuration — … is required` during `docker compose build`.

### Pitfall 2: Prisma 7 generated client missing from the standalone image (HIGH)
**What goes wrong:** The runner copies `.next/standalone`, `.next/static`, `public`, `prisma`, `prisma7.config.ts`, and full `node_modules` (`[VERIFIED: Dockerfile:25-31]`) but **not** `/app/generated`, where the `prisma-client` generator writes (`output = "../generated/prisma"`, `[VERIFIED: prisma/schema.prisma:8-11]`). Runtime `lib/prisma.ts` imports `../generated/prisma/client` (`[VERIFIED: lib/prisma.ts:12]`), and `generated/` is gitignored. If Next's file tracing does not carry it, `node server.js` crashes on import.
**Why it happens:** Prisma 7 moved the client out of `node_modules`; the old "copy node_modules" mental model misses it.
**How to avoid:** Add `COPY --from=builder /app/generated ./generated` to the runner stage and verify with `docker compose run --rm web node -e "require('./generated/prisma/client')"` (or a container start smoke test) before the first deploy.
**Warning signs:** `Cannot find module '../generated/prisma/client'` at container start.

### Pitfall 3: Layout-only role gating (HIGH — security)
**What goes wrong:** `AdminShell` checks the role, but an attacker fetches a section's RSC payload/page directly (partial rendering) and the layout does not re-run — Next.js documents this explicitly.
**How to avoid:** Enforce `requireRole` in every admin page and every `/api/admin/**` route, and keep the layout check as UX only. Add a route-handler test for a valid-session wrong-role caller expecting 404 (never 403).
**Warning signs:** Section content renders for a role whose nav link is hidden; a route returns data to a `support` caller that only an `administrator` should reach.

### Pitfall 4: Env bootstrap re-elevating a downgraded admin (HIGH — privilege escalation)
**What goes wrong:** `ADMIN_TELEGRAM_IDS` is treated as a live grant; every request forces `role = administrator` for its members, so UI downgrades silently revert and D-66 ("далее управление через UI/БД") is violated.
**How to avoid:** Bootstrap rule = *if no `admin_users` row exists, create one; never update an existing row's role.* Test: create row as `support`, call `getAdminRole` again, assert still `support`.
**Warning signs:** A downgraded admin's role flips back after a reload.

### Pitfall 5: Broadcast retry storm on blocked/deactivated recipients (MEDIUM-HIGH)
**What goes wrong:** Every Telegram `sendMessage` failure is treated as retryable; 403-blocked users are rescheduled forever, the queue never drains, and the broadcast status sticks at `sending`.
**How to avoid:** Classify errors: 403 (`bot was blocked by the user`, `user is deactivated`) and 400 (`chat not found`) → terminal `failed` for that recipient (optionally null `chatId`); 429 → back off honoring `retry_after`; 5xx/network → retry with existing backoff. [CITED: core.telegram.org/api/errors] and [CITED: github.com/TelegramBotAPI/errors].
**Warning signs:** `failed` count never grows while the broadcast stays `sending`; repeated reschedules for the same `dedupeKey`.

### Pitfall 6: White Label DNS misconfig stranding paid users (MEDIUM-HIGH)
**What goes wrong:** `sub.my.3set.online` has an AAAA record, is Cloudflare-proxied, or points at the cabinet IP instead of `144.31.93.193` → every issued sub-link fails to connect.
**How to avoid:** Deploy checklist: A → `144.31.93.193`, **no AAAA**, **DNS Only (grey cloud)**, wait for cert, then `curl` the sub-link from outside and validate it parses. Keep provider-default fallback; never rewrite the host (Pattern 6). (Pitfall 9.)
**Warning signs:** `dig AAAA sub.my.3set.online` returns anything; the URL host ≠ `sub.my.3set.online`.

### Pitfall 7: Migrations treated as reversible (MEDIUM)
**What goes wrong:** A bad deploy is "rolled back" by redeploying the previous image, but the DB schema still contains the new migration — Prisma has no automatic prod rollback [CITED: prisma.io/docs/orm/prisma-migrate/workflows/development-and-production].
**How to avoid:** Before deploying, take a `pg_dump`; rollback = restore that dump + deploy the previous commit, or ship a forward-fix migration. Document this in the deploy runbook (D-78).
**Warning signs:** No pre-deploy backup step; rollback plan says only "redeploy previous image".

### Pitfall 8: Disk fill / log bloat on the single server (MEDIUM)
**What goes wrong:** Unbounded Docker JSON logs + unrotated backups fill the disk; Postgres and the app die together (PITFALLS performance trap).
**How to avoid:** `logging: { driver: "json-file", options: { max-size: "10m", max-file: "3" } }`; backup retention + age-pruning (`find … -mtime +7 -delete`).
**Warning signs:** `docker system df` growth; free-space alerts.

### Pitfall 9: ARTEMIDA read fan-out causes 429s (MEDIUM)
**What goes wrong:** Stats page calls `getBalance` + `listKeys` + `getDevices` per key on every render/refresh; admin refresh-spam triggers 429/`Retry-After`.
**How to avoid:** One `listKeys()` for keys+devices, one `getBalance()`; short TTL cache; degrade to `—`/`unknown` on failure (Patterns 2/3).

## Code Examples

### Admin role guard + 404 mapping (route handler)
```ts
// Source: pattern from app/api/admin/tickets/[id]/reply/route.ts (existing, VERIFIED)
import { AdminError, SessionError } from "@/lib/session";
import { requireRole } from "@/lib/admin-auth";

export async function POST(req: Request): Promise<Response> {
  try {
    const { role } = await requireRole("administrator"); // D-66: roles only
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err instanceof AdminError)  return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  // ...zod body, create Broadcast + enqueue Notifications...
}
```

### Bulk-enqueue broadcast recipients (idempotent)
```ts
// Reuses the UNIQUE Notification.dedupeKey claim semantics (lib/outbox.ts)
const recipients = await prisma.user.findMany({
  where: { chatId: { not: null } },
  select: { id: true },
});
await prisma.notification.createMany({
  data: recipients.map((u) => ({
    type: "broadcast",
    dedupeKey: `broadcast:${broadcastId}:${u.id}`,
    userId: u.id,
  })),
  skipDuplicates: true, // a retried enqueue can never double-send
});
```

### Broadcast dispatch with terminal 403 / retryable 429
```ts
// Source pattern: lib/ticket-notify.ts dispatchTicketNotification (existing, VERIFIED)
export async function dispatchBroadcast(id: string, send: TelegramSender): Promise<NotifyDispatchResult> {
  const n = await prisma.notification.findUnique({
    where: { id },
    select: { userId: true, type: true },
  });
  if (!n?.userId) return { outcome: "skipped" };
  const user = await prisma.user.findUnique({
    where: { id: n.userId },
    select: { chatId: true, telegramId: true },
  });
  if (!user) return { outcome: "skipped" };
  const broadcast = await prisma.broadcast.findFirst({ orderBy: { createdAt: "desc" } }); // body lookup in real impl
  const body = (broadcast?.body ?? "").slice(0, BOT_REPLY_CAP);
  const chatId = String(user.chatId ?? user.telegramId);
  try {
    await send.sendMessage(chatId, body); // NO parse_mode — plain text only
    return { outcome: "pushed" };
  } catch (err) {
    const code = (err as { response?: { error_code?: number; parameters?: { retry_after?: number } } })
      ?.response?.error_code;
    if (code === 403 || code === 400) {
      // permanent: blocked / deactivated / chat not found → treat as terminal
      return { outcome: "skipped" }; // worker marks done; caller increments failed
    }
    return { outcome: "retryable_error" }; // 429/5xx/network → reschedule with backoff
  }
}
```
*(The exact error-shape extraction depends on Telegraf's thrown error object; the planner should include a test with a stubbed 403/429 sender. Some Telegraf versions expose `err.response.error_code`; verify at implementation time.)*

### Compose prod skeleton
```yaml
# docker-compose.prod.yml (new) — mirrors local compose, adds nginx + edge
services:
  web:
    build: .
    env_file: [.env]
    environment:
      DATABASE_URL: postgresql://setwhite:${DB_PASSWORD}@db:5432/setwhite
      BOT_MODE: webhook
      NODE_ENV: production
      UPLOAD_DIR: /data/uploads
      APP_BASE_URL: https://my.3set.online
    volumes: [uploads:/data/uploads]
    depends_on: { db: { condition: service_healthy } }
    restart: unless-stopped
    logging: { driver: json-file, options: { max-size: 10m, max-file: "3" } }
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      start_period: 40s
      retries: 3
  db:
    image: postgres:17-alpine
    environment: { POSTGRES_USER: setwhite, POSTGRES_PASSWORD: ${DB_PASSWORD}, POSTGRES_DB: setwhite }
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U setwhite -d setwhite"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/my.3set.online.conf:/etc/nginx/conf.d/default.conf:ro
      - certs:/etc/letsencrypt:ro
      - certbot_www:/var/www/certbot:ro
    depends_on: [web]
    restart: unless-stopped
volumes: { pgdata: {}, uploads: {}, certs: {}, certbot_www: {} }
# db has NO ports: — internal network only
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` as the auth layer | DAL + per-page/route guards; middleware = optimistic only | Next.js App Router docs, current (2026) | Role checks move next to data; layout no longer trusted |
| `next-pwa` / `@ducanh2912/next-pwa` | `app/manifest.ts` + Serwist | Phase 1 already adopted | No change this phase |
| `prisma migrate dev` on prod | `prisma migrate deploy` (advisory lock, no drift detect) | Prisma long-standing | Already in `Dockerfile:34` |
| `node:latest` | Pin `node:24-bookworm-slim` | — | Already pinned |
| `docker-compose` v1 | `docker compose` v2 | — | Scripts must use `docker compose` |

**Deprecated/outdated:**
- `requireAdminSession`/`isAdmin` env allow-list as the *only* admin gate — replaced by role-aware `requireRole` (Phase 4 explicitly flagged this replacement: `04-04-SUMMARY.md` "Phase 5 replaces the env allow-list behind the same door").

## Assumptions Log

> Every claim in the table below is `[ASSUMED]` — it is a design/ops choice not verifiable from the repo or official docs this session, and needs owner confirmation before it becomes a locked decision. A1, A2, A4 and A6 should be surfaced first.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Revenue = `SUM(amount)` of orders with `paidAt` in period and status ∈ `paid|provisioning|provisioned`; orders = same count; users = all-time `User` count | Pattern 2 / ADM-03 | Numbers may disagree with the owner's finance expectations; needs confirmation before locking the stats queries |
| A2 | `critical` = balance ≤ 0; `low` = 0 < balance ≤ `ARTEMIDA_LOW_BALANCE_RUB`; default threshold value (e.g. 500 ₽) | Pattern 3 / D-70 | Alert fires too late/early; wrong UX urgency |
| A3 | Overall broadcast status when some rows fail: report `sent` if `failed === 0` and none pending, else `failed` on any terminal failures; UI shows derived counts | Pattern 4 / D-71 | Status chip semantics differ from UI-SPEC expectation (which lists only queued/sending/sent/failed) |
| A4 | Admin profile route param `/admin/users/[id]` uses our internal `User.id` (not telegramId) | Pattern 2 / D-68 | If telegramId is intended, links/joins must change |
| A5 | Broadcast recipients = users with non-null `chatId` (users who have messaged the bot) | Pattern 4 | Recipient count undercounts users who never `/start`ed |
| A6 | Low-balance "push" can be admin-banner + WARN log in v1; a Telegram DM to admins is optional | Pattern 3 / D-70 | D-70's "пуш" may require an actual Telegram alert |
| A7 | Certbot runs as a Compose sidecar (or documented host cron); D-75 does not fix the cert driver | Pattern 5 | Owner may prefer host-level certbot; low impact |
| A8 | `my.3set.online` A record must be DNS-only (grey cloud) for HTTP-01 first issuance | Pattern 5 | If it stays proxied, cert issuance fails and the cabinet is unreachable over HTTPS |
| A9 | Search `q` matching is `contains` and case-sensitive for `keyId`; telegram-id branch is exact | Pattern 2 / D-68 | Search may miss differently-cased references; low impact |

**If this table is empty:** not the case — A1–A9 need confirmation. A1, A2, A4, A6 are the ones that should be surfaced to the owner before execution (or resolved by the plan with a checkpoint).

## Open Questions

> **All resolved in the plan set (iteration 1).** Pointers below map each question to the plan/task that locks it.

1. **(RESOLVED → A1, LOCKED in 05-07 Task 1 / wave 5)** **Exact stats semantics (A1)** — What counts as "revenue": captured payments (`paid|provisioning|provisioned`), provisioned only, or net of refunds? Is "users" all-time or new-in-period?
   - What we know: UI-SPEC defines labels (`admin.statsRevenue/statsUsers/statsOrders`) and a 7/30/90 period.
   - What's unclear: the SQL definition.
   - Resolution: locked to A1 — revenue = `SUM(amount)` of orders with `paidAt` in period and status ∈ {paid, provisioning, provisioned}; orders = same count; users = all-time count. Implemented + tested in 05-07 Task 1 (the read is one cheap aggregation, so reversible).
2. **(RESOLVED → A2, LOCKED in 05-07 Task 2 / wave 5)** **Threshold value and critical boundary (A2)** — Environment default for `ARTEMIDA_LOW_BALANCE_RUB` and whether `critical` is `≤0` or `≤ threshold/2`.
   - Resolution: default 500 ₽; `critical` = balance ≤ 0; `low` = 0 < balance ≤ threshold; `unknown` = read threw. `lib/env.ts` gains `ARTEMIDA_LOW_BALANCE_RUB` in 05-05 Task 1; the classifier + boundary tests land in 05-07 Task 2.
3. **(RESOLVED → A6, owner-gated in 05-07 Task 2 `checkpoint:decision` / wave 5)** **Does the owner want a Telegram push for low balance (A6)?** — `ADMIN_TELEGRAM_IDS` is available; a `sendMessage` to admins is straightforward but adds a delivery path.
   - Resolution: banner + WARN log is the default; the Telegram-DM option is presented as an explicit owner `checkpoint:decision` in 05-07 Task 2 before the worker tick ships.
4. **(RESOLVED → LOCKED in 05-04 Task 1 / wave 3)** **Was the owner's observation "Phase 4 admin gate replaced by roles" intended for the attachment-serve `isAdminUser` path too?** — The gated serve currently accepts an `isAdminUser` boolean (`[VERIFIED: lib/tickets-service.ts:372-387]`); it should become "role ∈ {administrator, support}" (manager cannot view tickets per the matrix).
   - Resolution: yes — 05-04 Task 1 replaces the `isAdminUser` boolean with a role-set check (`administrator|support`), manager non-owner → 404.
5. **(RESOLVED → LOCKED in 05-04 Task 1 / wave 3)** **Where does the admin route live — `/admin/**` under the existing `app/` tree?** — Confirmed by UI-SPEC (`/admin`, `/admin/users`, …); no route group required.
   - Resolution: admin pages live at `/admin/**` under the existing `app/` tree; no route group. Implemented across 05-01/02/03/04/07.

## Environment Availability

| Dependency | Required By | Available (this Mac) | Version | Fallback |
|------------|-------------|----------------------|---------|----------|
| Node.js | Build/test | ✓ | v24.15.0 | — |
| npm | Install/test | ✓ | 11.12.1 | — |
| PostgreSQL client + server | Local test DB `setwhite` | ✓ | 16.15 (Homebrew) | — |
| `setwhite` DB + migrations | Vitest DB-backed suites | ✓ | Phase 1–4 tables present | — |
| Docker / Docker Compose | Building/verifying images, compose authoring | ✗ (not on PATH, no Docker.app) | — | Docker **must** be present on the target server 64.188.97.106; author compose/Dockerfile locally, verify on the server |
| Nginx (local) | Nginx conf validation | ✗ | — | Validate with `nginx -t` in a container on the target server |
| Certbot (local) | — | ✗ | — | Runs on the target server / in the nginx-certbot image |
| openssl | Secret generation | ✓ | 3.6.4 | — |
| gh CLI | OPS-03 GitHub push/PR | ✓ | 2.98.0 | — |
| git remote | OPS-03 | ✓ | `https://github.com/xxldrago/3set-white.git` (branch `main`) | — |

**Missing dependencies with no fallback:**
- **Docker/Compose on the deploy target is assumed** (single server 64.188.97.106). Verification tasks that require actually running the stack cannot be executed on this Mac; the plan must mark them as server/owner-gated manual steps or `checkpoint:human-verify`. Local static checks (`nginx -t` via container is also unavailable) should be deferred to the server.

**Missing dependencies with fallback:**
- Local Docker: use `docker compose config` (syntax) only where available; otherwise document a server-side smoke test. No fallback for running containers locally.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`; section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (existing) |
| Config file | `vitest.config.ts` (`fileParallelism: false`, DB-backed suites, dummy env) |
| Quick run command | `npx vitest run tests/unit/<file>.test.ts` |
| Full suite command | `npm test` → `vitest run tests/unit` (needs `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ADM-01 | `getAdminRole` resolves roles; bootstrap creates administrator once and never re-elevates; `can()` matrix matches UI-SPEC §1 | unit | `vitest run tests/unit/admin-auth.test.ts` | ❌ Wave 0 |
| ADM-01 | Admin route returns 401 signed-out, 404 wrong-role/valid-session, 200 correct role | integration (route) | `vitest run tests/unit/admin-route.test.ts` | ❌ Wave 0 |
| ADM-01 | Self role-change blocked; last-admin cannot be removed | integration | same file | ❌ Wave 0 |
| ADM-02 | Search by exact telegram-id and by key/customerRef; ≥2 count header; >50 truncation; no PII leak | integration | `vitest run tests/unit/admin-search.test.ts` | ❌ Wave 0 |
| ADM-02 | Profile sections resolve independently; ARTEMIDA key failure degrades only Keys | integration | same file | ❌ Wave 0 |
| ADM-03 | Revenue/user/order aggregates over period; SQL semantics per A1 | unit (DB) | `vitest run tests/unit/admin-stats.test.ts` | ❌ Wave 0 |
| ADM-03 | Broadcast enqueue creates `Broadcast` + N deduped `Notification` rows; dedupe prevents double-send | integration (DB) | `vitest run tests/unit/broadcast.test.ts` | ❌ Wave 0 |
| ADM-03 | Worker dispatches broadcast; 403 terminal (no reschedule), 429 retryable; status derivation | unit (DB) | same file | ❌ Wave 0 |
| ADM-04 | Balance classification `ok/low/critical/unknown` at threshold boundaries | unit | `vitest run tests/unit/balance-alert.test.ts` | ❌ Wave 0 |
| ADM-04 | ARTEMIDA stat read failure renders `unknown` and does not blank DB cards | integration | admin-stats test | ❌ Wave 0 |
| OPS-01 | Webhook host/env wiring; `APP_BASE_URL` used for Platega return URL | unit (config) | `vitest run tests/unit/env.test.ts` (extend) | ❌ Wave 0 |
| OPS-01 | Health endpoint returns 200 | route test | `vitest run tests/unit/health-route.test.ts` | ❌ Wave 0 |
| OPS-02 | WL sub-link host verification helper: correct host passes, mismatch/fallback warns | unit | `vitest run tests/unit/whitelabel.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the specific new test file(s) green.
- **Per wave merge:** `npm test` (full unit suite) + `npx tsc --noEmit`.
- **Phase gate:** full suite green + `npm run build` exit 0 before `/gsd-verify-work`; deploy steps are server/owner-gated manual verification.

### Wave 0 Gaps
- [ ] `tests/unit/admin-auth.test.ts` — roles, bootstrap create-only, matrix, self-change, 404 mapping (ADM-01)
- [ ] `tests/unit/admin-search.test.ts` — search + profile joins + degradation (ADM-02)
- [ ] `tests/unit/admin-stats.test.ts` — DB aggregates + ARTEMIDA degradation + low-balance classifier (ADM-03/04)
- [ ] `tests/unit/broadcast.test.ts` — enqueue dedupe, dispatch 403/429, status (ADM-03)
- [ ] `tests/unit/whitelabel.test.ts` — sub-link host verify/fallback (OPS-02)
- [ ] `tests/unit/health-route.test.ts` — health endpoint (OPS-01)
- [ ] Add `ADMIN_TELEGRAM_IDS` (and `ARTEMIDA_LOW_BALANCE_RUB`) to `vitest.config.ts` test env for the new suites.
- [ ] No framework install needed (Vitest present). DB migration for `admin_users`/`broadcasts` must land before DB-backed tests run.

*(Deploy/OPS verification that requires Docker or the live server cannot be automated in this environment — mark those tasks `checkpoint:human-verify` per Environment Availability.)*

## Security Domain

> `security_enforcement` is enabled (`security_asvs_level: 1`); section included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (unchanged) | Telegram Login Widget + WebApp initData HMAC → jose HS256 session (`lib/auth.ts`) |
| V3 Session Management | yes (unchanged) | httpOnly/`SameSite=Lax`/`Secure`-in-prod cookie, 30d, `verifySession` HS256 allow-list |
| V4 Access Control | **yes (this phase)** | `admin_users` RBAC + `requireRole` in DAL/pages/routes; 404 on forbidden (no enumeration); self-change block; deny-by-default; nav filtered server-side |
| V5 Input Validation | yes | zod 4 at every admin boundary (`q` ≤ some cap, role enum, broadcast body `trim().min(1).max(4000)`); i18n keys only |
| V6 Cryptography | yes (no hand-roll) | jose for sessions; `timingSafeEqual` for Platega headers; never hand-roll crypto |
| V7 Error Handling & Logging | yes | typed codes only; no provider/DB text to users (D-19/D-24); PII-safe pino logs (no tokens/sub-links/chat ids) |
| V8 Data Protection | yes | secrets env-only; DB port not published; uploads served via gated route (`nosniff`) |
| V9 Communications | yes | HTTPS mandatory; Nginx TLS; webhooks on `my.3set.online` |
| V10 Malicious Code | n/a | no new packages/registries |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via env allow-list overriding UI roles | Elevation of Privilege | Bootstrap create-only; never `update` an existing `admin_users` role from env (Pattern 1, Pitfall 4) |
| Last-admin lockout (admin demotes self / only admin) | Denial of Service | Block self role change in UI **and** backend; UI-SPEC §6 `admin.rolesSelf`; test it |
| Role enumeration via 403 vs 404 | Information Disclosure | Forbidden ≡ 404 (`AdminError` → 404); nav filters unpermitted sections from the DOM |
| Layout-only authorization bypass (RSC fetch) | Elevation of Privilege | Re-check role in every page/route; test wrong-role valid session → 404 |
| Broadcast injection / Bot API parse failure | Tampering | Plain-text `sendMessage` (no `parse_mode`); zod body cap 4000; administrator-only |
| Broadcast retry DoS on dead chats | DoS | 403/400 terminal; 429 backoff; per-recipient dedupe key |
| IDOR in admin content (attachments) | Information Disclosure | `getOwnedAttachment(..., isStaff)` joins ticket→message→attachment; non-owned ≡ 404; extend `isAdminUser` to role set {administrator, support} |
| Secrets in image / git / logs | Information Disclosure | Build-time placeholder env only; runtime `.env` 0600 on server; `.gitignore` `.env*`; no tokens/sub-links logged (D-77, T-03-01) |
| SSRF/open proxy via Nginx | Elevation of Privilege | Fixed `proxy_pass http://web:3000`; no dynamic upstream from user input |
| Unauthenticated health endpoint leaking internals | Information Disclosure | Shallow health payload (`status`, `uptime`); no env/version secrets |
| Webhook spoofing | Spoofing | Existing dual secret (path + `X-Telegram-Bot-Api-Secret-Token`) and Platega header verify (unchanged) |
| DB exposed on the host | Information Disclosure | Compose `db` has no published ports |

## Sources

### Primary (HIGH confidence — read this session)
- In-repo source reads (quoted verbatim in-line): `lib/session.ts`, `lib/auth.ts`, `lib/env.ts`, `lib/outbox.ts`, `lib/worker.ts`, `lib/artemida.ts`, `lib/keys-service.ts`, `lib/orders-service.ts`, `lib/tickets-service.ts`, `lib/bot-payments.ts`, `lib/ticket-notify.ts`, `lib/reminders-service.ts`, `lib/i18n/index.ts`, `lib/i18n/messages/ru.ts`, `prisma/schema.prisma`, `prisma7.config.ts`, `Dockerfile`, `docker-compose.yml`, `next.config.ts`, `instrumentation.ts`, `app/page.tsx`, `app/api/admin/tickets/[id]/reply/route.ts`, `app/api/telegram/webhook/[secret]/route.ts`, `app/api/platega/callback/route.ts`, `docs/artemida-v1-contract.md`, `tests/unit/session.test.ts`, `vitest.config.ts`, `.planning/config.json`.
- Phase artifacts: `05-CONTEXT.md`, `05-UI-SPEC.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `04-04-SUMMARY.md`, `03-03-SUMMARY.md`, `AGENTS.md`.

### Secondary (MEDIUM confidence — official docs / cross-checked web)
- Telegram Bot API FAQ — broadcast limits (~30/s bulk, ~20/min/group, 1/s/chat) and 429 guidance — https://core.telegram.org/bots/faq
- Telegram Bot API error reference — 403/400 permanent errors — https://core.telegram.org/api/errors and https://github.com/TelegramBotAPI/errors
- Next.js Authentication guide — DAL, layout partial-rendering caveat, route-handler role checks, optimistic Proxy — https://nextjs.org/docs/app/guides/authentication (published 2026-08-25)
- Prisma — development vs production (`migrate deploy`, no auto rollback, advisory locking) — https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
- Cloudflare — proxy status / DNS-only (grey cloud), origin exposure, cert issuance implications — https://developers.cloudflare.com/dns/proxy-status/
- Docker/Next.js production & healthcheck patterns (multi-source convergent) — https://stacknotice.com/blog/docker-nextjs-production-guide-2026, https://stackpractices.com/recipes/docker-health-check-configuration/
- Nginx + Certbot + Compose automatic TLS (multi-source convergent) — https://github.com/masiton/letsencrypt-docker-compose, https://github.com/eugene-khyst/letsencrypt-docker-compose
- PostgreSQL Docker backup with pg_dump + cron + retention (multi-source convergent) — https://serversinc.io/blog/automated-postgresql-backups-in-docker-complete-guide-with-pg-dump/, https://github.com/mentos1386/docker-postgres-cron-backup
- AgentBridge production runbook (startup migration caveat, rollback ≠ migration rollback) — https://github.com/Vann-Dev/AgentBridge/blob/main/docs/production-runbook.md

### Tertiary (LOW confidence — flagged for validation)
- Telegraf error object shape for 403/429 (`err.response.error_code` / `parameters.retry_after`) — assumed from the Bot API shape; must be verified in an implementation-time test.
- `next build` behavior of importing `lib/env.ts` in the builder stage — inferred from fail-fast import graph + prior SUMMARY note; verify by actually building the image.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all versions read from `package.json`; deploy images are standard.
- Architecture (RBAC + outbox broadcast + degradation): HIGH — grounded in verbatim in-repo readings and the project's own prior-phase patterns; Next.js enforcement constraint CITED from official docs.
- Deploy/White Label: MEDIUM-HIGH — topology follows the owner's locked D-75..D-78 and the project's ARCHITECTURE.md, but actual server/DNS state cannot be observed from this environment; Docker is not installed locally.
- Pitfalls: MEDIUM-HIGH — the two Dockerfile gaps are HIGH (inferred from read files + build behavior; verify by building); the rest rest on official docs.

**Research date:** 2026-10-04
**Valid until:** ~30 days for stable infra/RBAC; re-check Telegram limits and Next.js App Router auth guidance if older than that (fast-moving).

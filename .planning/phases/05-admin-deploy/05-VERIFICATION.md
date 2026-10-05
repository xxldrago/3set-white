---
phase: 05-admin-deploy
verified: 2026-10-05T13:00:00Z
status: gaps_found
score: 3/5 must-haves verified
behavior_unverified: 1 # Truths present + wired in code but whose runtime behaviour requires the live server (counted as the T3 deploy truth; T4-DNS and T5-deploy sub-behaviours are folded into human_verification below)
overrides_applied: 0
gaps:
  - truth: "Все изменения кода закоммичены и запушены в GitHub 3set-white"
    status: failed
    reason: "Код закоммичен локально (208 коммитов, включая все коммиты Phase 5), но НЕ запушен: origin/main застрял на 9d40b76 (Phase 1, план 01-01), HEAD — 6a80665 (Phase 5, план 05-06). 193 коммита впереди origin/main, 0 позади. Это же ломает воспроизводимость деплоя: scripts/deploy.sh начинается с `git pull --ff-only`, который на сервере стянет устаревший код Phase 1."
    artifacts:
      - path: ".git (remote origin/main)"
        issue: "origin/main = 9d40b76 (Phase 1); HEAD = 6a80665 (Phase 5); ahead 193 / behind 0"
    missing:
      - "git push origin main (требует credentials владельца; пушить после проверки)"
behavior_unverified_items:
  - truth: "Пользователь открывает кабинет по https://my.3set.online, бот и Platega-webhook работают через этот домен"
    test: "На 64.188.97.106: docker compose -f docker-compose.prod.yml build && up -d; curl -f https://my.3set.online/api/health → 200; nginx -t; setWebhook и Platega callback на my.3set.online"
    expected: "Кабинет отвечает по HTTPS, /api/health → 200 (worker:true), бот принимает webhook, Platega callback принимается"
    why_human: "Артефакты (Nginx TLS conf, Compose topology, deploy.sh, маршруты /api/telegram/webhook/[secret] и /api/platega/callback) присутствуют и связаны, но живой деплой требует сервера 64.188.97.106 и Docker — недоступны агенту (05-06 Task 5, blocking-human)."
coincidental_reliance_items: []
human_verification:
  - test: "Живой деплой на 64.188.97.106 (05-06 Task 5): build образа, nginx -t, curl /api/health, выдача TLS, setWebhook, pg_dump restore dry-run, rollback dry-run, dig AAAA sub.my.3set.online пуст"
    expected: "Весь стек работает на my.3set.online; OPS-01 можно пометить complete"
    why_human: "Docker и сервер недоступны агенту; это явный блокирующий human-gate (05-06 SUMMARY фиксирует Task 5 как blocking-human)"
  - test: "DNS A-record sub.my.3set.online → 144.31.93.193 (без AAAA, DNS Only) и настройка White Label бренда sub.my.3set.online в кабинете ARTEMIDA"
    expected: "Provider-сслыки резолвятся на sub.my.3set.online; verifySubscriptionHost.match === true"
    why_human: "Внешние действия владельца в Cloudflare и кабинете ARTEMIDA (D-72/D-73); код только проверяет хост и делает fallback"
  - test: "Живой вход администратора/техподдержки/менеджера в /admin и фактическая рассылка broadcast в Telegram"
    expected: "Каждый видит только свои разделы; broadcast доставляется получателям с 403-terminal/429-retry и дедупликацией"
    why_human: "Рендеринг навигации, доставка в реальном Telegram и визуальные состояния требуют браузера/боевого бота — юнит-тесты пиннят структуру и логику, но не реальный UI/Telegram"
---

# Phase 5: Admin & Deploy Verification Report

**Phase Goal:** Команда управляет сервисом через админ-панель, весь стек работает на my.3set.online
**Verified:** 2026-10-05T13:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Администратор, техподдержка и менеджер заходят в админ-панель и видят только свои разделы согласно ролям | ✓ VERIFIED | `lib/admin-auth.ts` `can()` matrix (administrator=все, support=users/profileKeys/profileTickets/tickets, manager=overview/users/profilePayments); `requireRole(...)` пере-проверяется на КАЖДОЙ странице (`app/admin/{page,users,broadcast,roles,tickets}.tsx`, `users/[id]`, `tickets/[id]`) и каждом `/api/admin/**` route; layout — только UX (`app/admin/layout.tsx`); forbidden ≡ 404 (`AdminError`), ни одного 403 в admin surface. Юнит-тесты: `admin-auth.test.ts` (7), `admin-route.test.ts`, `tickets-route.test.ts`, `ticket-attachments.test.ts` — все зелёные |
| 2 | Админ находит пользователя по telegram-id/ключу, видит ключи/платежи; видит статистику выручки и баланс ARTEMIDA с алертом; делает broadcast | ✓ VERIFIED | `lib/admin-service.ts` (`adminSearchUsers` exact-first + dedupe + 50-cap + PII-minimal; `loadAdminProfile` с независимой деградацией секций); `lib/admin-stats.ts` (cached ARTEMIDA + DB aggregates); `lib/balance-alert.ts` (classifyBalance + DM dispatcher, dedupe `balance:{date}:{band}:{id}`); `lib/broadcast.ts` (enqueue → deduped Notifications → batched worker delivery, 400/403 terminal, 429 retry_after backoff, только `chatId ?? telegramId`). Юнит-тесты: `admin-search.test.ts` (31), `admin-stats.test.ts`, `balance-alert.test.ts`, `broadcast.test.ts` — зелёные. Живой broadcast в Telegram — human (см. Human Verification) |
| 3 | Пользователь открывает кабинет по https://my.3set.online, бот и Platega-webhook работают через домен | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Артефакты присутствуют и связаны: `nginx/my.3set.online.conf` (TLS + ACME + fixed proxy_pass web:3000), `docker-compose.prod.yml` (web/db/nginx/certbot, db без published ports, healthcheck), `scripts/deploy.sh`, маршруты `app/api/telegram/webhook/[secret]` и `app/api/platega/callback`. Живой деплой на 64.188.97.106 — human-gate (Docker недоступен агенту) |
| 4 | Subscription-ссылки отдаются через White Label домен sub.my.3set.online | ✓ VERIFIED | `lib/whitelabel.ts` `verifySubscriptionHost`/`resolveSubscriptionUrl` — только проверяет хост и делает fallback к provider-URL, никогда не конструирует/переписывает хост; `WHITELABEL_HOST` из env (default `sub.my.3set.online`). Юнит-тесты `whitelabel.test.ts` (6). Фактический DNS A-record/brand — human (owner manual) |
| 5 | Все изменения кода закоммичены и запушены в GitHub 3set-white, деплой воспроизводится на сервере | ✗ FAILED | Код закоммичен (208 коммитов локально), но НЕ запушен: origin/main = 9d40b76 (Phase 1), HEAD = 6a80665 (Phase 5), ahead 193. Деплой воспроизводится только после push — `deploy.sh` начинается с `git pull --ff-only` |

**Score:** 3/5 truths verified (1 present-but-behavior-unverified, 1 failed)

### Deferred Items

None — Phase 5 is the final milestone phase; no later phase absorbs the push gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/admin-auth.ts` | requireRole + can() matrix + create-only bootstrap | ✓ VERIFIED | `getAdminRole` upsert `update: {}` — даунгрейд не перевыдаёт роль |
| `lib/admin-roles.ts` | changeAdminRole: self-change block, last-admin guard, Serializable conditional updateMany | ✓ VERIFIED | `isolationLevel: Serializable`, `updateMany` `count===1`, P2034→not_found |
| `lib/admin-service.ts` | adminSearchUsers + loadAdminProfile (PII-minimal) | ✓ VERIFIED | `AdminKeyView` без subscriptionUrl/traffic/customerRef; search возвращает только {userId,telegramId,displayName,staffRole?} |
| `lib/admin-stats.ts` | cached ARTEMIDA + DB aggregates, safe degradation | ✓ VERIFIED | 60s TTL cache, `degraded:true` при ArtemidaError |
| `lib/balance-alert.ts` | classifyBalance + idempotent DM dispatcher | ✓ VERIFIED | dedupe key `balance:{date}:{band}:{telegramId}` |
| `lib/broadcast.ts` | derive status + dispatch (403-terminal/429-retry) + outcome accounting | ✓ VERIFIED | `errorCode` 400/403→skipped, иначе retryable + retryAfterSec |
| `lib/whitelabel.ts` | verifySubscriptionHost / resolveSubscriptionUrl (no host fabrication) | ✓ VERIFIED | fallback возвращает provider URL байт-в-байт |
| `lib/outbox.ts` | enqueueBroadcastNotifications + enqueueBalanceAlertNotifications (createMany skipDuplicates) | ✓ VERIFIED | dedupe by UNIQUE `dedupeKey` |
| `lib/worker.ts` | drainNotificationType for BROADCAST + BALANCE_ALERT; hourly balance tick | ✓ VERIFIED | `BALANCE_ALERT_INTERVAL_MS` 60min; `recordBroadcastOutcome` on pushed/skipped |
| `app/api/health/route.ts` | shallow 200 {status,uptime,worker} | ✓ VERIFIED | no DB/env/version/token; `dynamic=force-dynamic` |
| `app/api/admin/**` (6 routes) | requireRole + 401/404/500 mapping | ✓ VERIFIED | все 6 маршрутов проверяют role; 404 not 403 |
| `app/admin/**` (8 pages) | requireRole re-check (layouts not boundary) | ✓ VERIFIED | все 8 страниц пере-проверяют guard |
| `Dockerfile` | build-stage placeholder ENV + generated client copy | ✓ VERIFIED | builder ENV placeholders; runner `COPY --from=builder /app/generated ./generated` |
| `docker-compose.prod.yml` | web/db/nginx/certbot, db unpublished, healthcheck | ✓ VERIFIED | node native fetch healthcheck; db без `ports:` |
| `nginx/my.3set.online.conf` | TLS + ACME + fixed proxy + limits | ✓ VERIFIED | proxy_read_timeout 75s, client_max_body_size 8m |
| `scripts/{deploy,backup,rollback}.sh` | executable, secret-free | ✓ VERIFIED | deploy=git pull→build→up -d; backup=pg_dump+volumes; rollback=restore+prev commit |
| `docs/DEPLOY.md` | full runbook (DNS/secrets/TLS/webhooks/backup/rollback/monitoring) | ✓ VERIFIED | complete, secret-free |
| `prisma/schema.prisma` + 2 migrations | AdminUser + Broadcast models | ✓ VERIFIED | `20261003221043_phase5_admin`, `20261005021951_phase5_broadcast` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `app/admin/**` pages | `lib/admin-auth.requireRole` | direct import, guard re-check | ✓ WIRED | каждая страница пере-проверяет (layouts не граница) |
| `app/api/admin/**` routes | `lib/admin-auth.requireRole` | direct import | ✓ WIRED | 6 routes |
| `app/api/admin/users/search` | `lib/admin-service.adminSearchUsers` | service call after role | ✓ WIRED | zod ≤200 cap |
| `app/api/admin/broadcast` POST | `lib/outbox.enqueueBroadcastNotifications` + `lib/broadcast.loadBroadcastStatus` | create Broadcast + createMany | ✓ WIRED | dedupe `broadcast:{id}:{userId}` |
| `lib/worker.drainNotificationType` | `lib/broadcast.dispatchBroadcast` + `recordBroadcastOutcome` | BROADCAST dispatcher | ✓ WIRED | 403→skipped→failed counter |
| `lib/worker.runBalanceAlert` | `lib/balance-alert` + `enqueueBalanceAlertNotifications` | hourly tick | ✓ WIRED | dedupe per date+band+id |
| `app/api/health` | `globalThis.__setwhiteWorker.started` | worker handle | ✓ WIRED | absent→false, still 200 |
| `lib/whitelabel` | `lib/env.WHITELABEL_HOST` | single env source | ✓ WIRED | never hardcoded twice |
| `scripts/deploy.sh` | GitHub origin/main | `git pull --ff-only` | ✗ NOT_WIRED | origin/main 193 commits behind — деплой стянет Phase 1 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| admin stats | `loadDbStats` revenue/users/orders | `prisma.order.aggregate` + `user.count` | real DB aggregate | ✓ FLOWING |
| admin stats | `loadArtemidaStats` balance/keys/devices | `artemida.getBalance()` + `listKeys()` | real provider read (cached 60s) | ✓ FLOWING |
| admin search | `adminSearchUsers` rows | `prisma.user.findUnique` + `keyCache.findMany` | real DB query | ✓ FLOWING |
| admin profile | `loadAdminKeys` | `prisma.keyCache.findMany` | real DB read | ✓ FLOWING |
| admin profile payments | `loadAdminPayments` → `toHistoryRow` | `prisma.order.findMany` | real DB read (provider ids dropped) | ✓ FLOWING |
| balance alert | `classifyBalance` band | `loadArtemidaStats().balance` | real balance | ✓ FLOWING |
| broadcast body | `broadcast.body.slice(0, BOT_REPLY_CAP)` | `prisma.broadcast` row | real stored body | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck | `npx tsc --noEmit` | exit 0, clean | ✓ PASS |
| Full unit suite | `DATABASE_URL=… npx vitest run tests/unit` | 38 files / 346 tests passed | ✓ PASS |
| Production build | `BOT_TOKEN=x … npm run build` (throwaway env) | exit 0; /admin, /api/admin/*, /api/health all emitted | ✓ PASS |
| No legacy admin gate | `grep requireAdminSession/isAdmin` in *.ts/*.tsx | 0 matches (only ADMIN_TELEGRAM_IDS bootstrap) | ✓ PASS |
| No 403 oracle | `grep 403` in app/admin + app/api/admin | only comments "404 (not 403)" | ✓ PASS |
| Secrets-free deploy artifacts | grep in nginx/scripts/docs/Dockerfile/compose/.env.example | no real secrets | ✓ PASS |

### Probe Execution

No probes declared in Phase 5 plans. Step 7c: SKIPPED (not a migration/CLI probe phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| ADM-01 | 05-01, 05-04 | Роли: администратор/техподдержка/менеджер, section matrix | ✓ SATISFIED | `lib/admin-auth.ts` + `lib/admin-roles.ts` + gated pages/routes |
| ADM-02 | 05-02 | Поиск по telegram-id/ключу + read-only профиль | ✓ SATISFIED | `lib/admin-service.ts` + search/profile routes/pages |
| ADM-03 | 05-03, 05-07 | Статистика выручки/пользователей + broadcast | ✓ SATISFIED | `lib/admin-stats.ts` + `lib/broadcast.ts` + worker |
| ADM-04 | 05-07 | ARTEMIDA статистика (баланс) + low-balance alerts | ✓ SATISFIED | `lib/balance-alert.ts` + `classifyBalance` + DM dispatcher |
| OPS-01 | 05-06 | Деплой на один сервер (Compose+Nginx+HTTPS), webhooks | ⚠️ PARTIAL | Артефакты полны и secret-free; живой деплой — human-gate; push — gap |
| OPS-02 | 05-05 | White Label домен | ✓ SATISFIED (code) | `lib/whitelabel.ts`; DNS/brand — owner manual |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | No TBD/FIXME/XXX, no stub returns, no hardcoded-empty props in modified files |

### Human Verification Required

1. **Живой деплой на 64.188.97.106** (05-06 Task 5, blocking-human) — build образа, `nginx -t`, `curl -f https://my.3set.online/api/health` → 200, выдача TLS, `setWebhook`, pg_dump restore dry-run, rollback dry-run, `dig AAAA sub.my.3set.online` пуст.
2. **DNS + ARTEMIDA brand** — `sub.my.3set.online A → 144.31.93.193` (без AAAA, DNS Only) + White Label бренд в кабинете ARTEMIDA.
3. **Живой вход по ролям + broadcast** — фактический рендеринг навигации по ролям и доставка broadcast в реальном Telegram.

### Gaps Summary

Функциональная цель фазы достигнута в коде на 100%: RBAC (roles + create-only bootstrap + 404-not-403), поиск/профиль пользователя без утечки PII, статистика с кэшем ARTEMIDA и idempotent low-balance DM, broadcast с дедупликацией и 403-terminal/429-retry, White Label с fallback без fabrication, shallow health, и полный набор деплой-артефактов (Dockerfile, Compose, Nginx, скрипты, runbook) — всё secret-free, `tsc` чистый, 346 юнит-тестов зелёные, прод-сборка проходит.

Единственный BLOCKER: **код не запушен в GitHub** (`origin/main` на коммите Phase 1, 193 коммита впереди). Это не только нарушает SC5 («запушены в GitHub 3set-white»), но и ломает воспроизводимость деплоя — `scripts/deploy.sh` начинается с `git pull --ff-only`, который на сервере стянет устаревший код. Требует `git push origin main` (credentials владельца).

Прочее — это осознанные human-gates (живой деплой, DNS/brand, живой вход/broadcast в Telegram), зафиксированные как behavior-unverified и не считающиеся провалом фазы.

---

_Verified: 2026-10-05T13:00:00Z_
_Verifier: the agent (gsd-verifier)_

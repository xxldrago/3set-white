# Pitfalls Research

**Domain:** VPN subscription service — Telegram bot + PWA cabinet + Platega.io payments + ARTEMIDA Paid API backend
**Researched:** 2026-09-30
**Confidence:** MEDIUM (web sources cross-checked against official docs: docs.platega.io, core.telegram.org; patterns confirmed across multiple production VPN-bot codebases)

## Critical Pitfalls

### Pitfall 1: Paid but no VPN key — provisioning fails after money is taken

**What goes wrong:**
Platega sends `CONFIRMED`, but the subsequent `POST /keys` (or `/trial`) to ARTEMIDA fails — 502/503, 429 rate limit, 402 (own API balance empty), timeout, or server crash between payment confirm and provisioning. User paid rubles, has no subscription link, opens a ticket angry. This is the #1 support incident in VPN-bot projects.

**Why it happens:**
Developers write the happy path as one synchronous chain: webhook → create key → send link. Any failure in the middle leaves a paid-but-unfulfilled order with no recovery path. No persistent order record, no retry, no reconciliation.

**How to avoid:**
- Persist an `orders` row BEFORE redirecting to payment: `{ id, telegram_id, platega_tx_id, devices, days, amount, currency, status: PENDING }`.
- Provision only on the transition `PENDING → PAID`, inside an atomic claim (`UPDATE ... WHERE status=PENDING` — only one worker wins).
- On ARTEMIDA failure: keep order in `PROVISION_ERROR`, enqueue retry with backoff (honor `Retry-After` on 429; retry 502/503), notify user "оплата получена, ключ создаётся".
- Add a reconciler job (every 2–5 min): poll `GET /transaction/{id}` for orders stuck in `PENDING`/`PROVISION_ERROR` — recovers payments whose callback was lost.
- Admin "grant manually / refund" button for orders that exhaust retries.

**Warning signs:**
- Provisioning code lives inside the webhook handler with no DB write first.
- No background worker / cron in the architecture.
- "It works" tested only with ARTEMIDA reachable and funded.

**Phase to address:**
Phase 1 (payments + provisioning core). The order state machine must exist before the first real ruble flows.

---

### Pitfall 2: Double provisioning on webhook retries — ARTEMIDA balance burned twice

**What goes wrong:**
Platega explicitly retries callbacks up to 3 times at 5-minute intervals if your endpoint doesn't answer 200 within 60s. Telegram also redelivers updates. Without dedup, the same payment provisions two ARTEMIDA keys (each burning real API balance) or extends a subscription twice.

**Why it happens:**
Handler does `if status==CONFIRMED: create_key()` with no idempotency guard. Slow provisioning (ARTEMIDA call > 60s or crash after provision but before 200) guarantees a retry that provisions again.

**How to avoid:**
- Unique DB constraint on `platega_tx_id` / callback event id; duplicate delivery → acknowledge 200, do nothing.
- State machine rule: a `PAID` order never transitions again (paid-never-downgrades, paid-never-reprovisions).
- Always pass `Idempotency-Key` header on ARTEMIDA `POST`/`DELETE` (supported by the API) — generate from order id, reuse across retries.
- Answer 200 fast; do heavy provisioning asynchronously, then notify.

**Warning signs:**
- Webhook handler has no dedup table or unique index.
- `Idempotency-Key` never sent to ARTEMIDA.
- Load test with duplicated callback payload creates two keys.

**Phase to address:**
Phase 1 (payments). Add a "send same callback twice → one key" verification criterion.

---

### Pitfall 3: Trusting the Platega callback at face value — free VPN for forgers

**What goes wrong:**
Anyone can POST to your callback URL. If you provision on an unsigned/unchecked body, an attacker mints VPN keys without paying. Platega-specific trap: **callbacks carry NO cryptographic signature** — authentication is only the `X-MerchantId` + `X-Secret` request headers (verified timing-safe). Teams coming from Stripe-style HMAC look for a signature field that doesn't exist and either skip verification or verify the wrong thing.

**Why it happens:**
Docs skimmed; dev assumes "callback from Platega = paid". Amount/currency not compared to the order. Status `PENDING` or `CANCELED` treated as payable.

**How to avoid:**
- Verify `X-MerchantId`/`X-Secret` headers with timing-safe compare; reject with 401 otherwise.
- Re-query `GET /transaction/{id}` server-to-server before provisioning — the API response can't be forged.
- Compare `amount` + `currency` against the stored order; mismatch → hold for manual review, never provision.
- Only `CONFIRMED` provisions. `CANCELED`/`CHARGEBACKED` update status only (chargeback must revoke or flag, never ignore).
- Always send `metadata.userId` (telegram-id) when creating the transaction — required for Platega antifraud on some merchant categories; missing it can get the shop disconnected.

**Warning signs:**
- Callback handler reads `req.body.status` and provisions without header check or re-query.
- No `metadata.userId` in transaction creation.
- No handling of `CHARGEBACKED` status.

**Phase to address:**
Phase 1 (payments). Security review of the callback endpoint before going live.

---

### Pitfall 4: ARTEMIDA API wallet runs dry — every purchase fails with 402

**What goes wrong:**
Project `PROJECT.md` notes the API balance is separate and topped up via `POST /wallet/topups`. When it hits zero, every `POST /keys` returns 402. Users see "payment accepted, key failed" or cryptic errors; team discovers it from support tickets, then scrambles a manual topup while sales are dead.

**Why it happens:**
Wallet balance treated as ops trivia instead of a first-class monitored resource. No alerting, no dashboard, no graceful UX for 402.

**How to avoid:**
- Poll `GET /wallet` (or balance endpoint) on a schedule; alert admin at < N days of runway (compute from avg daily spend).
- Show wallet balance + runway in admin panel (manager role).
- On 402 from ARTEMIDA: tell the user honestly ("временно недоступно, оплата не списана" — and mean it: don't capture payment you can't fulfill; or auto-refund), notify admin immediately.
- Document + script the topup flow (`POST /wallet/topups` + `GET /wallet/topups/{paymentId}` check) so it's a 2-minute runbook, not archaeology.

**Warning signs:**
- No wallet monitoring in the plan; "пополним когда упадёт".
- 402 handled the same as generic 500.
- Only one person knows how topup works.

**Phase to address:**
Phase 1 (core) for 402 handling; admin-panel phase for balance widget + alerts.

---

### Pitfall 5: Trial farming — unlimited free VPN via re-registration

**What goes wrong:**
Trial is 1 day / 2 devices / 2 ₽ via `POST /trial`. Without server-side one-trial-per-user enforcement, users re-register (new Telegram account, second bot start, PWA without linking) and chain free trials forever — burning ARTEMIDA balance at 2 ₽ + key slots each time.

**Why it happens:**
Trial gated only by a client-side button ("already used" flag in bot state) or by telegram-id alone without account linking between bot and PWA. Attacker uses the channel you didn't gate.

**How to avoid:**
- Single identity: `telegram-id` is the ONLY account key in bot and PWA (per PROJECT.md). Enforce `UNIQUE(trial_used)` per telegram-id server-side.
- `POST /trial` only after checking the flag in YOUR DB inside a transaction (check-then-set atomically), not just hiding the button.
- Block `renew`/`upgrade` on trial keys in UI AND backend (API forbids it; backend must return a clean "trial нельзя продлить — купите подписку" instead of proxying the API error).
- Rate-limit trial issuance per IP/device fingerprint as a second layer.

**Warning signs:**
- Trial availability decided in frontend/bot handler without DB constraint.
- PWA and bot have separate user tables.
- No test for "same user requests trial twice concurrently".

**Phase to address:**
Phase 1 (trial + auth). The identity model (one telegram-id) must be settled before trial ships.

---

### Pitfall 6: Trial renew/upgrade crash — proxying ARTEMIDA errors raw to users

**What goes wrong:**
User taps "Продлить" on a trial key (or double-taps renew, or renews an expired/deleted key). ARTEMIDA returns 409/422/404. Bot shows "Error 409" or crashes the scene/wizard, leaving the user stuck mid-flow. Same class: upgrade with invalid device count, renew with insufficient API balance (402).

**Why it happens:**
Backend transparently proxies ARTEMIDA responses. No per-key state machine on our side; buttons rendered without checking key state.

**How to avoid:**
- Maintain key state locally (`active/trial/expired/pending_payment`) and render actions conditionally: trial keys show only "Купить подписку", never renew/upgrade.
- Map ARTEMIDA codes to user messages: 401→"service config error, admin notified"; 402→"temporarily unavailable"; 409→"already processing, wait a minute"; 429→auto-retry with `Retry-After`; 502/503→"retrying automatically".
- Disable action buttons while an operation is in flight (per-key lock) — prevents double-tap duplicate renewals.

**Warning signs:**
- Frontend displays raw API error bodies.
- No key-state field in DB; every screen re-fetches and hopes.
- Double-clicking "Продлить" sends two requests.

**Phase to address:**
Phase 2 (cabinet + key management UX).

---

### Pitfall 7: Telegram update delivery misconfigured — polling + webhook conflict, forged updates

**What goes wrong:**
Two bot instances poll with the same token (e.g., dev machine + server, or two Docker replicas) → Telegram load-balances updates between them, half the payments/messages vanish. Or webhook without `secret_token` accepts forged updates. Or long-polling in production drops updates during deploys.

**Why it happens:**
PROJECT.md targets one server, but dev/test instances linger. Telegraf defaults make it easy to run a second poller accidentally.

**How to avoid:**
- Exactly ONE update consumer per token in prod: webhook (preferred — required anyway for Platega HTTPS + Telegram on same domain) with `secret_token` verification (`X-Telegram-Bot-Api-Secret-Token` header check).
- Local dev uses a SEPARATE test bot token, never the prod token.
- Single-flight lock per update (`update_id` dedup table) so even a redelivery can't double-process.
- Webhook endpoint responds fast (ack → queue → process async); Telegram retries non-2xx and gives up after ~24h of failures.

**Warning signs:**
- "Sometimes the bot doesn't answer" — classic split-brain polling symptom.
- Same token in `.env.example`, dev `.env`, and server.
- No `secret_token` on `setWebhook`.

**Phase to address:**
Phase 0/1 (bot skeleton + deploy). Decide webhook-vs-polling once; webhook is the answer on a server with a domain.

---

### Pitfall 8: Telegram Login Widget replay — captured URL payload = account takeover

**What goes wrong:**
The classic Login Widget returns auth data via redirect URL (`id, auth_date, hash`). That URL lands in browser history, referrers, and server access logs. If the backend accepts the payload for 30 days with no replay guard, anyone holding a copied URL logs in as the victim in the PWA, sees their keys/links, and can link/unlink accounts.

**Why it happens:**
Devs implement the documented HMAC check (`SHA256(bot_token)` secret) but skip `auth_date` freshness and one-time-use. Real-world VPN-bot codebases had to patch exactly this (30-day window → 24h + replay cache).

**How to avoid:**
- Server-side HMAC verification (never trust frontend), `auth_date` max age 24h, reject stale.
- One-time-use: hash the widget `hash` field (e.g., `sha256("tg_widget:"+hash)`), store in a replay cache with 24h TTL, reject reuse with "войдите снова".
- Don't log full widget URLs; strip query params in access logs.
- Note: switching the bot to Telegram's newer OIDC login in BotFather is ONE-WAY — test on a staging bot first, not prod.

**Warning signs:**
- Auth endpoint validates hash but ignores `auth_date`.
- No replay/used-token store.
- Widget callback data logged verbatim.

**Phase to address:**
Phase 2 (PWA auth). Must be in the auth implementation, not retrofitted.

---

### Pitfall 9: Subscription link doesn't connect — White Label DNS + dead links with no self-heal

**What goes wrong:**
PROJECT.md uses `my.3set.online` both as cabinet AND as White Label domain for subscription links. Misconfig (AAAA record present, Cloudflare proxy ON instead of DNS Only, cert not yet issued, A-record pointing at cabinet instead of `144.31.93.193`) → paid users get links that don't open in V2RayNG/Streisand/Hiddify. Every such user becomes a support ticket. Second half: links die silently later (key rotated, node down) and nobody notices until complaints.

**Why it happens:**
DNS done once by hand, never verified from the protocol's perspective. No health check on the served subscription content. No "reissue link" self-service.

**How to avoid:**
- Treat White Label DNS as checklist in deploy runbook: A → `144.31.93.193`, NO AAAA, Cloudflare DNS Only (grey cloud), wait for auto-cert, then `curl` the subscription URL from outside and validate it parses as valid VLESS/Trojan config.
- Keep fallback: if White Label domain unhealthy, serve the default ARTEMIDA subscription domain so users are never stranded.
- In bot/PWA: "Проверить подключение" self-test + "Перевыпустить ссылку" button (reissue without new payment).
- Expiry reminders (1/3/7 days) + "ключ не работает?" diagnostic card showing traffic used, devices, expiry — deflects 80% of tickets.

**Warning signs:**
- Deploy plan says "настроить DNS" with no verification step.
- No fallback domain stored per key.
- Support has no "reissue link" tool; only devs can fix via API.

**Phase to address:**
Deploy phase (DNS checklist) + Phase 2 (self-service diagnostics in cabinet/bot).

---

### Pitfall 10: Permanent delete without refund path — support burns paying users

**What goes wrong:**
ARTEMIDA `permanent delete` returns NO funds. A support agent (or a buggy "replace trial with paid" flow) deletes a paid key — user loses paid days, money gone, chargeback/complaint follows. Same risk in auto-cleanup jobs that purge "unpaid orders" too aggressively and catch paid ones.

**Why it happens:**
Delete exposed too broadly (support role, or a button next to "disable"), no confirmation showing remaining days/value, no soft-state before hard delete.

**How to avoid:**
- Role discipline: support sees keys and tickets only; delete/disable restricted to admin (matches PROJECT.md roles).
- Two-step delete: disable first (key stops working, recoverable) → permanent delete only with explicit confirm showing lost value + refund decision.
- Cleanup jobs only purge orders in `PENDING` older than X AND re-verified as non-`CONFIRMED` via API before deletion.
- Trial→paid replacement flow: create paid key first, verify it works, THEN delete trial.

**Warning signs:**
- Delete button one click, no confirm, available to support role.
- Cleanup cron deletes by age without status check.
- No audit log of who deleted what.

**Phase to address:**
Admin-panel phase (roles + confirm flows) and Phase 1 (cleanup job guards).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No local orders table — rely on Platega dashboard + ARTEMIDA as source of truth | Ship purchase flow in days | No reconciliation, no idempotency, support can't see payment↔key linkage; Pitfalls 1–2 guaranteed | Never for payments |
| Single shared user table for bot+PWA keyed by username instead of telegram-id | Faster "auth" | Duplicate accounts, trial bypass, ticket↔key mismatch | Never — telegram-id from day one |
| Raw ARTEMIDA errors passed to users | Less mapping code | Cryptic UX, support flooded, double-tap bugs (Pitfall 6) | Never in prod; ok in internal admin view |
| Polling instead of webhook for the bot | Easier local dev | Split-brain instances, lost updates, no secret_token auth | Local dev only; prod = webhook |
| Secrets in chat/env committed "temporarily" | Unblocks deploy | Leaked ARTEMIDA/Platega/SSH creds; funds stealable (API wallet topups, payouts) | Never — `.env` + `.gitignore` + rotation from day 0 |
| Skipping expiry reminders | Less code | Renewal revenue lost; users discover expiry when VPN dies abroad | MVP-ok to start with bot message only, but schedule it early |
| One Telegram poller + SQLite + no outbox for notifications | Simple single-server deploy | Lost "key ready" messages after crash; duplicate notifications after restart | MVP-ok IF notification outbox table added before paid traffic |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ARTEMIDA `POST /keys`, `/trial`, renew/upgrade | No `Idempotency-Key`; retry creates duplicate paid keys | Generate key from order id (`order:{id}:create`), reuse on every retry |
| ARTEMIDA 429/502/503 | Treat as fatal, show error | Honor `Retry-After`, bounded retries with backoff; 4xx (except 429) surface immediately, never retried |
| ARTEMIDA 401 | Silent failures, "bot broke" | Alert admin (key rotated/invalid); never show to users as their fault |
| ARTEMIDA auth/session panels (cf. 3x-ui family) | Assuming Bearer always works through Cloudflare/proxy | Verify the `Authorization` header reaches the API (proxies can strip it); test server-side first |
| Platega transaction create | Omitting `metadata.userId` | Always send telegram-id as `metadata.userId` + username; antifraud requirement |
| Platega callback | Looking for HMAC signature field; trusting body | Verify `X-MerchantId`/`X-Secret` headers timing-safe + re-query `GET /transaction/{id}` + compare amount/currency |
| Platega callback URL | HTTP, self-signed cert, private IP, slow handler | Public HTTPS with CA cert (self-signed rejected); answer 200 < 60s; idempotent handler (3 retries/5min) |
| Platega statuses | Treating any callback as paid | Only `CONFIRMED` provisions; `CANCELED` closes; `CHARGEBACKED` flags/revokes |
| Telegram `pre_checkout` (if native invoices ever used) | Slow/no `answerPreCheckoutQuery` (>10s) | Answer within 10s; validate tariff/trial/promo BEFORE approving |
| Telegram Login Widget | Hash check only, 30-day acceptance | Hash + `auth_date` ≤ 24h + one-time-use replay cache |
| White Label domain | Proxy ON / AAAA present / wrong A-record | A → `144.31.93.193`, no AAAA, DNS Only, verify served subscription content parses |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous webhook handlers (Platega + Telegram in request thread) | Timeouts → provider retries → duplicate work; bot slow during ARTEMIDA slowness | Ack-fast + async worker queue for provisioning/notifications | First traffic spike or ARTEMIDA slowdown |
| No per-key locks on renew/upgrade | Double charges on double-tap; 409 storms | Per-key in-flight lock + idempotency key per operation | ~tens of concurrent users |
| Polling ARTEMIDA per page view (traffic, devices) | 429s, cabinet slow | Cache key details server-side (30–60s TTL), refresh async | ~100 active cabinet users |
| Single Node process, no restart policy | One crash = dead bot + dead callbacks until manual SSH | Docker restart policy + healthcheck + process manager; webhook consumers stateless | First unhandled exception in prod |
| Access-log bloat with full URLs/payloads on one small server | Disk full → DB + bot die together | Log rotation, strip query/secrets, separate volume alerts | Months in, suddenly |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| ARTEMIDA_API_KEY / Platega X-Secret / bot token in git | Full API-wallet drain, forged payments, bot hijack | Env-only, `.gitignore`, secret scan in CI, rotate anything ever pasted in chat (incl. root password per PROJECT.md) |
| Callback endpoints without auth (Platega headers / Telegram secret_token) | Free keys, fake payments | Mandatory verification middleware on every webhook; 401 + alert on mismatch |
| Login Widget without replay guard | Session hijack via copied URL | 24h window + one-time-use cache (Pitfall 8) |
| Admin panel without role enforcement server-side | Support/manager escalate to full admin | Enforce roles in API, not just UI; audit log for deletes/refunds/balance views |
| Subscription links treated as public | Link sharing = free-riding on paid keys | Device limits enforced (1–10 per tariff); traffic anomaly view for manager; reissue invalidates old link |
| Root SSH password shared in chat, never rotated | Server takeover → all secrets + user data | Move to key-only SSH, rotate password immediately, firewall webhook/DB ports |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Key delivered as raw URL text with no instructions | User doesn't know which app to install; "не работает" tickets | Per-platform cards (Android/iOS/Windows): app name + import button + 3-step guide |
| No price/parameter confirmation before Platega redirect | "С меня списали не столько" disputes | Confirm screen: days × devices = price (from `GET /pricing`), then pay |
| Trial and paid keys visually identical | User tries to renew trial, fails, frustrated | Badge trial keys; trial card CTA is only "Купить подписку" |
| Payment return path unclear (user closes Platega tab) | "Я оплатил, где ключ?" — even though webhook will arrive | "Вернитесь в бота — ключ придёт сам за ~1 минуту" + reconciler + "проверить оплату" button polling order status |
| Ticket replies only in the channel they wrote from | User writes in bot, reply waits in PWA they never open | Mirror ticket answers to BOTH bot and PWA (per PROJECT.md: единая очередь, ответы в оба канала) |
| No expiry warning | VPN dies at the border/at night; churn | Bot push at 7/3/1 days + one-tap renew with saved parameters |

## "Looks Done But Isn't" Checklist

- [ ] **Purchase flow:** Often missing reconciler for lost callbacks — verify by blocking callback URL, paying, then confirming the key still arrives via polling recovery.
- [ ] **Webhook handler:** Often missing duplicate-delivery test — verify by POSTing the same `CONFIRMED` callback twice and confirming exactly one key.
- [ ] **Callback security:** Often missing header verification + status re-query — verify by POSTing a forged callback without headers and confirming rejection (401, no key).
- [ ] **Trial:** Often missing server-side one-per-user + concurrent double-claim test — verify two simultaneous `/trial` calls yield one key.
- [ ] **Renew/upgrade on trial:** Often missing backend block — verify API-level rejection with a friendly message, not proxied 4xx.
- [ ] **Login Widget:** Often missing `auth_date` check + replay cache — verify replayed payload is rejected.
- [ ] **White Label:** Often missing content check — verify subscription URL fetched externally parses as valid client config.
- [ ] **Wallet monitoring:** Often missing — verify admin sees balance + low-balance alert fires on staging.
- [ ] **Delete flows:** Often missing confirm + role gate — verify support role cannot delete, admin sees value-loss warning.
- [ ] **Secrets:** Often missing scan — verify `git log`/`git grep` shows no tokens, `.env` ignored, root password rotated.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Paid but no key (P1) | LOW if orders table exists; HIGH if not | Find payment in Platega dashboard → match to user via `payload`/`metadata.userId` → provision manually → add reconciler so it never recurs |
| Double provisioning (P2) | MEDIUM (API balance already spent; permanent delete gives no refund) | Disable extra key, extend the surviving key's days to compensate, add unique constraint + idempotency keys |
| Forged callbacks exploited (P3) | HIGH (revenue + trust loss) | Rotate Platega secret, add header verify + re-query, audit all keys granted without matching `CONFIRMED` transaction, revoke fraudulent ones |
| Wallet empty (P4) | LOW | Emergency topup via runbook, then add monitoring; refund or fulfill affected users from order log |
| Trial farming (P5) | LOW–MEDIUM | Backfill `trial_used` per telegram-id, require linking, invalidate duplicate trial keys |
| Webhook split-brain (P7) | LOW | Kill extra pollers, switch prod to webhook + secret_token, dedup by `update_id` |
| Widget replay (P8) | MEDIUM | Force re-login for all PWA sessions, add replay cache + 24h window |
| Dead White Label links (P9) | LOW | Fix DNS (A-only, DNS Only), fallback to default domain, add reissue button |
| Wrongful delete (P10) | HIGH (funds unrecoverable) | Compensate user with new key / manual refund via Platega, restrict roles, add two-step delete |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| P1 order state machine + reconciler | Phase 1 (purchase core) | Kill ARTEMIDA mid-purchase → order recovers to delivered without duplicate |
| P2 idempotency (dedup + Idempotency-Key) | Phase 1 (purchase core) | Duplicate callback → single key; same order retried → single key |
| P3 callback verify + re-query | Phase 1 (purchase core) | Forged callback rejected; amount mismatch held |
| P4 wallet monitoring + 402 UX | Phase 1 (error mapping) + admin phase (widget/alerts) | Staging 402 → friendly message + admin alert |
| P5 trial one-per-user + renew/upgrade block | Phase 1 (trial + identity) | Concurrent trials → one key; trial renew blocked backend-side |
| P6 error mapping + per-key locks | Phase 2 (cabinet/keys UX) | Double-tap renew → one operation; no raw 4xx in UI |
| P7 webhook + secret_token, one consumer | Phase 0/1 (bot skeleton + deploy) | Two instances → alarm; forged update rejected |
| P8 widget 24h + replay cache | Phase 2 (PWA auth) | Replayed payload rejected with re-login prompt |
| P9 White Label checklist + reissue + reminders | Deploy phase + Phase 2 (self-service) | External fetch of sub-URL parses; reissue works; reminders fire |
| P10 roles + two-step delete + guarded cleanup | Admin phase + Phase 1 (cleanup job) | Support cannot delete; cleanup never touches non-PENDING-verified orders |
| Secrets hygiene | Phase 0 (repo + server bootstrap) | Secret scan clean; key-only SSH; password rotated |

## Sources

- Platega official API docs (docs.platega.io): transaction callback contract — `X-MerchantId`/`X-Secret` header auth (no signature), 60s timeout, 3 retries at 5-min intervals, HTTPS/valid-cert requirements, `metadata.userId` antifraud, `GET /transaction/{id}` re-query, `CONFIRMED`/`CANCELED`/`CHARGEBACKED` statuses — HIGH confidence (official docs).
- Telegram Bot Payments + Stars docs (core.telegram.org): `pre_checkout_query` 10s rule, multi-use invoice double-payment warning, `successful_payment` before delivery, `/paysupport` support duty — HIGH confidence (official docs).
- Telegram Login Widget docs + OIDC update (core.telegram.org): HMAC scheme, `auth_date`, one-way OIDC switch, COOP header trap — HIGH confidence (official docs).
- Production VPN-bot codebases (vexvpn-telegram-vpn, vpn_tg_bot_template, ksiVPN-telegram-bot, MarzBot, remnawave-bedolaga-telegram-bot): idempotent payment claims, atomic promo reservation, provision-failure refund, reconciler fallback, webhook signature verification, Login Widget replay-cache fix — MEDIUM confidence (cross-checked across 4+ independent repos, patterns convergent).
- Panel-API integration experience (3x-ui/3x-ui-client issues): 5xx-on-contention retry scoping, session-vs-token auth, Cloudflare stripping `Authorization`, CSRF pitfalls — MEDIUM confidence (issue threads + client docs, relevant as ARTEMIDA failure-mode analogues: always honor 429/5xx semantics and verify auth reaches the API).

---
*Pitfalls research for: VPN subscription + Telegram bot + Platega.io + ARTEMIDA API (3set-white)*
*Researched: 2026-09-30*

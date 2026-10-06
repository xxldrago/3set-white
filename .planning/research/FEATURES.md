# Feature Research

**Domain:** VPN subscription sales service (Telegram bot + PWA cabinet + tickets + admin panel, RU/RUB market)
**Researched:** 2026-09-30
**Confidence:** MEDIUM (web sources, cross-verified across 10+ independent products: Sota VPN, YouFast, Alius, LIBERTY, Alice VPN, SaveNet, MarzBot, Remnawave shop bots, Nemo VPN, Sub2Base)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Trial key (free/cheap test) | Every CIS VPN bot offers a test before payment (LIBERTY: 30-day test; Alius: 7-day; YouFast: 3 free days; Sota: 7-day for 10 ₽). Users will not pay blind. | LOW | Our API: `POST /trial` fixed 1 day / 2 devices / 2 ₽. One-tap "Попробовать" button in bot + cabinet. Must enforce one-trial-per-user (track in own DB). |
| Tariff selection: period × devices | Standard is 1/3/6/12 months (Remnawave shop, SaveNet, MarzBot) or 7/30/90 days. Users expect choice of duration and device count. | LOW | Our v1: 7/30/90 days × 1–10 devices, price via `GET /pricing`. Period/device picker is a thin UI over ARTEMIDA pricing. |
| Instant key delivery (subscription link + QR) | Core value: pay → working link in seconds. All bots deliver sub-link + QR + client setup instructions immediately after payment. | MEDIUM | Requires Platega webhook → `POST /keys` (or trial) → push link to bot + cabinet. Idempotency-Key on POSTs; handle delayed webhook with "pending payment" state. |
| Purchase + renewal in bot | Users live in Telegram; renewal must be 2 taps from reminder or `/start` menu. Remnawave shop, MarzBot, Nemo all do in-bot renew. | LOW | `POST /keys/{id}/renew`. Renewal button on each key card + expiry reminder with deep-link to pay. |
| RUB card payments (MIR/SBP) | RU audience pays with Russian cards/SBP, not crypto. Nemo uses Platega (МИР/СБП/карты); Remnawave bots use YooKassa. | MEDIUM | Platega methods: SBP QR (2), RU cards (10), acquiring (11). Flow: create transaction → redirect/pay link → callback `CONFIRMED/CANCELED/CHARGEBACKED` verified by `X-MerchantId` + `X-Secret` headers → provision. HTTPS endpoint mandatory, 200 OK else 3 retries. |
| "My subscriptions" list with status/expiry | Every bot has "My services/keys": active, pending, expired with traffic + expiry details (AliMehrjou bot, MarzBot). | LOW | Cabinet screen + bot menu section. Data from ARTEMIDA `GET /keys`; cache + sync. Trial keys flagged (no renew/upgrade allowed by API). |
| Expiry reminders (bot push, ~3 days before) | Remnawave shop notifies 3 days before expiry; AliMehrjou bot daily scheduler; Sub2Base "renewal reminders keep rates high on autopilot". Directly protects MRR. | LOW | Scheduler (cron/node-cron) scanning expiries → Telegram push with renew button. Single highest-ROI retention feature. |
| Setup instructions per platform | Users (non-technical) need "download v2rayNG/Streisand/Hiddify → paste link" guides. Remnawave sub-page builder, 3X-UI guides all include this. | LOW | Static per-OS instruction cards in bot + cabinet; link to client apps. Cheap, cuts support load massively. |
| Support contact / ticket creation from bot + cabinet | LIBERTY has dedicated support bot; Remnawave-tg-bot has built-in support chat; PROJECT requires unified queue with attachments in both channels. | MEDIUM | Own ticket entity in DB (ARTEMIDA has no tickets API): create from bot/cabinet, attachments (photo/screenshot), replies routed to both channels, status open/answered/closed. |
| Admin: user/key lookup + stats + broadcast | SaveNet (`/admin /stats /users /block`), AliMehrjou (`/sub_info /user_subs /sendall /users_count`) — every selling bot has this. | MEDIUM | Admin panel (web, role-gated): search user by telegram-id, view keys, revenue/user stats, broadcast to all users. Block/unblock = revoke access. |
| Payment history | Sota has `/payments`; users dispute charges and ask "what did I pay for". | LOW | Store Platega transactions in own DB (id, amount, status, payload=telegram_id+key params); history screen per user. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required for launch, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Referral program (free time for invites) | Alice VPN: free month per invited friend; SaveNet: every 7 paid referrals = 1 free month; YouFast gifts. Cheapest CAC in this market — VPN spreads by word of mouth. | MEDIUM | Unique invite link per user; reward = trial/paid key extension via ARTEMIDA after referee's first confirmed payment. Needs anti-fraud (one account per telegram-id is natural guard). v1.x, after payments stable. |
| Promo codes / gift subscriptions | SaveNet promo codes + first-purchase discounts (20–33%); Nemo gift codes; YouFast giftable subs. Drives launches, bloggers, holidays. | LOW | Own promo table (code → discount % or free days); applied at price calculation before Platega transaction. Gift = key issued to another telegram-id. |
| Auto-renewal (autopay) | Sota has `/autopay`. Removes expiry churn entirely; competitors mostly rely on manual renew + reminders. | HIGH | Requires Platega recurrent SBP-subscriptions API + subscription-status callbacks (`SUBSCRIPTION_ACTIVATED`, `NextChargeAt`). Real complexity: stored mandates, failed-charge dunning, cancel flow. v2+. |
| Device upgrade / management in cabinet | ARTEMIDA supports `POST /keys/{id}/upgrade` and device lists. Most bots sell fixed-device plans; letting users add a device mid-period for prorated price is upsell with zero CAC. | LOW | Already in PROJECT scope. Price delta via `GET /pricing`; pay difference via Platega; then upgrade call. |
| Traffic top-up / traffic stats | Nemo has `traffic_buy.py`; 3X-UI panels show per-user traffic. Our v1 is unlimited, but *showing* consumed traffic builds perceived value ("you used 47 GB"). | LOW | ARTEMIDA exposes traffic per key. Display-only in v1; sellable top-ups only if limited tariffs ever ship. |
| Multi-language (RU + EN) | Sota: 10 languages; Remnawave bots RU/EN. RU-only is fine for v1 (PROJECT out-of-scope), EN unlocks diaspora + reduces ban-risk dependence on one market. | MEDIUM | i18n from day one (key-based strings) so EN is a translation file later, not a rewrite. |
| White-label subscription domain | PROJECT requirement (`my.3set.online` as sub-link domain). Competitors with generic panel domains look resold; own domain = brand trust + harder to block-list. | LOW | ARTEMIDA White Label: A-record to `144.31.93.193`, no AAAA, DNS-Only; save domain in code, use for links. |
| Family / multi-location-in-one-sub positioning | LIBERTY: multiple locations + family plans in one subscription. Marketing-level differentiator more than tech. | LOW | Mostly packaging: allow more devices + present "one sub for whole family" tariff presets. |
| Server status / transparency page | Remnawave bots show server status button; NexusPanel shows live nodes/traffic. Trust signal when RU users fear blocks. | LOW | Simple status endpoint (ARTEMIDA reachability + node list) surfaced in cabinet. Defer unless support asks. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Internal user balance / wallet top-up | "Like real services" — top up once, spend gradually | Adds ledger, refund disputes, stuck-money support tickets; PROJECT explicitly out of scope. Doubles payment states for zero v1 value. | Pay-per-key: each purchase/renewal is one Platega transaction with payload binding it to key params. |
| Traffic-limited (metered) tariffs in v1 | Seems like segmentation/upsell | Metering disputes ("I didn't use that much") are the #1 support-load generator; PROJECT sets unlimited default. Pricing + UX complexity before PMF. | Unlimited (`trafficLimitGb=0`) for all v1 tariffs; show consumption stats for perceived value. |
| Manual card-to-card / receipt-screenshot payments | Avoids gateway commission | AliMehrjou bot does receipt approval — it means human approval per payment, fraud, no instant delivery. Kills core value (instant key). | Platega acquiring only; commission is cost of automation. |
| Unlimited-devices default plans | Marketing appeal ("no limits!") | Credential sharing abuse → 1 buyer serves 50 users; YouFast "unlimited devices" only works with other anti-abuse. ARTEMIDA pricing is per-device for a reason. | 1–10 devices selectable, priced per device; upgrade path for more. |
| Renew/upgrade on trial keys | Users will ask "extend my trial" | ARTEMIDA API forbids trial renew/upgrade (409). Building UI for it = guaranteed error path. | Block renew/upgrade buttons on trial keys; offer "buy full plan" conversion CTA instead. |
| Permanent key delete exposed to users | "I want to remove my key" | ARTEMIDA permanent delete = no refund, irreversible. User self-serve delete = accidental money loss + rage tickets. | No user-facing delete in v1. Admin-only delete with confirmation; users just let keys expire. |
| English localization in v1 | "Bigger market" | Translation + support in EN doubles content work before RU demand is validated. | RU-only v1; i18n keys in code so EN is a later translation drop. |
| Crypto payments in v1 | "Censorship-resistant money" | RU mass user has cards/SBP; crypto adds CryptoBot integration, rate volatility, second webhook pipeline. Nemo does both — but only after cards worked. | Platega cards/SBP first; crypto (Platega method 13 or CryptoBot) as v1.x if users ask. |
| Native mobile apps (own VPN client) | "Like big VPNs" | Vollam-class custom clients cost $75–500+ and months; sub-link + existing clients (v2rayNG/Streisand/Hiddify) is the entire CIS market standard. | Sub-link + QR + setup guides; never build a client. |

## Feature Dependencies

```
[Instant key delivery]
    └──requires──> [Platega transaction + CONFIRMED callback]
    │                  └──requires──> [HTTPS webhook endpoint + header verification]
    └──requires──> [ARTEMIDA key issuance (POST /keys, Idempotency-Key)]
    └──requires──> [User identity (telegram-id, bot+PWA sync)]

[Renewal / upgrade]
    └──requires──> [Instant key delivery] (same payment→provision pipeline)
    └──requires──> [Pricing lookup (GET /pricing)]

[Expiry reminders]
    └──requires──> [My subscriptions] (need expiry dates)
    └──requires──> [Telegram push via bot]

[Tickets (bot + cabinet, unified queue)]
    └──requires──> [User identity]
    ──enhances──> [Instant key delivery] (failed-provisioning tickets need payment/key context)

[Referral program]
    └──requires──> [Instant key delivery] (reward issuance = key create/extend)
    └──requires──> [Payment history] (reward only after referee's CONFIRMED payment)

[Promo codes / gifts]
    └──requires──> [Instant key delivery] (discount applied before transaction create)

[Autopay]
    └──requires──> [Platega recurrent subscriptions + status callbacks]
    └──requires──> [Payment history]
    ──conflicts──> [Pay-per-key simplicity] (two payment models coexist; keep isolated)

[Admin panel]
    └──requires──> [User identity + Payment history + My subscriptions] (read models)
    ──enhances──> [Tickets] (support role works the queue; manager reads finance)
```

### Dependency Notes

- **Key delivery requires Platega CONFIRMED callback + ARTEMIDA issuance:** the payment→provision pipeline is the critical path; everything revenue-related hangs off it. Build it first, with pending-payment state for delayed webhooks.
- **Renewal/upgrade reuses the same pipeline:** do not build a second payment flow — parameterize (new key vs renew vs upgrade) with payload binding.
- **Reminders require subscription read model:** needs synced expiry dates; cheap once key list exists.
- **Referrals require confirmed-payment history:** otherwise self-referral fraud prints free keys.
- **Autopay conflicts with pay-per-key simplicity:** keep recurrent logic isolated; never retrofit autopay into the one-shot flow.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate "users buy VPN in 2 clicks".

- [ ] Trial key one-tap (bot + cabinet) — proves value before payment, market-standard entry
- [ ] Tariff picker 7/30/90 × 1–10 devices with live pricing — the actual product
- [ ] Platega pay → CONFIRMED webhook → instant sub-link + QR delivery — core value loop
- [ ] Renewal + device upgrade (block on trial keys) — repeat revenue
- [ ] My subscriptions (bot + PWA cabinet, Telegram Login sync) — account home
- [ ] Expiry reminders (3-day push with renew button) — cheapest retention
- [ ] Setup instructions per platform — cuts support load from day one
- [ ] Tickets from bot + cabinet, unified queue with attachments — trust + PROJECT requirement
- [ ] Admin panel with roles (admin/support/manager), user lookup, stats, broadcast — operability
- [ ] Payment history per user — dispute handling

### Add After Validation (v1.x)

Features to add once core purchase loop works and first revenue lands.

- [ ] Referral program — trigger: organic "share with friends" requests or CAC pressure
- [ ] Promo codes / gift subscriptions — trigger: launch campaign, blogger partnership, holidays
- [ ] Traffic consumption display — trigger: users ask "how much did I use"; near-zero cost
- [ ] Crypto payment method — trigger: card-decline complaints or explicit user requests
- [ ] Server status page — trigger: block-wave panic in support tickets

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Autopay / recurrent SBP subscriptions — why defer: HIGH complexity (mandates, dunning, Platega recurrent API), needs volume to justify
- [ ] English localization — why defer: doubles content/support; RU demand unvalidated
- [ ] Metered traffic tariffs — why defer: support-load risk; contradicts unlimited positioning
- [ ] Family-plan packaging — why defer: marketing layer on top of existing device plans

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Trial key one-tap | HIGH | LOW | P1 |
| Tariff picker + live pricing | HIGH | LOW | P1 |
| Platega pay → instant delivery | HIGH | MEDIUM | P1 |
| Renewal / upgrade | HIGH | LOW | P1 |
| My subscriptions (bot + cabinet) | HIGH | LOW | P1 |
| Expiry reminders | HIGH | LOW | P1 |
| Setup instructions | MEDIUM | LOW | P1 |
| Tickets unified queue | HIGH | MEDIUM | P1 |
| Admin panel + roles | HIGH | MEDIUM | P1 |
| Payment history | MEDIUM | LOW | P1 |
| Referral program | HIGH | MEDIUM | P2 |
| Promo codes / gifts | MEDIUM | LOW | P2 |
| Traffic display | LOW | LOW | P2 |
| Crypto payments | MEDIUM | MEDIUM | P2 |
| Server status page | LOW | LOW | P3 |
| Autopay | HIGH | HIGH | P3 |
| EN localization | MEDIUM | MEDIUM | P3 |
| Metered tariffs | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | RU Telegram VPN bots (Sota/Liberty/Alice/YouFast) | Open-source shop bots (MarzBot/Remnawave-tg/Nemo) | Our Approach |
|---------|---------------------------------------------------|---------------------------------------------------|--------------|
| Trial | Free 3–30 days or 7-day for 10 ₽, one tap | Trial system standard, configurable | 1-day / 2-device trial via `POST /trial`, one tap, one per user |
| Tariffs | 30d/1y/3y or monthly+yearly tiers, devices often fixed | 1/3/6/12 mo, YooKassa/Crypto/Stars/Tribute | 7/30/90 d × 1–10 devices, server-side pricing, Platega RUB |
| Delivery | Sub-link in chat instantly | Sub-link + QR + sync with panel | Sub-link + QR + per-OS guides, bot + PWA |
| Renewal | In-bot renew, Sota has autopay + `/payments` | Renew via plans, expiry notifications (3-day) | In-bot + cabinet renew/upgrade; reminders; no autopay v1 |
| Cabinet | Mini-app or bot-only (many are bot-only) | Mostly bot-only; panels are admin-side | Full PWA cabinet on own domain (differentiator vs bot-only) |
| Support | Dedicated support bot (LIBERTY) or channel | Built-in support chat (Remnawave-tg) | Unified ticket queue bot+cabinet with attachments (goes further) |
| Referral/gifts | Alice: month per friend; YouFast: gifts | Referral days, promo codes common | v1.x: referrals + promo/gifts after core loop validated |
| Admin | Hidden | `/admin /stats /users /sendall /block` commands | Web admin panel with 3 roles (admin/support/manager) — richer than bot commands |

## Sources

- GramBots listings: Sota VPN, YouFast VPN, Alius VPN, LIBERTY VPN, Alice VPN (bot feature sets, pricing, trial mechanics) — web, MEDIUM
- GitHub savenet-vpn-bot: plans, Tron payments, 3X-UI integration, referral + promo, auto-expiry scheduler — web, MEDIUM
- GitHub reznetwork/remnawave-telegrambot: multi-pay (YooKassa/CryptoPay/Stars/Tribute), 3-day expiry notices, i18n — web, MEDIUM
- GitHub press-vm/remnawave-tg-bot: modular shop bot, trial, support chat, promo, referral — web, MEDIUM
- GitHub AliMehrjou/telegram-vpn-bot: free-config pipeline, receipt flow, referrals, `/sendall`, expiry reminders — web, MEDIUM
- GitHub shekelstrong/vpn_bot (Nemo): Platega + CryptoBot dual payments, gift codes, traffic top-up, 5-container Docker layout — web, MEDIUM
- GitHub fUS1ONd/vpn_bot docs/platega/04-callback: Platega callback headers, statuses, HTTPS-only requirements — web, MEDIUM
- Platega.io official site + docs.platega.io: methods (SBP/cards/crypto), commissions, recurrent subscription callbacks — web, MEDIUM
- Sub2Base / BotSubscription: renewal reminders, trials, autopay patterns for Telegram subscriptions — web, LOW
- NexusPanel / Vollam / V2RayTun docs: reseller panels, white-label, device limits, sub-link mechanics — web, LOW

---
*Feature research for: VPN subscription service (Telegram bot + PWA cabinet + tickets + admin)*
*Researched: 2026-09-30*

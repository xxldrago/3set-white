# API Coverage — ARTEMIDA Paid API V1 (Phase 5 surface)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
>
> **Phase scope note:** Phase 5 (Admin & Deploy) adds **no new external API integration**. The detector
> fired on `D-69` (`ARTEMIDA API (баланс GET /balance, ключи, устройства)`) and `OPS-01` (webhook
> host/env wiring), but both are **existing** integrations reused for admin read surfaces and deploy
> config — no new provider capability is introduced. The matrix below records the decision for every
> ARTEMIDA V1 capability the phase touches, so the reuse is explicit rather than accidental.

## Existing ARTEMIDA client surface (`lib/artemida.ts`)

| capability | decision | reason |
|---|---|---|
| `getBalance` (`GET /balance`) | INTEGRATE | ADM-04: admin dashboard balance card + low-balance classifier (D-69/D-70) |
| `listKeys` (`GET /keys`) | INTEGRATE | ADM-04: admin stats keys/devices totals (D-69); already used by Phase 2 |
| `getDevices` (`GET /keys/{id}/devices`) | OPT-OUT | not needed — ADM-04 device total is derived from the single `listKeys()` device count to avoid N+1 429 fan-out (Pitfall 9) |
| `createKey` | OPT-OUT | out of scope — Phase 3 owns key issuance; admin panel is read-only on keys (UI-SPEC §4) |
| `renewKey` | OPT-OUT | out of scope — user-initiated only (REQUIREMENTS Out of Scope) |
| `upgradeKey` | OPT-OUT | out of scope — user-initiated only |
| `enableKey` / `disableKey` | OPT-OUT | not needed yet — no admin key-mutation surface in v1 (UI-SPEC §4: admins view, never mutate user keys) |
| `deleteKey` (permanent) | OPT-OUT | explicitly out of scope — REQUIREMENTS Out of Scope ("Self-service permanent delete ... только админ с подтверждением"); no admin delete UI in Phase 5 (UI-SPEC §Copywriting Contract) |
| `getKey` (`GET /keys/{id}`) | OPT-OUT | not needed — admin profile keys are read from the local `keys_cache` mirror (ADR-126 mirror-only, D-07/D-29) |
| `getSubscriptionLinks` | OPT-OUT | not needed for admin — sub-links are user-facing (Phase 2); Phase 5 only verifies the White Label host (OPS-02), which reads the provider-returned URL already stored in `keys_cache` |
| `getPricing` | OPT-OUT | not needed — Phase 2/3 own pricing; admin shows historical order amounts from our DB |

## Third-party services touched by deploy (OPS-01, not ARTEMIDA)

| service | decision | reason |
|---|---|---|
| Telegram Bot API (`setWebhook`, `sendMessage`) | INTEGRATE | OPS-01: webhook host on `my.3set.online`; ADM-03: broadcast delivery via the existing outbox worker |
| Platega.io callback | INTEGRATE | OPS-01: callback URL moved to `https://my.3set.online/api/platega/callback` (config only, handler unchanged) |
| Let's Encrypt / Certbot | INTEGRATE | OPS-01/D-75: HTTPS termination via Certbot on the single VPS |
| White Label DNS (`sub.my.3set.online`) | INTEGRATE | OPS-02/D-72: A-record checklist + sub-link host verify/fallback; owner-managed, code only verifies |

**New provider capabilities introduced this phase:** none.

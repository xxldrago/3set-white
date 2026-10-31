# API Coverage — ARTEMIDA Paid API (V1)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
>
> Phase 8 (Unit Economics & Retention) integrates exactly ONE ARTEMIDA
> capability: the live `GET /balance` call, reusing the existing
> `artemida.getBalance()` client method (`lib/artemida.ts:641`) inside the
> `loadBurnRunway` loader with `.catch(() => null)` isolation (D-15). Every
> other capability is already integrated by earlier phases (v1.0 Phases 2–6)
> and is out of Phase 8's scope — the phase adds no new provider call beyond
> the balance read. Per the phase contract (08-CONTEXT D-19, 08-RESEARCH
> §Standard Stack), zero new dependencies and zero new API surface are added.

| capability | decision | reason |
|---|---|---|
| getBalance (`GET /balance`) | INTEGRATE | reused in `loadBurnRunway` for runway (D-15), isolated `.catch(() => null)`, `unlimited → null` |
| getPricing / getPricingKey (`GET /pricing`) | OPT-OUT | already integrated in Phases 2–3 (pricing surfaces); Phase 8 reads cost from `Order.providerCost`, not pricing |
| createTrial (`POST /trial`) | OPT-OUT | already integrated in Phase 3 (trial flow); Phase 8 only filters trials via `KeyCache.isTrial` (D-10) |
| createKey (`POST /keys`) | OPT-OUT | already integrated in Phase 3 (provisioning); Phase 8 is read-only derivation |
| getKeys (`GET /keys`) | OPT-OUT | already integrated in Phase 3 (cabinet key lists); not needed by Phase 8 |
| getKey (`GET /keys/{id}`) | OPT-OUT | already integrated in Phase 3; Phase 8 reconstructs terms from `orders`, never from live key state (D-06) |
| getSubscriptionLinks (`GET /keys/{id}/subscription-links`) | OPT-OUT | already integrated in Phase 3 (cabinet); not needed by Phase 8 |
| getDevices (`GET /keys/{id}/devices`) | OPT-OUT | already integrated in Phase 4 (devices); not needed by Phase 8 |
| deleteDevice (`DELETE /keys/{id}/devices/{token}`) | OPT-OUT | already integrated in Phase 4; Phase 8 has no write surface |
| clearDevices (`POST /keys/{id}/devices/clear`) | OPT-OUT | already integrated in Phase 4; Phase 8 has no write surface |
| getTraffic (`GET /keys/{id}/traffic`) | OPT-OUT | already integrated in Phase 4 (traffic); not needed by Phase 8 |
| resetTraffic (`POST /keys/{id}/traffic/reset`) | OPT-OUT | already integrated in Phase 4; Phase 8 has no write surface |
| renewKey (`POST /keys/{id}/renew`) | OPT-OUT | already integrated in Phases 4–6 (renewal flow); Phase 8 classifies renewals from the order chain, does not call it |
| upgradeKey (`POST /keys/{id}/upgrade`) | OPT-OUT | already integrated in Phase 4; Phase 8 treats upgrades as non-renewals (D-09), never calls it |
| disableKey / enableKey (`POST /keys/{id}/disable` / `enable`) | OPT-OUT | already integrated in Phase 3 (block/unblock); Phase 8 has no write surface |
| deleteKey (`DELETE /keys/{id}[/permanent]`) | OPT-OUT | already integrated in Phase 4 (admin delete); Phase 8 has no write surface |

No capability is silently omitted: every non-integrated row carries an explicit
reason, and the single INTEGRATE row is the one live call this phase makes.

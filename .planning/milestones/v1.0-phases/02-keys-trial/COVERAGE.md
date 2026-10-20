# API Coverage — ARTEMIDA Paid API V1

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Phase 2 is the first real integration with the ARTEMIDA Paid API V1
(`https://artemida.cc/v1`, `Authorization: Bearer <key>`). Locked decision **D-17**
requires the *full* V1 client contract (`lib/artemida.ts`) to be defined now, even
where a later phase owns the route/UI wiring. The matrix below therefore separates
two things: whether the **client capability exists** after this phase, and whether a
**phase-2 user surface** is wired to it.

Rows marked `OPT-OUT` are capabilities with no Phase-2 route/UI. Their client method
is still authored under D-17 where the endpoint is part of the V1 surface; the
opt-out reason names the phase that owns the wiring.

| capability | decision | reason |
|---|---|---|
| `GET /pricing?days=&devices=` | INTEGRATE | TRIAL-02 live tariff price via BFF `GET /api/pricing` (D-26/D-27/D-28) |
| `POST /trial` | INTEGRATE | TRIAL-01 one-tap trial from bot + cabinet (D-21..D-24) |
| `GET /keys` (list, incl. `limit`/`offset`/`includeRevoked`) | INTEGRATE | CAB-01 «Мои подписки» cache-first read + background revalidate (D-29) |
| `GET /keys/{id}` | INTEGRATE | CAB-01/CAB-04 key detail read, ownership-joined |
| `GET /keys/{id}/subscription-links` | INTEGRATE | CAB-04 sub-link + server-rendered QR (D-30) |
| `GET /keys/{id}/devices` | INTEGRATE | CAB-03 device list |
| `DELETE /keys/{id}/devices/{token}` | INTEGRATE | CAB-03 delete one device (D-32 confirm) |
| `POST /keys/{id}/devices/clear` | INTEGRATE | CAB-03 reset all devices (D-32 confirm) |
| `GET /keys/{id}/traffic` | INTEGRATE | CAB-04 traffic display (D-31); client method defined now |
| `POST /keys/{id}/traffic/reset` | OPT-OUT | not needed yet — no v1 user surface for resetting counters; client method defined per D-17 |
| `POST /keys/{id}/renew` | OPT-OUT | not needed yet — Phase 3 payments owns renew (PAY-02); client method defined per D-17 |
| `POST /keys/{id}/upgrade` | OPT-OUT | not needed yet — Phase 3 payments owns device upgrade (PAY-03); client method defined per D-17 |
| `POST /keys/{id}/disable` | OPT-OUT | not needed yet — no v1 user surface; admin lifecycle in Phase 5; client method defined per D-17 |
| `POST /keys/{id}/enable` | OPT-OUT | not needed yet — no v1 user surface; admin lifecycle in Phase 5; client method defined per D-17 |
| `DELETE /keys/{id}` (revoke) | OPT-OUT | explicitly out of scope v1 — self-service permanent delete is prohibited (REQUIREMENTS Out of Scope); admin-only in Phase 5 |
| `DELETE /keys/{id}/permanent` | OPT-OUT | explicitly out of scope v1 — irreversible without refund; admin-only in Phase 5 |
| `GET /balance` | OPT-OUT | not needed yet — admin-only statistic + low-balance alert in Phase 5 (ADM-04) |
| `GET /keys?q=` (customerRef search) | OPT-OUT | not needed yet — admin user lookup in Phase 5 (ADM-02); the `customerRef = String(telegramId)` mapping is still persisted this phase so the Phase-5 join exists |

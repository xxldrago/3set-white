---
phase: 20-vpn-core-connect-fsm-10-days
plan: 01
subsystem: api
tags: [sing-box, tun, config, jwt, zod, vitest, artemida, mobile-bff]

requires:
  - phase: 18-mobile-auth
    provides: verifyAccessToken (JWT Bearer + credentials watermark) for the per-request gate
  - phase: 19-server-pools-auto-ping-7-days
    provides: Server/ServerOutbound, parsePools, getSubscriptionLinksCacheFirst, exported isActiveKey
provides:
  - GET /api/mobile/config?serverId=... — JWT + active-key gated complete TUN config contract
  - pure buildMobileConfig + MobileConfigServerMeta, serverMeta
  - 14 vitest vectors covering gate, schema, secrecy, provider errors and builder
  - sealed API coverage matrix (26 capabilities, 14 reasoned opt-outs)
affects:
  - Phase 20 plans 02-07 (native TUN tunnel, connect FSM, connected panel) consume this contract

actuals:
  tokens: 5974
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Backend assembles the complete opaque config; client sends only serverId (D-01/D-02)"
    - "Reuse the phase-19 gate verbatim: verifyAccessToken -> isActiveKey -> cache-first links -> parsePools"
    - "WireGuard Server.outbound lives in `endpoints` only (sing-box 1.14); other protocols stay in `outbounds`"
    - "Outcome-code-only structured logging; domain errors degrade to 200 stable codes + Retry-After, never 5xx"

key-files:
  created:
    - app/api/mobile/config/route.ts
    - lib/mobile-config.ts
    - tests/unit/mobile-config-route.test.ts
    - .planning/phases/20-vpn-core-connect-fsm-10-days/deferred-items.md
  modified:
    - .planning/phases/20-vpn-core-connect-fsm-10-days/COVERAGE.md

key-decisions:
  - "D-01 confirmed by the user at the blocking decision gate: backend-full-config (locked). Client sends only serverId and never assembles config; /pricing, getKeyWithLinks and /servers.outbound are forbidden config sources"
  - "D-03: JWT + active owned key are re-evaluated on every /config request, including reconnect; expiry mid-tunnel drops the tunnel on the next fetch"
  - "D-08: smoke-proven TUN values verbatim — address [172.18.0.1/30, fdfe:dcba:9876::1/126], mtu 1500, dns_mode hijack, dns_address [172.18.0.2, fdfe:dcba:9876::2], auto_route/strict_route true, stack gvisor; new-format DNS; route.final direct"
  - "WireGuard is emitted as a sing-box 1.14 endpoint, never an outbound; the chosen outbound is copied verbatim without mutation"
  - "Response is {ok:true, config, server} with server limited to {id,city,flag,proto,sni?,tab}; no raw link, links[], config fragment or secret in logs"
  - "Unknown/malformed serverId returns {ok:false,error:'server_not_found'} with 200, keeping one domain-error envelope and no 5xx"

patterns-established:
  - "Pure never-throw config builder with tolerant input narrowing, mirroring lib/server-pool.ts"
  - "Hoisted vi.fn mocks + body/log secrecy assertions mirroring tests/unit/mobile-servers-route.test.ts"

requirements-completed: [REQ-CONN-03]

coverage:
  - id: D1
    description: "JWT + active-key gated /config route with serverId-only selection and 401/403/server_not_found paths"
    requirement: REQ-CONN-03
    verification:
      - kind: unit
        ref: "tests/unit/mobile-config-route.test.ts#JWT gate, active-key gate, serverId-only selection"
        status: pass
    human_judgment: false
  - id: D2
    description: "Complete smoke-proven sing-box v1.14 TUN config from one phase-19 Server, WireGuard in endpoints"
    requirement: REQ-CONN-03
    verification:
      - kind: unit
        ref: "tests/unit/mobile-config-route.test.ts#complete TUN config, WireGuard endpoint, pure builder"
        status: pass
    human_judgment: false
  - id: D3
    description: "No raw link, outbound secret, Authorization or config in response metadata or logs; provider errors degrade without 5xx"
    requirement: REQ-CONN-03
    verification:
      - kind: unit
        ref: "tests/unit/mobile-config-route.test.ts#no raw link/load/secret, provider error degradation"
        status: pass
    human_judgment: false
  - id: D4
    description: "API coverage matrix with a decision and reason on every capability, all opt-outs reasoned"
    verification:
      - kind: other
        ref: "node gsd-tools.cjs query check api-coverage.verify-pre .planning/phases/20-vpn-core-connect-fsm-10-days"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live ARTEMIDA links[] shape on a paid key re-verifies the serverId lookup assumptions"
    requirement: REQ-CONN-03
    verification: []
    human_judgment: true
    rationale: "Manual-only; requires a real paid ARTEMIDA key and is [ASSUMED] inherited from phase 19. No live credential in this environment."

duration: 4 min
completed: 2026-11-27
status: complete
---

# Phase 20 Plan 01: VPN Core `/config` Contract Summary

**JWT-gated `/api/mobile/config` returning a complete smoke-proven sing-box v1.14.4 TUN config from a serverId, with per-request active-key gating and zero secret leakage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-27T07:19:50Z
- **Completed:** 2026-11-27T07:24:00Z
- **Tasks:** 3 (1 blocking decision gate + 1 tracer + 1 auto)
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- Landed the new public BFF contract: `GET /api/mobile/config?serverId=...` with `force-dynamic`, `x-request-id`, and a 401/403/`server_not_found` gate evaluated on every request.
- Built a pure, never-throw `buildMobileConfig` emitting the checkConfig-proven TUN config (`log`, new-format `dns`, `inbounds[tun]`, `endpoints`, `outbounds`, `route.final=direct`), with WireGuard as an endpoint only.
- Zero new dependencies or Prisma changes; reused `verifyAccessToken`, exported `isActiveKey`, `getSubscriptionLinksCacheFirst` and `parsePools` from phase 19.
- Added 14 focused vitest vectors proving gate, schema, WireGuard placement, provider-error degradation and no-secret discipline in both body and logs; focused suite 23/23 green.
- Normalized `COVERAGE.md` so the api-coverage gate passes: 26 capabilities, 12 INTEGRATE, 14 OPT-OUT, all reasoned.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm D-01 backend `/config` contract (blocking decision)** — no file changes; user selected `backend-full-config` (locked). Decision recorded below and in STATE.md.
2. **Task 2: End-to-end `/config` tracer** — `4756bc6` (feat)
3. **Task 3: Error-state vectors + API coverage matrix** — `5f93ec2` (test)

**Plan metadata:** final docs commit (see git log for `docs(20-01): complete ...`).

## Files Created/Modified

- `app/api/mobile/config/route.ts` — new JWT + active-key gated GET route; zod serverId validation; provider-error degradation; outcome-code-only logs.
- `lib/mobile-config.ts` — pure TUN config builder + metadata type/shaper; no env, DB, network or logging.
- `tests/unit/mobile-config-route.test.ts` — 14 vectors for gate, selection, full schema, WG endpoint, secrecy, provider errors and pure builder.
- `.planning/phases/20-vpn-core-connect-fsm-10-days/COVERAGE.md` — formatted to satisfy the api-coverage gate; preserved all reasoned opt-outs.
- `.planning/phases/20-vpn-core-connect-fsm-10-days/deferred-items.md` — records out-of-scope parallel-work `tsc` failures.

## Decisions Made

- **D-01 (user-confirmed at a blocking checkpoint):** backend-full-config. `/config` returns the ready config; the client sends only `serverId` and never assembles a fragment. `/pricing`, `getKeyWithLinks` and `/servers.outbound` are not config sources.
- **D-02/D-03:** serverId is the only selector; JWT + owned active key are checked on every request, so an expired key drops the tunnel at the next reconnect.
- **D-04/D-05:** no raw share link or Authorization reaches the body or logs; stable error codes and `Retry-After` replace provider text; no 5xx.
- **D-08:** WireGuard stays a sing-box 1.14 endpoint, never an outbound; smoke-proven TUN values used verbatim.
- **WireGuard clarification:** the plan says "keep the chosen `Server.outbound` verbatim in `outbounds`" and also "WireGuard stays an endpoint, not an outbound". Implemented as: copied verbatim into `endpoints` for WireGuard, into `outbounds` for every other protocol. This satisfies the must-have and `CheckConfig` shape.
- **server_not_found status:** returned as HTTP 200 with `{ok:false,error:"server_not_found"}` (explicitly permitted by the plan/PATTERNS) to keep one domain-error envelope and avoid a transport exception in the Flutter client.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Coverage matrix format blocked the api-coverage gate**
- **Found during:** Task 3 verification (`check api-coverage.verify-pre`)
- **Issue:** 3 malformed rows in the pre-existing `COVERAGE.md`: `INTEGRATE (compile-only)` is not an allowed decision, one reason exceeded 200 chars, one capability exceeded 80 chars.
- **Fix:** changed the decision to `INTEGRATE` and moved "compile-only" into the reason; shortened the subscription-links reason; abbreviated the third-party-package capability while keeping its members in the reason. No opt-out was removed or weakened.
- **Files modified:** `.planning/phases/20-vpn-core-connect-fsm-10-days/COVERAGE.md`
- **Verification:** gate now returns `block:false, passed:true` (26 capabilities, 12 INTEGRATE, 14 OPT-OUT).
- **Committed in:** `5f93ec2`

---

**Total deviations:** 1 auto-fixed (1 blocking / validation-format). **Impact:** formatting only; no contract, capability or security behavior changed.

## Issues Encountered

- Global `npx tsc --noEmit` is red on unrelated, actively-edited files from parallel work (`lib/bot.ts`, `lib/bot-guides.ts` — `I18nKey` / argument-count errors; line numbers shifted between consecutive runs). Per the deviation scope boundary these were NOT fixed; a scoped `tsc -p` over exactly the 20-01 files exits 0, and the focused vitest suite is 23/23 green. Logged to `deferred-items.md` and the Windows ledger (`deviation`). Re-run global `tsc` once the parallel bot/i18n work lands.
- Live ARTEMIDA `links[]` shape on a paid key remains `[ASSUMED]` from phase 19 (manual-only, no live key here); logged to the Windows ledger as `unrun-verify`.

## Authentication Gates

None. The D-01 blocking decision checkpoint was resolved explicitly by the user; no CLI/credential gate occurred.

## User Setup Required

None - no external service configuration is introduced by this plan.

## Known Stubs

None - all emitted values come from the authenticated user's subscription links or the smoke-proven TUN constants; no placeholder, fake IP or simulated data.

## Next Phase Readiness

- Ready for the next plan: the `/config` contract is stable and test-backed; downstream native TUN, connect FSM and panel work can bind to `{ok, config, server}` and the documented error codes.
- Follow-up before phase verification: global `tsc --noEmit` must be re-run after the parallel bot/i18n work is committed; live ARTEMIDA `links[]` re-verification stays a manual `[ASSUMED]` item.

## Self-Check: PASSED

- All 4 created files exist on disk.
- Both task commits (`4756bc6`, `5f93ec2`) are present in git history.
- Focused vitest: 23/23 passed; scoped `tsc`: exit 0; `prisma validate`: valid; api-coverage gate: passed.

---
*Phase: 20-vpn-core-connect-fsm-10-days*
*Completed: 2026-11-27*

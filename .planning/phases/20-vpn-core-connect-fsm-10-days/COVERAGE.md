# API Coverage — ARTEMIDA Paid API V1 (`https://artemida.cc/v1`)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 20 integrates an external API: ARTEMIDA Paid API V1 (server-to-server only, `Bearer ${ARTEMIDA_API_KEY}`), reached through the new backend BFF route `GET /api/mobile/config?serverId=...`.
> Source contract: `docs/artemida-v1-contract.md` + `docs/artemida-v1-contract.json`. Client `lib/artemida.ts`.
> CONTEXT D-01/D-02/D-04 are authoritative: the backend re-reads subscription-links (`getSubscriptionForUserId` -> `artemida.getSubscriptionLinks`), never `/pricing`, never `getKeyWithLinks`, never `/servers.outbound` as a config source. The client never calls ARTEMIDA.

## Capability matrix — ARTEMIDA Paid API V1

| capability | decision | reason |
|---|---|---|
| `GET /keys` | INTEGRATE | Active-key gate (D-03) on every `/config` request: `listKeysByUserId` + `isActiveKey`; ownership `customerRef`; no key => `no_active_key` 403. |
| `GET /keys/{id}/subscription-links` | INTEGRATE | Full config source (D-01/D-02): `getSubscriptionForUserId` -> `getSubscriptionLinks` -> `parsePools` -> `buildMobileConfig`. Cache-first; raw links never returned/logged. |
| `GET /keys/{id}/traffic` | INTEGRATE | Already called by existing `getSubscriptionForUserId`; display-only; failure degrades to nulls and never blocks config. Not a `load` source (REQ-POOL-04 deferred). |
| `GET /keys/{id}` | OPT-OUT | Not needed for phase 20 config; active key resolved from `KeyCache`/`listKeysByUserId`; ownership via `keys_cache`. |
| `GET /pricing` | OPT-OUT | CONTEXT D-04: `/api/mobile/config` does NOT use ARTEMIDA `/pricing`; config comes from subscription-links. `/pricing` is tariffs, not tunnel config. |
| `GET /balance` | OPT-OUT | Not needed for phase 20 connection; no balance surfaced. |
| `POST /keys` | OPT-OUT | Paid key creation is phase 21; phase 20 reads only. |
| `POST /keys/{id}/upgrade` | OPT-OUT | Upgrade is phase 21; trial cannot renew/upgrade; phase 20 reads only. |
| `POST /keys/{id}/renew` | OPT-OUT | Renewal is phase 21; phase 20 reads only. |
| `POST /trial` | OPT-OUT | Trial provisioning is phase 18/21; phase 20 does not create trial keys. |
| `GET /keys/{id}/devices` | OPT-OUT | Device management is phase 22; phase 20 does not list devices. |
| `DELETE /keys/{id}` | OPT-OUT | Permanent delete not needed; never called in phase 20. |
| `PATCH /keys/{id}/traffic` (`setTrafficLimit`) | OPT-OUT | Traffic-limit mutation not needed; phase 20 reads only. |

## Native sing-box libbox (sing-box v1.14.4, GPL-3.0) — external native dependency, not an HTTP API

| capability | decision | reason |
|---|---|---|
| `libbox.Setup` | INTEGRATE | Initialize libbox once in the same own C-shared shim. |
| `libbox.CheckConfig` | INTEGRATE | Validate the full TUN config (D-01) before `StartOrReloadService`. |
| `CommandServer.StartOrReloadService` | INTEGRATE | Start tunnel service in TUN mode; `OverrideOptions`. |
| `CommandServer.Close`/`CloseService` | INTEGRATE | Cleanup on stop/disconnect. |
| `PlatformInterface.OpenTun(options)` | INTEGRATE | D-05: own shim returns the OS-supplied TUN fd; libbox queries name from fd, dups it; fd stays platform-owned. |
| `CommandClient.AddCommand(CommandStatus=1)` + `WriteStatus(StatusMessage)` | INTEGRATE | D-17/REQ-CONN-07: real `TrafficAvailable/UplinkTotal/DownlinkTotal`; no new plugin, no fake bytes. |
| `CommandClient.URLTest(outboundTag)` + `WriteGroups` | INTEGRATE | Pre-connect ping (FSM `pinging`) retained from phase 19; `generate_204`; no ICMP. |
| `libbox_start_with_tun(fd, config)` / `libbox_traffic()` | INTEGRATE | New own C exports; regenerate `libbox_shim.h` + `libbox_bindings.dart` via ffigen. |
| `setTunnelNetworkSettings` / `NEOnDemandRuleConnect` (iOS) | INTEGRATE | D-07: compile-only Swift target + OnDemand; do not build/verify tunnel until Apple entitlement. |
| gomobile `.aar` / `sing-ffi` / Flutter sing-box packages | OPT-OUT | D-05/D-06: not C-ABI, not ffigen, unverified pub legitimacy; `flutter_background_service` duplicates Kotlin foreground service. |
| `libbox_urltest` C symbol | OPT-OUT | Does not exist; own shim exports `urltest`/`urltest_take` (phase 19). |
| ICMP ping | OPT-OUT | HTTP urltest only; Android ICMP needs root. |
| Kill-switch toggle | OPT-OUT | D-09: kill switch always on; no user toggle. |

## Notes / known uncertainties (not silently dismissed)

- **REQ-POOL-04 `load` bar DEFERRED** (phase 19 CONTEXT D-04): no `load` field served/shown; no simulation. Not an OPT-OUT of an integrated capability.
- **Real ARTEMIDA `links[]` payload is `[ASSUMED]`** (inherited from phase 19): serverId lookup relies on the phase-19 parser assumptions; re-verify on a live paid key.
- **GPL-3.0-or-later** sing-box/libbox; source offer + legal review owned by phase 23; recorded blocker, not solved here.
- **Android libbox build blocked in this env** (no OpenJDK 17 / Android SDK / NDK); CI artifacts only.
- **Apple NetworkExtension entitlement declared but unapproved** (D-07); iOS tunnel verification external.
- **iOS fd handoff uses private KVC upstream**; recorded `[ASSUMED]` risk, not solved in phase 20.
- **No secrets committed**; raw links stay server-side; generic errors only; no config/fd/token logging.

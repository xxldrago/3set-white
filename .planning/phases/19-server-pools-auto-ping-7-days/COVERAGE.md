# API Coverage — ARTEMIDA Paid API V1 (`https://artemida.cc/v1`)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 19 integrates an external API: ARTEMIDA Paid API V1 (server-to-server only, `Bearer ${ARTEMIDA_API_KEY}`).
> Source contract: `docs/artemida-v1-contract.md` + `docs/artemida-v1-contract.json`. Client `lib/artemida.ts`.
> NOTE: CONTEXT D-01 overrides ROADMAP 19.1 — `/api/mobile/servers` is sourced from **subscription-links**, NOT ARTEMIDA `/pricing`. `REQ-BE-02` (`/pricing` source) is superseded; `/pricing` is NOT integrated here.

## Capability matrix — ARTEMIDA Paid API V1

| capability | decision | reason |
|---|---|---|
| `GET /keys` | INTEGRATE | Active-key resolution for `no_active_key` (D-21); `artemida.listKeys` on revalidate → `KeyCache`; `listKeysByUserId` reads cache; ownership `customerRef`. |
| `GET /keys/{id}/subscription-links` | INTEGRATE | Server source (D-01); `artemida.getSubscriptionLinks(keyId)` → `{subscriptionUrl,links[]}`; cache-first `KeyCache` + in-memory `linksCache` + `cached`; D-22; raw links never returned/logged. |
| `GET /keys/{id}/traffic` | INTEGRATE | Called by existing `getSubscriptionForUserId` (`getTraffic`); display-only; failure degrades to nulls and never blocks links. Not used for `load` (D-04); no traffic shown in phase 19. |
| `GET /keys/{id}` | OPT-OUT | Not needed for phase 19; active key already read from `KeyCache` (`listKeysByUserId`); ownership via `keys_cache`; not called. |
| `GET /pricing` | OPT-OUT | CONTEXT D-01 / task supersedes: `/api/mobile/servers` does NOT use ARTEMIDA `/pricing`; servers come from subscription-links; no `/pricing`. |
| `GET /balance` | OPT-OUT | Not needed for phase 19 server pools; no balance surfaced; key pill uses `key.active` + `remainingDays`/`expireAt`. |
| `POST /keys` | OPT-OUT | Paid key creation is phase 21 (Subscription & Purchase); phase 19 reads only; no provider create. |
| `POST /keys/{id}/upgrade` | OPT-OUT | Key upgrade is phase 21; trial cannot renew/upgrade; phase 19 reads only. |
| `POST /keys/{id}/renew` | OPT-OUT | Renewal is phase 21; phase 19 reads only. |
| `POST /trial` | OPT-OUT | Trial provisioning is phase 18/21; phase 19 does not create trial keys; trial keys are read as active until expiry (not renewable). |
| `GET /keys/{id}/devices` | OPT-OUT | Device management is phase 22; phase 19 does not list devices; `key.active` uses `keyCache`. |
| `DELETE /keys/{id}` | OPT-OUT | Permanent delete not needed; not a server-pool capability; never called in phase 19. |
| `PATCH /keys/{id}/traffic` (`setTrafficLimit`) | OPT-OUT | Traffic-limit mutation not needed; phase 19 reads only. |

## Native sing-box libbox (sing-box v1.14.4, GPL-3.0) — external native dependency, not an HTTP API

| capability | decision | reason |
|---|---|---|
| `libbox.Setup` | INTEGRATE | Initialize libbox once; no TUN; own no-op `PlatformInterface`. |
| `libbox.CheckConfig` | INTEGRATE | Validate minimal sing-box 1.14 config (no TUN; new DNS; WireGuard endpoint) before `StartOrReloadService`. |
| `libbox.Version` | INTEGRATE | Proven in research smoke test; diagnostic only. |
| `CommandServer.StartOrReloadService` | INTEGRATE | Start minimal no-TUN service for urltest; `OverrideOptions`. |
| `CommandServer.Close`/`CloseService` | INTEGRATE | Cleanup; `dispose`. |
| `CommandClient.URLTest(outboundTag)` | INTEGRATE | Primary ping (D-06); HTTP through real outbound; `generate_204`; async RTT via `WriteGroups`. NOT `libbox_urltest` C symbol; honest mapping. |
| `CommandClientHandler.WriteGroups` (`URLTestDelay`/`URLTestTime`) | INTEGRATE | RTT read-back; `CommandGroup=2`; `0,0` no-history/failed → offline; serialize. |
| `CommandClient.Connect`/`AddCommand(CommandGroup)` | INTEGRATE | Subscribe `CommandGroup`. |
| VPN tunnel (`OpenTun`, `BIND_VPN_SERVICE`, `VpnService`, NetworkExtension) | OPT-OUT | Phase 19 is urltest-only; no tunnel; phase 20. No `BIND_VPN_SERVICE`. |
| Clash API `urlTest` / `flutter_sing_box` / `singbox_ffi` | OPT-OUT | Not chosen; own C-shared shim + `ffigen` (D-08); `sing-ffi` non-public; no third-party sing-box Flutter package; GPL recorded. |
| ICMP ping | OPT-OUT | D-06 HTTP urltest, not ICMP; Android ICMP needs root. |

## Notes / known uncertainties (not silently dismissed)

- **REQ-POOL-04 `load` bar: DEFERRED** (CONTEXT D-04). No `load` field is served or shown; no simulation; sorting is RTT-only; future tie-break RTT→`load`. Not an OPT-OUT of an integrated capability; explicitly deferred.
- **No `load` source**: no provider `load` field in ARTEMIDA subscription-links; cannot invent. 
- **`no_active_key`** (403) machine-readable; empty `simple`/`whitelist`.
- **`getKeyWithLinks` does NOT exist**; use `getSubscriptionForUserId` (researcher correction) which wraps `artemida.getSubscriptionLinks`.
- **Real ARTEMIDA `links[]` payload is `[ASSUMED]`**: contract observes `vless://placeholder`, `count≠links.length`, `links[]` strings, `protocols.vless`; per-protocol URIs/params/remarks `[ASSUMED]`; tolerant parser skips unparseable; scheme allowlist; re-verify on a live paid key. Recorded flagged assumption (A1) + manual verification in `19-VALIDATION.md`.
- **`wg://` vs `wireguard://`**: accept both; WireGuard sing-box 1.14 is `endpoint`, not outbound; `[ASSUMED]` real ARTEMIDA WG emission.
- **UDP-only transports** (Hysteria2 QUIC/UDP, WireGuard UDP, SS-UDP): silent TCP fallback can't validate when libbox absent → honest offline; libbox primary. 
- **GPL-3.0-or-later** sing-box/libbox; dynamic linking + source offer + legal review; phase 23; recorded known blocker, not solved here. 
- **Android libbox build blocked in this env** (no OpenJDK17 / Android SDK / NDK); silent `Socket.connect` fallback ships; CI builds artifacts; iOS arm64 buildable. 
- **No secrets committed**; raw share links server-side; no secret in card list; minimal `outbound` for ping only; never log.

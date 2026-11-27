// lib/mobile-config.ts — pure Server → complete sing-box v1.14.4 TUN config
// transform (Phase 20, D-01/D-04/D-08). No env, no next/headers, no DB, no
// network, no logging. Never throws: malformed input yields a harmless config
// with no chosen outbound, never a fabricated server or a fake IP.
//
// The chosen `Server.outbound` is copied verbatim into the correct sing-box
// section: WireGuard is an `endpoint` in 1.14 (NOT an outbound); every other
// protocol stays an `outbound`. The raw share link is never retained here and
// nothing in this module is ever logged. Secrets in the outbound are the
// payload the authenticated client needs — they are not rendered in metadata.

import type { PoolTab, Proto, Server, ServerOutbound } from "./server-pool";

export interface MobileConfigServerMeta {
  id: string;
  city: string;
  flag: string;
  proto: Proto;
  sni?: string;
  tab: PoolTab;
}

export interface MobileConfig {
  log: { level: string };
  dns: { servers: Array<{ type: string; tag: string }>; final: string };
  inbounds: Array<{
    type: string;
    tag: string;
    address: string[];
    mtu: number;
    dns_mode: string;
    dns_address: string[];
    auto_route: boolean;
    strict_route: boolean;
    stack: string;
  }>;
  endpoints: ServerOutbound[];
  outbounds: ServerOutbound[];
  /** Route rule + default outbound: the selected server, never silent direct. */
  route: { rules?: Array<{ outbound: string }>; final: string };
}

/** Smoke-proven TUN values (20-RESEARCH.md §1/§9, CheckConfig accepted). */
function tunInbound(): MobileConfig["inbounds"][number] {
  return {
    type: "tun",
    tag: "tun-in",
    address: ["172.18.0.1/30", "fdfe:dcba:9876::1/126"],
    mtu: 1500,
    dns_mode: "hijack",
    dns_address: ["172.18.0.2", "fdfe:dcba:9876::2"],
    auto_route: true,
    strict_route: true,
    stack: "gvisor",
  };
}

/** Tolerant copy of a phase-19 Server.outbound. No field is invented or dropped. */
function outboundOf(server: unknown): ServerOutbound | null {
  if (!server || typeof server !== "object" || Array.isArray(server)) return null;
  const candidate = (server as { outbound?: unknown }).outbound;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const outbound = candidate as Record<string, unknown>;
  if (typeof outbound.type !== "string" || !outbound.type) return null;
  return { ...outbound } as ServerOutbound;
}

/**
 * Build a complete, opaque sing-box TUN config for one phase-19 Server.
 * Pure and never-throwing. The caller (JWT + active-key gated route) is the
 * only place this is invoked; no raw share link or `links[]` is accepted here.
 */
export function buildMobileConfig(server: unknown): MobileConfig {
  const outbound = outboundOf(server);
  // sing-box 1.14: WireGuard is an endpoint, never an outbound (D-08).
  const isWireGuard = outbound?.type === "wireguard";
  const endpoints: ServerOutbound[] = isWireGuard && outbound ? [outbound] : [];
  const outbounds: ServerOutbound[] = [{ type: "direct", tag: "direct" }];
  if (outbound && !isWireGuard) outbounds.push(outbound);
  // sing-box 1.14: `route.final` is the DEFAULT outbound. With no rule and
  // `final: "direct"` every packet would leave the tunnel directly, making the
  // selected VLESS/Reality outbound (or WireGuard endpoint) dead data. The
  // chosen tag is therefore both the default and the single route target;
  // `direct` stays declared only as a fallback for a malformed server.
  const chosenTag =
    outbound && typeof outbound.tag === "string" && outbound.tag
      ? outbound.tag
      : null;

  return {
    log: { level: "error" },
    dns: { servers: [{ type: "local", tag: "local" }], final: "local" },
    inbounds: [tunInbound()],
    endpoints,
    outbounds,
    route: chosenTag
      ? { rules: [{ outbound: chosenTag }], final: chosenTag }
      : { final: "direct" },
  };
}

/**
 * Minimal panel metadata only. SNI is whitelist-only (phase-19 D-03); the
 * simple pool never carries it. No share link, outbound, or secret field.
 */
export function serverMeta(server: Server): MobileConfigServerMeta {
  const meta: MobileConfigServerMeta = {
    id: server.id,
    city: server.city,
    flag: server.flag,
    proto: server.proto,
    tab: server.tab,
  };
  if (server.tab === "whitelist" && typeof server.sni === "string" && server.sni) {
    meta.sni = server.sni;
  }
  return meta;
}

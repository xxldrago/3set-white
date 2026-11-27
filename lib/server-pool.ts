// lib/server-pool.ts — pure share-URI → Server transform (Phase 19, D-01/D-02/
// D-03/D-05). No env, no next/headers, no DB, no network, no logging. Never
// throws: every exported function tolerates malformed input. No `load`, no
// simulation, no raw share-link is ever retained in a rendered card.
//
// The `outbound` field is a MINIMAL sing-box 1.14 outbound/endpoint used only
// by the client ping core. It carries protocol secrets by necessity; it is
// never rendered in a card and never logged. Card fields (id/name/city/cc/
// flag/proto/sni/tab/host/port/protocol) are metadata-only.
//
// Real ARTEMIDA links[] payloads are [ASSUMED] (only `vless://placeholder` was
// observed); parsing is tolerant with a scheme allowlist and skip-unparseable.

export type PoolTab = "simple" | "whitelist";

export type Proto =
  | "WireGuard"
  | "Shadowsocks"
  | "VLESS"
  | "VLESS · Reality"
  | "Hysteria2"
  | "Trojan"
  | "VMess";

export interface ServerOutbound {
  type: string;
  tag: string;
  [key: string]: unknown;
}

export interface Server {
  id: string;
  name: string;
  city: string;
  cc: string;
  flag: string;
  proto: Proto;
  /** Only present for whitelist servers (D-03). */
  sni?: string;
  tab: PoolTab;
  host: string;
  port: number;
  /** Canonical scheme: vless | ss | hysteria2 | trojan | wg | vmess. */
  protocol: string;
  /** Minimal sing-box outbound/endpoint for ping; never rendered/logged. */
  outbound: ServerOutbound;
}

export interface ServerPools {
  simple: Server[];
  whitelist: Server[];
}

export interface RemarkInfo {
  name: string;
  displayName: string;
  city: string;
  cc: string;
  flag: string;
}

/** D-02 markers. `WL` is token-ish so it does not fire inside other words. */
export const WL_MARKER = /(?:\bWL\b|whitelist|обход)/i;

const ALLOWED_SCHEMES = new Set([
  "vless",
  "ss",
  "hysteria2",
  "hy2",
  "trojan",
  "wg",
  "wireguard",
  "vmess",
]);

const MAX_LINK_LENGTH = 8192;
const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeBase64Utf8(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** FNV-1a ×2 → 16 hex chars. Deterministic, non-crypto, no raw link retained. */
function stableHash(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ c, 0x01000193) ^ (h2 >>> 13)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function plausibleHost(host: string): boolean {
  if (!host || host.length > 253 || /\s/.test(host)) return false;
  if (!/^[A-Za-z0-9.\-:_[\]%]+$/.test(host)) return false;
  if (host.startsWith("[") && host.endsWith("]")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.toLowerCase() === "localhost") return true;
  // Reject bare placeholders such as `vless://placeholder` (no dot, no IP).
  return host.includes(".");
}

function validPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function firstPort(raw: string): number | null {
  const candidate = raw.split(/[,\/]/)[0];
  const port = Number.parseInt(candidate, 10);
  return validPort(port) ? port : null;
}

interface Splitshare {
  scheme: string;
  authority: string;
  query: URLSearchParams;
  remark: string;
}

function splitShare(raw: string): Splitshare | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return null;
  const sep = trimmed.indexOf("://");
  if (sep <= 0) return null;
  const scheme = trimmed.slice(0, sep).toLowerCase();
  if (!ALLOWED_SCHEMES.has(scheme)) return null;

  const rest = trimmed.slice(sep + 3);
  const hash = rest.indexOf("#");
  const remark = safeDecodeURIComponent(hash >= 0 ? rest.slice(hash + 1) : "");
  const beforeHash = hash >= 0 ? rest.slice(0, hash) : rest;
  const question = beforeHash.indexOf("?");
  const authority = question >= 0 ? beforeHash.slice(0, question) : beforeHash;
  const queryRaw = question >= 0 ? beforeHash.slice(question + 1) : "";
  return { scheme, authority, query: new URLSearchParams(queryRaw), remark };
}

function authorityParts(authority: string): { userinfo: string; hostport: string } | null {
  const at = authority.lastIndexOf("@");
  if (at <= 0 || at === authority.length - 1) return null;
  return { userinfo: authority.slice(0, at), hostport: authority.slice(at + 1) };
}

function hostPort(hostport: string, defaultPort: number): { host: string; port: number } | null {
  let raw = hostport;
  if (raw.startsWith("[") && raw.includes("]")) {
    const end = raw.indexOf("]");
    const host = raw.slice(1, end);
    let tail = raw.slice(end + 1);
    if (tail.startsWith(":")) tail = tail.slice(1);
    const port = firstPort(tail) ?? defaultPort;
    return plausibleHost(`[${host}]`) ? { host, port } : null;
  }
  const colon = raw.lastIndexOf(":");
  const host = colon >= 0 ? raw.slice(0, colon) : raw;
  const port = colon >= 0 ? firstPort(raw.slice(colon + 1)) ?? defaultPort : defaultPort;
  return plausibleHost(host) ? { host, port } : null;
}

/** D-02: marker wins over the VLESS+Reality fallback. */
export function classifyPool(remark: string, scheme: string, security?: string): PoolTab {
  const safeRemark = typeof remark === "string" ? remark : "";
  if (WL_MARKER.test(safeRemark)) return "whitelist";
  const safeScheme = typeof scheme === "string" ? scheme.toLowerCase() : "";
  const safeSecurity = typeof security === "string" ? security.toLowerCase() : "";
  if (safeScheme === "vless" && safeSecurity === "reality") return "whitelist";
  return "simple";
}

export function flagToCc(flag: string): string {
  if (typeof flag !== "string") return "";
  const match = flag.match(REGIONAL_INDICATOR);
  if (!match || match.index === undefined) return "";
  const pair = match[0];
  return Array.from(pair)
    .map((char) => String.fromCharCode(char.codePointAt(0)! - 0x1f1e6 + 0x41))
    .join("");
}

export function ccToFlag(cc: string): string {
  if (typeof cc !== "string" || !/^[A-Za-z]{2}$/.test(cc)) return "";
  return Array.from(cc.toUpperCase())
    .map((char) => String.fromCodePoint(char.charCodeAt(0) - 0x41 + 0x1f1e6))
    .join("");
}

/** D-03: name/city/cc/flag from remark; markers stripped from display name. */
export function parseRemark(remark: string): RemarkInfo {
  const raw = typeof remark === "string" ? safeDecodeURIComponent(remark) : "";
  const stripped = raw.replace(WL_MARKER, "").replace(/\s+/g, " ").trim();
  const match = stripped.match(REGIONAL_INDICATOR);
  if (!match || match.index === undefined) {
    return { name: stripped, displayName: stripped, city: "", cc: "", flag: "" };
  }
  const cc = flagToCc(match[0]);
  const before = stripped.slice(0, match.index).trim();
  const after = stripped.slice(match.index + match[0].length).trim();
  const city = [before, after].filter(Boolean).join(" ").trim();
  const name = city || stripped.replace(match[0], "").trim();
  return { name, displayName: name, city, cc, flag: ccToFlag(cc) };
}

interface Parsed {
  server: Omit<Server, "id" | "tab" | "sni">;
  secret: string;
  remark: string;
  security: string;
}

function parseVless(split: Splitshare): Parsed | null {
  const parts = authorityParts(split.authority);
  if (!parts) return null;
  const hp = hostPort(parts.hostport, 443);
  if (!hp) return null;
  const uuid = safeDecodeURIComponent(parts.userinfo).trim();
  if (!uuid) return null;

  const security = (split.query.get("security") ?? "none").toLowerCase();
  const sni = split.query.get("sni") ?? split.query.get("serverName") ?? "";
  const fp = split.query.get("fp") ?? "";
  const flow = split.query.get("flow") ?? "";
  const network = split.query.get("type") ?? split.query.get("network") ?? "tcp";
  const insecure = ["1", "true", "yes"].includes((split.query.get("allowInsecure") ?? "").toLowerCase())
    || ["1", "true", "yes"].includes((split.query.get("insecure") ?? "").toLowerCase());

  const outbound: ServerOutbound = {
    type: "vless",
    tag: "",
    server: hp.host,
    server_port: hp.port,
    uuid,
    encryption: split.query.get("encryption") ?? "none",
  };
  if (flow) outbound.flow = flow;
  if (network && network !== "tcp") {
    const transport: Record<string, unknown> = { type: network };
    const host = split.query.get("host");
    const path = split.query.get("path");
    const serviceName = split.query.get("serviceName");
    if (host) transport.host = host;
    if (path) transport.path = path;
    if (serviceName) transport.service_name = serviceName;
    outbound.transport = transport;
  }
  if (security === "reality") {
    outbound.tls = {
      enabled: true,
      security: "reality",
      serverName: sni || hp.host,
      fingerprint: fp || "chrome",
      pbk: split.query.get("pbk") ?? "",
      shortId: split.query.get("sid") ?? "",
      utls: { enabled: true },
    };
  } else if (security === "tls") {
    outbound.tls = {
      enabled: true,
      serverName: sni || hp.host,
      ...(fp ? { fingerprint: fp } : {}),
      ...(insecure ? { insecure: true } : {}),
    };
  }

  return {
    server: {
      name: "",
      city: "",
      cc: "",
      flag: "",
      proto: security === "reality" ? "VLESS · Reality" : "VLESS",
      host: hp.host,
      port: hp.port,
      protocol: "vless",
      outbound,
    },
    secret: uuid,
    remark: split.remark,
    security,
  };
}

function parseSs(split: Splitshare): Parsed | null {
  const info = split.authority;
  if (!info) return null;
  let method = "";
  let password = "";
  let hostportRaw = "";

  if (info.includes("@")) {
    const parts = authorityParts(info);
    if (!parts) return null;
    const decoded = decodeBase64Utf8(safeDecodeURIComponent(parts.userinfo));
    if (!decoded) return null;
    const colon = decoded.indexOf(":");
    if (colon <= 0) return null;
    method = decoded.slice(0, colon);
    password = decoded.slice(colon + 1);
    hostportRaw = parts.hostport;
  } else {
    // Legacy whole-info base64: base64(method:password@host:port).
    const decoded = decodeBase64Utf8(info);
    if (!decoded || !decoded.includes("@")) return null;
    const parts = authorityParts(decoded);
    if (!parts) return null;
    const colon = parts.userinfo.indexOf(":");
    if (colon <= 0) return null;
    method = parts.userinfo.slice(0, colon);
    password = parts.userinfo.slice(colon + 1);
    hostportRaw = parts.hostport;
  }

  const hp = hostPort(hostportRaw, 8388);
  if (!hp || !method) return null;
  const outbound: ServerOutbound = {
    type: "shadowsocks",
    tag: "",
    server: hp.host,
    server_port: hp.port,
    method,
    password,
  };
  const plugin = split.query.get("plugin");
  if (plugin) {
    outbound.plugin = plugin;
    const opts = split.query.get("plugin_opts");
    if (opts) outbound.plugin_opts = opts;
  }
  return {
    server: {
      name: "", city: "", cc: "", flag: "",
      proto: "Shadowsocks",
      host: hp.host, port: hp.port, protocol: "ss", outbound,
    },
    secret: password,
    remark: split.remark,
    security: "",
  };
}

function parseHysteria2(split: Splitshare): Parsed | null {
  const parts = authorityParts(split.authority);
  if (!parts) return null;
  const password = safeDecodeURIComponent(parts.userinfo).trim();
  if (!password) return null;
  const portRaw = split.query.get("mport") ?? split.query.get("ports") ?? "";
  const hp = hostPort(parts.hostport, 443);
  if (!hp) return null;
  const port = portRaw ? firstPort(portRaw) ?? hp.port : hp.port;

  const outbound: ServerOutbound = {
    type: "hysteria2",
    tag: "",
    server: hp.host,
    server_port: port,
    password,
  };
  const obfs = split.query.get("obfs");
  if (obfs) {
    outbound.obfs = { type: obfs, ...(split.query.get("obfs-password") ? { password: split.query.get("obfs-password") } : {}) };
  }
  const insecure = ["1", "true", "yes"].includes((split.query.get("insecure") ?? "").toLowerCase())
    || ["1", "true", "yes"].includes((split.query.get("allowInsecure") ?? "").toLowerCase());
  const tls: Record<string, unknown> = { enabled: true, ...(insecure ? { insecure: true } : {}) };
  const sni = split.query.get("sni") ?? split.query.get("serverName") ?? "";
  if (sni) tls.serverName = sni;
  const alpn = split.query.get("alpn");
  if (alpn) tls.alpn = alpn.split(",").filter(Boolean);
  outbound.tls = tls;

  return {
    server: {
      name: "", city: "", cc: "", flag: "",
      proto: "Hysteria2", host: hp.host, port, protocol: "hysteria2", outbound,
    },
    secret: password,
    remark: split.remark,
    security: "",
  };
}

function parseTrojan(split: Splitshare): Parsed | null {
  const parts = authorityParts(split.authority);
  if (!parts) return null;
  const password = safeDecodeURIComponent(parts.userinfo).trim();
  if (!password) return null;
  const hp = hostPort(parts.hostport, 443);
  if (!hp) return null;
  const security = (split.query.get("security") ?? "tls").toLowerCase();
  const sni = split.query.get("sni") ?? split.query.get("peer") ?? split.query.get("serverName") ?? "";
  const fp = split.query.get("fp") ?? "";
  const insecure = ["1", "true", "yes"].includes((split.query.get("insecure") ?? "").toLowerCase());

  const outbound: ServerOutbound = {
    type: "trojan",
    tag: "",
    server: hp.host,
    server_port: hp.port,
    password,
  };
  if (security === "reality") {
    outbound.tls = {
      enabled: true,
      security: "reality",
      serverName: sni || hp.host,
      fingerprint: fp || "chrome",
      pbk: split.query.get("pbk") ?? "",
      shortId: split.query.get("sid") ?? "",
      utls: { enabled: true },
    };
  } else {
    const tls: Record<string, unknown> = { enabled: true, serverName: sni || hp.host };
    if (fp) tls.fingerprint = fp;
    if (insecure) tls.insecure = true;
    const alpn = split.query.get("alpn");
    if (alpn) tls.alpn = alpn.split(",").filter(Boolean);
    outbound.tls = tls;
  }
  return {
    server: {
      name: "", city: "", cc: "", flag: "",
      proto: "Trojan", host: hp.host, port: hp.port, protocol: "trojan", outbound,
    },
    secret: password,
    remark: split.remark,
    security,
  };
}

function parseWireGuard(split: Splitshare): Parsed | null {
  const parts = authorityParts(split.authority);
  if (!parts) return null;
  const privateKey = safeDecodeURIComponent(parts.userinfo).trim();
  if (!privateKey) return null;
  const hp = hostPort(parts.hostport, 51820);
  if (!hp) return null;
  const publicKey = split.query.get("publickey") ?? split.query.get("publicKey") ?? "";
  const addresses = (split.query.get("address") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const peer: Record<string, unknown> = { address: hp.host, port: hp.port };
  if (publicKey) peer.public_key = publicKey;
  const presharedKey = split.query.get("presharedkey");
  if (presharedKey) peer.pre_shared_key = presharedKey;
  const allowedIps = split.query.get("allowedips");
  if (allowedIps) peer.allowed_ips = allowedIps.split(",").filter(Boolean);
  const keepalive = Number.parseInt(split.query.get("keepalive") ?? "", 10);
  if (validPort(keepalive)) peer.persistent_keepalive_interval = keepalive;
  const reserved = split.query.get("reserved");
  if (reserved) peer.reserved = reserved.split(",").map((v) => Number.parseInt(v, 10)).filter(Number.isFinite);

  // sing-box 1.14: WireGuard is an ENDPOINT, not an outbound.
  const endpoint: ServerOutbound = {
    type: "wireguard",
    tag: "",
    address: addresses.length ? addresses : [],
    private_key: privateKey,
    peers: [peer],
  };
  const mtu = Number.parseInt(split.query.get("mtu") ?? "", 10);
  if (validPort(mtu)) endpoint.mtu = mtu;

  return {
    server: {
      name: "", city: "", cc: "", flag: "",
      proto: "WireGuard", host: hp.host, port: hp.port, protocol: "wg", outbound: endpoint,
    },
    secret: privateKey,
    remark: split.remark,
    security: "",
  };
}

function parseVmess(split: Splitshare): Parsed | null {
  const decoded = decodeBase64Utf8(split.authority);
  if (!decoded) return null;
  let json: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    json = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const host = typeof json.add === "string" ? json.add.trim() : "";
  const port = Number.parseInt(String(json.port ?? ""), 10);
  const uuid = typeof json.id === "string" ? json.id.trim() : "";
  if (!plausibleHost(host) || !validPort(port) || !uuid) return null;

  const security = typeof json.scy === "string" ? json.scy : "auto";
  const alterId = Number.parseInt(String(json.aid ?? "0"), 10);
  const network = typeof json.net === "string" ? json.net : "tcp";
  const tlsEnabled = json.tls === "tls" || json.tls === true;

  const outbound: ServerOutbound = {
    type: "vmess",
    tag: "",
    server: host,
    server_port: port,
    uuid,
    security,
    alter_id: Number.isFinite(alterId) ? alterId : 0,
  };
  if (network && network !== "tcp") {
    const transport: Record<string, unknown> = { type: network };
    if (typeof json.host === "string" && json.host) transport.host = json.host;
    if (typeof json.path === "string" && json.path) transport.path = json.path;
    outbound.transport = transport;
  }
  if (tlsEnabled) {
    const tls: Record<string, unknown> = { enabled: true };
    if (typeof json.sni === "string" && json.sni) tls.serverName = json.sni;
    if (typeof json.fp === "string" && json.fp) tls.fingerprint = json.fp;
    outbound.tls = tls;
  }

  return {
    server: {
      name: "", city: "", cc: "", flag: "",
      proto: "VMess", host, port, protocol: "vmess", outbound,
    },
    secret: uuid,
    remark: typeof json.ps === "string" ? json.ps : split.remark,
    security: tlsEnabled ? "tls" : "",
  };
}

/** Tolerant, never-throw single-link parser. Returns null for unparseable. */
export function parseShareLink(raw: string): Server | null {
  try {
    const split = splitShare(raw);
    if (!split) return null;
    let parsed: Parsed | null = null;
    switch (split.scheme) {
      case "vless": parsed = parseVless(split); break;
      case "ss": parsed = parseSs(split); break;
      case "hysteria2":
      case "hy2": parsed = parseHysteria2(split); break;
      case "trojan": parsed = parseTrojan(split); break;
      case "wg":
      case "wireguard": parsed = parseWireGuard(split); break;
      case "vmess": parsed = parseVmess(split); break;
      default: return null;
    }
    if (!parsed) return null;

    const remarkInfo = parseRemark(parsed.remark);
    const tab = classifyPool(parsed.remark, split.scheme, parsed.security);
    const id = stableHash(`${split.scheme}|${parsed.server.host}|${parsed.server.port}|${parsed.secret}`);
    parsed.server.outbound.tag = `srv-${id}`;

    const server: Server = {
      ...parsed.server,
      id,
      name: remarkInfo.name,
      city: remarkInfo.city,
      cc: remarkInfo.cc,
      flag: remarkInfo.flag,
      tab,
    };
    // D-03: SNI is returned for whitelist only.
    if (tab === "whitelist") {
      const sni = split.query.get("sni") ?? split.query.get("serverName") ?? "";
      if (sni) server.sni = sni;
    }
    return server;
  } catch {
    return null;
  }
}

/**
 * Parse all links into exactly two pools (XOR). Unparseable links are skipped;
 * byte-identical duplicates collapse to one stable id. Input order is stable.
 */
export function parsePools(links: unknown): ServerPools {
  const pools: ServerPools = { simple: [], whitelist: [] };
  if (!Array.isArray(links)) return pools;
  const seen = new Set<string>();
  for (const raw of links) {
    const server = parseShareLink(raw as string);
    if (!server || seen.has(server.id)) continue;
    seen.add(server.id);
    if (server.tab === "whitelist") {
      pools.whitelist.push(server);
    } else {
      // Defensive: never surface SNI on a simple card.
      delete server.sni;
      pools.simple.push(server);
    }
  }
  return pools;
}

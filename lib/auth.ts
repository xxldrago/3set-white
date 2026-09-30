// Unified Telegram identity: dual HMAC verifiers + one jose session (D-09/D-10/D-11).
//
// Pure module by design: node:crypto + jose only, secrets passed as params.
// No next/headers, no env import — unit tests and the integration flow import
// this without a Next runtime. Cookie serialization is a string builder here;
// the auth route sets it as a raw Set-Cookie header (same flags the
// next/headers pattern prescribes: httpOnly, lax, secure-in-prod only).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/** 24h auth_date window (D-11): Widget/initData older than this is stale. */
export const AUTH_MAX_AGE_SEC = 86_400;

export const SESSION_COOKIE = "3set_session";
const SESSION_TTL = "30d";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export interface WidgetPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  [key: string]: unknown;
}

/**
 * Length-guarded timing-safe hex comparison (Pitfall 2): === leaks timing,
 * bare timingSafeEqual throws on length mismatch (DoS via crafted hash).
 * Garbage input → false, never a throw.
 */
function timingSafeEqualHex(computed: Buffer, receivedHex: unknown): boolean {
  if (typeof receivedHex !== "string" || receivedHex.length === 0) return false;
  let received: Buffer;
  try {
    received = Buffer.from(receivedHex, "hex");
  } catch {
    return false;
  }
  if (received.length !== computed.length) return false;
  try {
    return timingSafeEqual(computed, received);
  } catch {
    return false;
  }
}

/**
 * Classic Login Widget verifier (core.telegram.org/widgets/login-legacy):
 * secret_key = SHA256(bot_token), data-check-string = sorted key=<value>
 * lines joined by \n, hex(HMAC_SHA256) compared timing-safe. 24h window.
 */
export function verifyWidget(
  data: WidgetPayload,
  botToken: string,
  maxAgeSec = AUTH_MAX_AGE_SEC,
): boolean {
  if (!data || typeof data !== "object") return false;
  if (typeof data.id !== "number" || !Number.isFinite(data.id)) return false;
  if (typeof data.auth_date !== "number" || !Number.isFinite(data.auth_date)) return false;
  const { hash, ...fields } = data;
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${String(fields[k])}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest();
  if (!timingSafeEqualHex(computed, hash)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (data.auth_date > now) return false; // future-dated payloads are forged
  return now - data.auth_date <= maxAgeSec;
}

/**
 * WebApp initData verifier (core.telegram.org/bots/webapps):
 * secret_key = HMAC_SHA256(bot_token, "WebAppData"), same check-string
 * construction over initData pairs. Returns the verified fields (caller
 * JSON.parses `user`) or null. Same compare discipline + auth_date window.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec = AUTH_MAX_AGE_SEC,
): Record<string, string> | null {
  if (typeof initData !== "string" || initData.length === 0) return null;
  let pairs: URLSearchParams;
  try {
    pairs = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const hash = pairs.get("hash");
  if (!hash) return null;
  pairs.delete("hash");
  const dataCheckString = [...pairs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest();
  if (!timingSafeEqualHex(computed, hash)) return null;
  const out: Record<string, string> = {};
  pairs.forEach((v, k) => {
    out[k] = v;
  });
  const authDate = Number(out["auth_date"]);
  if (!Number.isFinite(authDate)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now || now - authDate > maxAgeSec) return null;
  return out;
}

/** Mint one HS256 session JWT for a telegram id (30d expiry). */
export async function signSession(telegramId: number, secret: string): Promise<string> {
  return new SignJWT({ tid: telegramId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(new TextEncoder().encode(secret));
}

/**
 * Verify a session JWT with an explicit HS256 allow-list (rejects alg:none
 * and wrong-secret tokens). Returns the telegram id or null — never throws.
 */
export async function verifySession(token: string, secret: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return typeof payload.tid === "number" && Number.isFinite(payload.tid)
      ? payload.tid
      : null;
  } catch {
    return null;
  }
}

/** Serialize the httpOnly session cookie (secure only in production, Pitfall 4). */
export function buildSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

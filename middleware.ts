// Partner-subdomain router (edge, no DB): `<name>.3set.online` → the
// server-side resolver at `/sub/<name>` (which pins `?ref=` or redirects
// home). Only the bare `<name>.3set.online` host matches — apex, `my.*`,
// localhost, and reserved names pass through untouched.
//
// Requires (owner ops, outside code): wildcard DNS `*.3set.online` → this
// host, nginx `server_name *.3set.online` on the same vhost, and a wildcard
// cert (DNS-01). Without those, partner hosts never reach this code.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PARENT = "3set.online";
const MAIN_HOST = `my.${PARENT}`;

// Edge-safe copy of the reserved set (lib/referrals.ts pulls Prisma, which
// cannot run in the edge runtime — keep the two lists in sync).
const RESERVED = new Set([
  "www",
  "my",
  "api",
  "admin",
  "app",
  "status",
  "mail",
  "cdn",
  "static",
  "sub",
  "smtp",
  "ftp",
  "blog",
  "support",
  "pay",
]);

export function middleware(req: NextRequest): NextResponse {
  const host = req.nextUrl.hostname.toLowerCase();
  if (host === MAIN_HOST) return NextResponse.next();
  const match = host.endsWith(`.${PARENT}`)
    ? host.slice(0, -(PARENT.length + 1))
    : null;
  // Single-label, assignable names only (`a.3set.online` — not apex,
  // multi-level, or reserved infrastructure names).
  if (!match || match.length === 0 || match.includes(".") || RESERVED.has(match)) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.host = `my.${PARENT}`;
  url.protocol = "https:";
  url.pathname = `/sub/${match}`;
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Skip static assets, Next internals, and API (API rides the main host).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|api).*)"],
};

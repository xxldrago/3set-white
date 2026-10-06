// lib/client-ip.ts — trusted client-IP resolver (CR-02, T-06-10-01).
//
// Forwarded-address headers are client-influenced at the edge. nginx sets
// `X-Real-IP $remote_addr` and (after the CR-02 hardening) overwrites
// `X-Forwarded-For` with `$remote_addr`; this resolver must nevertheless stay
// safe when a proxy concatenates a client-supplied chain. Resolution order:
//   1. `X-Real-IP` — the edge-set trusted hop — when non-empty;
//   2. otherwise the LAST non-empty `X-Forwarded-For` entry. NEVER index 0:
//      an append-style proxy (`$proxy_add_x_forwarded_for`) places the
//      attacker-controlled value first;
//   3. otherwise the literal `"direct"`.
//
// Pure module by design: no env import, no next/headers, no DB — importable
// from vitest's node environment without a Next runtime.
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = req.headers.get("x-forwarded-for");
  const parts = forwarded
    ?.split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  // Single-entry XFF resolves to that entry (last === first); a multi-entry
  // chain resolves to the last hop, which the edge appended over the client's.
  if (parts && parts.length > 0) return parts[parts.length - 1];
  return "direct";
}

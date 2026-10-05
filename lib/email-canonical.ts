// lib/email-canonical.ts — canonical mailbox identity (WR-04, plan 06-13).
//
// Plus-addressing (`user+tag@example.com`) and Gmail dot aliases
// (`a.b@gmail.com`) let one mailbox mint many accounts, and — because the
// email trial keys on `customerRef = email:{userId}` — many trials. Collapsing
// every alias of a mailbox to one canonical string, persisted under
// `User.emailCanonical @unique`, makes the UNIQUE constraint the arbiter: the
// second alias registration hits 409 and creates no account (and therefore no
// trial customerRef).
//
// Pure module by design: no node:crypto, no env import, no next/headers, no DB
// — importable from vitest's node environment without a Next runtime. Never
// throws: a malformed input is returned trimmed + lowercased unchanged so the
// caller can still store/dedupe it.
export function canonicalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  // Not a valid `local@domain` shape — return the normalized input unchanged.
  if (at <= 0 || at === normalized.length - 1) return normalized;

  const domain = normalized.slice(at + 1);
  let local = normalized.slice(0, at);

  // Strip the `+tag` suffix from the local part.
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);

  // Gmail/Googlemail treat dots in the local part as insignificant.
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }

  // A `+tag`-only local (`+tag@x`) collapses to the empty local; keep the
  // normalized input so no two distinct malformed shapes collide.
  if (local.length === 0) return normalized;

  return `${local}@${domain}`;
}

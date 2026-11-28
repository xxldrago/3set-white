// Pure, server-side subscription entitlement view (D-10).
//
// ONE predicate owns statusKind + graceUntil and the phase-19 connect gate, so
// /subscription, /api/mobile/servers and /api/mobile/config can never disagree
// about whether an owned key still entitles the user to a tunnel. No I/O, no
// logging, no client-side grace math: callers pass a key and consume the result.
import { deriveStatusKind, type RenderedKey, type StatusKind } from "./keys-service";

/**
 * 24h grace after expiry (D-10, human-confirmed at the 21-01 decision gate).
 * 86_400_000ms is ONE day — do not multiply it by 24 (that would be 24 days).
 */
export const GRACE_MS = 86_400_000; // 24 * 60 * 60 * 1000

/**
 * Phase-19 raw-status exclusions, kept verbatim: `deriveStatusKind` alone is
 * not enough because a raw `revoked`/`disabled`/`trial-expired` key may still
 * carry a future `expiresAt`. Graced keys are expired BY TIME with a raw status
 * that is not a permanent disqualifier, so they pass through the grace branch.
 */
export const DISQUALIFIED_STATUSES = new Set([
  "expired",
  "revoked",
  "disabled",
  "trial-expired",
]);

/** The minimal key shape needed to derive the display status and grace. */
export interface GraceKeyInput {
  status: string;
  expiresAt: string | null;
  isTrial: boolean;
}

export interface SubscriptionStatusView {
  statusKind: StatusKind;
  /** ISO instant = expiresAt + 24h; only for an expired, non-trial key. */
  graceUntil: string | null;
  /** Whether `now` is strictly inside that window. */
  inGrace: boolean;
}

function parseExpiry(expiresAt: string | null): Date | null {
  if (expiresAt === null) return null;
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Normalize provider status spelling (`REVOKED`, `trial_expired`, …). */
function normalizeRawStatus(status: string): string {
  return (typeof status === "string" ? status : "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

/**
 * Derive the status kind and the 24h grace window. Pure: no provider call, no
 * DB, no logging. `expiresAt` is authoritative over the stored status string
 * (existing `deriveStatusKind`); trials never receive a grace window.
 */
export function deriveSubscriptionStatus(key: GraceKeyInput): SubscriptionStatusView {
  const expiry = parseExpiry(key.expiresAt);
  const statusKind = deriveStatusKind(key.status, expiry);
  const isExpired = statusKind === "expired" && expiry !== null && !key.isTrial;
  const graceUntil = isExpired ? new Date(expiry.getTime() + GRACE_MS).toISOString() : null;
  const inGrace =
    graceUntil !== null && Date.now() < new Date(graceUntil).getTime();
  return { statusKind, graceUntil, inGrace };
}

/**
 * The single connect-entitlement predicate consumed by /servers, /config and
 * /subscription. Preserves the phase-19 id and raw-status checks, and adds one
 * grace branch: an expired (by time, non-trial) key stays connectable until
 * `graceUntil`; afterwards it is indistinguishable from no key.
 */
export function isKeyConnectable(key: RenderedKey): boolean {
  const id = typeof key.id === "string" ? key.id.trim() : "";
  if (!id) return false;

  const view = deriveSubscriptionStatus(key);
  if (DISQUALIFIED_STATUSES.has(normalizeRawStatus(key.status))) return false;
  if (view.inGrace) return true;

  if (view.statusKind !== "active" && view.statusKind !== "expiring") return false;
  if (key.expiresAt) {
    const expiry = new Date(key.expiresAt).getTime();
    if (!Number.isNaN(expiry) && expiry <= Date.now()) return false;
  }
  return true;
}

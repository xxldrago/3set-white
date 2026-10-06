// One-time Login Widget payload guard (D-11): dirty-check via UNIQUE(hash)
// insert, race-safe under concurrency. initData relies on the auth_date
// window instead (no one-time guarantee there). Rows older than 48h are
// pruned by a later-phase cron.
//
// Error discipline (WR-05, T-06-12-02): ONLY a Prisma unique violation
// (P2002) means "duplicate → replay". Every other failure (connection loss,
// timeout, …) is logged and rethrown so the callers map it to a generic 500.
// A database outage must never masquerade as a replayed payload (401).
import { logger } from "./logger";
import { prisma } from "./prisma";

/** Consume a Widget hash: true on first use, false on replay (duplicate). */
export async function consumeWidgetHash(hash: string): Promise<boolean> {
  try {
    await prisma.replayCache.create({ data: { hash } });
    return true; // first use
  } catch (err: unknown) {
    if (isUniqueViolation(err)) return false; // P2002 → duplicate replay
    // No hash / PII in the log (V7, T-02-03).
    logger.error({ route: "replay", outcome: "error" });
    throw err; // let the caller map to 500, not 401
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

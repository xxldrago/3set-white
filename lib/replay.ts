// One-time Login Widget payload guard (D-11): dirty-check via UNIQUE(hash)
// insert, race-safe under concurrency. initData relies on the auth_date
// window instead (no one-time guarantee there). Rows older than 48h are
// pruned by a later-phase cron.
import { prisma } from "./prisma";

/** Consume a Widget hash: true on first use, false on replay (duplicate). */
export async function consumeWidgetHash(hash: string): Promise<boolean> {
  try {
    await prisma.replayCache.create({ data: { hash } });
    return true; // first use
  } catch {
    return false; // duplicate → reject as replay
  }
}

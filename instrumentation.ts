// Next.js instrumentation hook (D-40, RESEARCH Pattern 3).
//
// `register()` is called once when a server instance is initiated. It starts
// the outbox fulfillment worker + hourly reconcile tick + daily expiry-reminder
// tick (all owned by `startWorker`). Two guards:
//   - NEXT_RUNTIME === 'nodejs' — never run the worker on the edge runtime.
//   - NEXT_PHASE !== 'phase-production-build' — never start it during `next build`
//     (mirrors lib/bot.ts:274).
// The import is lazy so `lib/worker` (and its Prisma/interval side effects) is
// never evaluated at build time. The bootstrap is wrapped so a worker start
// failure can never crash the server process.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { startWorker } = await import("./lib/worker");
    startWorker();
  } catch (err) {
    const { logger } = await import("./lib/logger");
    logger.error({ outcome: "worker_start_failed", err });
  }
}

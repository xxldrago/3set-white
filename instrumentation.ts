// Next.js instrumentation hook (D-40, RESEARCH Pattern 3).
//
// `register()` is called once when a server instance is initiated. It starts
// the outbox fulfillment worker + hourly reconcile tick + daily expiry-reminder
// tick (all owned by `startWorker`), and — in long-polling mode — loads
// `lib/bot`, whose import side effect calls `bot.launch()`. Two guards:
//   - NEXT_RUNTIME === 'nodejs' — never run the worker on the edge runtime.
//   - NEXT_PHASE !== 'phase-production-build' — never start it during `next build`
//     (mirrors lib/bot.ts:274).
// The imports are lazy so `lib/worker` (and its Prisma/interval side effects) is
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
  // Long polling: nothing imports `lib/bot` when there is no webhook request to
  // hit, so the poller would never start. Loading the module is what launches
  // it — lib/bot.ts owns the BOT_MODE/global-once guard itself. Kept in a
  // separate try so a bot import failure cannot skip the worker above.
  if (process.env.BOT_MODE === "polling") {
    try {
      await import("./lib/bot");
    } catch (err) {
      const { logger } = await import("./lib/logger");
      logger.error({ outcome: "bot_polling_import_failed", err });
    }
  }
}

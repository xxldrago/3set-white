// scripts/backfill-analytics.ts — CLI-only history backfill for daily_metrics
// (D-14). Never a route, never an admin button: the container entrypoint owns
// the DB (the port is unpublished), the Dockerfile copies scripts/ into the
// runner, and the documented operator command is
// `docker compose -f docker-compose.prod.yml exec web npx tsx scripts/backfill-analytics.ts`.
//
// Imports are RELATIVE here — the `@/` alias does not exist under tsx
// (mirrors prisma/seed.ts).
//
// The engine is the SAME rollupDays the nightly cron route calls, so backfill
// and nightly can never disagree; the absolute-value upsert
// (`SET col = EXCLUDED.col`) makes re-runs produce identical results.
import { prisma } from "../lib/prisma";
import { rollupDays } from "../lib/analytics/rollup";
import { mskDayLabel, mskMonthLabel, addMonths } from "../lib/analytics/time";

// Mirrors lib/revenue.ts:10 — one money definition, no second enum.
const PAID = ["paid", "provisioning", "provisioned"] as const;
const DAY_MS = 86_400_000;

/**
 * The full attained history: first paid-order MSK day … yesterday. With no
 * paid orders at all the default degenerates to "today or later", which the
 * loop skips (days=0) instead of writing phantom rows.
 */
async function resolveDefaultRange(): Promise<{ fromDay: string; toDay: string }> {
  const now = new Date();
  const toDay = mskDayLabel(new Date(now.getTime() - DAY_MS));
  const agg = await prisma.order.aggregate({
    _min: { paidAt: true },
    where: { status: { in: [...PAID] } },
  });
  const fromDay = agg._min.paidAt ? mskDayLabel(agg._min.paidAt) : mskDayLabel(now);
  return { fromDay, toDay };
}

/** Chunk [fromDay, toDay] by calendar month for progress logging. */
async function backfillAll(fromDay: string, toDay: string): Promise<{ days: number; upserted: number }> {
  let chunkFrom = fromDay;
  let days = 0;
  let upserted = 0;
  while (chunkFrom <= toDay) {
    const nextMonth = addMonths(mskMonthLabel(chunkFrom), 1);
    const monthLastDay = new Date(Date.parse(nextMonth) - DAY_MS).toISOString().slice(0, 10);
    const chunkTo = monthLastDay <= toDay ? monthLastDay : toDay;
    const result = await rollupDays(chunkFrom, chunkTo, "backfill");
    days += result.days;
    upserted += result.upserted;
    console.log(`backfill: ${chunkFrom} .. ${chunkTo} days=${result.days} upserted=${result.upserted}`);
    if (chunkTo === toDay) break;
    chunkFrom = nextMonth;
  }
  return { days, upserted };
}

async function main(): Promise<void> {
  await prisma.$connect();
  const { fromDay, toDay } = await resolveDefaultRange();
  console.log(`backfill: range ${fromDay} .. ${toDay} (MSK)`);
  const { days, upserted } = await backfillAll(fromDay, toDay);
  console.log(`backfill: done days=${days} upserted=${upserted}`);
}

main()
  .catch((e: unknown) => {
    console.error("backfill: failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

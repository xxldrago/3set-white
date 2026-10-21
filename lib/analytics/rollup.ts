// Nightly rollup: paid orders → daily series → idempotent absolute-value
// upsert into daily_metrics, plus yesterday's ARTEMIDA balance snapshot.
//
// Prelude to the dusk-to-dawn job: the MSK day bucketing happens here only
// through lib/analytics/time + series — never `CURRENT_DATE`/`date_trunc`
// (D-15: the session TimeZone differs dev vs prod — Asia/Vladivostok vs UTC).
//
// IDEMPOTENCE CONTRACT (D-13 / Pitfall 7): every upsert is ABSOLUTE
// (`SET col = EXCLUDED.col`, never `col = col + n`). Re-running over the
// same range is a no-op on values; twelve concurrent runs of the same day
// cannot double-count — the last writer's computed values simply win.
//
// ORDER WINDOW — deliberately NOT bounded below by fromDay: the term-chain
// ledger needs the whole history of every key active inside the window, or
// the nightly re-roll would overwrite a full backfill's active_keys with
// window-limited values. Out-of-window orders never emit money counters
// (their days fall outside [fromDay, toDay]); the query upper bound is
// `paidAt < end-of-window`. At MVP scale the full paid set is a few
// thousand rows — one query per run.
//
// Cash-attribution caveat (inherent, documented, not fixed): a lost Platega
// callback recovered by the hourly reconcile stamps that order's paidAt
// with the recovery instant, so its cash shifts to the recovery MSK day.
// `finalAmount`/`balanceUsed` facts are untouched.
import { prisma } from "../prisma";
import { logger } from "../logger";
import { artemida } from "../artemida";
import { mskDayLabel, mskDayStartInstant } from "./time";
import { buildDailySeries, nextDayLabel } from "./series";

// Mirrors lib/revenue.ts:10 — the same money pipeline, never a second enum.
const PAID = ["paid", "provisioning", "provisioned"] as const;

/**
 * Recompute MSK days [fromDay, toDay] (inclusive) from source rows and
 * upsert absolute values into daily_metrics. Returns ids/outcomes only —
 * never DATABASE_URL or provider payloads.
 */
export async function rollupDays(
  fromDay: string,
  toDay: string,
  source: "cron" | "backfill" = "cron",
): Promise<{ days: number; upserted: number; balance: "ok" | "skipped" }> {
  // Window bounds are INSTANTS for timestamp(3) columns; the adapter writes
  // them as UTC wall clock. The lower bound is intentionally absent — see the
  // module comment (term chains need the keys' full history).
  const to = mskDayStartInstant(nextDayLabel(toDay));

  const [orders, users, compensations] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [...PAID] }, paidAt: { lt: to } },
      select: {
        id: true,
        userId: true,
        kind: true,
        days: true,
        devices: true,
        finalAmount: true,
        balanceUsed: true,
        providerCost: true,
        keyId: true,
        provisionedKeyId: true,
        paidAt: true,
        status: true,
      },
    }),
    prisma.user.findMany({
      where: { createdAt: { lt: to } },
      select: { createdAt: true },
    }),
    prisma.ticketCompensation.findMany({
      where: { createdAt: { lt: to } },
      select: { days: true, createdAt: true },
    }),
  ]);

  const series = buildDailySeries(
    orders,
    users,
    compensations.map((c) => ({ at: c.createdAt, days: c.days })),
    fromDay,
    toDay,
  );

  let upserted = 0;
  for (const a of series) {
    // Per-day single-row statement; the day is ALWAYS a 'YYYY-MM-DD' string
    // cast ::date (a JS Date here would land one day earlier — adapter rule).
    upserted += await prisma.$executeRaw`
      INSERT INTO daily_metrics (
        day, paid_orders, paid_cash_rub, new_orders, renew_orders,
        upgrade_orders, provider_cost_rub, provider_cost_orders,
        active_keys, new_users, goodwill_days, computed_at
      )
      VALUES (
        ${a.day}::date, ${a.paidOrders}, ${a.paidCashRub}, ${a.newOrders},
        ${a.renewOrders}, ${a.upgradeOrders}, ${a.providerCostRub},
        ${a.providerCostOrders}, ${a.activeKeys}, ${a.newUsers},
        ${a.goodwillDays}, now()
      )
      ON CONFLICT (day) DO UPDATE SET
        paid_orders          = EXCLUDED.paid_orders,
        paid_cash_rub        = EXCLUDED.paid_cash_rub,
        new_orders           = EXCLUDED.new_orders,
        renew_orders         = EXCLUDED.renew_orders,
        upgrade_orders       = EXCLUDED.upgrade_orders,
        provider_cost_rub    = EXCLUDED.provider_cost_rub,
        provider_cost_orders = EXCLUDED.provider_cost_orders,
        active_keys          = EXCLUDED.active_keys,
        new_users            = EXCLUDED.new_users,
        goodwill_days        = EXCLUDED.goodwill_days,
        computed_at          = now()
    `;
  }

  let balance: "ok" | "skipped" = "ok";
  try {
    // One snapshot per run, for YESTERDAY (now-based) — first reading wins:
    // DO NOTHING never silently overwrites an earlier captured value.
    const snapshotDay = mskDayLabel(new Date(Date.now() - 86_400_000));
    const wallet = await artemida.getBalance();
    await prisma.$executeRaw`
      INSERT INTO artemida_balance_snapshots (day, balance_rub, captured_at, source)
      VALUES (${snapshotDay}::date, ${Math.round(wallet.balance)}, now(), ${source})
      ON CONFLICT (day) DO NOTHING
    `;
  } catch {
    // Convenience series, not an invariant: never fail the rollup for it.
    logger.warn({ route: "rollup", outcome: "balance_unavailable" });
    balance = "skipped";
  }

  logger.info({
    route: "rollup",
    outcome: "ok",
    days: series.length,
    upserted,
    balance,
    source,
  });
  return { days: series.length, upserted, balance };
}

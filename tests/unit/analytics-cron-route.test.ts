// POST /api/cron/analytics vectors (D-13 / T-03-cronopen): the nightly
// rollup trigger is closed by default (503 when CRON_SECRET is unset),
// rejects a missing/forged `x-cron-secret` with 401 WITHOUT running a rollup
// (spied rollupDays), and a valid header runs the SAME rollupDays the
// backfill uses — idempotently across repeated POSTs. Harness mirrors
// tests/unit/cron-reconcile-route.test.ts.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_STATE = vi.hoisted(() => ({
  CRON_SECRET: "unit-test-cron-secret-000000000000" as string | undefined,
}));
vi.mock("../../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/env")>();
  const env = { ...actual.env };
  // Dynamic getter so a test can unset CRON_SECRET without re-importing.
  Object.defineProperty(env, "CRON_SECRET", { get: () => ENV_STATE.CRON_SECRET });
  return { ...actual, env };
});
// Auto-spy with pass-through: the route must run the REAL rollup engine while
// staying inspectable for "a rejected request ran no rollup".
vi.mock(import("../../lib/analytics/rollup"), { spy: true });

import { POST } from "../../app/api/cron/analytics/route";
import { rollupDays } from "../../lib/analytics/rollup";
import { artemida, type Balance } from "../../lib/artemida";
import { mskDateKey, mskDayLabel } from "../../lib/analytics/time";
import { prisma } from "../../lib/prisma";

const OWNER = BigInt("200000342"); // fresh 2000003xx range (RESEARCH Wave-0)
const SECRET = ENV_STATE.CRON_SECRET as string;

const wallet = (balance: number): Balance => ({ balance, currency: "RUB", unlimited: false });

/** The 7 MSK day keys the nightly run covers: today-7 … yesterday. */
function windowDayKeys(): string[] {
  return Array.from({ length: 8 }, (_, i) =>
    mskDayLabel(new Date(Date.now() - (i + 1) * 86_400_000)),
  ).slice(0, 7);
}

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/analytics", { method: "POST", headers });
}

// Value columns of the daily_metrics rows in the re-roll window, keyed by day
// label, computed_at excluded (it may move between posts).
async function windowValues(): Promise<Map<string, string>> {
  const rows = await prisma.dailyMetric.findMany({
    where: { day: { in: windowDayKeys().map(mskDateKey) } },
    orderBy: { day: "asc" },
  });
  return new Map(
    rows.map((r) => {
      const { computedAt: _computedAt, ...rest } = r;
      return [r.day.toISOString().slice(0, 10), JSON.stringify(rest)];
    }),
  );
}

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: OWNER },
    select: { id: true },
  });
  if (user) {
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { telegramId: OWNER } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.user.create({ data: { telegramId: OWNER }, select: { id: true } });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

beforeEach(async () => {
  ENV_STATE.CRON_SECRET = "unit-test-cron-secret-000000000000";
  // Fixture order paid 2 MSK days ago — inside the 7-day re-roll window
  // from every moment of the day (an order "today-2" is never today/yesterday).
  await prisma.order.create({
    data: {
      userId: (await prisma.user.findUniqueOrThrow({ where: { telegramId: OWNER }, select: { id: true } })).id,
      kind: "new",
      days: 30,
      devices: 2,
      amount: 500,
      currency: "RUB",
      status: "paid",
      paidAt: new Date(Date.now() - 2 * 86_400_000),
      finalAmount: 500,
      balanceUsed: 100, // cash leg = 400
      providerCost: null,
      provisionedKeyId: "ck1",
    },
  });
  await prisma.dailyMetric.deleteMany({ where: { day: { in: windowDayKeys().map(mskDateKey) } } });
  await prisma.artemidaBalanceSnapshot.deleteMany({
    where: { day: mskDateKey(mskDayLabel(new Date(Date.now() - 86_400_000))) },
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.order.deleteMany({ where: { user: { telegramId: OWNER } } });
});

describe("POST /api/cron/analytics (D-13)", () => {
  it("rejects a missing secret header and runs no rollup", async () => {
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(vi.mocked(rollupDays)).not.toHaveBeenCalled();
  });

  it("rejects a forged secret header and runs no rollup", async () => {
    const res = await POST(request({ "x-cron-secret": "not-the-secret" }));
    expect(res.status).toBe(401);
    expect(vi.mocked(rollupDays)).not.toHaveBeenCalled();
  });

  it("is closed by default (503) while CRON_SECRET is unset, running no rollup", async () => {
    ENV_STATE.CRON_SECRET = undefined;
    const res = await POST(request({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "disabled" });
    expect(vi.mocked(rollupDays)).not.toHaveBeenCalled();
  });

  it("runs the 7-day re-roll with a valid secret and is idempotent across posts", async () => {
    vi.spyOn(artemida, "getBalance").mockResolvedValue(wallet(777));

    const res = await POST(request({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; days: number; upserted: number; balance: string };
    expect(body.ok).toBe(true);
    expect(body.days).toBe(7); // today-7 … yesterday, inclusive
    expect(body.upserted).toBe(7);
    expect(body.balance).toBe("ok");

    // Same window passed to the engine as the operator would expect.
    const call = vi.mocked(rollupDays).mock.calls.at(-1)!;
    const [fromDay, toDay] = call;
    expect(toDay).toBe(mskDayLabel(new Date(Date.now() - 86_400_000)));
    expect(fromDay).toBe(mskDayLabel(new Date(Date.now() - 7 * 86_400_000)));

    const first = await windowValues();
    expect(first.get(mskDayLabel(new Date(Date.now() - 2 * 86_400_000)))).toContain("400");

    // Idempotent: a second POST re-rolls the exact same absolute values.
    const secondRes = await POST(request({ "x-cron-secret": SECRET }));
    expect(secondRes.status).toBe(200);
    expect(await windowValues()).toEqual(first);
  });
});

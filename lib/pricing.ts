// Shared tariff pricing (single source of truth for display AND billing).
//
// `TariffPrice` is an explicit admin-set retail matrix for (days, devices).
// `resolveTariffQuote` returns the manual amount when an exact combo row exists
// and falls back to the live ARTEMIDA quote otherwise; `createOrder`
// (incl. renew) and `/api/pricing` both resolve through these helpers, so the
// displayed price and the charged amount cannot diverge. Upgrade deltas derive
// from the same 30-day base-grid convention as the observed provider
// derivation (+1 device/30d), falling back to the provider's tier method when
// the grid has no (30, devices+addDevices) row.
import { z } from "zod";
import { ArtemidaError, artemida } from "./artemida";
import { logger } from "./logger";
import { prisma } from "./prisma";
import {
  TARIFF_CURRENCY,
  TARIFF_DAYS,
  TARIFF_MAX_AMOUNT,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
} from "./tariff-grid";

export {
  TARIFF_CURRENCY,
  TARIFF_DAYS,
  TARIFF_MAX_AMOUNT,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
};
export type { TariffDays } from "./tariff-grid";

export interface TariffQuote {
  amount: number;
  currency: string;
  source: "manual" | "provider";
}

export interface TariffPriceRow {
  id: number;
  days: number;
  devices: number;
  amount: number;
  currency: string;
  updatedByTelegramId: string | null;
  updatedAt: Date;
}

export interface TariffPriceInput {
  days: number;
  devices: number;
  /** Whole RUB, or null to clear the override (fall back to provider). */
  amount: number | null;
}

const tariffCellSchema = z.object({
  days: z.number().int().refine((v) => (TARIFF_DAYS as readonly number[]).includes(v)),
  devices: z.number().int().min(TARIFF_MIN_DEVICES).max(TARIFF_MAX_DEVICES),
  amount: z
    .number()
    .int()
    .min(TARIFF_MIN_AMOUNT)
    .max(TARIFF_MAX_AMOUNT)
    .nullable(),
});

function assertTariffSelection(days: number, devices: number): void {
  const parsed = z
    .object({
      days: z.number().int().refine((v) => (TARIFF_DAYS as readonly number[]).includes(v)),
      devices: z.number().int().min(TARIFF_MIN_DEVICES).max(TARIFF_MAX_DEVICES),
    })
    .safeParse({ days, devices });
  if (!parsed.success) throw new ArtemidaError("unknown", 200);
}

async function findManualTariff(
  days: number,
  devices: number,
): Promise<{ amount: number; currency: string } | null> {
  const row = await prisma.tariffPrice.findUnique({
    where: { days_devices: { days, devices } },
    select: { amount: true, currency: true },
  });
  if (!row || row.currency !== TARIFF_CURRENCY) return null;
  return { amount: row.amount, currency: row.currency };
}

/**
 * Retail quote for a (days, devices) tariff: manual grid row wins, otherwise
 * the live provider quote.
 */
export async function resolveTariffQuote(days: number, devices: number): Promise<TariffQuote> {
  assertTariffSelection(days, devices);
  const manual = await findManualTariff(days, devices);
  if (manual) return { amount: manual.amount, currency: manual.currency, source: "manual" };
  const provider = await artemida.getPricing({ days, devices });
  return { amount: Math.round(provider.price), currency: provider.currency, source: "provider" };
}

/**
 * Upgrade delta from the retail base grid: monthly unit = grid (30, total)/30,
 * months fixed at 1. This mirrors the established 30-day derivation basis used
 * for the observed provider fixture (+1 device/30d). Falls back to the
 * provider tier method when the grid has no base row.
 */
export async function resolveUpgradeQuote(input: {
  days: number;
  devices: number;
  addDevices: number;
}): Promise<TariffQuote> {
  const { days, devices, addDevices } = input;
  assertTariffSelection(days, devices);
  if (!Number.isInteger(addDevices) || addDevices < 1 || devices + addDevices > TARIFF_MAX_DEVICES) {
    throw new ArtemidaError("unknown", 200);
  }
  const manual = await findManualTariff(30, devices + addDevices);
  if (manual) {
    const unit = manual.amount / 30;
    return { amount: Math.round(unit * addDevices), currency: manual.currency, source: "manual" };
  }
  const provider = await artemida.getUpgradeQuote({ days, devices, addDevices });
  return { amount: provider.amount, currency: provider.currency, source: "provider" };
}

/** Manual grid read for the admin settings surface (ordered). */
export async function listTariffPrices(): Promise<TariffPriceRow[]> {
  const rows = await prisma.tariffPrice.findMany({
    orderBy: [{ days: "asc" }, { devices: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    days: row.days,
    devices: row.devices,
    amount: row.amount,
    currency: row.currency,
    updatedByTelegramId:
      row.updatedByTelegramId === null ? null : String(row.updatedByTelegramId),
    updatedAt: row.updatedAt,
  }));
}

/**
 * Replace the whole retail grid atomically: rows with an amount are upserted,
 * null rows are cleared (provider fallback). Every row is re-validated here
 * so a direct service caller cannot bypass the route-level zod.
 */
export async function replaceTariffGrid(
  rows: TariffPriceInput[],
  updatedByTelegramId: number,
): Promise<TariffPriceRow[]> {
  const seen = new Set<string>();
  const parsed = rows.map((row, index) => {
    const result = tariffCellSchema.safeParse(row);
    if (!result.success) {
      throw new Error(`pricing:bad_request:row:${index}`);
    }
    const key = `${result.data.days}:${result.data.devices}`;
    if (seen.has(key)) throw new Error(`pricing:bad_request:duplicate:${index}`);
    seen.add(key);
    return result.data;
  });

  await prisma.$transaction(async (tx) => {
    await tx.tariffPrice.deleteMany({});
    const kept = parsed.filter((row) => row.amount !== null);
    if (kept.length > 0) {
      await tx.tariffPrice.createMany({
        data: kept.map((row) => ({
          days: row.days,
          devices: row.devices,
          amount: row.amount as number,
          currency: TARIFF_CURRENCY,
          updatedByTelegramId: BigInt(updatedByTelegramId),
        })),
      });
    }
  });

  logger.info({
    route: "admin-pricing",
    outcome: "grid_replaced",
    rows: parsed.length,
    updatedByTelegramId,
  });
  return listTariffPrices();
}

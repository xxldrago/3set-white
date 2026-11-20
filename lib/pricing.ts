// Shared tariff pricing (single source of truth for display AND billing).
//
// Retail price = provider quote + the owner's markup. The markup is a single
// global setting (percent or a fixed RUB amount) because the device ceiling is
// now 9999 and a per-cell price table cannot be maintained at that size.
//
// A MANUAL grid row remains available as an exact override for the small range
// (≤ TARIFF_GRID_MAX_DEVICES devices): the owner occasionally wants to pin one
// specific combo (a promo price, a rounding fix). Precedence is explicit —
// 1. manual cell for the exact (days, devices), when one exists;
// 2. otherwise provider quote + markup.
//
// Every caller resolves through these helpers, so the displayed price and the
// charged amount cannot diverge.
import { z } from "zod";
import { ArtemidaError, artemida } from "./artemida";
import { logger } from "./logger";
import { prisma } from "./prisma";
import {
  MARKUP_KINDS,
  MARKUP_MAX_FIXED,
  MARKUP_MAX_PERCENT,
  TARIFF_CURRENCY,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_AMOUNT,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
  type MarkupKind,
} from "./tariff-grid";

export {
  MARKUP_KINDS,
  MARKUP_MAX_FIXED,
  MARKUP_MAX_PERCENT,
  TARIFF_CURRENCY,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_AMOUNT,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
};
export type { MarkupKind, TariffDays } from "./tariff-grid";

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
  /** Whole RUB, or null to clear the override (fall back to the markup). */
  amount: number | null;
}

export interface TariffMarkup {
  kind: MarkupKind;
  /** Percent points when kind=percent, whole RUB when kind=fixed. */
  value: number;
}

export const DEFAULT_MARKUP: TariffMarkup = { kind: "percent", value: 0 };

const MARKUP_KIND_KEY = "pricing.markupKind";
const MARKUP_VALUE_KEY = "pricing.markupValue";

const gridCellSchema = z.object({
  days: z.number().int().refine((v) => (TARIFF_DAYS as readonly number[]).includes(v)),
  // The manual grid stays small on purpose (see TARIFF_GRID_MAX_DEVICES).
  devices: z.number().int().min(TARIFF_MIN_DEVICES).max(TARIFF_GRID_MAX_DEVICES),
  amount: z
    .number()
    .int()
    .min(TARIFF_MIN_AMOUNT)
    .max(TARIFF_MAX_AMOUNT)
    .nullable(),
});

/**
 * Storefront selection guard. Accepts the full provider range (1..9999
 * devices, the five offered terms) — NOT the smaller manual-grid range.
 */
function assertTariffSelection(days: number, devices: number): void {
  const parsed = z
    .object({
      days: z.number().int().refine((v) => (TARIFF_DAYS as readonly number[]).includes(v)),
      devices: z.number().int().min(TARIFF_MIN_DEVICES).max(TARIFF_MAX_DEVICES),
    })
    .safeParse({ days, devices });
  if (!parsed.success) throw new ArtemidaError("unknown", 200);
}

// ---------------------------------------------------------------------------
// Markup settings
// ---------------------------------------------------------------------------

/** Read the global markup. Missing/invalid rows fall back to no markup. */
export async function getTariffMarkup(): Promise<TariffMarkup> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [MARKUP_KIND_KEY, MARKUP_VALUE_KEY] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const kindRaw = byKey.get(MARKUP_KIND_KEY);
  const kind: MarkupKind =
    kindRaw === "fixed" || kindRaw === "percent" ? kindRaw : DEFAULT_MARKUP.kind;
  const rawValue = byKey.get(MARKUP_VALUE_KEY);
  const parsed = rawValue === undefined ? Number.NaN : Number(rawValue);
  const value =
    Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MARKUP.value;
  return { kind, value };
}

/** Validate + persist the global markup (admin-only surface). */
export async function setTariffMarkup(input: TariffMarkup): Promise<TariffMarkup> {
  const kind: MarkupKind = input.kind === "fixed" ? "fixed" : "percent";
  const ceiling = kind === "fixed" ? MARKUP_MAX_FIXED : MARKUP_MAX_PERCENT;
  if (!Number.isFinite(input.value) || input.value < 0 || input.value > ceiling) {
    throw new Error("pricing:bad_request:markup");
  }
  // Percent may be fractional (e.g. 7.5%); a fixed markup is whole RUB.
  const value = kind === "fixed" ? Math.round(input.value) : Math.round(input.value * 100) / 100;
  for (const [key, stored] of [
    [MARKUP_KIND_KEY, kind],
    [MARKUP_VALUE_KEY, String(value)],
  ] as const) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: stored },
      create: { key, value: stored },
    });
  }
  logger.info({ route: "admin-pricing", outcome: "markup_set", kind, value });
  return { kind, value };
}

/**
 * Apply the markup to a provider amount (whole RUB).
 *
 * Rounding is half-up so a 0.5 RUB fraction never silently favours the buyer,
 * and the result is clamped to the storefront floor (1 RUB) — a free order must
 * never be created by a markup of zero on a zero quote.
 */
export function applyMarkup(providerAmount: number, markup: TariffMarkup): number {
  const base = providerAmount;
  const raw =
    markup.kind === "fixed" ? base + markup.value : base + (base * markup.value) / 100;
  const rounded = Math.round(raw);
  return Math.max(TARIFF_MIN_AMOUNT, Math.min(TARIFF_MAX_AMOUNT, rounded));
}

// ---------------------------------------------------------------------------
// Manual override grid
// ---------------------------------------------------------------------------

async function findManualTariff(
  days: number,
  devices: number,
): Promise<{ amount: number; currency: string } | null> {
  // Above the grid ceiling there is no manual cell by construction.
  if (devices > TARIFF_GRID_MAX_DEVICES) return null;
  const row = await prisma.tariffPrice.findUnique({
    where: { days_devices: { days, devices } },
    select: { amount: true, currency: true },
  });
  if (!row || row.currency !== TARIFF_CURRENCY) return null;
  return { amount: row.amount, currency: row.currency };
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/**
 * Retail quote for a (days, devices) tariff: an exact manual cell wins,
 * otherwise the live provider quote plus the global markup.
 */
export async function resolveTariffQuote(days: number, devices: number): Promise<TariffQuote> {
  assertTariffSelection(days, devices);
  const manual = await findManualTariff(days, devices);
  if (manual) return { amount: manual.amount, currency: manual.currency, source: "manual" };
  const [provider, markup] = await Promise.all([
    artemida.getPricing({ days, devices }),
    getTariffMarkup(),
  ]);
  return {
    amount: applyMarkup(Math.round(provider.price), markup),
    currency: provider.currency,
    source: "provider",
  };
}

/**
 * Upgrade delta for adding devices to an existing key.
 *
 * Mirrors the established 30-day derivation basis: when the grid has a
 * (30, devices+addDevices) base row the monthly unit comes from it, otherwise
 * the provider's tier method quotes the delta (no provider quote endpoint
 * exists). The markup applies to the provider path exactly as it does for a
 * new key, so adding a device is never cheaper per device than buying up front.
 */
export async function resolveUpgradeQuote(input: {
  days: number;
  devices: number;
  addDevices: number;
}): Promise<TariffQuote> {
  const { days, devices, addDevices } = input;
  assertTariffSelection(days, devices);
  if (
    !Number.isInteger(addDevices) ||
    addDevices < 1 ||
    devices + addDevices > TARIFF_MAX_DEVICES
  ) {
    throw new ArtemidaError("unknown", 200);
  }
  const manual = await findManualTariff(30, devices + addDevices);
  if (manual) {
    const unit = manual.amount / 30;
    return { amount: Math.round(unit * addDevices), currency: manual.currency, source: "manual" };
  }
  const [provider, markup] = await Promise.all([
    artemida.getUpgradeQuote({ days, devices, addDevices }),
    getTariffMarkup(),
  ]);
  return {
    amount: applyMarkup(Math.round(provider.amount), markup),
    currency: provider.currency,
    source: "provider",
  };
}

// ---------------------------------------------------------------------------
// Admin grid read/write
// ---------------------------------------------------------------------------

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
 * Replace the whole manual grid atomically: rows with an amount are upserted,
 * null rows are cleared. Every row is re-validated here so a direct service
 * caller cannot bypass the route-level zod.
 */
export async function replaceTariffGrid(
  rows: TariffPriceInput[],
  updatedByTelegramId: number,
): Promise<TariffPriceRow[]> {
  const seen = new Set<string>();
  const parsed = rows.map((row, index) => {
    const result = gridCellSchema.safeParse(row);
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

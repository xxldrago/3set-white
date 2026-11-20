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
  MARKUP_PER_DEVICE,
  MARKUP_PER_DEVICE_MAX,
  TARIFF_CURRENCY,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_AMOUNT,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
} from "./tariff-grid";

export {
  MARKUP_PER_DEVICE,
  MARKUP_PER_DEVICE_MAX,
  TARIFF_CURRENCY,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
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
  /** Whole RUB, or null to clear the override (fall back to the markup). */
  amount: number | null;
}

/** Whole-RUB markup added once per device for one offered term. */
export type PerDeviceMarkups = Record<number, number>;

const markupKey = (days: number) => `pricing.markupPerDevice.${days}`;

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
// Per-device markup settings
// ---------------------------------------------------------------------------

/** Read one term's per-device markup, falling back to the locked default. */
export async function getMarkupPerDevice(days: number): Promise<number> {
  if (!(TARIFF_DAYS as readonly number[]).includes(days)) {
    throw new Error("pricing:bad_request:days");
  }
  const row = await prisma.setting.findUnique({
    where: { key: markupKey(days) },
    select: { value: true },
  });
  if (row === null) return MARKUP_PER_DEVICE[days as keyof typeof MARKUP_PER_DEVICE];
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MARKUP_PER_DEVICE_MAX
    ? Math.round(parsed)
    : MARKUP_PER_DEVICE[days as keyof typeof MARKUP_PER_DEVICE];
}

/** Read all five term markups (one query), defaults filled in. */
export async function getAllMarkupsPerDevice(): Promise<PerDeviceMarkups> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: "pricing.markupPerDevice." } },
    select: { key: true, value: true },
  });
  const byDays = new Map<number, number>();
  for (const row of rows) {
    const days = Number(row.key.slice("pricing.markupPerDevice.".length));
    const parsed = Number(row.value);
    if (
      (TARIFF_DAYS as readonly number[]).includes(days) &&
      Number.isFinite(parsed) &&
      parsed >= 0 &&
      parsed <= MARKUP_PER_DEVICE_MAX
    ) {
      byDays.set(days, Math.round(parsed));
    }
  }
  const result: PerDeviceMarkups = {};
  for (const days of TARIFF_DAYS) {
    result[days] = byDays.get(days) ?? MARKUP_PER_DEVICE[days];
  }
  return result;
}

/** Validate + persist one term's per-device markup (admin-only surface). */
export async function setMarkupPerDevice(days: number, value: number): Promise<number> {
  if (!(TARIFF_DAYS as readonly number[]).includes(days)) {
    throw new Error("pricing:bad_request:days");
  }
  if (!Number.isInteger(value) || value < 0 || value > MARKUP_PER_DEVICE_MAX) {
    throw new Error("pricing:bad_request:markup");
  }
  await prisma.setting.upsert({
    where: { key: markupKey(days) },
    update: { value: String(value) },
    create: { key: markupKey(days), value: String(value) },
  });
  logger.info({ route: "admin-pricing", outcome: "markup_set", days, value });
  return value;
}

/**
 * Retail price = live provider quote + per-device markup × device count.
 *
 * The provider quote already reflects its own device tiers, so the final price
 * always tracks ARTEMIDA changes; the markup is a constant addition per device.
 * Rounding is half-up and the result is clamped to the storefront floor.
 */
export function applyMarkup(
  providerAmount: number,
  days: number,
  devices: number,
  markupPerDevice: number,
): number {
  const base = providerAmount;
  const raw = base + markupPerDevice * devices;
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
    getMarkupPerDevice(days),
  ]);
  return {
    amount: applyMarkup(Math.round(provider.price), days, devices, markup),
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
    // Upgrades are priced on the 30-day basis, so the monthly per-device
    // markup applies to every added device.
    getMarkupPerDevice(30),
  ]);
  return {
    // The provider quote already covers the added devices; the markup is
    // charged once per added device, not per total device count.
    amount: Math.max(
      TARIFF_MIN_AMOUNT,
      Math.min(TARIFF_MAX_AMOUNT, Math.round(provider.amount) + markup * addDevices),
    ),
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

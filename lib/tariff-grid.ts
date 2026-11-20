// Tariff grid dimensions — client-safe (no server imports).
// Single source for the storefront dimensions: the picker, the admin editor,
// and the server validation share these exact bounds.

/**
 * Storefront tariff terms in days (must match the picker + route validation).
 *
 * The provider prices exactly these periods (`periods` in `GET /pricing`) while
 * accepting any term from 1 to 365 days, so the picker offers the five buckets
 * it prices natively instead of inventing arbitrary values.
 */
export const TARIFF_DAYS = [7, 30, 90, 180, 365] as const;
export type TariffDays = (typeof TARIFF_DAYS)[number];

/**
 * Storefront device bounds.
 *
 * The provider now accepts 1..9999 devices (`minDevices=1`, `maxDevices=9999`
 * in `GET /pricing`). The old "minimum 2" lock belonged to the retired price
 * grid and is gone. Retail pricing is a markup over the provider quote, so a
 * device count this large needs no per-cell grid.
 */
export const TARIFF_MIN_DEVICES = 1;
export const TARIFF_MAX_DEVICES = 9999;

/**
 * Ceiling for the MANUAL override grid in the admin panel.
 *
 * The grid is an explicit per-cell price table, so it must stay small enough to
 * edit by hand: five terms × ten device counts = 50 inputs. Counts above this
 * are priced by the markup over the live provider quote, which is the mechanism
 * the storefront actually uses for the long tail. A manual cell always wins over
 * the markup for an exact (days, devices) match.
 */
export const TARIFF_GRID_MAX_DEVICES = 10;

/** Manual price bounds, whole RUB (catches typos, not a business cap). */
export const TARIFF_MIN_AMOUNT = 1;
export const TARIFF_MAX_AMOUNT = 1_000_000_000;

/** Locked settlement/display currency (Platega/RUB contract). */
export const TARIFF_CURRENCY = "RUB";

/** Markup kinds the retail price can add on top of the provider quote. */
export const MARKUP_KINDS = ["percent", "fixed"] as const;
export type MarkupKind = (typeof MARKUP_KINDS)[number];

/** Upper bound for a percent markup (guards against a typo like 10000%). */
export const MARKUP_MAX_PERCENT = 1000;
/** Upper bound for a fixed markup in whole RUB. */
export const MARKUP_MAX_FIXED = 1_000_000;

import { t } from './i18n';

/**
 * Human label for a tariff term. Exhaustive over `TARIFF_DAYS` so adding a
 * period cannot silently fall through to a wrong bucket. Resolves through `t()`
 * with literal keys (not a computed path) so the i18n completeness scan sees
 * every term label as used.
 */
export function tariffDaysLabel(days: number): string {
  switch (days) {
    case 7:
      return t("pricing.days7");
    case 30:
      return t("pricing.days30");
    case 90:
      return t("pricing.days90");
    case 180:
      return t("pricing.days180");
    case 365:
      return t("pricing.days365");
    default:
      return t("pricing.days30");
  }
}

// Tariff grid dimensions — client-safe (no server imports).
// Single source for the storefront dimensions: the picker, the admin editor,
// and the server validation share these exact bounds.

/** Storefront tariff terms in days (must match the picker + route validation). */
export const TARIFF_DAYS = [7, 30, 90] as const;
export type TariffDays = (typeof TARIFF_DAYS)[number];

/** Provider minimum / app ceiling (contract lock 02-01). */
export const TARIFF_MIN_DEVICES = 2;
export const TARIFF_MAX_DEVICES = 10;

/** Manual price bounds, whole RUB (catches typos, not a business cap). */
export const TARIFF_MIN_AMOUNT = 1;
export const TARIFF_MAX_AMOUNT = 1_000_000;

/** Locked settlement/display currency (Platega/RUB contract). */
export const TARIFF_CURRENCY = "RUB";

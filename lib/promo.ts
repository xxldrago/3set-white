// Promo codes — discount intake for the money pipeline.
//
// A code is either a percentage (1-100) or a fixed RUB amount, bounded by
// `maxUses` (null = unlimited) and `expiresAt` (null = never expires).
// Codes are case-insensitive on input: stored uppercased, looked up
// uppercased. Validation is pure-read; consumption is an atomic
// `usedCount = usedCount + 1 WHERE usedCount < maxUses` claim so concurrent
// checkouts cannot overspend a limited code.
import { z } from "zod";
import { prisma } from "./prisma";

export const PROMO_CODE_RE = /^[A-Z0-9-]{3,32}$/;
export const PROMO_MAX_DISCOUNT_PCT = 100;
export const PROMO_MAX_DISCOUNT_RUB = 1_000_000;

export type PromoType = "percentage" | "fixed";

export interface PromoRow {
  id: string;
  code: string;
  discount: number;
  type: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export const promoInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(32)
    .regex(PROMO_CODE_RE),
  discount: z.number().int().min(1).max(PROMO_MAX_DISCOUNT_RUB),
  type: z.enum(["percentage", "fixed"]),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type PromoInput = z.infer<typeof promoInputSchema>;

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isPromoUsable(row: Pick<PromoRow, "maxUses" | "usedCount" | "expiresAt">): boolean {
  if (row.maxUses !== null && row.usedCount >= row.maxUses) return false;
  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/** Percentage discount validated for the [1..100] range. */
function pctOff(amount: number, discount: number): number {
  const pct = Math.max(1, Math.min(PROMO_MAX_DISCOUNT_PCT, discount));
  return Math.max(0, amount - Math.floor((amount * pct) / 100));
}

/** Fixed RUB discount, never below zero. */
function fixedOff(amount: number, discount: number): number {
  return Math.max(0, amount - discount);
}

/** Apply a validated promo to a whole-RUB amount → discounted amount. */
export function applyDiscount(
  amount: number,
  row: Pick<PromoRow, "discount" | "type">,
): number {
  if (row.type === "fixed") return fixedOff(amount, row.discount);
  return pctOff(amount, row.discount);
}

export type PromoValidation =
  | { ok: true; row: PromoRow; finalAmount: number }
  | { ok: false; reason: "not_found" | "exhausted" | "expired" };

/**
 * Validate a code against an amount (read-only — no consumption).
 * Unknown codes and unusable codes are distinguished for the admin surface;
 * the storefront maps both to the same generic copy (no oracle).
 */
export async function validatePromo(
  rawCode: string,
  amount: number,
): Promise<PromoValidation> {
  const code = normalizePromoCode(rawCode);
  if (!PROMO_CODE_RE.test(code)) return { ok: false, reason: "not_found" };
  const row = await prisma.promoCode.findUnique({ where: { code } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.maxUses !== null && row.usedCount >= row.maxUses) {
    return { ok: false, reason: "exhausted" };
  }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, row, finalAmount: applyDiscount(amount, row) };
}

/**
 * Atomically consume one use of a code. Returns the row when the claim won,
 * null when the code is missing, expired, or exhausted (lost race included).
 * Expiry is re-checked inside the UPDATE so a code expiring mid-checkout
 * cannot be consumed.
 */
export async function consumePromo(rawCode: string): Promise<PromoRow | null> {
  const code = normalizePromoCode(rawCode);
  if (!PROMO_CODE_RE.test(code)) return null;
  const rows = await prisma.$queryRaw<PromoRow[]>`
    UPDATE promo_codes
    SET "usedCount" = "usedCount" + 1
    WHERE code = ${code}
      AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
      AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
    RETURNING id, code, discount, type, "maxUses", "usedCount", "expiresAt", created_at AS "createdAt"
  `;
  return rows[0] ?? null;
}

export async function listPromos(): Promise<PromoRow[]> {
  return prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createPromo(input: PromoInput): Promise<PromoRow> {
  if (input.type === "percentage" && input.discount > PROMO_MAX_DISCOUNT_PCT) {
    throw new Error("promo:bad_percentage");
  }
  const code = normalizePromoCode(input.code);
  if (!PROMO_CODE_RE.test(code)) throw new Error("promo:bad_code");
  return prisma.promoCode.create({
    data: {
      code,
      discount: input.discount,
      type: input.type,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
}

export async function deletePromo(id: string): Promise<boolean> {
  const result = await prisma.promoCode.deleteMany({ where: { id } });
  return result.count === 1;
}

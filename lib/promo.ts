// Promo codes — discount intake for the money pipeline.
//
// A code is either a percentage (1-100) or a fixed RUB amount, bounded by
// `maxUses` (null = unlimited) and `expiresAt` (null = never expires), may be
// switched off with `active`, and may require a minimum order amount
// (`minSum`). Codes are case-insensitive on input: stored uppercased, looked
// up uppercased. Validation is pure-read; consumption is an atomic
// `usedCount = usedCount + 1 WHERE usedCount < maxUses AND active` claim so
// concurrent checkouts cannot overspend a limited or paused code.
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
  active: boolean;
  minSum: number | null;
  note: string | null;
  createdAt: Date;
  ownerUserId: number | null;
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
  // Personal partner code: the internal User.id buyers are attributed to.
  ownerUserId: z.number().int().positive().nullable().optional(),
  // Manual on/off switch and minimum order amount (whole RUB).
  active: z.boolean().optional(),
  minSum: z.number().int().min(0).max(PROMO_MAX_DISCOUNT_RUB).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

/** In-place edits of an existing code (PATCH). */
export const promoPatchSchema = z.object({
  active: z.boolean().optional(),
  minSum: z.number().int().min(0).max(PROMO_MAX_DISCOUNT_RUB).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export type PromoInput = z.infer<typeof promoInputSchema>;
export type PromoPatch = z.infer<typeof promoPatchSchema>;

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isPromoUsable(
  row: Pick<PromoRow, "maxUses" | "usedCount" | "expiresAt"> & { active?: boolean },
): boolean {
  // Rows written before the switch existed (active undefined) count as on.
  if (row.active === false) return false;
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

export type PromoRejection = "not_found" | "disabled" | "exhausted" | "expired" | "below_min";

export type PromoValidation =
  | { ok: true; row: PromoRow; finalAmount: number }
  | { ok: false; reason: PromoRejection };

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
  if (!row.active) return { ok: false, reason: "disabled" };
  if (row.maxUses !== null && row.usedCount >= row.maxUses) {
    return { ok: false, reason: "exhausted" };
  }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.minSum !== null && amount < row.minSum) {
    return { ok: false, reason: "below_min" };
  }
  return { ok: true, row, finalAmount: applyDiscount(amount, row) };
}

/**
 * Atomically consume one use of a code. Returns the row when the claim won,
 * null when the code is missing, inactive, expired, exhausted, or the order is
 * below its minimum (lost race included). Every guard is re-checked inside the
 * UPDATE so a code paused mid-checkout cannot be consumed. `amount` is optional
 * only for legacy callers that do not price the order — checkout always passes
 * it, so `minSum` is enforced on the real money path.
 */
export async function consumePromo(
  rawCode: string,
  amount?: number,
): Promise<PromoRow | null> {
  const code = normalizePromoCode(rawCode);
  if (!PROMO_CODE_RE.test(code)) return null;
  const rows = await prisma.$queryRaw<PromoRow[]>`
    UPDATE promo_codes
    SET "usedCount" = "usedCount" + 1
    WHERE code = ${code}
      AND "active" = true
      AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
      AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      AND ("minSum" IS NULL OR ${amount ?? null}::int IS NULL OR ${amount ?? null} >= "minSum")
    RETURNING id, code, discount, type, "maxUses", "usedCount", "expiresAt", "active",
      "minSum", note, created_at AS "createdAt", owner_user_id AS "ownerUserId"
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
  if (input.ownerUserId !== undefined && input.ownerUserId !== null) {
    const owner = await prisma.user.findUnique({
      where: { id: input.ownerUserId },
      select: { id: true },
    });
    if (!owner) throw new Error("promo:bad_owner");
  }
  return prisma.promoCode.create({
    data: {
      code,
      discount: input.discount,
      type: input.type,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      ownerUserId: input.ownerUserId ?? null,
      active: input.active ?? true,
      minSum: input.minSum ?? null,
      note: input.note?.trim() ? input.note.trim() : null,
    },
  });
}

export async function listPromosByOwner(ownerUserId: number): Promise<PromoRow[]> {
  return prisma.promoCode.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: "desc" },
  });
}

/** In-place update of the switch, minimum amount and note. */
export async function updatePromo(
  id: string,
  patch: PromoPatch,
): Promise<PromoRow | null> {
  const data: { active?: boolean; minSum?: number | null; note?: string | null } = {};
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.minSum !== undefined) data.minSum = patch.minSum;
  if (patch.note !== undefined) data.note = patch.note?.trim() ? patch.note.trim() : null;
  if (Object.keys(data).length === 0) {
    return prisma.promoCode.findUnique({ where: { id } });
  }
  const result = await prisma.promoCode.updateMany({ where: { id }, data });
  if (result.count === 0) return null;
  return prisma.promoCode.findUnique({ where: { id } });
}

/** Bulk switch for the registry's multi-select. Returns changed rows. */
export async function setPromosActive(ids: string[], active: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.promoCode.updateMany({
    where: { id: { in: ids } },
    data: { active },
  });
  return result.count;
}

export async function deletePromo(id: string): Promise<boolean> {
  const result = await prisma.promoCode.deleteMany({ where: { id } });
  return result.count === 1;
}

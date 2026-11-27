// GET /api/admin/promos/check — read-only promo validation (administrator-only).
//
// The registry's checker answers "what would this code do right now?" against
// the SAME logic checkout uses: `validatePromo` from lib/promo.ts, which checks
// the usage ceiling before expiry and applies `applyDiscount`. Nothing is
// consumed and no ARTEMIDA quote is involved — the caller may pass an `amount`
// to see the resulting price, otherwise only the code's own state is returned.
//
// requireRole → 401/404; a malformed code/amount → 400. Unknown codes answer
// 200 with `found: false` (this is an admin surface, not the storefront, so
// there is no oracle to protect).
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { logger } from "../../../../../lib/logger";
import {
  PROMO_CODE_RE,
  PROMO_MAX_DISCOUNT_RUB,
  applyDiscount,
  normalizePromoCode,
} from "../../../../../lib/promo";
import { promoStatusOf } from "../../../../../lib/admin-promos-directory";
import { prisma } from "../../../../../lib/prisma";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  code: z.string().trim().min(1).max(32),
  // Optional: the amount the admin wants to price the code against.
  amount: z.coerce.number().int().min(1).max(PROMO_MAX_DISCOUNT_RUB).optional(),
});

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-promos-check", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    code: url.searchParams.get("code") ?? undefined,
    amount: url.searchParams.get("amount") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const code = normalizePromoCode(parsed.data.code);
  if (!PROMO_CODE_RE.test(code)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const row = await prisma.promoCode.findUnique({ where: { code } });
    if (!row) {
      return Response.json({ code, found: false });
    }
    const status = promoStatusOf(row, Date.now());
    const amount = parsed.data.amount;
    return Response.json({
      code: row.code,
      found: true,
      status,
      usable: status === "active" || status === "soon",
      type: row.type,
      discount: row.discount,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      ownerUserId: row.ownerUserId,
      // Only computed when the admin supplied a base price.
      amount: amount ?? null,
      finalAmount:
        amount === undefined
          ? null
          : status === "active" || status === "soon"
            ? applyDiscount(amount, row)
            : null,
    });
  } catch {
    logger.error({ route: "admin-promos-check", outcome: "read_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

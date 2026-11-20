// GET/PUT /api/admin/pricing — ADM tariff settings (administrator-only BFF).
//
// GET returns the manual override grid ({ rows }) plus the global markup.
// PUT replaces the grid atomically from the full matrix: each cell carries an
// amount in whole RUB or null to clear the override (fall back to the markup).
// PATCH updates the markup (percent or fixed RUB) that applies to every price
// not covered by an exact manual cell.
//
// The manual grid is deliberately bounded to TARIFF_GRID_MAX_DEVICES: with the
// storefront ceiling at 9999 devices a per-cell table would be ~50k inputs.
// Every row is re-validated here — never trust the client even though it
// pre-validates. requireRole → 401/404; invalid body → 400.
import { z } from "zod";
import { requireRole } from "../../../../lib/admin-auth";
import {
  getTariffMarkup,
  listTariffPrices,
  replaceTariffGrid,
  setTariffMarkup,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_AMOUNT,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
} from "../../../../lib/pricing";
import { MARKUP_KINDS, MARKUP_MAX_FIXED, MARKUP_MAX_PERCENT } from "../../../../lib/tariff-grid";
import { logger } from "../../../../lib/logger";
import { AdminError, SessionError } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  days: z.number().int().refine((v) => (TARIFF_DAYS as readonly number[]).includes(v)),
  devices: z.number().int().min(TARIFF_MIN_DEVICES).max(TARIFF_GRID_MAX_DEVICES),
  amount: z.number().int().min(TARIFF_MIN_AMOUNT).max(TARIFF_MAX_AMOUNT).nullable(),
});

const bodySchema = z.object({
  rows: z
    .array(rowSchema)
    .min(1)
    .max(TARIFF_DAYS.length * (TARIFF_GRID_MAX_DEVICES - TARIFF_MIN_DEVICES + 1)),
});

const markupSchema = z
  .object({
    kind: z.enum(MARKUP_KINDS),
    value: z.number().min(0),
  })
  .superRefine((value, ctx) => {
    const ceiling = value.kind === "fixed" ? MARKUP_MAX_FIXED : MARKUP_MAX_PERCENT;
    if (value.value > ceiling) {
      ctx.addIssue({ code: "custom", message: `value must be <= ${ceiling}` });
    }
    if (value.kind === "fixed" && !Number.isInteger(value.value)) {
      ctx.addIssue({ code: "custom", message: "fixed markup must be whole RUB" });
    }
  });

/** Shared 401/404/500 mapping for the administrator gate. */
function gateError(err: unknown): Response | null {
  if (err instanceof SessionError) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (err instanceof AdminError) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export async function GET(): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    const mapped = gateError(err);
    if (mapped) return mapped;
    logger.error({ route: "admin-pricing", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  try {
    const [rows, markup] = await Promise.all([listTariffPrices(), getTariffMarkup()]);
    return Response.json({ rows, markup });
  } catch {
    logger.error({ route: "admin-pricing", outcome: "list_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<Response> {
  let telegramId: number;
  try {
    ({ telegramId } = await requireRole("administrator"));
  } catch (err) {
    const mapped = gateError(err);
    if (mapped) return mapped;
    logger.error({ route: "admin-pricing", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const rows = await replaceTariffGrid(parsed.data.rows, telegramId);
    return Response.json({ rows });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("pricing:bad_request")) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    logger.error({ route: "admin-pricing", outcome: "replace_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/pricing — set the global markup applied to every price that
 * has no exact manual cell. This is the primary pricing lever: the storefront
 * ceiling is 9999 devices, so the long tail is priced as provider quote +
 * markup rather than by hand.
 */
export async function PATCH(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    const mapped = gateError(err);
    if (mapped) return mapped;
    logger.error({ route: "admin-pricing", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = markupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const markup = await setTariffMarkup(parsed.data);
    return Response.json({ markup });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("pricing:bad_request")) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    logger.error({ route: "admin-pricing", outcome: "markup_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

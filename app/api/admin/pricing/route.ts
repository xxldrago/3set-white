// GET/PUT /api/admin/pricing — ADM tariff settings (administrator-only BFF).
//
// GET returns the manual retail grid ({ rows }). PUT replaces it atomically
// from the full matrix: each cell carries an amount in whole RUB or null to
// clear the override (fall back to the live ARTEMIDA quote). Every row is
// re-validated here — never trust the client even though it pre-validates.
// requireRole → 401/404; invalid body → 400.
import { z } from "zod";
import { requireRole } from "../../../../lib/admin-auth";
import {
  listTariffPrices,
  replaceTariffGrid,
  TARIFF_MAX_AMOUNT,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
  TARIFF_DAYS,
} from "../../../../lib/pricing";
import { logger } from "../../../../lib/logger";
import { AdminError, SessionError } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  days: z.number().int().refine((v) => (TARIFF_DAYS as readonly number[]).includes(v)),
  devices: z.number().int().min(TARIFF_MIN_DEVICES).max(TARIFF_MAX_DEVICES),
  amount: z.number().int().min(TARIFF_MIN_AMOUNT).max(TARIFF_MAX_AMOUNT).nullable(),
});

const bodySchema = z.object({
  rows: z
    .array(rowSchema)
    .min(1)
    .max(TARIFF_DAYS.length * (TARIFF_MAX_DEVICES - TARIFF_MIN_DEVICES + 1)),
});

export async function GET(): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-pricing", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  try {
    return Response.json({ rows: await listTariffPrices() });
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
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
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

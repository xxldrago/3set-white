// GET/PUT/PATCH /api/admin/pricing — ADM tariff settings (administrator-only BFF).
//
// GET returns the optional manual grid plus the per-device markups for all
// five offered terms. PUT replaces the grid atomically (each cell is a whole-RUB
// price or null to clear). PATCH updates ONE term's per-device markup — the
// primary pricing lever: retail = live ARTEMIDA quote + markup × devices.
//
// Every row/value is re-validated here — never trust the client even though it
// pre-validates. requireRole → 401/404; invalid body → 400.
import { z } from "zod";
import { requireRole } from "../../../../lib/admin-auth";
import {
  getAllMarkupsPerDevice,
  listTariffPrices,
  replaceTariffGrid,
  setMarkupPerDevice,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_AMOUNT,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
} from "../../../../lib/pricing";
import { MARKUP_PER_DEVICE_MAX } from "../../../../lib/tariff-grid";
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

const markupSchema = z.object({
  days: z.number().int().refine((v) => (TARIFF_DAYS as readonly number[]).includes(v)),
  value: z.number().int().min(0).max(MARKUP_PER_DEVICE_MAX),
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
    const [rows, markups] = await Promise.all([listTariffPrices(), getAllMarkupsPerDevice()]);
    return Response.json({ rows, markups });
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

/** PATCH — set the markup added per device for ONE offered term. */
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
    const value = await setMarkupPerDevice(parsed.data.days, parsed.data.value);
    return Response.json({ days: parsed.data.days, value });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("pricing:bad_request")) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    logger.error({ route: "admin-pricing", outcome: "markup_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

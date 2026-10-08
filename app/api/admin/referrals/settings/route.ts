// GET/PUT /api/admin/referrals/settings — global program rates
// (administrator-only). GET returns the effective settings (defaults when
// unset). PUT accepts a partial `{ inviterKind?, inviterValue?,
// inviteeValue?, minWithdraw? }`; unknown keys are ignored, negatives are
// clamped server-side.
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { getReferralSettings, setReferralSettings } from "../../../../../lib/referrals";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    inviterKind: z.enum(["percent", "fixed"]).optional(),
    inviterValue: z.number().min(0).max(1_000_000).optional(),
    inviteeValue: z.number().min(0).max(1_000_000).optional(),
    minWithdraw: z.number().min(0).max(100_000_000).optional(),
  })
  .strict();

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
    return (
      gateError(err) ??
      (() => {
        logger.error({ route: "admin-referrals", outcome: "session_error" });
        return Response.json({ error: "internal" }, { status: 500 });
      })()
    );
  }
  try {
    return Response.json({ settings: await getReferralSettings() });
  } catch {
    logger.error({ route: "admin-referrals", outcome: "settings_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    return (
      gateError(err) ??
      (() => {
        logger.error({ route: "admin-referrals", outcome: "session_error" });
        return Response.json({ error: "internal" }, { status: 500 });
      })()
    );
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
    const settings = await setReferralSettings(parsed.data);
    return Response.json({ settings });
  } catch {
    logger.error({ route: "admin-referrals", outcome: "save_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

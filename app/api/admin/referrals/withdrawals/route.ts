// GET /api/admin/referrals/withdrawals — payout queue (administrator-only).
// `?status=pending|approved|rejected|all` (default pending), newest first.
// POST { id, approve } — decide one request (idempotent: re-deciding a
// settled request returns its current status).
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { decideWithdrawal, listWithdrawals } from "../../../../../lib/referrals";
import { logger } from "../../../../../lib/logger";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
});

const decideSchema = z.object({
  id: z.string().min(1).max(64),
  approve: z.boolean(),
});

function gateError(err: unknown): Response | null {
  if (err instanceof SessionError) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (err instanceof AdminError) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    return (
      gateError(err) ??
      (() => {
        logger.error({ route: "admin-withdrawals", outcome: "session_error" });
        return Response.json({ error: "internal" }, { status: 500 });
      })()
    );
  }
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ status: url.searchParams.get("status") ?? undefined });
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    return Response.json({ withdrawals: await listWithdrawals(parsed.data.status) });
  } catch {
    logger.error({ route: "admin-withdrawals", outcome: "list_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    return (
      gateError(err) ??
      (() => {
        logger.error({ route: "admin-withdrawals", outcome: "session_error" });
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
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const row = await decideWithdrawal(parsed.data.id, parsed.data.approve);
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ withdrawal: row });
  } catch {
    logger.error({ route: "admin-withdrawals", outcome: "decide_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

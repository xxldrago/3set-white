// GET/POST /api/admin/promos — ADM promo management (administrator-only).
//
// GET returns all codes newest-first. POST creates one from
// `{ code, discount, type, maxUses?, expiresAt? }`; the code is uppercased,
// percentage is capped at 100 server-side. requireRole → 401/404;
// invalid body → 400; duplicate code → 409.
import { requireRole } from "../../../../lib/admin-auth";
import {
  createPromo,
  listPromos,
  promoInputSchema,
} from "../../../../lib/promo";
import { logger } from "../../../../lib/logger";
import { AdminError, SessionError } from "../../../../lib/session";

export const dynamic = "force-dynamic";

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
        logger.error({ route: "admin-promos", outcome: "session_error" });
        return Response.json({ error: "internal" }, { status: 500 });
      })()
    );
  }
  try {
    const rows = await listPromos();
    return Response.json({ promos: rows });
  } catch {
    logger.error({ route: "admin-promos", outcome: "list_error" });
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
        logger.error({ route: "admin-promos", outcome: "session_error" });
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
  const parsed = promoInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const row = await createPromo(parsed.data);
    return Response.json({ promo: row }, { status: 201 });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    ) {
      return Response.json({ error: "code_taken" }, { status: 409 });
    }
    if (err instanceof Error && err.message === "promo:bad_percentage") {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    logger.error({ route: "admin-promos", outcome: "create_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

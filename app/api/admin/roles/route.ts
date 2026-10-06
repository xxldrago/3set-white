// POST /api/admin/roles — administrator-only role change (ADM-01 / D-66).
//
// Copies the close-route skeleton (T-05-15): `requireRole('administrator')`,
// zod-validate `{ telegramId, role }`, map SessionError→401 / AdminError→404,
// else 500. The self-change block below is the first line of defence; the
// write itself (`changeAdminRole`) adds the last-admin guard and the
// conditional single-writer `Serializable` transaction (T-05-16). A rejected
// request carries a generic body identical to a missing route — no role/target
// oracle (D-51): `last_admin` and `not_found` both render as 404.
import { z } from "zod";
import { requireRole, type AdminRole } from "../../../../lib/admin-auth";
import { changeAdminRole } from "../../../../lib/admin-roles";
import { logger } from "../../../../lib/logger";
import { AdminError, SessionError } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  telegramId: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
  role: z.enum(["administrator", "support", "manager"]),
});

export async function POST(req: Request): Promise<Response> {
  let caller: { telegramId: number; role: AdminRole };
  try {
    caller = await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-roles", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const targetTelegramId = BigInt(String(parsed.data.telegramId));
  // Backend-enforced self-change block (not only the disabled UI control).
  if (targetTelegramId === BigInt(caller.telegramId)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const outcome = await changeAdminRole(targetTelegramId, parsed.data.role);
    if (outcome !== "ok") {
      // No oracle: an unknown target and a last-admin refusal are identical.
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, role: parsed.data.role });
  } catch {
    logger.error({ route: "admin-roles", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}


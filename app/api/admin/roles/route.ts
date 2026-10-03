// POST /api/admin/roles — administrator-only role change (ADM-01 / D-66).
//
// Copies the close-route skeleton (T-05-15): `requireRole('administrator')`,
// zod-validate `{ telegramId, role }`, map SessionError→401 / AdminError→404,
// else 500. Two backend guards the UI cannot be trusted to enforce:
//   1. Self-change is rejected server-side (an administrator can never edit
//      their own row) — the first line of defence against last-admin lockout.
//   2. The write is a conditional single-writer `updateMany`
//      (`where: { telegramId, role: currentRole }`): `count === 1` wins, a
//      missing/already-changed row is a no-op (never an unguarded `update()`).
// A rejected request carries a generic body identical to a missing route — no
// role/target oracle (D-51).
import { z } from "zod";
import { requireRole, type AdminRole } from "../../../../lib/admin-auth";
import { logger } from "../../../../lib/logger";
import { prisma } from "../../../../lib/prisma";
import { AdminError, SessionError } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  telegramId: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
  role: z.enum(["administrator", "support", "manager"]),
});

type ChangeResult = "ok" | "not_found";

/**
 * Apply one role change as a conditional single-writer transaction. Returns
 * `not_found` (never a leaked reason) when the target row does not exist or no
 * longer has the role the caller read — a concurrent writer already won.
 */
async function changeRole(targetTelegramId: bigint, role: AdminRole): Promise<ChangeResult> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.adminUser.findUnique({
      where: { telegramId: targetTelegramId },
      select: { role: true },
    });
    if (!target) return "not_found";

    const { count } = await tx.adminUser.updateMany({
      where: { telegramId: targetTelegramId, role: target.role },
      data: { role },
    });
    return count === 1 ? "ok" : "not_found";
  });
}

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
    const result = await changeRole(targetTelegramId, parsed.data.role);
    if (result === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, role: parsed.data.role });
  } catch {
    logger.error({ route: "admin-roles", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

// Administrator role-change writer (ADM-01 / D-66). Server-only write model —
// the read models live in `lib/admin-service.ts`.
//
// Two invariants the UI cannot be trusted to enforce (T-05-15/T-05-16):
//   1. A change may never remove the LAST administrator. The target's role is
//      re-read inside the transaction and, when it is being downgraded away
//      from `administrator`, the count of OTHER administrators must be ≥ 1.
//   2. The write is a conditional single-writer `updateMany`
//      (`where: { telegramId, role: <role read> }`): `count === 1` wins and a
//      vanished/already-changed row is a no-op — never an unguarded `update()`.
//
// The whole thing runs at `Serializable`: two concurrent downgrades (e.g. two
// administrators demoting each other) create a serialization conflict, so the
// loser aborts (Prisma P2034) and reports `not_found` rather than both
// succeeding. The self-change block lives in the route as the first line of
// defence.
import type { AdminRole } from "./admin-auth";
import { prisma } from "./prisma";

export type RoleChangeOutcome = "ok" | "not_found" | "last_admin";

/** Prisma's write-conflict / deadlock code (surfaced from PG 40001 / 40P01). */
function isWriteConflict(err: unknown): boolean {
  return (err as { code?: string }).code === "P2034";
}

export async function changeAdminRole(
  targetTelegramId: bigint,
  role: AdminRole,
): Promise<RoleChangeOutcome> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const target = await tx.adminUser.findUnique({
          where: { telegramId: targetTelegramId },
          select: { role: true },
        });
        if (!target) return "not_found";
        // No-op change still succeeds (idempotent).
        if (target.role === role) return "ok";

        if (target.role === "administrator") {
          const otherAdmins = await tx.adminUser.count({
            where: { role: "administrator", telegramId: { not: targetTelegramId } },
          });
          if (otherAdmins === 0) return "last_admin";
        }

        const { count } = await tx.adminUser.updateMany({
          where: { telegramId: targetTelegramId, role: target.role },
          data: { role },
        });
        return count === 1 ? "ok" : "not_found";
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (isWriteConflict(err)) return "not_found";
    throw err;
  }
}

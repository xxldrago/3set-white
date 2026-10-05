// Phase 5 role-aware data-access guard (D-64..D-67). Server-only.
//
// Roles live in the dedicated `admin_users` table (D-64); the server-only
// `ADMIN_TELEGRAM_IDS` env allow-list is a BOOTSTRAP seed only — it may create
// the first administrator row, never update an existing role (create-only,
// T-05-02 / Pitfall 4), so a UI downgrade survives a re-resolve and env
// membership cannot become a standing elevation source.
//
// `can(role, section)` is a pure literal matrix matching UI-SPEC §1 and is used
// to filter the admin nav server-side. Layouts are NOT a security boundary
// (Next.js partial rendering skips them): every `/admin` page and every
// `/api/admin` route must re-check `requireRole` (T-05-01 / Pitfall 3).
import { cache } from "react";
import { prisma } from "./prisma";
import { env } from "./env";
import { AdminError, requireSession } from "./session";

export type AdminRole = "administrator" | "support" | "manager";

export type AdminSection =
  | "overview"
  | "users"
  | "profileKeys"
  | "profilePayments"
  | "profileTickets"
  | "tickets"
  | "broadcast"
  | "roles";

/** UI-SPEC §1 role matrix — the single literal source of truth. */
const MATRIX: Record<AdminRole, readonly AdminSection[]> = {
  administrator: [
    "overview",
    "users",
    "profileKeys",
    "profilePayments",
    "profileTickets",
    "tickets",
    "broadcast",
    "roles",
  ],
  support: ["users", "profileKeys", "profileTickets", "tickets"],
  manager: ["overview", "users", "profilePayments"],
};

/** Pure section check — testable without a Next runtime. */
export function can(role: AdminRole, section: AdminSection): boolean {
  return MATRIX[role].includes(section);
}

function isBootstrapAdmin(telegramId: number): boolean {
  const raw = env.ADMIN_TELEGRAM_IDS;
  if (!raw) return false;
  return raw
    .split(",")
    .map((part) => Number(part.trim()))
    .some((id) => Number.isSafeInteger(id) && id === telegramId);
}

/**
 * Resolve the caller's staff role or null. `admin_users` (UI-managed) is the
 * source of truth (D-66); the env allow-list only seeds a missing row as
 * `administrator` (D-67). Wrapped in React `cache()` so a layout + page in one
 * render share a single DB read.
 */
export const getAdminRole = cache(async (telegramId: number): Promise<AdminRole | null> => {
  const existing = await prisma.adminUser.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { role: true },
  });
  if (existing) return existing.role;

  if (!isBootstrapAdmin(telegramId)) return null;

  const created = await prisma.adminUser.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: {}, // create-only — never re-elevate an existing row (T-05-02)
    create: { telegramId: BigInt(telegramId), role: "administrator" },
    select: { role: true },
  });
  return created.role;
});

/**
 * Resolve the caller and require one of `allowed`. Throws SessionError (→401)
 * when unauthenticated, and AdminError (→404, never 403 — no route/role
 * enumeration, D-51/T-05-03) when the caller has no role or the wrong one.
 */
export async function requireRole(
  ...allowed: AdminRole[]
): Promise<{ telegramId: number; role: AdminRole }> {
  const telegramId = await requireSession();
  const role = await getAdminRole(telegramId);
  if (!role || !allowed.includes(role)) throw new AdminError();
  return { telegramId, role };
}

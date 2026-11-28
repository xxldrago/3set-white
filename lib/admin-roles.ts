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
import type { AdminRole, AdminSection } from "./admin-auth";
import { isUniqueViolation, isWriteConflict } from "./prisma-errors";
import { prisma } from "./prisma";

export type RoleChangeOutcome = "ok" | "not_found" | "last_admin";

/**
 * Assign a role to a Telegram id with no staff row (the roles-page "all
 * users" flow). Creates the `admin_users` row; a concurrent assign wins via
 * P2002 and reports `ok` (the UI refreshes to the stored role). Never
 * touches the last-admin invariant — no administrator row is removed.
 */
export async function assignAdminRole(
  targetTelegramId: bigint,
  role: AdminRole,
): Promise<"ok"> {
  try {
    await prisma.adminUser.create({
      data: { telegramId: targetTelegramId, role },
    });
    return "ok";
  } catch (err: unknown) {
    if (isUniqueViolation(err)) return "ok";
    throw err;
  }
}

export type RoleRemovalOutcome = "ok" | "not_found" | "last_admin";

/**
 * Remove a staff role, returning the account to the implicit `client` role.
 * A missing `admin_users` row is already a client → `ok` (idempotent, so the
 * all-users table can submit "Клиент" for any customer). Keeps the same
 * last-admin invariant and Serializable single-writer discipline; the
 * conditional `deleteMany` means a concurrent change loses as `not_found`.
 */
export async function removeAdminRole(
  targetTelegramId: bigint,
): Promise<RoleRemovalOutcome> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const target = await tx.adminUser.findUnique({
          where: { telegramId: targetTelegramId },
          select: { role: true },
        });
        if (!target) return "ok";

        if (target.role === "administrator") {
          const otherAdmins = await tx.adminUser.count({
            where: { role: "administrator", telegramId: { not: targetTelegramId } },
          });
          if (otherAdmins === 0) return "last_admin";
        }

        const { count } = await tx.adminUser.deleteMany({
          where: { telegramId: targetTelegramId, role: target.role },
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

/** Дескриптор роли для справочника ролей (T4/T5). */
export interface RoleDescriptor {
  name: string;
  description: string;
  /** Максимум пользователей — null = без лимита. */
  maxUsers: number | null;
  /** Разделы (секции), доступные роли (тип `can()`). */
  features: readonly AdminSection[];
  /** Приоритет роли (чем выше — тем шире доступ; administrator = 10). */
  priority: number | null;
  isDefault: boolean;
  /** Глобальная роль (сотрудники) против роли только в кабинете (partner). */
  globalScope: boolean;
  /** Роль защищает домен (например, «оператор»). */
  protectsDomain: boolean;
  /** Необязательное примечание (как применяется в интерфейсе). */
  apply: string | null;
  hidden: boolean;
}

/** ROLE_MATRIX (T5): статический справочник ролей — источник правды для таблицы. */
export const ROLE_MATRIX: readonly RoleDescriptor[] = [
  {
    name: "administrator",
    description: "Полный доступ: все секции — обзор, аналитика, пользователи, баланс, промокоды, рефералы, роли; смена ролей и вывод на сервер.",
    maxUsers: null,
    features: [
      "overview",
      "analytics",
      "users",
      "profileKeys",
      "profilePayments",
      "profileTickets",
      "tickets",
      "broadcast",
      "pricing",
      "promos",
      "referrals",
      "roles",
      "segments",
      "alerts",
      "fraud",
      "providers",
      "wallet",
    ] as const,
    priority: 10,
    isDefault: false,
    globalScope: true,
    protectsDomain: true,
    apply: null,
    hidden: false,
  },
  {
    name: "manager",
    description: "Руководитель: обзор, аналитика, пользователи, платежи, сегменты — без настройки кошелька и смены ролей.",
    maxUsers: null,
    features: ["overview", "analytics", "users", "profilePayments", "segments"] as const,
    priority: 5,
    isDefault: false,
    globalScope: false,
    protectsDomain: false,
    apply: null,
    hidden: false,
  },
  {
    name: "support",
    description: "Сотрудник поддержки: пользователи, ключи, тикеты — читает, помогает участникам.",
    maxUsers: null,
    features: ["users", "profileKeys", "profileTickets", "tickets"] as const,
    priority: 5,
    isDefault: false,
    globalScope: false,
    protectsDomain: false,
    apply: null,
    hidden: false,
  },
  {
    name: "partner",
    description: "Партнёр: свой дашборд, рефералы, промокоды и заработок — без доступа к чужим данным.",
    maxUsers: null,
    features: ["partner", "partnerReferrals", "partnerPromos", "partnerPayouts"] as const,
    priority: 1,
    isDefault: false,
    globalScope: true,
    protectsDomain: false,
    apply: null,
    hidden: false,
  },
];

/**
 * Таблица ролей (T4/T5): ROLE_MATRIX + динамическое поле `users` — число
 * сотрудников с ролью в `admin_users`.
 */
export async function adminRolesTable(): Promise<Array<RoleDescriptor & { users: number }>> {
  const counts = await prisma.adminUser.groupBy({ by: ["role"], _count: { _all: true } });
  const byRole = new Map(counts.map((c) => [c.role, c._count._all]));
  return ROLE_MATRIX.map((d) => ({ ...d, users: byRole.get(d.name) ?? 0 }));
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

// Phase 5 admin read models (ADM-02). Server-only module discipline mirrors
// `lib/keys-service.ts` / `lib/orders-service.ts`: No Next imports, the `prisma`
// singleton, and typed literal shapes for the UI.
//
// Authorization is NOT performed here — the route/page resolves the caller's
// admin role via `lib/admin-auth.requireRole` FIRST. These reads are
// deliberately NOT owner-filtered: the admin's role is the authorization
// (unlike the cabinet's owner-joined reads). No caller telegram id is read here.
//
// PII minimum (T-05-05 / D-12): a search result carries ONLY
// `{ userId, telegramId, displayName, staffRole? }`; a profile key view carries
// only display fields. chatId, session tokens, provider ids, and subscription
// URLs are never selected into (or serialized from) an admin surface.
import type { AdminRole } from "./admin-auth";
import { deriveStatusKind, type StatusKind } from "./keys-service";
import { toHistoryRow, type OrderHistoryRow } from "./orders-service";
import { prisma } from "./prisma";
import type { TicketListRow } from "./tickets-service";

/** UI-SPEC §3: over this many matches, render the first 50 + a notice. */
export const ADMIN_SEARCH_LIMIT = 50;

/** The ONLY fields a search row exposes (PII minimum — T-05-05). */
export interface AdminSearchResult {
  userId: number;
  /** Serialized as a string: BigInt is not JSON-safe and the UI renders text. */
  telegramId: string;
  displayName: string | null;
  /** Present only when the matched user is a staff member (drives RoleChip). */
  staffRole?: AdminRole;
}

export interface AdminSearchResponse {
  rows: AdminSearchResult[];
  /** Total matched users BEFORE the 50-row cap (drives the ≥2 count header). */
  count: number;
  truncated: boolean;
}

/** Narrow, read-only key view for the admin profile — never a sub-link. */
export interface AdminKeyView {
  id: string;
  name: string | null;
  isTrial: boolean;
  statusKind: StatusKind;
  expiresAt: string | null;
  devices: number | null;
  deviceLimit: number | null;
}

export interface AdminProfileHeader {
  userId: number;
  telegramId: string;
  displayName: string | null;
  createdAt: Date;
  staffRole: AdminRole | null;
}

/** One independently-degrading profile sub-section (ok:false = read failed). */
export type ProfileSection<T> = { ok: true; rows: T[] } | { ok: false };

export interface AdminProfile {
  header: AdminProfileHeader;
  keys: ProfileSection<AdminKeyView>;
  payments: ProfileSection<OrderHistoryRow>;
  tickets: ProfileSection<TicketListRow>;
}

const USER_SELECT = {
  id: true,
  telegramId: true,
  firstName: true,
  lastName: true,
  username: true,
} as const;

type SelectedUser = {
  id: number;
  telegramId: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
};

/** Display name from our own PII-minimal fields; null when nothing is known. */
function displayNameOf(user: Pick<SelectedUser, "firstName" | "lastName" | "username">): string | null {
  const full = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (full.length > 0) return full;
  return user.username && user.username.trim().length > 0 ? user.username : null;
}

function toSearchResult(user: SelectedUser): AdminSearchResult {
  return {
    userId: user.id,
    telegramId: String(user.telegramId),
    displayName: displayNameOf(user),
  };
}

/** Parse a digits-only query as a telegram id without throwing on overflow. */
function parseTelegramId(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed >= BigInt(0) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * ADM-02 search. A fully-numeric `q` takes the exact telegram-id branch FIRST
 * (the match is ordered first), then both branches run a parameterised
 * `contains` on `keys_cache.key_id` / `customer_ref`. Results are de-duped by
 * user and capped at 50 with a truncation flag. Only the PII-minimal row shape
 * leaves this function (T-05-05).
 */
export async function adminSearchUsers(q: string): Promise<AdminSearchResponse> {
  const trimmed = q.trim();
  if (trimmed.length === 0) return { rows: [], count: 0, truncated: false };

  const results = new Map<number, AdminSearchResult>();

  if (/^\d+$/.test(trimmed)) {
    const telegramId = parseTelegramId(trimmed);
    if (telegramId !== null) {
      const exact = await prisma.user.findUnique({
        where: { telegramId },
        select: USER_SELECT,
      });
      if (exact) results.set(exact.id, toSearchResult(exact));
    }
  }

  const keyRows = await prisma.keyCache.findMany({
    where: {
      OR: [{ keyId: { contains: trimmed } }, { customerRef: { contains: trimmed } }],
    },
    select: { user: { select: USER_SELECT } },
    orderBy: { updatedAt: "desc" },
  });
  for (const row of keyRows) {
    if (!results.has(row.user.id)) results.set(row.user.id, toSearchResult(row.user));
  }

  if (results.size > 0) {
    const staff = await prisma.adminUser.findMany({
      where: {
        telegramId: { in: [...results.values()].map((result) => BigInt(result.telegramId)) },
      },
      select: { telegramId: true, role: true },
    });
    const roleByTelegramId = new Map(staff.map((row) => [String(row.telegramId), row.role]));
    for (const result of results.values()) {
      const role = roleByTelegramId.get(result.telegramId);
      if (role) result.staffRole = role;
    }
  }

  const all = [...results.values()];
  const count = all.length;
  const truncated = count > ADMIN_SEARCH_LIMIT;
  return {
    rows: truncated ? all.slice(0, ADMIN_SEARCH_LIMIT) : all,
    count,
    truncated,
  };
}

/** Profile header read; null ⇒ the id is unknown (the page maps this to 404). */
export async function loadAdminHeader(userId: number): Promise<AdminProfileHeader | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...USER_SELECT, createdAt: true },
  });
  if (!user) return null;

  const staff = await prisma.adminUser.findUnique({
    where: { telegramId: user.telegramId },
    select: { role: true },
  });

  return {
    userId: user.id,
    telegramId: String(user.telegramId),
    displayName: displayNameOf(user),
    createdAt: user.createdAt,
    staffRole: staff?.role ?? null,
  };
}

/** Read-only key list for one user (keys_cache), narrowed for the admin UI. */
export async function loadAdminKeys(userId: number): Promise<AdminKeyView[]> {
  const rows = await prisma.keyCache.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.keyId,
    name: row.name,
    isTrial: row.isTrial,
    statusKind: deriveStatusKind(row.status, row.expiresAt),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    devices: row.devices,
    deviceLimit: row.deviceLimit,
  }));
}

/**
 * Payment history for one user, mapped through the SAME `toHistoryRow` as the
 * cabinet — the provider-free shape is reused, never re-mapped (T-03-provider-leak).
 */
export async function loadAdminPayments(userId: number): Promise<OrderHistoryRow[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return orders.map(toHistoryRow);
}

/** Ticket list for one user (same preview shape as the cabinet queue). */
export async function loadAdminTickets(userId: number): Promise<TicketListRow[]> {
  const rows = await prisma.ticket.findMany({
    where: { userId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    status: row.status,
    unreadForUser: row.unreadForUser,
    lastMessageAt: row.lastMessageAt,
    preview: row.messages[0]?.body ?? null,
  }));
}

/** Run one section read, converting a failure into an `ok:false` marker. */
async function settle<T>(load: () => Promise<T[]>): Promise<ProfileSection<T>> {
  try {
    return { ok: true, rows: await load() };
  } catch {
    return { ok: false };
  }
}

/**
 * The three sections are read independently: a failure in one (e.g. the keys
 * read throwing) yields `{ok:false}` for that section only — the header and the
 * other two still resolve (UI-SPEC §4). Null ⇒ unknown user.
 */
export async function loadAdminProfile(userId: number): Promise<AdminProfile | null> {
  const header = await loadAdminHeader(userId);
  if (!header) return null;

  const [keys, payments, tickets] = await Promise.all([
    settle(() => loadAdminKeys(userId)),
    settle(() => loadAdminPayments(userId)),
    settle(() => loadAdminTickets(userId)),
  ]);

  return { header, keys, payments, tickets };
}

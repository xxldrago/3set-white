// Partner-scoped support inbox. A partner may read and answer ONLY tickets
// opened by accounts they referred directly (`users.referred_by_id`). The
// shared `/admin/tickets` queue stays staff-only, and every route re-checks
// this scope server-side — the pages are not a security boundary.
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma";

export type PartnerTicketFilter = "all" | "unread" | "open" | "answered" | "closed";

export const PARTNER_TICKET_FILTERS: readonly PartnerTicketFilter[] = [
  "all",
  "unread",
  "open",
  "answered",
  "closed",
] as const;

export interface PartnerTicketRow {
  id: string;
  subject: string;
  status: "open" | "answered" | "closed";
  unreadForAdmin: number;
  lastMessageAt: string;
  preview: string | null;
  messageCount: number;
  requester: {
    userId: number;
    displayName: string | null;
    email: string | null;
    username: string | null;
  };
}

export interface PartnerTicketStats {
  total: number;
  open: number;
  answered: number;
  closed: number;
  unread: number;
}

function displayNameOf(row: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string | null {
  const full = [row.firstName, row.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (full.length > 0) return full;
  return row.username && row.username.trim().length > 0 ? row.username : null;
}

function filterWhere(filter: PartnerTicketFilter): Prisma.TicketWhereInput {
  switch (filter) {
    case "unread":
      return { unreadForAdmin: { gt: 0 }, status: { not: "closed" } };
    case "open":
      return { status: "open" };
    case "answered":
      return { status: "answered" };
    case "closed":
      return { status: "closed" };
    case "all":
    default:
      return {};
  }
}

/** Resolve the signed-in partner's own `users` row id (never client input). */
export async function partnerUserIdForTelegram(
  telegramId: number,
): Promise<number | null> {
  const row = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** True only when the ticket belongs to a direct referral of this partner. */
export async function isPartnerTicket(
  partnerId: number,
  ticketId: string,
): Promise<boolean> {
  const row = await prisma.ticket.findFirst({
    where: { id: ticketId, user: { referredById: partnerId } },
    select: { id: true },
  });
  return row !== null;
}

/** Route-level guard: partner session + downline ownership of the ticket. */
export async function canPartnerAccessTicket(
  telegramId: number,
  ticketId: string,
): Promise<boolean> {
  const partnerId = await partnerUserIdForTelegram(telegramId);
  if (partnerId === null) return false;
  return isPartnerTicket(partnerId, ticketId);
}

/** Partner inbox: tickets of direct referrals only, newest activity first. */
export async function listPartnerTickets(
  partnerId: number,
  filter: PartnerTicketFilter = "all",
): Promise<{ rows: PartnerTicketRow[]; stats: PartnerTicketStats }> {
  const scope: Prisma.TicketWhereInput = { user: { referredById: partnerId } };
  const [total, open, answered, closed, unread, tickets] = await Promise.all([
    prisma.ticket.count({ where: scope }),
    prisma.ticket.count({ where: { ...scope, status: "open" } }),
    prisma.ticket.count({ where: { ...scope, status: "answered" } }),
    prisma.ticket.count({ where: { ...scope, status: "closed" } }),
    prisma.ticket.count({
      where: { ...scope, unreadForAdmin: { gt: 0 }, status: { not: "closed" } },
    }),
    prisma.ticket.findMany({
      where: { ...scope, ...filterWhere(filter) },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        subject: true,
        status: true,
        unreadForAdmin: true,
        lastMessageAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  return {
    rows: tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      unreadForAdmin: ticket.unreadForAdmin,
      lastMessageAt: ticket.lastMessageAt.toISOString(),
      preview: ticket.messages[0]?.body ?? null,
      messageCount: ticket._count.messages,
      requester: {
        userId: ticket.user.id,
        displayName: displayNameOf(ticket.user),
        email: ticket.user.email,
        username: ticket.user.username,
      },
    })),
    stats: { total, open, answered, closed, unread },
  };
}

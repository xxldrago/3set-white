// Tickets service — the SINGLE ticket read/write path shared by the bot and the
// BFF routes (SUP-01 "единая очередь"). Both channel heads call these
// functions, so there is no duplicated Prisma ticket logic and the two surfaces
// cannot diverge (Pitfall 4). Module discipline mirrors `lib/keys-service.ts`
// and `lib/orders-service.ts`: no Next imports, a `prisma` singleton import,
// and typed literal unions for the UI.
//
// Ownership is enforced INSIDE the service (T-04-01): a ticket the caller does
// not own is indistinguishable from a missing one — both return `null`. The
// caller-supplied ticket id is never trusted for authorization.
import { prisma } from "./prisma";

export type TicketStatus = "open" | "answered" | "closed";
export type TicketAuthor = "user" | "support";

/** The bot intake flag is valid for 30 minutes after `beginSupportPrompt`. */
const SUPPORT_PROMPT_TTL_MS = 30 * 60_000;

/**
 * A plain structural descriptor of an already-normalized attachment. Plan 04-02
 * owns `lib/attachments.ts` (sharp + volume); this module deliberately does NOT
 * import it because 04-01 and 04-02 land in parallel. `path` is RELATIVE to
 * UPLOAD_DIR only — never absolute (D-53/D-56).
 */
export interface AttachmentDescriptor {
  path: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export interface CreateTicketInput {
  telegramId: bigint;
  subject: string;
  body: string;
  attachment?: AttachmentDescriptor | null;
}

export type CreateTicketResult =
  | { kind: "created"; id: string }
  | { kind: "no_user" };

export interface TicketListRow {
  id: string;
  subject: string;
  status: TicketStatus;
  unreadForUser: number;
  lastMessageAt: Date;
  preview: string | null;
}

export interface TicketThreadMessage {
  id: string;
  author: TicketAuthor;
  body: string | null;
  createdAt: Date;
  attachments: Array<{
    id: string;
    mime: string;
    width: number | null;
    height: number | null;
    sizeBytes: number;
  }>;
}

export interface TicketThread {
  id: string;
  subject: string;
  status: TicketStatus;
  unreadForUser: number;
  messages: TicketThreadMessage[];
}

/**
 * Create a ticket and its first user message (+ optional attachment) in ONE
 * transaction. The owning `User` is resolved from `telegramId`; an unknown id
 * is a typed `no_user` no-op — a user is NEVER created here (identity is owned
 * by the login/bot path, T-04-04). Both the bot and the cabinet call this, so
 * every ticket lands in the single queue with identical fields.
 */
export async function createTicket(input: CreateTicketInput): Promise<CreateTicketResult> {
  const user = await prisma.user.findUnique({
    where: { telegramId: input.telegramId },
    select: { id: true },
  });
  if (!user) return { kind: "no_user" };

  const id = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        userId: user.id,
        subject: input.subject,
        status: "open",
        unreadForUser: 0,
      },
      select: { id: true },
    });

    const message = await tx.ticketMessage.create({
      data: { ticketId: ticket.id, author: "user", body: input.body },
      select: { id: true },
    });

    if (input.attachment) {
      await tx.attachment.create({
        data: { messageId: message.id, ...input.attachment },
      });
    }

    return ticket.id;
  });

  return { kind: "created", id };
}

/**
 * The caller's tickets, newest activity first (UI-SPEC §1). `preview` is the
 * newest message body, or `null` for an image-only last message.
 */
export async function listTicketsForUser(telegramId: bigint): Promise<TicketListRow[]> {
  const rows = await prisma.ticket.findMany({
    where: { user: { telegramId } },
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

/**
 * Ownership-joined thread read (T-04-01). The join
 * `where { id, user: { telegramId } }` means a ticket the caller does not own
 * returns `null` exactly like a missing one — no ownership oracle.
 */
export async function getTicketForUser(
  telegramId: bigint,
  ticketId: string,
): Promise<TicketThread | null> {
  const row = await prisma.ticket.findFirst({
    where: { id: ticketId, user: { telegramId } },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: {
            select: { id: true, mime: true, width: true, height: true, sizeBytes: true },
          },
        },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    unreadForUser: row.unreadForUser,
    messages: row.messages.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      createdAt: m.createdAt,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        mime: a.mime,
        width: a.width,
        height: a.height,
        sizeBytes: a.sizeBytes,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Bot intake state (consumed as-is by plan 04-07; it must not redefine these).
// The flag is persisted on the user row so it survives webhook/restart. The
// claim is single-winner (claim-before-create): a retried or concurrent update
// reads `awaitingSupport: false` and creates nothing.
// ---------------------------------------------------------------------------

/** Arm the support intake for 30 minutes. */
export async function beginSupportPrompt(telegramId: bigint): Promise<void> {
  await prisma.user.updateMany({
    where: { telegramId },
    data: { awaitingSupport: true, supportPromptAt: new Date() },
  });
}

/** True only when set and younger than the 30-minute TTL. */
export function isSupportPromptFresh(
  supportPromptAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!supportPromptAt) return false;
  return now.getTime() - supportPromptAt.getTime() < SUPPORT_PROMPT_TTL_MS;
}

/**
 * ATOMIC single-winner claim of the support intake — not a blind clear. The
 * conditional `updateMany` matches only an armed AND still-fresh row, so the
 * first caller wins (`count === 1` → `true`) and any retried/concurrent
 * duplicate sees `awaitingSupport: false` (`false`) and must not create a
 * ticket. This is the ONLY place `awaitingSupport` is set false.
 */
export async function clearSupportPrompt(
  telegramId: bigint,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      telegramId,
      awaitingSupport: true,
      supportPromptAt: { gte: new Date(now.getTime() - SUPPORT_PROMPT_TTL_MS) },
    },
    data: { awaitingSupport: false },
  });
  return count === 1;
}

// ---------------------------------------------------------------------------
// Lifecycle writers (D-50/D-58/D-59). The single-writer discipline from
// `transitionOrder` applies: a conditional `updateMany` makes a transition
// single-winner, and `unreadForUser` is touched ONLY in `addSupportMessage`
// (increment exactly once) and `markTicketRead` (clear) — never on enqueue or
// dispatch (Pitfall 6).
// ---------------------------------------------------------------------------

/**
 * Support reply on an existing ticket (admin/API path, D-51). In ONE
 * transaction: append the `support` message, move the ticket to `answered`,
 * bump `unreadForUser` EXACTLY once, and stamp `lastMessageAt`. Returns the
 * created message id (the caller enqueues the fan-out in plan 04-04) or `null`
 * when the ticket does not exist.
 */
export async function addSupportMessage(
  ticketId: string,
  body: string,
): Promise<{ id: string } | null> {
  const exists = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!exists) return null;

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: { ticketId, author: "support", body },
      select: { id: true },
    });
    await tx.ticket.updateMany({
      where: { id: ticketId },
      data: {
        status: "answered",
        unreadForUser: { increment: 1 },
        lastMessageAt: new Date(),
      },
    });
    return created;
  });

  return { id: message.id };
}

/**
 * User reply in a thread (D-59). Ownership join first: a non-owned ticket is
 * indistinguishable from missing → `null`. In ONE transaction: append the
 * `user` message (optional attachment), set `status: "open"` — a reply to an
 * answered/closed ticket REOPENS IT IN PLACE, never a new ticket — and stamp
 * `lastMessageAt`. Does NOT bump `unreadForUser`.
 */
export async function appendUserMessage(
  telegramId: bigint,
  ticketId: string,
  body: string,
  attachment?: AttachmentDescriptor | null,
): Promise<{ messageId: string } | null> {
  const owned = await prisma.ticket.findFirst({
    where: { id: ticketId, user: { telegramId } },
    select: { id: true },
  });
  if (!owned) return null;

  const messageId = await prisma.$transaction(async (tx) => {
    const message = await tx.ticketMessage.create({
      data: {
        ticketId,
        author: "user",
        body,
        ...(attachment ? { attachments: { create: { ...attachment } } } : {}),
      },
      select: { id: true },
    });
    await tx.ticket.updateMany({
      where: { id: ticketId },
      data: { status: "open", lastMessageAt: new Date() },
    });
    return message.id;
  });

  return { messageId };
}

/**
 * Ownership-joined mark-read (D-58): clear `unreadForUser` for the owner
 * only. `count === 1` is the winner; a non-owned ticket returns `false` (no
 * oracle).
 */
export async function markTicketRead(telegramId: bigint, ticketId: string): Promise<boolean> {
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, user: { telegramId } },
    data: { unreadForUser: 0 },
  });
  return count === 1;
}

/**
 * Conditional single-writer transition. When `from` is given the update is a
 * compare-and-set (`count === 1` wins); this is the shared primitive behind
 * `closeTicket` and mirrors `transitionOrder` (T-04-02).
 */
export async function transitionTicket(
  ticketId: string,
  to: TicketStatus,
  from?: TicketStatus,
): Promise<boolean> {
  const { count } = await prisma.ticket.updateMany({
    where: from ? { id: ticketId, status: from } : { id: ticketId },
    data: { status: to },
  });
  return count === 1;
}

/** Admin close (D-51). Returns `false` when the ticket does not exist. */
export async function closeTicket(ticketId: string): Promise<boolean> {
  return transitionTicket(ticketId, "closed");
}

/**
 * Owner-joined check for the home nav unread entry (plan 04-05): does the
 * caller have a ticket currently in `open` status?
 */
export async function hasOpenTicket(telegramId: bigint): Promise<boolean> {
  const count = await prisma.ticket.count({
    where: { user: { telegramId }, status: "open" },
  });
  return count > 0;
}

/**
 * Resolve one attachment for the gated serve route (D-56 / T-04-17). The
 * `attachmentId` is joined to the message and ticket so the pair must match;
 * ownership is enforced on the ticket unless the caller is an admin
 * (`isAdminUser` is computed by the route from the server-only allow-list).
 * A non-owned (or missing) attachment returns `null` exactly like a missing
 * one — no ownership oracle. Only the storage path + MIME are exposed.
 */
export async function getOwnedAttachment(
  telegramId: bigint,
  ticketId: string,
  attachmentId: string,
  isAdminUser = false,
): Promise<{ path: string; mime: string } | null> {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      message: isAdminUser
        ? { ticketId }
        : { ticketId, ticket: { user: { telegramId } } },
    },
    select: { path: true, mime: true },
  });
  return attachment ?? null;
}

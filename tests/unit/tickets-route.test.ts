// Ticket BFF route vectors (SUP-01/SUP-02/SUP-03): create/reply/read/serve and
// the admin reply/close routes. Every route is session-gated, zod-validates its
// inputs, joins ownership before acting (non-owned ≡ 404, no oracle), and never
// leaks a stored path or sends Telegram inline.
//
// Integration style: a real local Postgres (devices-route.test.ts pattern) with
// `next/headers` mocked so a signed session cookie can be presented without a
// Next runtime. `UPLOAD_DIR`/`ADMIN_TELEGRAM_IDS` are set in `vi.hoisted` so
// `lib/env.ts` (and the module-load-time `lib/attachments.ts` constant) see them
// before the route graph is imported.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OWNER = BigInt('200000090');
const OTHER = BigInt('200000091');
const ADMIN = BigInt('200000092');

const uploadDir = vi.hoisted(() => {
  const dir = `/tmp/tickets-route-test-${process.pid}`;
  process.env.UPLOAD_DIR = dir;
  process.env.ADMIN_TELEGRAM_IDS = '200000092';
  return dir;
});

const botMock = vi.hoisted(() => ({ telegram: { sendMessage: vi.fn() } }));
vi.mock('../../lib/bot', () => ({ bot: botMock }));

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { POST as createTicket } from '../../app/api/tickets/route';
import { GET as serveAttachment } from '../../app/api/tickets/[id]/attachments/[attachmentId]/route';
import { POST as replyTicket } from '../../app/api/tickets/[id]/messages/route';
import { POST as readTicket } from '../../app/api/tickets/[id]/read/route';
import { POST as adminReply } from '../../app/api/admin/tickets/[id]/reply/route';
import { POST as adminClose } from '../../app/api/admin/tickets/[id]/close/route';
import * as attachmentsModule from '../../lib/attachments';
import { MAX_ATTACHMENT_BYTES } from '../../lib/attachments';
import { signSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

async function authorize(telegramId: bigint): Promise<void> {
  session.token = await signSession(Number(telegramId), SECRET);
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** A real in-memory jpeg fixture. */
async function jpegBytes(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

function multipartRequest(fields: {
  subject?: string;
  body?: string;
  attachment?: File;
}): Request {
  const form = new FormData();
  if (fields.subject !== undefined) form.set('subject', fields.subject);
  if (fields.body !== undefined) form.set('body', fields.body);
  if (fields.attachment !== undefined) form.set('attachment', fields.attachment);
  return new Request('http://localhost/api/tickets', { method: 'POST', body: form });
}

function jsonRequest(payload: unknown): Request {
  return new Request('http://localhost/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function ownerUserId(): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { telegramId: OWNER },
    select: { id: true },
  });
  return user.id;
}

/** Seed one owner ticket in a given state, with one support message. */
async function seedTicket(
  status: 'open' | 'answered' | 'closed',
  unread = 0,
): Promise<string> {
  const ticket = await prisma.ticket.create({
    data: { userId: await ownerUserId(), subject: 'тема', status, unreadForUser: unread },
    select: { id: true },
  });
  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, author: 'support', body: 'Ответ поддержки' },
  });
  return ticket.id;
}

async function messageCount(ticketId: string): Promise<number> {
  return prisma.ticketMessage.count({ where: { ticketId } });
}

async function ticketNotificationCount(ticketId: string): Promise<number> {
  return prisma.notification.count({ where: { ticketId } });
}

/** Seed an owner ticket with a real stored WebP attachment on one message. */
async function seedAttachment(): Promise<{ ticketId: string; attachmentId: string }> {
  const ticketId = await seedTicket('open');
  const normalized = await attachmentsModule.normalizeImage(await jpegBytes());
  const rel = await attachmentsModule.saveAttachment(ticketId, normalized);
  const message = await prisma.ticketMessage.create({
    data: { ticketId, author: 'user', body: 'pic' },
    select: { id: true },
  });
  const attachment = await prisma.attachment.create({
    data: {
      messageId: message.id,
      path: rel,
      mime: normalized.mime,
      sizeBytes: normalized.sizeBytes,
      width: normalized.width,
      height: normalized.height,
    },
    select: { id: true },
  });
  return { ticketId, attachmentId: attachment.id };
}

function attachmentContext(id: string, attachmentId: string) {
  return { params: Promise.resolve({ id, attachmentId }) };
}

async function ownerTicketCount(): Promise<number> {
  return prisma.ticket.count({ where: { user: { telegramId: OWNER } } });
}

/** Delete tickets (cascade messages/attachments) + their notifications. */
async function clearTickets(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { telegramId: { in: [OWNER, OTHER, ADMIN] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;
  const tickets = await prisma.ticket.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const ticketIds = tickets.map((t) => t.id);
  if (ticketIds.length > 0) {
    await prisma.notification.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  }
}

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { telegramId: { in: [OWNER, OTHER, ADMIN] } } });
  await prisma.user.create({ data: { telegramId: OWNER }, select: { id: true } });
  await prisma.user.create({ data: { telegramId: OTHER }, select: { id: true } });
  await prisma.user.create({ data: { telegramId: ADMIN }, select: { id: true } });
});

afterAll(async () => {
  await clearTickets();
  await prisma.user.deleteMany({ where: { telegramId: { in: [OWNER, OTHER, ADMIN] } } });
  vi.restoreAllMocks();
  await rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  session.token = undefined;
  botMock.telegram.sendMessage.mockClear();
  await clearTickets();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/tickets (SUP-01/SUP-02)', () => {
  it('returns 401 without a session and writes no ticket', async () => {
    const res = await createTicket(
      multipartRequest({ subject: 'Не работает VPN', body: 'Помогите, пожалуйста' }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(await ownerTicketCount()).toBe(0);
  });

  it('rejects a missing or blank subject/body with 400', async () => {
    await authorize(OWNER);

    expect((await createTicket(multipartRequest({ body: 'ok' }))).status).toBe(400);
    expect((await createTicket(multipartRequest({ subject: 'ok' }))).status).toBe(400);
    expect(
      (await createTicket(multipartRequest({ subject: '   ', body: 'ok' }))).status,
    ).toBe(400);
    expect(
      (await createTicket(multipartRequest({ subject: 'ok', body: '   ' }))).status,
    ).toBe(400);
    expect(await ownerTicketCount()).toBe(0);
  });

  it('rejects an oversize attachment with 413 before writing', async () => {
    await authorize(OWNER);
    const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.jpg', {
      type: 'image/jpeg',
    });

    const res = await createTicket(
      multipartRequest({ subject: 'ok', body: 'ok', attachment: big }),
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large' });
    expect(await ownerTicketCount()).toBe(0);
  });

  it('rejects a non-image attachment with 400', async () => {
    await authorize(OWNER);
    const text = new File([new Uint8Array(Buffer.from('this is not an image'))], 'notes.txt', {
      type: 'text/plain',
    });

    const res = await createTicket(
      multipartRequest({ subject: 'ok', body: 'ok', attachment: text }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_type' });
    expect(await ownerTicketCount()).toBe(0);
  });

  it('creates an open ticket with one user message and one relative-path attachment', async () => {
    await authorize(OWNER);
    const file = new File([new Uint8Array(await jpegBytes())], 'screen.jpg', {
      type: 'image/jpeg',
    });

    const res = await createTicket(
      multipartRequest({ subject: 'Не работает VPN', body: 'Скриншот', attachment: file }),
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean; id: string };
    expect(json.ok).toBe(true);

    const ticket = await prisma.ticket.findFirst({
      where: { id: json.id },
      include: { messages: { include: { attachments: true } } },
    });
    expect(ticket?.status).toBe('open');
    expect(ticket?.unreadForUser).toBe(0);
    expect(ticket?.messages).toHaveLength(1);
    const atts = ticket?.messages[0]?.attachments ?? [];
    expect(atts).toHaveLength(1);
    expect(path.isAbsolute(atts[0]!.path)).toBe(false);
    expect(atts[0]!.path.startsWith('..')).toBe(false);
    expect(atts[0]!.mime).toBe('image/webp');
    expect(atts[0]!.sizeBytes).toBeGreaterThan(0);
  });
});

describe('POST /api/tickets/[id]/messages + /read (SUP-01/D-58/D-59)', () => {
  it('rejects a malformed id with 400', async () => {
    await authorize(OWNER);
    expect((await replyTicket(jsonRequest({ body: 'x' }), idContext(''))).status).toBe(400);
    expect((await readTicket(jsonRequest({}), idContext(''))).status).toBe(400);
  });

  it('reopens the SAME thread on an owner reply to a closed ticket (no second ticket)', async () => {
    await authorize(OWNER);
    const id = await seedTicket('closed');

    const res = await replyTicket(jsonRequest({ body: 'Ещё вопрос' }), idContext(id));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; messageId: string };
    expect(json.ok).toBe(true);

    expect(await ownerTicketCount()).toBe(1);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(ticket.status).toBe('open');
    expect(await messageCount(id)).toBe(2);
  });

  it('appends an image-only reply through the shared attachment pipeline', async () => {
    await authorize(OWNER);
    const id = await seedTicket('answered');
    const file = new File([new Uint8Array(await jpegBytes())], 'shot.png', {
      type: 'image/png',
    });
    const form = new FormData();
    form.set('attachment', file);

    const res = await replyTicket(
      new Request('http://localhost/api/tickets', { method: 'POST', body: form }),
      idContext(id),
    );

    expect(res.status).toBe(200);
    expect(await messageCount(id)).toBe(2);
    const latest = await prisma.ticketMessage.findFirst({
      where: { ticketId: id },
      orderBy: { createdAt: 'desc' },
      include: { attachments: true },
    });
    expect(latest?.attachments).toHaveLength(1);
    expect(path.isAbsolute(latest!.attachments[0]!.path)).toBe(false);
  });

  it('returns 404 for a non-owner reply and appends nothing', async () => {
    await authorize(OTHER);
    const id = await seedTicket('open');

    const res = await replyTicket(jsonRequest({ body: 'не моё' }), idContext(id));

    expect(res.status).toBe(404);
    expect(await messageCount(id)).toBe(1);
  });

  it('clears unreadForUser for the owner (200)', async () => {
    await authorize(OWNER);
    const id = await seedTicket('answered', 3);

    const res = await readTicket(jsonRequest({}), idContext(id));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).unreadForUser).toBe(0);
  });

  it('returns 404 for a non-owner mark-read', async () => {
    await authorize(OTHER);
    const id = await seedTicket('answered', 3);

    const res = await readTicket(jsonRequest({}), idContext(id));

    expect(res.status).toBe(404);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).unreadForUser).toBe(3);
  });
});

describe('GET /api/tickets/[id]/attachments/[attachmentId] (D-56)', () => {
  const fileRequest = () => new Request('http://localhost/api/tickets');

  it('returns 401 without a session and never reads the file', async () => {
    const { ticketId, attachmentId } = await seedAttachment();
    const read = vi.spyOn(attachmentsModule, 'readAttachment');

    const res = await serveAttachment(fileRequest(), attachmentContext(ticketId, attachmentId));

    expect(res.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it('404s a non-owner without reading the file (no oracle)', async () => {
    await authorize(OTHER);
    const { ticketId, attachmentId } = await seedAttachment();
    const read = vi.spyOn(attachmentsModule, 'readAttachment');

    const res = await serveAttachment(fileRequest(), attachmentContext(ticketId, attachmentId));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(read).not.toHaveBeenCalled();
  });

  it('serves the owner 200 with nosniff + private cache and no stored path', async () => {
    await authorize(OWNER);
    const { ticketId, attachmentId } = await seedAttachment();

    const res = await serveAttachment(fileRequest(), attachmentContext(ticketId, attachmentId));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(res.headers.get('content-type')).toBe('image/webp');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    // The stored relative path must never appear in any response header.
    expect([...res.headers.values()].join(' ')).not.toContain('/tmp/');
  });

  it('serves an allow-listed admin a ticket they do not own (200)', async () => {
    await authorize(ADMIN);
    const { ticketId, attachmentId } = await seedAttachment();

    const res = await serveAttachment(fileRequest(), attachmentContext(ticketId, attachmentId));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects malformed ids with 400', async () => {
    await authorize(OWNER);
    const { ticketId, attachmentId } = await seedAttachment();

    expect((await serveAttachment(fileRequest(), attachmentContext('', attachmentId))).status).toBe(
      400,
    );
    expect((await serveAttachment(fileRequest(), attachmentContext(ticketId, ''))).status).toBe(
      400,
    );
  });
});

describe('admin ticket routes (D-51/D-57)', () => {
  it('returns 401 without a session', async () => {
    const id = await seedTicket('open');
    expect((await adminReply(jsonRequest({ body: 'x' }), idContext(id))).status).toBe(401);
    expect((await adminClose(jsonRequest({}), idContext(id))).status).toBe(401);
  });

  it('404s a valid non-admin session and mutates nothing', async () => {
    await authorize(OWNER);
    const id = await seedTicket('open');

    const replyRes = await adminReply(jsonRequest({ body: 'ответ' }), idContext(id));
    expect(replyRes.status).toBe(404);
    expect(await messageCount(id)).toBe(1);
    expect(await ticketNotificationCount(id)).toBe(0);

    const closeRes = await adminClose(jsonRequest({}), idContext(id));
    expect(closeRes.status).toBe(404);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('open');
  });

  it('admin reply creates one support message, bumps unread, and enqueues (no inline send)', async () => {
    await authorize(ADMIN);
    const id = await seedTicket('open');

    const res = await adminReply(jsonRequest({ body: 'Мы вам ответили' }), idContext(id));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(ticket.status).toBe('answered');
    expect(ticket.unreadForUser).toBe(1);
    expect(await messageCount(id)).toBe(2);

    const notifications = await prisma.notification.findMany({ where: { ticketId: id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe('notify-ticket-reply');
    expect(notifications[0]!.dedupeKey.startsWith(`ticket:${id}:`)).toBe(true);
    // D-57: the handler must never send Telegram inline.
    expect(botMock.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('a second distinct admin reply enqueues a second distinct notification', async () => {
    await authorize(ADMIN);
    const id = await seedTicket('open');

    expect((await adminReply(jsonRequest({ body: 'Первый' }), idContext(id))).status).toBe(200);
    expect((await adminReply(jsonRequest({ body: 'Второй' }), idContext(id))).status).toBe(200);

    const notifications = await prisma.notification.findMany({ where: { ticketId: id } });
    expect(notifications).toHaveLength(2);
    expect(new Set(notifications.map((n) => n.dedupeKey)).size).toBe(2);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).unreadForUser).toBe(2);
  });

  it('admin close marks the ticket closed; missing ticket 404s', async () => {
    await authorize(ADMIN);
    const id = await seedTicket('open');

    const res = await adminClose(jsonRequest({}), idContext(id));
    expect(res.status).toBe(200);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('closed');

    expect((await adminClose(jsonRequest({}), idContext('missing-ticket'))).status).toBe(404);
  });
});




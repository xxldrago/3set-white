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

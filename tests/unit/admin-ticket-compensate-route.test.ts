// POST /api/admin/tickets/[id]/compensate — role gate, idempotency and caps.
//
// Same signed-cookie harness as the read-route suite. Verifies the money-ish
// invariants: one grant per requestId, the per-ticket cap holds, the requester's
// bonus balance is credited exactly once, and a valid session without a support
// role is 404 (never 403).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.hoisted(() => {
  process.env.ADMIN_TELEGRAM_IDS = '910000401';
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { POST as compensate } from '../../app/api/admin/tickets/[id]/compensate/route';
import { signSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import { COMPENSATION_MAX_PER_TICKET } from '../../lib/ticket-compensation-reasons';

const ADMIN = 910000401;
const SUPPORT = 910000402;
const MANAGER = 910000403;
const OWNER = 910000404;
const IDS = [ADMIN, SUPPORT, MANAGER, OWNER].map((id) => BigInt(id));
const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

let ticketId = '';
let ownerId = 0;

async function authorize(telegramId: number): Promise<void> {
  session.token = await signSession(telegramId, SECRET);
}

async function cleanup(): Promise<void> {
  const stale = await prisma.ticket.findMany({
    where: { subject: { startsWith: 'COMP-ROUTE' } },
    select: { id: true },
  });
  const staleIds = stale.map((ticket) => ticket.id);
  await prisma.notification.deleteMany({ where: { ticketId: { in: staleIds } } });
  await prisma.ticketCompensation.deleteMany({ where: { ticketId: { in: staleIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: staleIds } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: IDS } } });
  await prisma.adminUser.deleteMany({ where: { telegramId: { in: IDS } } });
}

function body(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/admin/tickets/compensate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      days: 7,
      reason: 'goodwill',
      comment: 'sorry',
      requestId: crypto.randomUUID(),
      ...overrides,
    }),
  });
}

function call(id: string, req: Request = body()): Promise<Response> {
  return compensate(req, { params: Promise.resolve({ id }) });
}

async function balance(): Promise<number> {
  const row = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { bonusDays: true },
  });
  return row?.bonusDays ?? -1;
}

describe('POST /api/admin/tickets/[id]/compensate', () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.adminUser.createMany({
      data: [
        { telegramId: BigInt(ADMIN), role: 'administrator' },
        { telegramId: BigInt(SUPPORT), role: 'support' },
        { telegramId: BigInt(MANAGER), role: 'manager' },
      ],
    });
    const owner = await prisma.user.create({
      data: { telegramId: BigInt(OWNER) },
      select: { id: true },
    });
    ownerId = owner.id;
    const ticket = await prisma.ticket.create({
      data: {
        userId: owner.id,
        subject: 'COMP-ROUTE ticket',
        unreadForAdmin: 2,
        messages: { create: [{ author: 'user', body: 'vpn down' }] },
      },
      select: { id: true },
    });
    ticketId = ticket.id;
  });

  beforeEach(async () => {
    session.token = undefined;
    await prisma.ticketCompensation.deleteMany({ where: { ticketId } });
    await prisma.notification.deleteMany({ where: { ticketId } });
    await prisma.ticketMessage.deleteMany({ where: { ticketId, author: 'support' } });
    await prisma.user.update({ where: { id: ownerId }, data: { bonusDays: 0 } });
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'open', unreadForAdmin: 2, unreadForUser: 0 },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a signed-out caller with 401 and grants nothing', async () => {
    expect((await call(ticketId)).status).toBe(401);
    expect(await balance()).toBe(0);
  });

  it('returns 404 for a missing staff row and a non-support role (never 403)', async () => {
    await authorize(OWNER);
    expect((await call(ticketId)).status).toBe(404);

    await authorize(MANAGER);
    expect((await call(ticketId)).status).toBe(404);
    expect(await balance()).toBe(0);
  });

  it('rejects malformed payloads with 400', async () => {
    await authorize(ADMIN);
    for (const overrides of [
      { days: 0 },
      { days: 31 },
      { days: 7.5 },
      { reason: 'because' },
      { requestId: 'not-a-uuid' },
      { comment: 'x'.repeat(501) },
    ]) {
      expect((await call(ticketId, body(overrides))).status).toBe(400);
    }
    expect(await balance()).toBe(0);
  });

  it('returns 404 for an unknown ticket without crediting the caller', async () => {
    await authorize(ADMIN);
    expect((await call('does-not-exist')).status).toBe(404);
    expect(await balance()).toBe(0);
  });

  it('credits bonus days, appends a support message and answers the ticket', async () => {
    await authorize(SUPPORT);
    const response = await call(ticketId);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true, days: 7, bonusDays: 7, duplicate: false });

    expect(await balance()).toBe(7);
    const grants = await prisma.ticketCompensation.count({ where: { ticketId } });
    expect(grants).toBe(1);

    const message = await prisma.ticketMessage.findFirst({
      where: { ticketId, author: 'support' },
      orderBy: { createdAt: 'desc' },
    });
    expect(message?.body).toContain('7');

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true, unreadForAdmin: true, unreadForUser: true },
    });
    expect(ticket?.status).toBe('answered');
    expect(ticket?.unreadForAdmin).toBe(0);
    expect(ticket?.unreadForUser).toBe(1);

    const notification = await prisma.notification.findFirst({
      where: { ticketId, type: 'notify-ticket-reply' },
    });
    expect(notification).not.toBeNull();
  });

  it('is idempotent: the same requestId grants once and reports duplicate', async () => {
    await authorize(ADMIN);
    const requestId = crypto.randomUUID();
    const first = await call(ticketId, body({ requestId, days: 3 }));
    expect(first.status).toBe(200);
    expect((await first.json()).duplicate).toBe(false);

    const second = await call(ticketId, body({ requestId, days: 3 }));
    expect(second.status).toBe(200);
    const payload = await second.json();
    expect(payload).toMatchObject({ ok: true, days: 3, duplicate: true });

    expect(await balance()).toBe(3);
    expect(await prisma.ticketCompensation.count({ where: { ticketId } })).toBe(1);
    expect(
      await prisma.ticketMessage.count({ where: { ticketId, author: 'support' } }),
    ).toBe(1);
  });

  it('rejects a requestId already used on another ticket with 409', async () => {
    await authorize(ADMIN);
    const requestId = crypto.randomUUID();
    const other = await prisma.ticket.create({
      data: { userId: ownerId, subject: 'COMP-ROUTE other' },
      select: { id: true },
    });
    expect((await call(other.id, body({ requestId }))).status).toBe(200);
    expect((await call(ticketId, body({ requestId }))).status).toBe(409);
    expect(
      await prisma.ticketCompensation.count({ where: { ticket: { id: other.id } } }),
    ).toBe(1);
  });

  it('enforces the per-ticket cap', async () => {
    await authorize(ADMIN);
    await prisma.ticketCompensation.create({
      data: {
        ticketId,
        adminTelegramId: BigInt(ADMIN),
        days: COMPENSATION_MAX_PER_TICKET - 5,
        reason: 'outage',
        requestId: crypto.randomUUID(),
        messageId: 'seed',
      },
    });

    const response = await call(ticketId, body({ days: 10 }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('limit');
    expect(await prisma.ticketCompensation.count({ where: { ticketId } })).toBe(1);

    const allowed = await call(ticketId, body({ days: 5 }));
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).bonusDays).toBe(5);
  });
});

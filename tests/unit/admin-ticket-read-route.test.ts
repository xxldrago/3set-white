// POST /api/admin/tickets/[id]/read — role gate + counter clearing.
//
// Mirrors the admin-route suite's signed-cookie harness: signed-out → 401,
// no staff row / wrong role → 404 (never 403), administrator + support → 200,
// and only `unreadForAdmin` is cleared.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.hoisted(() => {
  process.env.ADMIN_TELEGRAM_IDS = '910000301';
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { POST as markRead } from '../../app/api/admin/tickets/[id]/read/route';
import { signSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

const ADMIN = 910000301;
const SUPPORT = 910000302;
const MANAGER = 910000303;
const OWNER = 910000304;
const IDS = [ADMIN, SUPPORT, MANAGER, OWNER].map((id) => BigInt(id));
const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

let ticketId = '';

async function authorize(telegramId: number): Promise<void> {
  session.token = await signSession(telegramId, SECRET);
}

async function cleanup(): Promise<void> {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: 'READ-ROUTE' } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: IDS } } });
  await prisma.adminUser.deleteMany({ where: { telegramId: { in: IDS } } });
}

function call(id: string): Promise<Response> {
  return markRead(new Request('http://localhost/api/admin/tickets/read'), {
    params: Promise.resolve({ id }),
  });
}

async function unread(): Promise<number> {
  const row = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { unreadForAdmin: true },
  });
  return row?.unreadForAdmin ?? -1;
}

describe('POST /api/admin/tickets/[id]/read', () => {
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
    const ticket = await prisma.ticket.create({
      data: {
        userId: owner.id,
        subject: 'READ-ROUTE ticket',
        unreadForAdmin: 3,
        messages: { create: [{ author: 'user', body: 'hello' }] },
      },
      select: { id: true },
    });
    ticketId = ticket.id;
  });

  beforeEach(async () => {
    session.token = undefined;
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { unreadForAdmin: 3 },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a signed-out caller with 401', async () => {
    expect((await call(ticketId)).status).toBe(401);
    expect(await unread()).toBe(3);
  });

  it('returns 404 for a missing staff row and a non-ticket role (never 403)', async () => {
    await authorize(OWNER);
    expect((await call(ticketId)).status).toBe(404);

    await authorize(MANAGER);
    expect((await call(ticketId)).status).toBe(404);
    expect(await unread()).toBe(3);
  });

  it('clears unreadForAdmin for administrator and support', async () => {
    await authorize(ADMIN);
    expect((await call(ticketId)).status).toBe(200);
    expect(await unread()).toBe(0);

    await prisma.ticket.update({ where: { id: ticketId }, data: { unreadForAdmin: 1 } });
    await authorize(SUPPORT);
    expect((await call(ticketId)).status).toBe(200);
    expect(await unread()).toBe(0);
  });

  it('returns 404 for an unknown ticket id', async () => {
    await authorize(ADMIN);
    expect((await call('does-not-exist')).status).toBe(404);
  });
});

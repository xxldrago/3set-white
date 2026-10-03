// Tickets-service vectors: one shared create/read path (SUP-01 "единая
// очередь"), the ownership join (T-04-01 IDOR — non-owned ≡ missing), and the
// bot intake single-winner claim (T-04-28). Runs against the real local
// Postgres with the keys-service.test.ts cleanup / beforeAll pattern.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  beginSupportPrompt,
  clearSupportPrompt,
  createTicket,
  getTicketForUser,
  isSupportPromptFresh,
  listTicketsForUser,
} from '../../lib/tickets-service';
import { prisma } from '../../lib/prisma';

const TELEGRAM_ID = BigInt('200000042');
const OTHER_TELEGRAM_ID = BigInt('200000043');
const UNKNOWN_TELEGRAM_ID = BigInt('299999999');
const MINUTE = 60_000;

async function cleanupUser(telegramId: bigint): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true },
  });
  if (user) await prisma.ticket.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { telegramId } });
}

async function cleanup(): Promise<void> {
  await cleanupUser(TELEGRAM_ID);
  await cleanupUser(OTHER_TELEGRAM_ID);
}

describe('tickets-service — create/read path + ownership + prompt claim', () => {
  let userId: number;
  let otherUserId: number;

  beforeAll(async () => {
    await cleanup();
    const [user, other] = await Promise.all([
      prisma.user.create({ data: { telegramId: TELEGRAM_ID }, select: { id: true } }),
      prisma.user.create({ data: { telegramId: OTHER_TELEGRAM_ID }, select: { id: true } }),
    ]);
    userId = user.id;
    otherUserId = other.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('creates an open ticket with its first user message via one path', async () => {
    await prisma.ticket.deleteMany({ where: { userId } });

    const created = await createTicket({
      telegramId: TELEGRAM_ID,
      subject: 'Нет доступа',
      body: 'VPN не работает',
    });
    expect(created.kind).toBe('created');
    const id = created.kind === 'created' ? created.id : '';

    const stored = await prisma.ticket.findUnique({ where: { id } });
    expect(stored?.status).toBe('open');
    expect(stored?.unreadForUser).toBe(0);
    expect(stored?.userId).toBe(userId);

    const thread = await getTicketForUser(TELEGRAM_ID, id);
    expect(thread?.id).toBe(id);
    expect(thread?.status).toBe('open');
    expect(thread?.messages).toHaveLength(1);
    expect(thread?.messages[0]?.author).toBe('user');
    expect(thread?.messages[0]?.body).toBe('VPN не работает');
    expect(thread?.messages[0]?.attachments).toEqual([]);
  });

  it('persists an attachment descriptor with the first message', async () => {
    await prisma.ticket.deleteMany({ where: { userId } });

    const created = await createTicket({
      telegramId: TELEGRAM_ID,
      subject: 'Скриншот',
      body: 'см. во вложении',
      attachment: {
        path: 'tickets/shot.webp',
        mime: 'image/webp',
        sizeBytes: 1234,
        width: 100,
        height: 50,
      },
    });
    const id = created.kind === 'created' ? created.id : '';

    const thread = await getTicketForUser(TELEGRAM_ID, id);
    expect(thread?.messages[0]?.attachments).toEqual([
      { id: expect.any(String), mime: 'image/webp', width: 100, height: 50, sizeBytes: 1234 },
    ]);
  });

  it('lists the caller tickets newest-activity-first with a preview', async () => {
    await prisma.ticket.deleteMany({ where: { userId } });

    const older = await createTicket({ telegramId: TELEGRAM_ID, subject: 'A', body: 'первое' });
    const olderId = older.kind === 'created' ? older.id : '';
    await prisma.ticket.update({
      where: { id: olderId },
      data: { lastMessageAt: new Date(Date.now() - MINUTE) },
    });

    const newer = await createTicket({ telegramId: TELEGRAM_ID, subject: 'B', body: 'второе' });
    const newerId = newer.kind === 'created' ? newer.id : '';

    const rows = await listTicketsForUser(TELEGRAM_ID);
    expect(rows.map((r) => r.id)).toEqual([newerId, olderId]);
    expect(rows[0]?.preview).toBe('второе');
  });

  it('returns null for a non-owner: no ownership oracle', async () => {
    await prisma.ticket.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });

    const created = await createTicket({ telegramId: TELEGRAM_ID, subject: 'S', body: 'B' });
    const id = created.kind === 'created' ? created.id : '';

    expect(await getTicketForUser(OTHER_TELEGRAM_ID, id)).toBeNull();
    expect(await listTicketsForUser(OTHER_TELEGRAM_ID)).toHaveLength(0);
  });

  it('returns no_user for an unknown telegram id and writes nothing', async () => {
    const before = await prisma.ticket.count();
    const result = await createTicket({
      telegramId: UNKNOWN_TELEGRAM_ID,
      subject: 'S',
      body: 'B',
    });
    expect(result).toEqual({ kind: 'no_user' });
    expect(await prisma.ticket.count()).toBe(before);
  });

  it('isSupportPromptFresh: 29min fresh, 31min stale, null false', () => {
    const now = new Date();
    expect(isSupportPromptFresh(new Date(now.getTime() - 29 * MINUTE), now)).toBe(true);
    expect(isSupportPromptFresh(new Date(now.getTime() - 31 * MINUTE), now)).toBe(false);
    expect(isSupportPromptFresh(null, now)).toBe(false);
  });

  it('clearSupportPrompt is a single-winner claim (no double-create)', async () => {
    await prisma.user.update({
      where: { telegramId: TELEGRAM_ID },
      data: { awaitingSupport: false, supportPromptAt: null },
    });

    await beginSupportPrompt(TELEGRAM_ID);
    const armed = await prisma.user.findUnique({
      where: { telegramId: TELEGRAM_ID },
      select: { awaitingSupport: true },
    });
    expect(armed?.awaitingSupport).toBe(true);

    // First claim wins and flips the flag.
    expect(await clearSupportPrompt(TELEGRAM_ID)).toBe(true);
    const after = await prisma.user.findUnique({
      where: { telegramId: TELEGRAM_ID },
      select: { awaitingSupport: true },
    });
    expect(after?.awaitingSupport).toBe(false);

    // Immediate second claim loses — a retried update cannot create again.
    expect(await clearSupportPrompt(TELEGRAM_ID)).toBe(false);
  });

  it('clearSupportPrompt refuses a stale (>30min) flag', async () => {
    await prisma.user.update({
      where: { telegramId: TELEGRAM_ID },
      data: { awaitingSupport: true, supportPromptAt: new Date(Date.now() - 31 * MINUTE) },
    });
    expect(await clearSupportPrompt(TELEGRAM_ID)).toBe(false);
  });
});

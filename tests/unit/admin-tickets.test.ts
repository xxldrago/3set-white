// Admin inbox read model (Inbox 2.0): status/unread filters, free-text search
// across subject/message/requester identity, offset pagination and the nav
// unread count. Runs against the real local Postgres with an isolated id range
// and a shared subject prefix so assertions never see other suites' tickets.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAdminUnreadTicketCount, loadAllTickets } from '../../lib/admin-service';
import { prisma } from '../../lib/prisma';

const TG_A = BigInt('200000191');
const TG_B = BigInt('200000192');
const TG_C = BigInt('200000193');
const PREFIX = 'INBOX-TEST';

let baselineUnread = 0;

async function cleanup(): Promise<void> {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({
    where: { telegramId: { in: [TG_A, TG_B, TG_C] } },
  });
}

describe('admin inbox — filters, search, pagination', () => {
  beforeAll(async () => {
    await cleanup();
    baselineUnread = await loadAdminUnreadTicketCount();

    const [alice, bob, charlie] = await Promise.all([
      prisma.user.create({
        data: {
          telegramId: TG_A,
          email: 'inbox-alice@example.test',
          username: 'inboxalice',
          firstName: 'Alice',
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          telegramId: TG_B,
          email: 'inbox-bob@example.test',
          username: 'inboxbob',
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          telegramId: TG_C,
          firstName: 'Charlie',
          lastName: 'Inbox',
        },
        select: { id: true },
      }),
    ]);
    await Promise.all([
      prisma.ticket.create({
        data: {
          userId: alice.id,
          subject: `${PREFIX} open`,
          status: 'open',
          unreadForAdmin: 2,
          lastMessageAt: new Date('2026-01-04T00:00:00Z'),
          messages: {
            create: [{ author: 'user', body: `${PREFIX} first question` }],
          },
        },
      }),
      prisma.ticket.create({
        data: {
          userId: alice.id,
          subject: `${PREFIX} answered`,
          status: 'answered',
          unreadForAdmin: 0,
          lastMessageAt: new Date('2026-01-03T00:00:00Z'),
          messages: {
            create: [{ author: 'user', body: `${PREFIX} already handled` }],
          },
        },
      }),
      prisma.ticket.create({
        data: {
          userId: bob.id,
          subject: `${PREFIX} closed`,
          status: 'closed',
          // Even a legacy closed row with a stale counter must not surface as
          // unread — both the filter and the nav count exclude closed threads.
          unreadForAdmin: 5,
          lastMessageAt: new Date('2026-01-02T00:00:00Z'),
          messages: {
            create: [{ author: 'user', body: `${PREFIX} resolved` }],
          },
        },
      }),
      prisma.ticket.create({
        data: {
          userId: charlie.id,
          subject: `${PREFIX} other`,
          status: 'open',
          unreadForAdmin: 1,
          lastMessageAt: new Date('2026-01-01T00:00:00Z'),
          messages: {
            create: [{ author: 'user', body: 'a very special needle' }],
          },
        },
      }),
    ]);
  });

  afterAll(async () => {
    await cleanup();
  });

  it('filters by status and by unseen support work', async () => {
    const base = { q: PREFIX, page: 1, pageSize: 20 };
    const all = await loadAllTickets(base);
    expect(all.total).toBe(4);
    expect(all.rows[0]?.requester?.email).toBe('inbox-alice@example.test');
    expect(all.rows[0]?.unreadForAdmin).toBe(2);

    expect((await loadAllTickets({ ...base, filter: 'open' })).total).toBe(2);
    expect((await loadAllTickets({ ...base, filter: 'answered' })).total).toBe(1);
    expect((await loadAllTickets({ ...base, filter: 'closed' })).total).toBe(1);

    const unread = await loadAllTickets({ ...base, filter: 'unread' });
    expect(unread.total).toBe(2);
    expect(unread.rows.every((row) => row.status !== 'closed')).toBe(true);
  });

  it('searches subject, message body, email, @username and name', async () => {
    const search = (q: string) => loadAllTickets({ filter: 'all', q, page: 1 });

    expect((await search(`${PREFIX} answered`)).total).toBe(1);
    expect((await search('needle')).total).toBe(1);
    expect((await search('inbox-bob@example.test')).total).toBe(1);
    expect((await search('@inboxalice')).total).toBe(2);
    expect((await search('Charlie')).total).toBe(1);
    expect((await search('no-such-ticket-anywhere')).total).toBe(0);
  });

  it('paginates newest-first and clamps out-of-range pages', async () => {
    const first = await loadAllTickets({ filter: 'all', q: PREFIX, page: 1, pageSize: 2 });
    expect(first.total).toBe(4);
    expect(first.pageCount).toBe(2);
    expect(first.rows.map((row) => row.subject)).toEqual([
      `${PREFIX} open`,
      `${PREFIX} answered`,
    ]);

    const second = await loadAllTickets({ filter: 'all', q: PREFIX, page: 2, pageSize: 2 });
    expect(second.page).toBe(2);
    expect(second.rows.map((row) => row.subject)).toEqual([
      `${PREFIX} closed`,
      `${PREFIX} other`,
    ]);

    const clamped = await loadAllTickets({ filter: 'all', q: PREFIX, page: 99, pageSize: 2 });
    expect(clamped.page).toBe(2);
    expect(clamped.rows).toHaveLength(2);
  });

  it('counts unseen, non-closed tickets for the nav badge', async () => {
    expect(await loadAdminUnreadTicketCount()).toBe(baselineUnread + 2);
  });
});

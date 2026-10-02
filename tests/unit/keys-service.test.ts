// CAB-01 cache-first read vectors (D-29 / T-02-14): the rendered status is
// derived from `expiresAt` against `now`, never from the stored status string;
// `revalidateKeys` upserts by the unique (userId, keyId) pair without
// duplicating rows. Runs against the real local Postgres (auth-flow.test.ts
// integration style) with a spied `artemida.listKeys` so no network is hit.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { artemida, type NormalizedKey } from '../../lib/artemida';
import { listKeys, revalidateKeys } from '../../lib/keys-service';
import { prisma } from '../../lib/prisma';

const TELEGRAM_ID = BigInt('200000040');
const DAY = 86_400_000;

function key(overrides: Partial<NormalizedKey> & { id: string }): NormalizedKey {
  return {
    name: null,
    status: 'active',
    isTrial: false,
    expiresAt: null,
    deviceLimit: null,
    devices: null,
    subscriptionUrl: null,
    customerRef: null,
    trafficUsedBytes: null,
    trafficLimitBytes: null,
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: TELEGRAM_ID },
    select: { id: true },
  });
  if (user) await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { telegramId: TELEGRAM_ID } });
}

describe('keys-service — cache-first subscription list (D-29)', () => {
  let userId: number;

  beforeAll(async () => {
    await cleanup();
    const user = await prisma.user.create({
      data: { telegramId: TELEGRAM_ID },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it('derives statusKind from expiresAt, never the stored status string', async () => {
    await prisma.keyCache.deleteMany({ where: { userId } });
    const now = Date.now();
    await prisma.keyCache.createMany({
      data: [
        // Stored status LIES in both directions; expiry must win.
        { userId, keyId: 'k_active', status: 'expired', expiresAt: new Date(now + 30 * DAY) },
        { userId, keyId: 'k_expiring', status: 'active', expiresAt: new Date(now + 1 * DAY) },
        { userId, keyId: 'k_expired', status: 'active', expiresAt: new Date(now - DAY) },
        { userId, keyId: 'k_unknown', status: 'active', expiresAt: null },
      ],
    });

    const rendered = await listKeys(TELEGRAM_ID);
    const byId = new Map(rendered.map((r) => [r.id, r]));

    expect(byId.get('k_active')?.statusKind).toBe('active');
    expect(byId.get('k_expiring')?.statusKind).toBe('expiring');
    expect(byId.get('k_expired')?.statusKind).toBe('expired');
    expect(byId.get('k_unknown')?.statusKind).toBe('unknown');
    // An expired key can never render as active (prohibition).
    expect(rendered.find((r) => r.id === 'k_expired')?.statusKind).not.toBe('active');
  });

  it('orders active → expiring → expired → pending → unknown', async () => {
    await prisma.keyCache.deleteMany({ where: { userId } });
    const now = Date.now();
    await prisma.keyCache.createMany({
      data: [
        { userId, keyId: 'k_unknown', status: 'weird', expiresAt: null },
        { userId, keyId: 'k_expired', status: 'active', expiresAt: new Date(now - DAY) },
        { userId, keyId: 'k_pending', status: 'pending', expiresAt: null },
        { userId, keyId: 'k_expiring', status: 'active', expiresAt: new Date(now + DAY) },
        { userId, keyId: 'k_active', status: 'active', expiresAt: new Date(now + 30 * DAY) },
      ],
    });

    const rendered = await listKeys(TELEGRAM_ID);
    expect(rendered.map((r) => r.statusKind)).toEqual([
      'active',
      'expiring',
      'expired',
      'pending',
      'unknown',
    ]);
  });

  it('preserves the isTrial badge flag and maps cache fields', async () => {
    await prisma.keyCache.deleteMany({ where: { userId } });
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: 'k_trial',
        name: 'Trial',
        status: 'active',
        isTrial: true,
        expiresAt: new Date(Date.now() + DAY),
        deviceLimit: 2,
        devices: 1,
        subscriptionUrl: 'https://example.test/sub',
        customerRef: 'ref-1',
        trafficUsedBytes: BigInt(1024),
        trafficLimitBytes: null,
      },
    });

    const [rendered] = await listKeys(TELEGRAM_ID);
    expect(rendered?.isTrial).toBe(true);
    expect(rendered?.name).toBe('Trial');
    expect(rendered?.devices).toBe(1);
    expect(rendered?.deviceLimit).toBe(2);
    expect(rendered?.trafficUsedBytes).toBe(1024);
    expect(rendered?.subscriptionUrl).toBe('https://example.test/sub');
  });

  it('revalidateKeys upserts by unique (userId, keyId) without duplicating', async () => {
    await prisma.keyCache.deleteMany({ where: { userId } });
    const listKeysSpy = vi.spyOn(artemida, 'listKeys').mockResolvedValue({
      items: [
        key({ id: 'k_sync_1', name: 'First', expiresAt: new Date(Date.now() + 5 * DAY).toISOString() }),
        key({ id: 'k_sync_2', name: 'Second', expiresAt: new Date(Date.now() + 6 * DAY).toISOString() }),
      ],
      count: 2,
      query: '',
    });

    await revalidateKeys(TELEGRAM_ID);

    // Second refresh updates (not inserts) an existing unique pair.
    listKeysSpy.mockResolvedValue({
      items: [
        key({
          id: 'k_sync_1',
          name: 'First updated',
          expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
        }),
      ],
      count: 1,
      query: '',
    });
    await revalidateKeys(TELEGRAM_ID);

    const rows = await prisma.keyCache.findMany({
      where: { userId },
      orderBy: { keyId: 'asc' },
    });
    expect(rows).toHaveLength(2); // no duplicate row for k_sync_1
    const first = rows.find((r) => r.keyId === 'k_sync_1');
    expect(first?.name).toBe('First updated');
    expect(first?.lastSyncedAt).toBeInstanceOf(Date);
  });
});

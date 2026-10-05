import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  order: { aggregate: vi.fn() },
  user: { count: vi.fn() },
}));
const provider = vi.hoisted(() => ({ getBalance: vi.fn(), listKeys: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/artemida', () => ({ ArtemidaError: class ArtemidaError extends Error {}, artemida: provider }));

import { clearArtemidaStatsCache, loadArtemidaStats, loadDbStats } from '@/lib/admin-stats';

describe('admin stats', () => {
  beforeEach(() => { vi.clearAllMocks(); clearArtemidaStatsCache(); });

  it('uses paid period orders and all-time users', async () => {
    db.order.aggregate.mockResolvedValue({ _sum: { amount: 1234 }, _count: 2 });
    db.user.count.mockResolvedValue(9);
    await expect(loadDbStats(new Date('2026-01-01'))).resolves.toEqual({ revenue: 1234, orders: 2, users: 9 });
    expect(db.order.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ['paid', 'provisioning', 'provisioned'] } }) }));
    expect(db.user.count).toHaveBeenCalledOnce();
  });

  it('degrades provider reads and caches the degraded result', async () => {
    provider.getBalance.mockRejectedValue(new Error('provider down'));
    provider.listKeys.mockResolvedValue({ items: [] });
    await expect(loadArtemidaStats()).resolves.toMatchObject({ balance: null, keys: null, devices: null, degraded: true });
    await loadArtemidaStats();
    expect(provider.getBalance).toHaveBeenCalledOnce();
  });

  it('sums devices from the single key list response', async () => {
    provider.getBalance.mockResolvedValue({ balance: 700, currency: 'RUB', unlimited: false });
    provider.listKeys.mockResolvedValue({ items: [{ devices: 2 }, { devices: 3 }] });
    await expect(loadArtemidaStats()).resolves.toMatchObject({ keys: 2, devices: 5, degraded: false });
    expect(provider.listKeys).toHaveBeenCalledOnce();
  });
});

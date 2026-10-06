import { ArtemidaError, artemida, type Balance } from './artemida';
import { prisma } from './prisma';

const PAID_STATUSES: ('paid' | 'provisioning' | 'provisioned')[] = ['paid', 'provisioning', 'provisioned'];
const ARTEMIDA_CACHE_TTL_MS = 60_000;

export interface DbStats {
  revenue: number;
  users: number;
  orders: number;
}

export interface ArtemidaStats {
  balance: Balance | null;
  keys: number | null;
  devices: number | null;
  degraded: boolean;
}

let artemidaCache: { expiresAt: number; value: ArtemidaStats } | null = null;
let artemidaRead: Promise<ArtemidaStats> | null = null;

export async function loadDbStats(from: Date): Promise<DbStats> {
  const [orders, users] = await Promise.all([
    prisma.order.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { paidAt: { gte: from }, status: { in: PAID_STATUSES } },
    }),
    prisma.user.count(),
  ]);

  const count = orders._count as number | { _all?: number } | undefined;
  return {
    revenue: orders._sum?.amount ?? 0,
    users,
    orders: typeof count === 'number' ? count : count?._all ?? 0,
  };
}

async function readArtemidaStats(): Promise<ArtemidaStats> {
  try {
    const [balance, keys] = await Promise.all([artemida.getBalance(), artemida.listKeys()]);
    return {
      balance,
      keys: keys.items.length,
      devices: keys.items.reduce((sum, key) => sum + (key.devices ?? 0), 0),
      degraded: false,
    };
  } catch (error) {
    if (error instanceof ArtemidaError) {
      return { balance: null, keys: null, devices: null, degraded: true };
    }
    return { balance: null, keys: null, devices: null, degraded: true };
  }
}

/** Read ARTEMIDA once per short TTL; failures are safe display data, not errors. */
export async function loadArtemidaStats(): Promise<ArtemidaStats> {
  const now = Date.now();
  if (artemidaCache && artemidaCache.expiresAt > now) return artemidaCache.value;
  if (!artemidaRead) {
    artemidaRead = readArtemidaStats().then((value) => {
      artemidaCache = { value, expiresAt: Date.now() + ARTEMIDA_CACHE_TTL_MS };
      artemidaRead = null;
      return value;
    });
  }
  return artemidaRead;
}

/** Test-only cache reset; harmless for the server and keeps unit tests isolated. */
export function clearArtemidaStatsCache(): void {
  artemidaCache = null;
  artemidaRead = null;
}

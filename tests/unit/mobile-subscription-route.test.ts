// GET /api/mobile/subscription contract (REQ-SUB-01/02/06, REQ-BE-03, D-10/D-12):
// real ownership-joined single-key read, machine-readable no_active_key,
// one getSubscriptionForUserId(userId, active.id) call, JWT 401, and no-5xx
// provider degradation. No secret, provider text or raw link in body or logs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RenderedKey } from '../../lib/keys-service';
import { ArtemidaError } from '../../lib/artemida';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  listKeys: vi.fn(),
  getSubscription: vi.fn(),
  findUser: vi.fn(),
  days: vi.fn(() => 6),
  // The shared grace helper imports this; mirror the real derivation so the
  // route fixtures exercise the actual predicate.
  deriveStatusKind: vi.fn((status: string, expiresAt: Date | null) => {
    if (expiresAt) {
      const remaining = expiresAt.getTime() - Date.now();
      if (remaining <= 0) return 'expired';
      if (remaining <= 3 * 86_400_000) return 'expiring';
      return 'active';
    }
    if (status === 'pending') return 'pending';
    if (status === 'expired') return 'expired';
    return 'unknown';
  }),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/keys-service', () => ({
  listKeysByUserId: mocks.listKeys,
  getSubscriptionForUserId: mocks.getSubscription,
  daysUntilExpiry: mocks.days,
  deriveStatusKind: mocks.deriveStatusKind,
}));
vi.mock('../../lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('../../lib/logger', () => ({
  logger: { info: mocks.info, error: mocks.error, warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../../app/api/mobile/subscription/route';

const LINK = 'https://sub.example.test/SECRETSUB123';
const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString();
const USER = { id: 1, telegramId: BigInt('12345'), email: 'u@example.test' };

function key(overrides: Partial<RenderedKey> = {}): RenderedKey {
  return {
    id: 'key-active',
    name: '3set VPN',
    status: 'active',
    isTrial: false,
    expiresAt: FUTURE,
    deviceLimit: 5,
    devices: 2,
    subscriptionUrl: null,
    customerRef: 'email:1',
    trafficUsedBytes: 0,
    trafficLimitBytes: null,
    statusKind: 'active',
    ...overrides,
  };
}

const subscribed = () => Promise.resolve({
  subscriptionUrl: LINK,
  links: [LINK],
  traffic: { usedBytes: 100, limitBytes: null },
});

const request = () => new Request('http://localhost/api/mobile/subscription') as NextRequest;
const logText = () => JSON.stringify(mocks.info.mock.calls) + JSON.stringify(mocks.error.mock.calls);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ userId: 1, telegramId: null });
  mocks.findUser.mockResolvedValue(USER);
  mocks.listKeys.mockResolvedValue([key()]);
  mocks.getSubscription.mockImplementation(subscribed);
  mocks.days.mockReturnValue(6);
});

describe('JWT / identity gate (T-21-10)', () => {
  it('401 without a valid JWT and makes no provider or DB read', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.listKeys).not.toHaveBeenCalled();
    expect(mocks.getSubscription).not.toHaveBeenCalled();
  });

  it('404 user_not_found when the authenticated user row is gone', async () => {
    mocks.findUser.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(404);
    expect((await res.json() as Record<string, unknown>).error).toBe('user_not_found');
    expect(mocks.getSubscription).not.toHaveBeenCalled();
  });
});

describe('real owned-key subscription (D-12 / REQ-SUB-01/02/06)', () => {
  it('returns expiresAt, remainingDays, deviceLimit, link, devices, isTrial, statusKind and graceUntil', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      expiresAt: FUTURE,
      remainingDays: 6,
      deviceLimit: 5,
      link: LINK,
      devices: 2,
      isTrial: false,
      statusKind: 'active',
      graceUntil: null,
      user: { id: 1, telegramId: 12345, email: 'u@example.test' },
    });
    expect(mocks.getSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.getSubscription).toHaveBeenCalledWith(1, 'key-active');
  });

  it('surfaces statusKind/graceUntil for a key inside the server grace window', async () => {
    const insideGrace = new Date(Date.now() - 60_000).toISOString(); // 1 min past expiry
    mocks.listKeys.mockResolvedValue([key({ expiresAt: insideGrace, statusKind: 'expired' })]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.statusKind).toBe('expired');
    expect(typeof body.graceUntil).toBe('string');
    expect(body.link).toBe(LINK);
  });

  it('reads exactly one active owned key even when several keys exist', async () => {
    mocks.listKeys.mockResolvedValue([
      key({ id: 'expired-old', expiresAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), statusKind: 'expired' }),
      key({ id: 'chosen', deviceLimit: 9 }),
      key({ id: 'pending', status: 'pending', expiresAt: null, statusKind: 'pending' }),
    ]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>).deviceLimit).toBe(9);
    expect(mocks.getSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.getSubscription).toHaveBeenCalledWith(1, 'chosen');
  });
});

describe('no active key / provider degradation (D-11 / D-22)', () => {
  it('returns machine-readable no_active_key with no link', async () => {
    mocks.listKeys.mockResolvedValue([]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: 'no_active_key' });
    expect(body).not.toHaveProperty('link');
    expect(mocks.getSubscription).not.toHaveBeenCalled();
  });

  it('maps provider unauthorized to the same no_active_key gate', async () => {
    mocks.getSubscription.mockRejectedValue(new ArtemidaError('unauthorized', 401));
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: 'no_active_key' });
  });

  it('maps a missing per-key subscription to no_active_key', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: 'no_active_key' });
  });

  it('degrades other provider failures to a 200 stable code, never a 5xx or provider text', async () => {
    const providerError = new ArtemidaError('bad_gateway', 502);
    providerError.message = 'UPSTREAM_DETAIL_SECRET from provider';
    mocks.getSubscription.mockRejectedValue(providerError);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: 'bad_gateway' });
    expect(body).not.toHaveProperty('link');
    expect(JSON.stringify(body)).not.toContain('UPSTREAM_DETAIL_SECRET');
    expect(logText()).not.toContain('UPSTREAM_DETAIL_SECRET');
    expect(logText()).not.toContain('SECRETSUB123');
    expect(logText()).not.toContain(LINK);
  });

  it('degrades an internal throw to 200 instead of 5xx', async () => {
    mocks.listKeys.mockRejectedValue(new Error('db down'));
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: 'internal' });
    expect(mocks.error).toHaveBeenCalled();
  });
});

// GET /api/mobile/servers route vectors (D-21/D-22): JWT 401, no_active_key
// 403 + empty pools, active-key filter (incl. raw revoked/disabled/trial-expired),
// provider error → empty/cached + not 5xx, no `load`, no secret in body or logs,
// NOT /pricing. All collaborators are mocked — no DB, no network.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RenderedKey } from '../../lib/keys-service';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  listKeys: vi.fn(),
  days: vi.fn(() => 7),
  source: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/keys-service', () => ({
  listKeysByUserId: mocks.listKeys,
  daysUntilExpiry: mocks.days,
}));
vi.mock('../../lib/servers-source', () => ({ getSubscriptionLinksCacheFirst: mocks.source }));
vi.mock('../../lib/logger', () => ({
  logger: { info: mocks.info, error: mocks.error, warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../../app/api/mobile/servers/route';
import { artemida } from '../../lib/artemida';

const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function key(overrides: Partial<RenderedKey> = {}): RenderedKey {
  return {
    id: 'key-active',
    name: '3set VPN',
    status: 'active',
    isTrial: false,
    expiresAt: FUTURE,
    deviceLimit: 2,
    devices: 1,
    subscriptionUrl: null,
    customerRef: 'email:1',
    trafficUsedBytes: 0,
    trafficLimitBytes: null,
    statusKind: 'active',
    ...overrides,
  };
}

const request = () => new Request('http://localhost/api/mobile/servers') as NextRequest;
const okSource = (links: string[] = []) =>
  Promise.resolve({ links, stale: false, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ userId: 1, telegramId: null });
  mocks.days.mockReturnValue(7);
});

describe('JWT gate (D-21 / T-19-01)', () => {
  it('returns 401 without a valid JWT and never reads keys or links', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: 'unauthorized', simple: [], whitelist: [], key: null });
    expect(mocks.listKeys).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });
});

describe('active-key gate (D-21 / T-19-02)', () => {
  it('403 no_active_key with empty pools when there is no key', async () => {
    mocks.listKeys.mockResolvedValue([]);
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      ok: false, error: 'no_active_key', simple: [], whitelist: [], key: null,
    });
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it('rejects expired, trial-expired, non-owned/empty-id and raw revoked/disabled', async () => {
    const bad = [
      key({ id: 'expired', statusKind: 'expired', expiresAt: PAST }),
      key({ id: 'trial-expired', status: 'trial-expired', isTrial: true, statusKind: 'active' }),
      key({ id: 'trial_expired', status: 'trial_expired', isTrial: true, statusKind: 'expiring' }),
      key({ id: '   ', statusKind: 'active' }),
      key({ id: 'revoked', status: 'REVOKED', statusKind: 'active' }),
      key({ id: 'disabled', status: 'disabled', statusKind: 'active' }),
      key({ id: 'pending', statusKind: 'pending' }),
    ];
    mocks.listKeys.mockResolvedValue(bad);
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('no_active_key');
  });

  it('accepts active, expiring and trial keys; keyId comes from RenderedKey.id', async () => {
    mocks.listKeys.mockResolvedValue([
      key({ id: 'trial-key', isTrial: true, statusKind: 'active' }),
    ]);
    mocks.source.mockImplementation(() => okSource());
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      simple: [],
      whitelist: [],
      key: { active: true, keyId: 'trial-key', isTrial: true, remainingDays: 7, expireAt: FUTURE },
    });
  });
});

describe('parsed pools + secrecy (D-01/D-03/D-05)', () => {
  it('returns 200 with parsed pools and no load / raw link / secret', async () => {
    mocks.listKeys.mockResolvedValue([key()]);
    const secretLink = 'vless://uuid-SUPERSECRET@simple.example.com:443?security=tls&sni=tls.example.com#Simple';
    mocks.source.mockImplementation(() => okSource([secretLink]));
    const spy = vi.spyOn(artemida, 'getPricing').mockRejectedValue(new Error('must not be called'));

    const res = await GET(request());
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.simple)).toBe(true);
    expect(Array.isArray(body.whitelist)).toBe(true);
    // Secrets are confined to the machine-only `outbound` (needed by libbox
    // ping); rendered card fields must carry none. No raw share-link anywhere.
    const cards = [...(body.simple as Record<string, unknown>[]), ...(body.whitelist as Record<string, unknown>[])]
      .map(({ outbound: _outbound, ...card }) => card);
    expect(JSON.stringify(cards)).not.toContain('SUPERSECRET');
    expect(JSON.stringify(body)).not.toContain('vless://');
    expect(JSON.stringify(body)).not.toContain('"load"');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    const logText = JSON.stringify(mocks.info.mock.calls) + JSON.stringify(mocks.error.mock.calls);
    expect(logText).not.toContain('SUPERSECRET');
    expect(logText).not.toContain('vless://');
    expect(logText).not.toContain('authorization');
  });
});

describe('provider error handling (D-22)', () => {
  it('maps unauthorized to no_active_key-safe 403 with empty pools', async () => {
    mocks.listKeys.mockResolvedValue([key()]);
    mocks.source.mockResolvedValue({ links: [], stale: false, error: 'unauthorized' });
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: 'no_active_key', simple: [], whitelist: [], key: null });
  });

  it('returns 200 (not 5xx) with empty pools + error code on provider failure', async () => {
    mocks.listKeys.mockResolvedValue([key()]);
    mocks.source.mockResolvedValue({ links: [], stale: false, error: 'bad_gateway' });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: false, error: 'bad_gateway', simple: [], whitelist: [], stale: false,
    });
  });

  it('serves a cached copy with stale=true and passes Retry-After', async () => {
    mocks.listKeys.mockResolvedValue([key()]);
    mocks.source.mockResolvedValue({
      links: ['ss://' + Buffer.from('none:pw@cached.example.com:8388').toString('base64') + '#Cached'],
      stale: true, error: 'rate_limited', retryAfterSec: 9,
    });
    const res = await GET(request());
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(res.headers.get('retry-after')).toBe('9');
    expect(body).toMatchObject({ ok: false, error: 'rate_limited', stale: true, retryAfterSec: 9 });
    expect((body.simple as unknown[]).length).toBe(1);
  });

  it('degrades an internal throw to 200 + empty pools instead of 5xx', async () => {
    mocks.listKeys.mockRejectedValue(new Error('db down'));
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: 'internal', simple: [], whitelist: [] });
    expect(mocks.error).toHaveBeenCalled();
  });
});

// Cache-first subscription-links source (D-22): no per-request ARTEMIDA,
// in-memory TTL keyed by userId:keyId, provider-error→cached/empty, status→code
// mapping, Retry-After passthrough, getSubscriptionForUserId (NOT
// getKeyWithLinks, NOT /pricing). No network is touched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtemidaError, type ArtemidaCode } from '../../lib/artemida';

const getter = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('../../lib/keys-service', () => ({
  getSubscriptionForUserId: getter.fn,
}));

import { getSubscriptionLinksCacheFirst, linksCache } from '../../lib/servers-source';

const USER = 42;
const links = (prefix: string) => [
  `vless://${prefix}@a.example.com:443#Simple`,
  `vless://${prefix}@b.example.com:443#WL`,
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  getter.fn.mockReset();
  linksCache.clear();
});

afterEach(() => {
  vi.useRealTimers();
  linksCache.clear();
});

describe('cache-first + ownership (D-22)', () => {
  it('calls getSubscriptionForUserId with (userId, keyId) and returns links', async () => {
    getter.fn.mockResolvedValue({ subscriptionUrl: null, links: links('u1'), traffic: { usedBytes: null, limitBytes: null } });
    const result = await getSubscriptionLinksCacheFirst(USER, 'key-a');
    expect(getter.fn).toHaveBeenCalledWith(USER, 'key-a');
    expect(result).toMatchObject({ links: links('u1'), stale: false, error: null });
  });

  it('serves fresh cached links without a provider call', async () => {
    getter.fn.mockResolvedValue({ subscriptionUrl: null, links: links('u1'), traffic: { usedBytes: null, limitBytes: null } });
    await getSubscriptionLinksCacheFirst(USER, 'key-a');
    vi.advanceTimersByTime(30_000);
    const second = await getSubscriptionLinksCacheFirst(USER, 'key-a');
    expect(getter.fn).toHaveBeenCalledTimes(1);
    expect(second.links).toEqual(links('u1'));
  });

  it('expires the cache after the short TTL and keys entries by keyId', async () => {
    getter.fn.mockResolvedValue({ subscriptionUrl: null, links: links('u1'), traffic: { usedBytes: null, limitBytes: null } });
    await getSubscriptionLinksCacheFirst(USER, 'key-a');
    vi.advanceTimersByTime(61_000);
    await getSubscriptionLinksCacheFirst(USER, 'key-a');
    await getSubscriptionLinksCacheFirst(USER, 'key-b'); // different key → own cache entry
    expect(getter.fn).toHaveBeenCalledTimes(3);
  });

  it('treats a non-owned/missing key (null) as empty links, not an error', async () => {
    getter.fn.mockResolvedValue(null);
    expect(await getSubscriptionLinksCacheFirst(USER, 'missing')).toEqual({
      links: [], stale: false, error: null,
    });
  });
});

describe('provider error degradation (D-22)', () => {
  it('serves a cached copy with stale=true on provider error', async () => {
    getter.fn
      .mockResolvedValueOnce({ subscriptionUrl: null, links: links('cached'), traffic: { usedBytes: null, limitBytes: null } })
      .mockRejectedValueOnce(new ArtemidaError('bad_gateway', 502));
    await getSubscriptionLinksCacheFirst(USER, 'key-a');
    vi.advanceTimersByTime(61_000);
    const result = await getSubscriptionLinksCacheFirst(USER, 'key-a');
    expect(result).toMatchObject({ links: links('cached'), stale: true, error: 'bad_gateway' });
  });

  it('returns empty links + error when there is no cache (never throws)', async () => {
    getter.fn.mockRejectedValue(new ArtemidaError('payment_required', 402));
    const result = await getSubscriptionLinksCacheFirst(USER, 'key-a');
    expect(result).toMatchObject({ links: [], stale: false, error: 'payment_required' });
  });

  it('maps every handled status code to its ArtemidaError code', async () => {
    const cases: Array<[ArtemidaCode, number]> = [
      ['unauthorized', 401], ['payment_required', 402], ['conflict', 409],
      ['rate_limited', 429], ['bad_gateway', 502], ['unavailable', 503],
      ['not_found', 404], ['unknown', 500],
    ];
    for (const [code, status] of cases) {
      getter.fn.mockRejectedValueOnce(new ArtemidaError(code, status));
      const result = await getSubscriptionLinksCacheFirst(USER, `key-${status}`);
      expect(result.error).toBe(code);
      expect(result.links).toEqual([]);
    }
  });

  it('passes Retry-After through for rate_limited only', async () => {
    getter.fn.mockRejectedValue(new ArtemidaError('rate_limited', 429, 7, 'req_1'));
    const result = await getSubscriptionLinksCacheFirst(USER, 'rate-key');
    expect(result.error).toBe('rate_limited');
    expect(result.retryAfterSec).toBe(7);
  });

  it('maps unknown failures to unknown without leaking provider text', async () => {
    getter.fn.mockRejectedValue(new Error('provider: secret text must not escape'));
    const result = await getSubscriptionLinksCacheFirst(USER, 'unknown-key');
    expect(result.error).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('secret text');
  });

  it('namespaces cached links by owner, not by keyId alone', async () => {
    const traffic = { usedBytes: null, limitBytes: null };
    getter.fn
      .mockResolvedValueOnce({ subscriptionUrl: null, links: links('owner'), traffic })
      .mockResolvedValueOnce({ subscriptionUrl: null, links: links('other'), traffic });

    await getSubscriptionLinksCacheFirst(USER, 'shared-key');
    const other = await getSubscriptionLinksCacheFirst(USER + 1, 'shared-key');

    expect(other.links).toEqual(links('other'));
    expect(getter.fn).toHaveBeenCalledTimes(2);
  });

  it('never caches a failed fetch over a good entry', async () => {
    getter.fn
      .mockResolvedValueOnce({ subscriptionUrl: null, links: links('good'), traffic: { usedBytes: null, limitBytes: null } })
      .mockRejectedValueOnce(new ArtemidaError('unavailable', 503));
    await getSubscriptionLinksCacheFirst(USER, 'key-a');
    vi.advanceTimersByTime(61_000);
    await getSubscriptionLinksCacheFirst(USER, 'key-a');
    expect(linksCache.get(`${USER}:key-a`)!.links).toEqual(links('good'));
  });
});

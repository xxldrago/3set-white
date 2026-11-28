// Wave 0 contract vectors for GET /api/mobile/pricing (D-01/D-02/D-03,
// REQ-SHOP-01/02/05, T-21-16..20): one batched five-term server quote,
// mobile-only 2..10 device bounds, JWT gate, stable no-5xx error codes and
// secret discipline. All collaborators are mocked; no real ARTEMIDA call.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  quote: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/pricing', () => ({ resolveTariffQuote: mocks.quote }));
vi.mock('../../lib/logger', () => ({
  logger: { info: mocks.info, error: mocks.error, warn: mocks.warn, debug: vi.fn() },
}));

import { GET } from '../../app/api/mobile/pricing/route';
import { ArtemidaError } from '../../lib/artemida';

/** Locked 2-device retail prices; the real formula is pinned in tariff-markup.test.ts. */
const LOCKED = new Map<number, number>([
  [7, 115],
  [30, 400],
  [90, 1000],
  [180, 1900],
  [365, 3800],
]);
const DAYS = [7, 30, 90, 180, 365];
const SECRET = 'ARTEMIDA_SECRET_SENTINEL_9f3a';
const PROVIDER_TEXT = 'provider leak: upstream key abc123';

function request(query = 'devices=2'): Request {
  return new Request(`http://localhost/api/mobile/pricing?${query}`, {
    headers: { authorization: 'Bearer test-access' },
  });
}

function goodQuote(days: number, devices = 2) {
  return {
    amount: (LOCKED.get(days) ?? 0) + (devices - 2) * 100,
    currency: 'RUB',
    source: 'provider' as const,
  };
}

const logText = () => JSON.stringify([...mocks.info.mock.calls, ...mocks.error.mock.calls, ...mocks.warn.mock.calls]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ userId: 42, telegramId: null });
  mocks.quote.mockImplementation(async (days: number, devices: number) => goodQuote(days, devices));
});

describe('GET /api/mobile/pricing — batched five-term quote (D-01)', () => {
  it('returns all five terms in order with the locked 2-device prices', async () => {
    const res = await request('devices=2');
    const body = (await res.json()) as {
      ok: boolean;
      currency: string;
      terms: { days: number; amount: number }[];
    };

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(body).toEqual({
      ok: true,
      currency: 'RUB',
      terms: DAYS.map((days) => ({ days, amount: LOCKED.get(days) })),
    });
    expect(mocks.quote).toHaveBeenCalledTimes(5);
    expect(mocks.quote.mock.calls.map((c) => c.slice(0, 2))).toEqual(
      DAYS.map((days) => [days, 2]),
    );
  });

  it('accepts the mobile ceiling of 10 devices with one batched request', async () => {
    const res = await request('devices=10');
    const body = (await res.json()) as { ok: boolean; terms: unknown[] };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.terms).toHaveLength(5);
    expect(mocks.quote).toHaveBeenCalledTimes(5);
    for (const call of mocks.quote.mock.calls) expect(call[1]).toBe(10);
  });
});

describe('GET /api/mobile/pricing — mobile device bounds (D-02)', () => {
  it('rejects devices=1 and devices=11 with bad_request and no provider call', async () => {
    expect((await request('devices=1')).status).toBe(400);
    expect(await (await request('devices=11')).json()).toEqual({ ok: false, error: 'bad_request' });
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it('rejects a non-integer device count', async () => {
    const res = await request('devices=2.5');
    expect(res.status).toBe(400);
    expect(mocks.quote).not.toHaveBeenCalled();
  });
});

describe('GET /api/mobile/pricing — JWT gate and secret discipline (T-21-16/19)', () => {
  it('returns 401 without a JWT and never quotes the provider', async () => {
    mocks.verify.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost/api/mobile/pricing?devices=2'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it('exposes no client amount field and no provider key in the body or logs', async () => {
    const previousKey = process.env.ARTEMIDA_API_KEY;
    process.env.ARTEMIDA_API_KEY = SECRET;
    try {
      const res = await request('devices=2&amount=1&clientAmount=2');
      const text = await res.text();
      const body = JSON.parse(text) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(['currency', 'ok', 'terms']);
      for (const term of body.terms as Record<string, unknown>[]) {
        expect(Object.keys(term).sort()).toEqual(['amount', 'days']);
      }
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('clientAmount');
      expect(logText()).not.toContain(SECRET);
    } finally {
      if (previousKey === undefined) delete process.env.ARTEMIDA_API_KEY;
      else process.env.ARTEMIDA_API_KEY = previousKey;
    }
  });
});

describe('GET /api/mobile/pricing — provider failure degradation (T-21-19/20)', () => {
  it('maps a provider rate limit to a stable 200 code with Retry-After', async () => {
    mocks.quote.mockRejectedValue(new ArtemidaError('rate_limited', 429, 7, 'req-secret'));

    const res = await request('devices=2');
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: 'rate_limited',
      retryAfterSec: 7,
    });
    expect(text).not.toContain('req-secret');
    expect(text).not.toContain(PROVIDER_TEXT);
    expect(logText()).not.toContain('req-secret');
    expect(logText()).not.toContain(PROVIDER_TEXT);
  });

  it('maps a provider 502 to a stable 200 code, never a 5xx or provider text', async () => {
    const leaked = new ArtemidaError('bad_gateway', 502, undefined, 'req-secret');
    leaked.message = PROVIDER_TEXT;
    mocks.quote.mockRejectedValue(leaked);

    const res = await request('devices=2');
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'provider_error' });
    expect(text).not.toContain(PROVIDER_TEXT);
    expect(logText()).not.toContain(PROVIDER_TEXT);
  });

  it('degrades an unexpected failure to 200 internal without leaking details', async () => {
    mocks.quote.mockRejectedValue(new Error(PROVIDER_TEXT));

    const res = await request('devices=2');
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'internal' });
    expect(text).not.toContain(PROVIDER_TEXT);
    expect(logText()).not.toContain(PROVIDER_TEXT);
  });
});

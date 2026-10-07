// GET /api/pricing route vectors (T-02-05): session gate, query clamping to
// the provider contract (2..10 devices, {7,30,90} days), exact provider price,
// and provider-error status mapping. next/headers is mocked; fetch is stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET } from '../../app/api/pricing/route';
import { signSession } from '../../lib/auth';
import { jsonResponse, objectError, pricingEnvelope } from '../helpers/fake-fetch';

const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

async function authorize(): Promise<void> {
  // Any authenticated session may read a quote — mint a uid-only (email-only)
  // session; requireSession accepts it without a linked Telegram.
  session.token = await signSession(424242, null, SECRET);
}

function request(query: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/pricing?${query}`));
}

beforeEach(() => {
  session.token = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/pricing (TRIAL-02)', () => {
  it('returns 401 without a session and never calls ARTEMIDA', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch must not be called without a session');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await request('days=7&devices=2');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows an email-only (uid-only) session to read a quote', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ body: pricingEnvelope(49, { days: 7, devices: 2 }) })),
    );

    const res = await request('days=7&devices=2');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 49 });
  });

  it('clamps devices to the provider minimum 2 and maximum 10', async () => {
    await authorize();
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ body: pricingEnvelope(49, { days: 7, devices: 2 }) }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    expect((await request('days=7&devices=1')).status).toBe(400);
    expect((await request('days=7&devices=11')).status).toBe(400);
    expect((await request('days=7&devices=2')).status).toBe(200);
    // Only the valid selection reached the provider.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('restricts days to the locked {7,30,90} set', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ body: pricingEnvelope(120, { days: 30, devices: 2 }) })),
    );

    expect((await request('days=60&devices=2')).status).toBe(400);
    expect((await request('days=15&devices=2')).status).toBe(400);
    expect((await request('days=30&devices=2')).status).toBe(200);
  });

  it('returns the exact ARTEMIDA amount for a valid selection', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ body: pricingEnvelope(49, { days: 7, devices: 2 }) })),
    );

    const res = await request('days=7&devices=2');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 49 });
  });

  it('maps a provider 429 to HTTP 429 with the Retry-After value', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          status: 429,
          headers: { 'retry-after': '0' },
          body: objectError('rate_limited'),
        }),
      ),
    );

    const res = await request('days=7&devices=2');

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'rate_limited', retryAfter: 0 });
  });

  it('maps a provider 502/503 to HTTP 502', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 502, body: objectError('bad_gateway') })),
    );

    const res = await request('days=7&devices=2');

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'bad_gateway' });
  });
});

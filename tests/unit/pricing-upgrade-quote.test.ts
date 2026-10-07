// GET /api/pricing upgrade-quote mode (PAY-03 / 03-01 Task 3): session gate,
// `kind` validation, addDevices bounds, and the locally derived prorated delta
// matching the observed 2026-10-03 fixture (+1 device on a 30-day key → 60 RUB).
// The `kind:'new'` path must stay byte-for-byte. next/headers is mocked; fetch
// is stubbed (no network).
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
import { jsonResponse, pricingEnvelope, success } from '../helpers/fake-fetch';

const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

async function authorize(): Promise<void> {
  // Any authenticated session may read a quote — uid-only (email-only) is valid.
  session.token = await signSession(424242, null, SECRET);
}

function request(query: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/pricing?${query}`));
}

/** Observed 2026-10-03 pricing body: apiPricing device tiers + volume basis. */
function upgradePricingEnvelope(): unknown {
  return success({
    quote: { amount: 120, currency: 'RUB', days: 30, devices: 2 },
    segment: { currency: 'RUB' },
    apiPricing: {
      devicePricePerMonth: 60,
      deviceTiers: [
        { from: 0, price: 60 },
        { from: 100, price: 55 },
        { from: 1000, price: 50 },
      ],
      volume: { keys: 1, devices: 2 },
      upgradeRule:
        'tier device price per added device; minimum one full month, proportional above 30 remaining days',
    },
  });
}

beforeEach(() => {
  session.token = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/pricing upgrade quote (PAY-03)', () => {
  it('returns 401 without a session and never calls ARTEMIDA', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch must not be called without a session');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await request('days=30&devices=2&kind=upgrade&addDevices=1');

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown kind with 400 and never calls ARTEMIDA', async () => {
    await authorize();
    const fetchSpy = vi.fn(async () => jsonResponse({ body: upgradePricingEnvelope() }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await request('days=30&devices=2&kind=sidegrade&addDevices=1');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects kind=upgrade without addDevices', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ body: upgradePricingEnvelope() })),
    );

    const res = await request('days=30&devices=2&kind=upgrade');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
  });

  it('bounds addDevices (min 1) and the 10-device ceiling', async () => {
    await authorize();
    const fetchSpy = vi.fn(async () => jsonResponse({ body: upgradePricingEnvelope() }));
    vi.stubGlobal('fetch', fetchSpy);

    expect((await request('days=30&devices=2&kind=upgrade&addDevices=0')).status).toBe(400);
    expect((await request('days=30&devices=10&kind=upgrade&addDevices=1')).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the recorded fixture amount (+1 device, 30 days → 60 RUB)', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ body: upgradePricingEnvelope() })),
    );

    const res = await request('days=30&devices=2&kind=upgrade&addDevices=1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 60 });
  });

  it('scales the delta by addDevices (+2 devices → 120 RUB)', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ body: upgradePricingEnvelope() })),
    );

    const res = await request('days=30&devices=2&kind=upgrade&addDevices=2');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 120 });
  });

  it('keeps the kind:new behavior byte-for-byte ({price} only)', async () => {
    await authorize();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ body: pricingEnvelope(49, { days: 7, devices: 2 }) })),
    );

    const res = await request('days=7&devices=2');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 49 });
  });
});

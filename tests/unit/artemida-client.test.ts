// ARTEMIDA client transport vectors (T-02-04/T-02-05): envelope parsing for
// both error shapes, status→code mapping, retry policy, Retry-After, and the
// exact provider amount. Fetch is injected — no network is ever touched.
import { describe, expect, it } from 'vitest';
import { ArtemidaError, createArtemidaClient } from '../../lib/artemida';
import {
  jsonResponse,
  objectError,
  pricingEnvelope,
  sequenceFetch,
  stringError,
  success,
} from '../helpers/fake-fetch';

const FAST = { retries: 1, minTimeout: 0, maxTimeout: 0, factor: 1 };

function build(responses: Response[]) {
  const seq = sequenceFetch(responses);
  const artemida = createArtemidaClient({ fetch: seq.fetch, retry: FAST });
  return { artemida, seq };
}

interface CapturedCall {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

/** Fake fetch that records method/url/headers/body for write-method assertions. */
function capturing(responses: Response[]): { fetch: typeof globalThis.fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let index = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    const res = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return res.clone();
  }) as typeof globalThis.fetch;
  return { fetch: fetchImpl, calls };
}

describe('artemida client — transport + pricing (TRIAL-02)', () => {
  it('parses the object error envelope and maps 402 to payment_required', async () => {
    const { artemida } = build([
      jsonResponse({ status: 402, body: objectError('insufficient_funds') }),
    ]);
    await expect(artemida.getPricing({ days: 7, devices: 2 })).rejects.toMatchObject({
      code: 'payment_required',
      status: 402,
    });
  });

  it('parses the string error envelope (observed 404 route shape)', async () => {
    const { artemida } = build([jsonResponse({ status: 404, body: stringError() })]);
    const err = (await artemida
      .getPricing({ days: 7, devices: 2 })
      .catch((e) => e)) as ArtemidaError;
    expect(err).toBeInstanceOf(ArtemidaError);
    expect(err.code).toBe('not_found');
  });

  it('does NOT retry a 401 and maps it to unauthorized', async () => {
    const { artemida, seq } = build([
      jsonResponse({ status: 401, body: objectError('invalid_api_key') }),
      jsonResponse({ body: pricingEnvelope(49) }),
    ]);
    await expect(artemida.getPricing({ days: 7, devices: 2 })).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(seq.calls()).toBe(1);
  });

  it('maps 409 to conflict without retrying', async () => {
    const { artemida, seq } = build([
      jsonResponse({ status: 409, body: objectError('conflict') }),
    ]);
    await expect(artemida.getPricing({ days: 7, devices: 2 })).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(seq.calls()).toBe(1);
  });

  it('retries 429 then succeeds (honoring Retry-After)', async () => {
    const { artemida, seq } = build([
      jsonResponse({
        status: 429,
        headers: { 'retry-after': '0' },
        body: objectError('rate_limited'),
      }),
      jsonResponse({ body: pricingEnvelope(49, { days: 7, devices: 2 }) }),
    ]);
    await expect(artemida.getPricing({ days: 7, devices: 2 })).resolves.toMatchObject({
      price: 49,
    });
    expect(seq.calls()).toBe(2);
  });

  it.each([502, 503])('retries %i then succeeds', async (status) => {
    const { artemida, seq } = build([
      jsonResponse({ status, body: objectError('bad_gateway') }),
      jsonResponse({ body: pricingEnvelope(300, { days: 90, devices: 2 }) }),
    ]);
    await expect(artemida.getPricing({ days: 90, devices: 2 })).resolves.toMatchObject({
      price: 300,
    });
    expect(seq.calls()).toBe(2);
  });

  it('extracts Retry-After seconds from a terminal 429', async () => {
    const seq = sequenceFetch([
      jsonResponse({
        status: 429,
        headers: { 'retry-after': '3' },
        body: objectError('rate_limited'),
      }),
    ]);
    const artemida = createArtemidaClient({ fetch: seq.fetch, retry: { retries: 0 } });
    const err = (await artemida
      .getPricing({ days: 7, devices: 2 })
      .catch((e) => e)) as ArtemidaError;
    expect(err).toBeInstanceOf(ArtemidaError);
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterSec).toBe(3);
    expect(seq.calls()).toBe(1);
  });

  it('returns the exact provider amount (data.quote.amount), never recomputed', async () => {
    const { artemida } = build([
      jsonResponse({ body: pricingEnvelope(49, { days: 7, devices: 2 }) }),
    ]);
    await expect(artemida.getPricing({ days: 7, devices: 2 })).resolves.toEqual({
      price: 49,
      currency: 'RUB',
      days: 7,
      devices: 2,
    });
  });

  it('accepts tolerant fallbacks (data.price / data.amount)', async () => {
    const price = build([jsonResponse({ body: success({ price: 120, currency: 'RUB' }) })]);
    await expect(price.artemida.getPricing({ days: 30, devices: 2 })).resolves.toMatchObject({
      price: 120,
      days: 30,
      devices: 2,
    });
    const amount = build([jsonResponse({ body: success({ amount: 300 }) })]);
    await expect(amount.artemida.getPricing({ days: 90, devices: 4 })).resolves.toMatchObject({
      price: 300,
      devices: 4,
    });
  });

  it('throws a typed unknown error (not a ZodError) for an unrecognized 200 body', async () => {
    const { artemida } = build([jsonResponse({ body: success({ unexpected: true }) })]);
    const err = (await artemida
      .getPricing({ days: 7, devices: 2 })
      .catch((e) => e)) as ArtemidaError;
    expect(err).toBeInstanceOf(ArtemidaError);
    expect(err.code).toBe('unknown');
  });

  it('sends Authorization: Bearer and hits the /pricing query contract', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = {
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        init,
      };
      return jsonResponse({ body: pricingEnvelope(49, { days: 7, devices: 2 }) });
    }) as typeof globalThis.fetch;
    const artemida = createArtemidaClient({ fetch: fakeFetch, retry: FAST });

    await artemida.getPricing({ days: 7, devices: 2 });

    expect(captured?.url).toContain('/pricing?days=7&devices=2');
    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${process.env['ARTEMIDA_API_KEY']}`);
    // GET carries no Idempotency-Key (writes only).
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});

describe('artemida client — full V1 surface (D-17)', () => {
  it('createTrial posts customerRef and normalizes the returned key', async () => {
    const cap = capturing([
      jsonResponse({
        body: success({ key: { id: 'key_1', status: 'active', isTrial: true, devices: [] } }),
      }),
    ]);
    const artemida = createArtemidaClient({ fetch: cap.fetch, retry: FAST });

    await expect(artemida.createTrial({ customerRef: '424242' })).resolves.toMatchObject({
      id: 'key_1',
      status: 'active',
      isTrial: true,
      devices: 0,
    });
    expect(cap.calls[0]?.method).toBe('POST');
    expect(cap.calls[0]?.url).toContain('/trial');
    expect(cap.calls[0]?.headers['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(cap.calls[0]?.body ?? '{}')).toEqual({ customerRef: '424242' });
  });

  it('maps a createTrial conflict (409) and does not retry', async () => {
    const seq = sequenceFetch([jsonResponse({ status: 409, body: objectError('conflict') })]);
    const artemida = createArtemidaClient({ fetch: seq.fetch, retry: FAST });

    await expect(artemida.createTrial({ customerRef: 'x' })).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(seq.calls()).toBe(1);
  });

  it('listKeys normalizes the observed empty shape', async () => {
    const { artemida } = build([
      jsonResponse({ body: success({ items: [], count: 0, query: '' }) }),
    ]);
    await expect(artemida.listKeys()).resolves.toEqual({ items: [], count: 0, query: '' });
  });

  it('listKeys sends limit/offset/includeRevoked/q and normalizes rows', async () => {
    const cap = capturing([
      jsonResponse({
        body: success({
          items: [
            {
              id: 'k1',
              name: 'Main',
              status: 'active',
              isTrial: false,
              expiresAt: '2030-01-01T00:00:00Z',
              deviceLimit: 4,
              devices: 2,
              customerRef: '42',
            },
          ],
          count: 1,
          query: '42',
        }),
      }),
    ]);
    const artemida = createArtemidaClient({ fetch: cap.fetch, retry: FAST });

    const list = await artemida.listKeys({ limit: 10, offset: 5, includeRevoked: true, q: '42' });

    expect(list.items[0]).toMatchObject({
      id: 'k1',
      name: 'Main',
      status: 'active',
      deviceLimit: 4,
      devices: 2,
      customerRef: '42',
    });
    expect(cap.calls[0]?.url).toContain('limit=10');
    expect(cap.calls[0]?.url).toContain('offset=5');
    expect(cap.calls[0]?.url).toContain('includeRevoked=true');
    expect(cap.calls[0]?.url).toContain('q=42');
  });

  it('getKey normalizes a nested data.key and maps a 404', async () => {
    const ok = build([jsonResponse({ body: success({ key: { id: 'k2', status: 'active' } }) })]);
    await expect(ok.artemida.getKey('k2')).resolves.toMatchObject({ id: 'k2', status: 'active' });

    const missing = build([jsonResponse({ status: 404, body: stringError() })]);
    await expect(missing.artemida.getKey('nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('getSubscriptionLinks normalizes subscriptionUrl with a vless fallback', async () => {
    const { artemida } = build([
      jsonResponse({ body: success({ subscriptionUrl: 'https://sub/x', vless: ['vless://a'] }) }),
    ]);
    await expect(artemida.getSubscriptionLinks('k2')).resolves.toEqual({
      subscriptionUrl: 'https://sub/x',
      links: ['vless://a'],
    });
  });

  it('getDevices normalizes token/name rows', async () => {
    const { artemida } = build([
      jsonResponse({ body: success({ items: [{ token: 't1', name: 'Phone' }, { id: 't2' }] }) }),
    ]);
    await expect(artemida.getDevices('k2')).resolves.toEqual([
      { token: 't1', name: 'Phone' },
      { token: 't2', name: null },
    ]);
  });

  it('device/traffic/lifecycle writes are idempotent-keyed', async () => {
    const cap = capturing([jsonResponse({ body: success({}) })]);
    const artemida = createArtemidaClient({ fetch: cap.fetch, retry: FAST });

    await artemida.deleteDevice('k2', 'tok en');
    await artemida.clearDevices('k2');
    await artemida.resetTraffic('k2');
    await artemida.disableKey('k2');
    await artemida.enableKey('k2');
    await artemida.deleteKey('k2');
    await artemida.deleteKey('k2', { permanent: true });

    const [delDevice, clear, reset, disable, enable, del, delPerm] = cap.calls;
    expect(delDevice?.method).toBe('DELETE');
    expect(delDevice?.url).toContain('/keys/k2/devices/tok%20en');
    expect(clear?.method).toBe('POST');
    expect(clear?.url).toContain('/keys/k2/devices/clear');
    expect(reset?.url).toContain('/keys/k2/traffic/reset');
    expect(disable?.url).toContain('/keys/k2/disable');
    expect(enable?.url).toContain('/keys/k2/enable');
    expect(del?.method).toBe('DELETE');
    expect(del?.url).toContain('/keys/k2');
    expect(del?.url).not.toContain('permanent');
    expect(delPerm?.url).toContain('/keys/k2/permanent');
    for (const call of cap.calls) {
      expect(call.headers['Idempotency-Key']).toBeTruthy();
    }
  });

  it('getTraffic normalizes used/limit bytes (0 = unlimited)', async () => {
    const { artemida } = build([
      jsonResponse({ body: success({ usedBytes: 1024, limitBytes: 0 }) }),
    ]);
    await expect(artemida.getTraffic('k2')).resolves.toEqual({ usedBytes: 1024, limitBytes: 0 });
  });

  it('renewKey / upgradeKey post {days,devices} and normalize the key', async () => {
    const cap = capturing([
      jsonResponse({
        body: success({ key: { id: 'k2', status: 'active', expiresAt: '2030-05-01T00:00:00Z' } }),
      }),
      jsonResponse({ body: success({ key: { id: 'k2', status: 'active', deviceLimit: 6 } }) }),
    ]);
    const artemida = createArtemidaClient({ fetch: cap.fetch, retry: FAST });

    await expect(artemida.renewKey('k2', { days: 30, devices: 4 })).resolves.toMatchObject({
      id: 'k2',
      expiresAt: '2030-05-01T00:00:00Z',
    });
    await expect(artemida.upgradeKey('k2', { days: 90, devices: 6 })).resolves.toMatchObject({
      deviceLimit: 6,
    });
    expect(cap.calls[0]?.url).toContain('/keys/k2/renew');
    expect(JSON.parse(cap.calls[0]?.body ?? '{}')).toEqual({ days: 30, devices: 4 });
    expect(cap.calls[1]?.url).toContain('/keys/k2/upgrade');
    expect(JSON.parse(cap.calls[1]?.body ?? '{}')).toEqual({ days: 90, devices: 6 });
    for (const call of cap.calls) {
      expect(call.headers['Idempotency-Key']).toBeTruthy();
    }
  });

  it('getBalance normalizes the observed balance shape', async () => {
    const { artemida } = build([
      jsonResponse({ body: success({ balance: 0, currency: 'RUB', unlimited: false }) }),
    ]);
    await expect(artemida.getBalance()).resolves.toEqual({ balance: 0, currency: 'RUB', unlimited: false });
  });
});

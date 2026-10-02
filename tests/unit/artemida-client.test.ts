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

// Wave 0 contract vectors for POST /api/mobile/promo/apply (D-08,
// REQ-SHOP-03/05, T-21-16/18/19): read-only server-side promo preview,
// no oracle for invalid codes, no client discount authority and no
// consumption path reachable from this route. All collaborators are mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  validate: vi.fn(),
  consume: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/promo', () => ({
  validatePromo: mocks.validate,
  consumePromo: mocks.consume,
}));
vi.mock('../../lib/logger', () => ({
  logger: { info: mocks.info, error: mocks.error, warn: mocks.warn, debug: vi.fn() },
}));

import { POST } from '../../app/api/mobile/promo/apply/route';

const SECRET = 'PROMO_SERVER_SECRET_7d21';

function promoRow(code: string, discount: number, type = 'percentage') {
  return {
    id: 'promo-1',
    code,
    discount,
    type,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ownerUserId: null,
  };
}

function valid(code: string, discount: number, type = 'percentage') {
  return { ok: true as const, row: promoRow(code, discount, type), finalAmount: 8500 };
}

async function apply(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/mobile/promo/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-access' },
      body: JSON.stringify(body),
    }),
  );
}

const logText = () => JSON.stringify([...mocks.info.mock.calls, ...mocks.error.mock.calls, ...mocks.warn.mock.calls]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ userId: 42, telegramId: null });
  mocks.validate.mockResolvedValue(valid('LIME15', 15));
});

describe('POST /api/mobile/promo/apply — read-only preview (D-08)', () => {
  it('previews LIME15 as 15% with a percentage only', async () => {
    const res = await apply({ code: 'LIME15' });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(body).toEqual({ ok: true, code: 'LIME15', discountPercent: 15 });
    expect(Object.keys(body).sort()).toEqual(['code', 'discountPercent', 'ok']);
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(mocks.validate.mock.calls[0][0]).toBe('LIME15');
  });

  it('previews 3SET5 as 5%', async () => {
    mocks.validate.mockResolvedValue(valid('3SET5', 5));

    const res = await apply({ code: '3SET5' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: '3SET5', discountPercent: 5 });
  });

  it('normalizes a lowercase code through the server validator', async () => {
    await apply({ code: ' lime15 ' });

    expect(mocks.validate.mock.calls[0][0]).toBe('LIME15');
  });

  it('never returns a client-authoritative amount or consumes the code', async () => {
    const res = await apply({ code: 'LIME15' });
    const text = await res.text();

    expect(text).not.toContain('8500');
    expect(text).not.toContain('finalAmount');
    expect(text).not.toContain('amount');
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});

describe('POST /api/mobile/promo/apply — no oracle for invalid codes (T-21-18)', () => {
  it('returns one stable promo_invalid code for an unknown code', async () => {
    mocks.validate.mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await apply({ code: 'NOPE123' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'promo_invalid' });
  });

  it('maps exhausted and expired codes to the same stable code', async () => {
    mocks.validate.mockResolvedValueOnce({ ok: false, reason: 'exhausted' });
    mocks.validate.mockResolvedValueOnce({ ok: false, reason: 'expired' });

    expect(await (await apply({ code: 'LIME15' })).json()).toEqual({ ok: false, error: 'promo_invalid' });
    expect(await (await apply({ code: '3SET5' })).json()).toEqual({ ok: false, error: 'promo_invalid' });
  });

  it('rejects a malformed code with the same code and no validator call', async () => {
    const res = await apply({ code: 'ab' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'promo_invalid' });
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied discount field', async () => {
    const res = await apply({ code: 'LIME15', discount: 100, amount: 1 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'promo_invalid' });
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it('rejects a fixed-amount promo as non-previewable', async () => {
    mocks.validate.mockResolvedValue(valid('FIXED500', 500, 'fixed'));

    const res = await apply({ code: 'FIXED500' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'promo_invalid' });
  });
});

describe('POST /api/mobile/promo/apply — gate and degradation (T-21-16/19)', () => {
  it('returns 401 without a JWT and never validates or consumes', async () => {
    mocks.verify.mockResolvedValue(null);

    const res = await apply({ code: 'LIME15' });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('degrades an unexpected failure to 200 internal without leaking text', async () => {
    const leaked = new Error(SECRET);
    mocks.validate.mockRejectedValue(leaked);

    const res = await apply({ code: 'LIME15' });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'internal' });
    expect(text).not.toContain(SECRET);
    expect(logText()).not.toContain(SECRET);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('returns bad_request for a non-JSON body', async () => {
    const res = await POST(
      new Request('http://localhost/api/mobile/promo/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-access' },
        body: '{not json',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});

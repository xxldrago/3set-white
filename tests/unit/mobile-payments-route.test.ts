// Wave 0 contract vectors for the mobile money-path slice (REQ-SHOP-06 /
// REQ-BE-04 / REQ-BE-07, T-21-01..03/07/08): JWT gate, strict server-quoted
// body, trial 409, ownership 404, DB-only status, single issuer, and secret
// discipline in BOTH response bodies and logs. All collaborators are mocked;
// no real payment or ARTEMIDA call is made.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  createOrder: vi.fn(),
  precheck: vi.fn(),
  loadOrder: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/orders-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/orders-service')>();
  return {
    ...actual,
    createOrder: mocks.createOrder,
    precheckOwnedKeyByUserId: mocks.precheck,
    loadOrderForUserId: mocks.loadOrder,
  };
});
vi.mock('../../lib/logger', () => ({
  logger: { info: mocks.info, error: mocks.error, warn: mocks.warn, debug: vi.fn() },
}));

import { POST } from '../../app/api/mobile/payments/create/route';
import { GET } from '../../app/api/mobile/payments/status/[id]/route';

const PAYMENT_URL = 'https://pay.example.test/checkout/SECRETPAYURL123';
const TX_ID = 'platega-tx-SECRET999';

const NEW_BODY = { kind: 'new', days: 7, devices: 2 };

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/mobile/payments/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-access' },
    body: JSON.stringify(body),
  });
}

function statusRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/mobile/payments/status/${encodeURIComponent(id)}`, {
      headers: { authorization: 'Bearer test-access' },
    }),
    { params: Promise.resolve({ id }) },
  ];
}

const created = (id = 'order-123') => ({
  kind: 'created' as const,
  order: {
    id,
    status: 'pending',
    paidAt: null,
    provisionedKeyId: null,
    plategaTxId: TX_ID,
    paymentUrl: PAYMENT_URL,
    amount: 115,
    finalAmount: 115,
    currency: 'RUB',
    payload: id,
  },
  url: PAYMENT_URL,
  provider: 'platega' as const,
});

const ownedKey = {
  id: 'key-owned',
  deviceLimit: 4,
  devices: 1,
  isTrial: false,
};

const logText = () => JSON.stringify([...mocks.info.mock.calls, ...mocks.error.mock.calls, ...mocks.warn.mock.calls]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ userId: 42, telegramId: null });
  mocks.createOrder.mockResolvedValue(created());
  mocks.precheck.mockResolvedValue({ ok: true, key: ownedKey });
  mocks.loadOrder.mockResolvedValue(null);
});

describe('POST /api/mobile/payments/create — JWT gate (T-21-01)', () => {
  it('returns 401 without a JWT and never calls the pipeline', async () => {
    mocks.verify.mockResolvedValue(null);

    const res = await POST(createRequest(NEW_BODY));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.precheck).not.toHaveBeenCalled();
  });
});

describe('POST /api/mobile/payments/create — server-quoted body (T-21-02)', () => {
  it('returns {ok,orderId,paymentUrl} and quotes the amount server-side', async () => {
    const res = await POST(createRequest(NEW_BODY));
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(body).toEqual({ ok: true, orderId: 'order-123', paymentUrl: PAYMENT_URL });

    const input = mocks.createOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({
      userId: 42, kind: 'new', days: 7, devices: 2, channel: 'web',
    });
    // No client amount/discount/payload marker reaches the shared service.
    expect(input).not.toHaveProperty('amount');
    expect(input).not.toHaveProperty('discount');
    expect(input).not.toHaveProperty('payload');
  });

  it('rejects a client-supplied amount/discount with 400 bad_request', async () => {
    const res = await POST(createRequest({ ...NEW_BODY, amount: 1, discount: 99 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['devices=1', { kind: 'new', days: 7, devices: 1 }],
    ['devices=11', { kind: 'new', days: 7, devices: 11 }],
    ['days outside TARIFF_DAYS', { kind: 'new', days: 60, devices: 2 }],
    ['missing days', { kind: 'new', devices: 2 }],
  ])('rejects %s', async (_label, body) => {
    const res = await POST(createRequest(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('uses the owned key limit for renew, never the client device count', async () => {
    const res = await POST(createRequest({ kind: 'renew', days: 30, devices: 10, keyId: 'key-owned' }));

    expect(res.status).toBe(200);
    const input = mocks.createOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({ kind: 'renew', devices: 4, keyId: 'key-owned', days: 30, userId: 42 });
  });

  it('keeps upgrade inside the mobile 10-device ceiling', async () => {
    const res = await POST(createRequest({ kind: 'upgrade', keyId: 'key-owned', addDevices: 7 }));

    expect(res.status).toBe(400); // 4 + 7 > 10
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
});

describe('POST /api/mobile/payments/create — trial / ownership / provider (T-21-05)', () => {
  it('maps a trial renew to the clean 409 code without calling the provider', async () => {
    mocks.precheck.mockResolvedValue({ ok: false, reason: 'trial' });

    const res = await POST(createRequest({ kind: 'renew', days: 30, keyId: 'key-trial' }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'trial' });
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('maps a non-owned key to the same 404 as a missing key', async () => {
    mocks.precheck.mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await POST(createRequest({ kind: 'upgrade', keyId: 'key-foreign', addDevices: 1 }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('degrades a provider error to a stable 200 code, never a 5xx', async () => {
    mocks.createOrder.mockResolvedValue({ kind: 'provider_error', code: 'unauthorized', provider: 'platega' });

    const res = await POST(createRequest(NEW_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('GET /api/mobile/payments/status/[id] — DB-only ownership poll (T-21-03)', () => {
  it('returns 401 without a JWT and never reads the DB', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await GET(...statusRequest('order-123'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(mocks.loadOrder).not.toHaveBeenCalled();
  });

  it('returns an identical 404 for missing and non-owned orders', async () => {
    const missing = await GET(...statusRequest('order-missing'));
    const foreign = await GET(...statusRequest('order-foreign'));

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(await missing.json()).toEqual({ ok: false, error: 'not_found' });
    expect(await foreign.json()).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.loadOrder).toHaveBeenCalledWith(42, 'order-missing');
    expect(mocks.loadOrder).toHaveBeenCalledWith(42, 'order-foreign');
  });

  it('rejects an empty / over-long id with 400 bad_request', async () => {
    expect((await GET(...statusRequest(''))).status).toBe(400);
    expect((await GET(...statusRequest('x'.repeat(201)))).status).toBe(400);
    expect(mocks.loadOrder).not.toHaveBeenCalled();
  });

  it('exposes only our mapped status fields, never provider fields', async () => {
    mocks.loadOrder.mockResolvedValue({
      ...created().order,
      status: 'provisioned',
      paidAt: new Date('2026-11-28T10:00:00.000Z'),
      provisionedKeyId: 'key-issued',
    });

    const res = await GET(...statusRequest('order-123'));
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['ok', 'paidAt', 'provisionedKeyId', 'status']);
    expect(body).toEqual({
      ok: true,
      status: 'provisioned',
      paidAt: '2026-11-28T10:00:00.000Z',
      provisionedKeyId: 'key-issued',
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain(TX_ID);
    expect(text).not.toContain('paymentUrl');
    expect(text).not.toContain('SECRETPAYURL123');
    expect(text).not.toContain('"amount"');
  });

  it('never calls a provider from the poll handler', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('poll must not call a provider'); });
    vi.stubGlobal('fetch', fetchSpy);
    mocks.loadOrder.mockResolvedValue({ ...created().order, status: 'pending' });

    const res = await GET(...statusRequest('order-123'));

    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>).status).toBe('pending');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('secret discipline (T-21-07 / T-21-08)', () => {
  it('never logs the payment URL, transaction id, token or amount', async () => {
    await POST(createRequest(NEW_BODY));
    await GET(...statusRequest('order-123'));

    const logs = logText();
    expect(logs).not.toContain(PAYMENT_URL);
    expect(logs).not.toContain('SECRETPAYURL123');
    expect(logs).not.toContain(TX_ID);
    expect(logs).not.toContain('test-access');
    expect(logs).not.toContain('"amount"');
    expect(logs).not.toContain('115');
  });

  it('derives success only from the stored DB status, not a timer', async () => {
    mocks.loadOrder.mockResolvedValueOnce({ ...created().order, status: 'pending' });
    const pending = await GET(...statusRequest('order-123'));
    expect((await pending.json() as Record<string, unknown>).status).toBe('pending');

    mocks.loadOrder.mockResolvedValueOnce({ ...created().order, status: 'provisioned' });
    const done = await GET(...statusRequest('order-123'));
    expect((await done.json() as Record<string, unknown>).status).toBe('provisioned');
  });
});

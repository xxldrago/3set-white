// Wave 0 contract for /api/mobile/devices (REQ-DEV-01/02, REQ-BE-06, T-22-01/02/07).
// Ownership-scoped JWT read, opaque token, stable {ok,error} envelope, zod bounds,
// Retry-After and no token/provider text in body or logs. No live provider.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RenderedKey } from '../../lib/keys-service';
import { ArtemidaError } from '../../lib/artemida';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  listKeys: vi.fn(),
  listDevices: vi.fn(),
  removeDevice: vi.fn(),
  createOrder: vi.fn(),
  precheck: vi.fn(),
  // subscription-view imports deriveStatusKind from keys-service; mirror the
  // real derivation so fixtures exercise the actual connectable predicate.
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
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/keys-service', () => ({
  listKeysByUserId: mocks.listKeys,
  listDevicesWithLabels: mocks.listDevices,
  removeDeviceByUserId: mocks.removeDevice,
  deriveStatusKind: mocks.deriveStatusKind,
}));
vi.mock('../../lib/logger', () => ({
  logger: { info: mocks.info, warn: mocks.warn, error: mocks.error, debug: vi.fn() },
}));

vi.mock('../../lib/orders-service', () => ({
  createOrder: mocks.createOrder,
  precheckOwnedKeyByUserId: mocks.precheck,
  keyDeviceLimit: vi.fn(() => 5),
  TRIAL_ERROR_CODE: 'trial',
}));

import { GET } from '../../app/api/mobile/devices/route';
import { DELETE } from '../../app/api/mobile/devices/[token]/route';
import { POST as createPayment } from '../../app/api/mobile/payments/create/route';

const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString();
const TOKEN_A = 'opaque-token-AAA';
const TOKEN_B = 'opaque-token-BBB';
const PROVIDER_SECRET = 'PROVIDER_SECRET_MUST_NOT_LEAK';

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

const listRequest = () =>
  new Request('http://localhost/api/mobile/devices') as NextRequest;

const logText = () =>
  JSON.stringify(mocks.info.mock.calls) +
  JSON.stringify(mocks.warn.mock.calls) +
  JSON.stringify(mocks.error.mock.calls);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ userId: 1, telegramId: null });
  mocks.listKeys.mockResolvedValue([key()]);
  mocks.listDevices.mockResolvedValue([
    { token: TOKEN_A, label: 'Телефон', name: 'Pixel' },
    { token: TOKEN_B, label: null, name: 'Ноутбук' },
  ]);
});

describe('GET /devices — JWT and ownership gate (T-22-01/07)', () => {
  it('401 without a JWT and makes no provider or DB read', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await GET(listRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(mocks.listKeys).not.toHaveBeenCalled();
    expect(mocks.listDevices).not.toHaveBeenCalled();
  });

  it('returns no_active_key for a missing active key without a provider call', async () => {
    mocks.listKeys.mockResolvedValue([]);
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'no_active_key' });
    expect(mocks.listDevices).not.toHaveBeenCalled();
  });

  it('returns the identical no_active_key envelope for a non-owned key (null join)', async () => {
    mocks.listDevices.mockResolvedValue(null);
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'no_active_key' });
    expect(mocks.listDevices).toHaveBeenCalledTimes(1);
    expect(mocks.listDevices).toHaveBeenCalledWith(1, 'key-active');
  });
});

describe('GET /devices — honest rows and secret discipline (T-22-02/06)', () => {
  it('returns one row per token in provider order with label/name and server deviceLimit', async () => {
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.deviceLimit).toBe(5);
    expect(body.devices).toEqual([
      { token: TOKEN_A, label: 'Телефон', name: 'Pixel' },
      { token: TOKEN_B, label: null, name: 'Ноутбук' },
    ]);
    // No client keyId, subscription link or fabricated last-seen value.
    expect(JSON.stringify(body)).not.toContain('keyId');
    expect(JSON.stringify(body)).not.toContain('lastSeen');
    expect(JSON.stringify(body)).not.toContain('link');
  });

  it('never emits a device token or provider text in the body or logs', async () => {
    const res = await GET(listRequest());
    const bodyText = JSON.stringify(await res.json());
    expect(bodyText).not.toContain(PROVIDER_SECRET);
    // Stable codes only in logs; the token is never a log field.
    expect(logText()).not.toContain(TOKEN_A);
    expect(logText()).not.toContain(TOKEN_B);
    expect(logText()).not.toContain(PROVIDER_SECRET);
  });
});

describe('GET /devices — provider degradation (no 5xx, no provider text)', () => {
  it('returns a stable 200 code and Retry-After on rate limits', async () => {
    mocks.listDevices.mockRejectedValue(
      new ArtemidaError('rate_limited', 429, 7, PROVIDER_SECRET),
    );
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: 'rate_limited', retryAfterSec: 7 });
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(JSON.stringify(body)).not.toContain(PROVIDER_SECRET);
    expect(logText()).not.toContain(PROVIDER_SECRET);
  });

  it('maps provider unauthorized to the same no_active_key outcome', async () => {
    mocks.listDevices.mockRejectedValue(
      new ArtemidaError('unauthorized', 401, undefined, PROVIDER_SECRET),
    );
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'no_active_key' });
    expect(logText()).not.toContain(PROVIDER_SECRET);
  });

  it('degrades an unexpected failure to stable internal without leaking text', async () => {
    mocks.listDevices.mockRejectedValue(new Error(PROVIDER_SECRET));
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'internal' });
    expect(logText()).not.toContain(PROVIDER_SECRET);
  });
});

const deleteRequest = (token: string) =>
  new Request(`http://localhost/api/mobile/devices/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  }) as NextRequest;

const callDelete = (token: string) =>
  DELETE(deleteRequest(token), { params: Promise.resolve({ token }) });

describe('DELETE /devices/{token} — auth, zod bounds and ownership (T-22-01/02)', () => {
  beforeEach(() => {
    mocks.removeDevice.mockResolvedValue(true);
  });

  it('401 without a JWT and makes no ownership or provider call', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await callDelete(TOKEN_A);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(mocks.listKeys).not.toHaveBeenCalled();
    expect(mocks.removeDevice).not.toHaveBeenCalled();
  });

  it('rejects an out-of-bounds token with zod before any provider call', async () => {
    const tooLong = 'x'.repeat(301);
    const empty = '';
    for (const token of [tooLong, empty]) {
      const res = await callDelete(token);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    }
    expect(mocks.listKeys).not.toHaveBeenCalled();
    expect(mocks.removeDevice).not.toHaveBeenCalled();
    expect(logText()).not.toContain(tooLong);
  });

  it('derives the key from claims.userId and deletes only the opaque token', async () => {
    const res = await callDelete(TOKEN_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.removeDevice).toHaveBeenCalledTimes(1);
    expect(mocks.removeDevice).toHaveBeenCalledWith(1, 'key-active', TOKEN_A);
    expect(logText()).not.toContain(TOKEN_A);
  });

  it('returns the same no_active_key outcome for a non-owned key and a missing key', async () => {
    mocks.removeDevice.mockResolvedValue(false);
    const nonOwned = await callDelete(TOKEN_A);
    expect(nonOwned.status).toBe(200);
    expect(await nonOwned.json()).toEqual({ ok: false, error: 'no_active_key' });

    mocks.listKeys.mockResolvedValue([]);
    const missing = await callDelete(TOKEN_A);
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ ok: false, error: 'no_active_key' });
    expect(mocks.removeDevice).toHaveBeenCalledTimes(1); // none for the missing key
  });
});

describe('DELETE /devices/{token} — stable degradation (T-22-04/07)', () => {
  beforeEach(() => {
    mocks.removeDevice.mockResolvedValue(true);
  });

  it('degrades a provider rate limit to a stable 200 code with Retry-After', async () => {
    mocks.removeDevice.mockRejectedValue(
      new ArtemidaError('rate_limited', 429, 5, PROVIDER_SECRET),
    );
    const res = await callDelete(TOKEN_B);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: 'rate_limited', retryAfterSec: 5 });
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(JSON.stringify(body)).not.toContain(PROVIDER_SECRET);
    expect(logText()).not.toContain(PROVIDER_SECRET);
    expect(logText()).not.toContain(TOKEN_B);
  });

  it('two concurrent deletes for one token resolve to the same stable outcome', async () => {
    const results = await Promise.all([callDelete(TOKEN_A), callDelete(TOKEN_A)]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    const bodies = await Promise.all(results.map((res) => res.json()));
    expect(bodies).toEqual([{ ok: true }, { ok: true }]);
    expect(logText()).not.toContain(TOKEN_A);
  });
});

const paymentRequest = (body: unknown) =>
  new Request('http://localhost/api/mobile/payments/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-access' },
    body: JSON.stringify(body),
  });

describe('paid upgrade handoff (D-05, no second issuer)', () => {
  it('derives the active owned key from the JWT when no client keyId is sent', async () => {
    mocks.precheck.mockResolvedValue({ ok: true, key: { id: 'key-active' } });
    mocks.createOrder.mockResolvedValue({
      kind: 'created',
      order: { id: 'ord-1' },
      url: 'https://pay.invalid/x',
    });

    const res = await createPayment(paymentRequest({ kind: 'upgrade', addDevices: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, orderId: 'ord-1' });
    expect(mocks.precheck).toHaveBeenCalledWith(1, 'key-active');
    expect(mocks.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'upgrade',
        addDevices: 1,
        userId: 1,
        keyId: 'key-active',
      }),
    );
  });

  it('returns not_found when there is no active key, without any provider call', async () => {
    mocks.listKeys.mockResolvedValue([]);
    const res = await createPayment(paymentRequest({ kind: 'upgrade', addDevices: 1 }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.precheck).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
});

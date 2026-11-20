// Administrator wallet BFF (provider API balance + top-up invoices).
//
// The API balance is the OPERATOR's prepaid account with ARTEMIDA — customer
// money never flows through it. These vectors pin the boundaries that matter:
// the administrator gate (signed out 401 / wrong role 404 / admin 200), amount
// validation before any provider call, and that a top-up without a payment id is
// treated as a provider failure rather than a usable success.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as walletGet } from '../../app/api/admin/wallet/route';
import { POST as topupPost } from '../../app/api/admin/wallet/topups/route';
import { GET as topupStatusGet } from '../../app/api/admin/wallet/topups/[paymentId]/route';
import { ArtemidaError, artemida } from '../../lib/artemida';
import { signSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

const ADMIN = BigInt('200000090');
const BUYER = BigInt('200000091');

async function cleanup(): Promise<void> {
  await prisma.adminUser.deleteMany({ where: { telegramId: { in: [ADMIN, BUYER] } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: [ADMIN, BUYER] } } });
}

async function authorizeAs(telegramId: bigint, role: 'administrator' | null): Promise<void> {
  // Roles live in the dedicated `admin_users` table (D-64/D-65), keyed by
  // telegram id — never on `user`.
  await prisma.adminUser.deleteMany({ where: { telegramId } });
  if (role !== null) {
    await prisma.adminUser.create({ data: { telegramId, role } });
  }
  session.token = await signSession(Number(telegramId), SECRET);
}

function post(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function paymentContext(paymentId: string) {
  return { params: Promise.resolve({ paymentId }) };
}

const plain = () => new Request('http://localhost');

beforeAll(async () => {
  await cleanup();
  await prisma.user.create({ data: { telegramId: ADMIN }, select: { id: true } });
  await prisma.user.create({ data: { telegramId: BUYER }, select: { id: true } });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

beforeEach(() => {
  session.token = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/admin/wallet', () => {
  it('returns 401 without a session and never reads the provider', async () => {
    const getBalance = vi.spyOn(artemida, 'getBalance').mockRejectedValue(new Error('no call'));

    const res = await walletGet();

    expect(res.status).toBe(401);
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('returns 404 for a signed-in non-administrator', async () => {
    await authorizeAs(BUYER, null);
    const getBalance = vi.spyOn(artemida, 'getBalance').mockRejectedValue(new Error('no call'));

    const res = await walletGet();

    expect(res.status).toBe(404);
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('returns the provider balance for an administrator', async () => {
    await authorizeAs(ADMIN, 'administrator');
    vi.spyOn(artemida, 'getBalance').mockResolvedValue({
      balance: 1840,
      currency: 'RUB',
      unlimited: false,
    });

    const res = await walletGet();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      balance: { balance: 1840, currency: 'RUB', unlimited: false },
    });
  });

  it('maps a provider 402 to 402', async () => {
    await authorizeAs(ADMIN, 'administrator');
    vi.spyOn(artemida, 'getBalance').mockRejectedValue(
      new ArtemidaError('payment_required', 402),
    );

    expect((await walletGet()).status).toBe(402);
  });
});

describe('POST /api/admin/wallet/topups', () => {
  it('returns 401 without a session', async () => {
    const create = vi.spyOn(artemida, 'createWalletTopup').mockRejectedValue(new Error('no call'));

    const res = await topupPost(post({ amount: 1000 }));

    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('validates the amount before any provider call', async () => {
    await authorizeAs(ADMIN, 'administrator');
    const create = vi.spyOn(artemida, 'createWalletTopup').mockRejectedValue(new Error('no call'));

    expect((await topupPost(post({ amount: 0 }))).status).toBe(400);
    expect((await topupPost(post({ amount: -100 }))).status).toBe(400);
    expect((await topupPost(post({ amount: 1.5 }))).status).toBe(400);
    expect((await topupPost(post({ amount: '1000' }))).status).toBe(400);
    expect((await topupPost(post({}))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates an invoice and forwards the idempotency key', async () => {
    await authorizeAs(ADMIN, 'administrator');
    const create = vi.spyOn(artemida, 'createWalletTopup').mockResolvedValue({
      operationId: 'op_1',
      paymentId: 'A123',
      amount: 1000,
      currency: 'RUB',
      url: 'https://pay.test/A123',
      status: 'CREATED',
    });

    const res = await topupPost(post({ amount: 1000, idempotencyKey: 'topup-01' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ topup: { paymentId: 'A123', amount: 1000 } });
    expect(create).toHaveBeenCalledWith({ amount: 1000 }, { idempotencyKey: 'topup-01' });
  });

  it('treats a missing payment id as a provider failure (502)', async () => {
    await authorizeAs(ADMIN, 'administrator');
    vi.spyOn(artemida, 'createWalletTopup').mockResolvedValue({
      operationId: null,
      paymentId: '',
      amount: 1000,
      currency: 'RUB',
      url: null,
      status: 'CREATED',
    });

    const res = await topupPost(post({ amount: 1000 }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'bad_gateway' });
  });
});

describe('GET /api/admin/wallet/topups/[paymentId]', () => {
  it('returns 401 without a session', async () => {
    const get = vi.spyOn(artemida, 'getWalletTopup').mockRejectedValue(new Error('no call'));

    const res = await topupStatusGet(plain(), paymentContext('A123'));

    expect(res.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it('relays the payment state and the resulting balance', async () => {
    await authorizeAs(ADMIN, 'administrator');
    const get = vi.spyOn(artemida, 'getWalletTopup').mockResolvedValue({
      paymentId: 'A123',
      amount: 1000,
      currency: 'RUB',
      status: 'CONFIRMED',
      paid: true,
      processed: true,
      processing: false,
      balance: 2840,
    });

    const res = await topupStatusGet(plain(), paymentContext('A123'));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: { paymentId: 'A123', processed: true, balance: 2840 },
    });
    expect(get).toHaveBeenCalledWith('A123');
  });

  it('rejects an over-long payment id (400)', async () => {
    await authorizeAs(ADMIN, 'administrator');
    const get = vi.spyOn(artemida, 'getWalletTopup').mockRejectedValue(new Error('no call'));

    expect((await topupStatusGet(plain(), paymentContext('x'.repeat(201)))).status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });
});

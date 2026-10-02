// Device BFF route vectors (CAB-03 / T-02-21/T-02-23): every device route is
// session-gated, zod-validates its path segments, and joins ownership before any
// provider call so a non-owned key can never mutate another user's devices.
//
// Integration style: a real local Postgres (auth-flow.test.ts pattern) with a
// spied `artemida` so no network is hit. next/headers is mocked so a signed
// session cookie can be presented without a Next runtime.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { DELETE } from '../../app/api/keys/[id]/devices/[token]/route';
import { POST } from '../../app/api/keys/[id]/devices/clear/route';
import { GET } from '../../app/api/keys/[id]/devices/route';
import { artemida, type Device } from '../../lib/artemida';
import { signSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

const OWNER = BigInt('200000070');
const OTHER = BigInt('200000071');
const KEY_ID = 'key-devices-route-test';

async function cleanup(): Promise<void> {
  await prisma.user.deleteMany({ where: { telegramId: { in: [OWNER, OTHER] } } });
}

async function authorize(telegramId: bigint): Promise<void> {
  session.token = await signSession(Number(telegramId), SECRET);
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function tokenContext(id: string, token: string) {
  return { params: Promise.resolve({ id, token }) };
}

const request = () => new Request('http://localhost');

beforeAll(async () => {
  await cleanup();
  const owner = await prisma.user.create({
    data: { telegramId: OWNER },
    select: { id: true },
  });
  await prisma.user.create({ data: { telegramId: OTHER }, select: { id: true } });
  await prisma.keyCache.create({
    data: { userId: owner.id, keyId: KEY_ID, status: 'active' },
  });
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

describe('GET /api/keys/[id]/devices (CAB-03)', () => {
  it('returns 401 without a session and never calls ARTEMIDA', async () => {
    const getDevices = vi.spyOn(artemida, 'getDevices').mockRejectedValue(new Error('no call'));

    const res = await GET(request(), idContext(KEY_ID));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(getDevices).not.toHaveBeenCalled();
  });

  it('rejects an invalid id (400) before any provider call', async () => {
    await authorize(OWNER);
    const getDevices = vi.spyOn(artemida, 'getDevices').mockResolvedValue([]);

    expect((await GET(request(), idContext(''))).status).toBe(400);
    expect((await GET(request(), idContext('x'.repeat(201)))).status).toBe(400);
    expect(getDevices).not.toHaveBeenCalled();
  });

  it('404s a non-owned key without calling the provider (no IDOR)', async () => {
    await authorize(OTHER);
    const getDevices = vi.spyOn(artemida, 'getDevices').mockResolvedValue([]);

    const res = await GET(request(), idContext(KEY_ID));

    expect(res.status).toBe(404);
    expect(getDevices).not.toHaveBeenCalled();
  });

  it('returns only addressable devices for the owning session', async () => {
    await authorize(OWNER);
    // Unknown provider shape: the `id` fallback and an entry with no token at
    // all. The empty-token entry must be dropped, never rendered as a row.
    vi.spyOn(artemida, 'getDevices').mockResolvedValue([
      { token: 'dev-a', name: 'Phone' },
      { token: '', name: 'ghost' },
    ] satisfies Device[]);

    const res = await GET(request(), idContext(KEY_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ devices: [{ token: 'dev-a', name: 'Phone' }] });
  });
});

describe('DELETE /api/keys/[id]/devices/[token] (CAB-03)', () => {
  it('returns 401 without a session and never calls ARTEMIDA', async () => {
    const deleteDevice = vi.spyOn(artemida, 'deleteDevice').mockResolvedValue();

    const res = await DELETE(request(), tokenContext(KEY_ID, 'dev-a'));

    expect(res.status).toBe(401);
    expect(deleteDevice).not.toHaveBeenCalled();
  });

  it('rejects an invalid id/token (400) before any provider call', async () => {
    await authorize(OWNER);
    const deleteDevice = vi.spyOn(artemida, 'deleteDevice').mockResolvedValue();

    expect((await DELETE(request(), tokenContext('', 'dev-a'))).status).toBe(400);
    expect((await DELETE(request(), tokenContext(KEY_ID, ''))).status).toBe(400);
    expect(deleteDevice).not.toHaveBeenCalled();
  });

  it('does not mutate the provider for a non-owned key (404)', async () => {
    await authorize(OTHER);
    const deleteDevice = vi.spyOn(artemida, 'deleteDevice').mockResolvedValue();

    const res = await DELETE(request(), tokenContext(KEY_ID, 'dev-a'));

    expect(res.status).toBe(404);
    expect(deleteDevice).not.toHaveBeenCalled();
  });

  it('removes a device on an owned key', async () => {
    await authorize(OWNER);
    const deleteDevice = vi.spyOn(artemida, 'deleteDevice').mockResolvedValue();

    const res = await DELETE(request(), tokenContext(KEY_ID, 'dev-a'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteDevice).toHaveBeenCalledWith(KEY_ID, 'dev-a');
  });
});

describe('POST /api/keys/[id]/devices/clear (CAB-03)', () => {
  it('returns 401 without a session and never calls ARTEMIDA', async () => {
    const clearDevices = vi.spyOn(artemida, 'clearDevices').mockResolvedValue();

    const res = await POST(request(), idContext(KEY_ID));

    expect(res.status).toBe(401);
    expect(clearDevices).not.toHaveBeenCalled();
  });

  it('rejects an invalid id (400) before any provider call', async () => {
    await authorize(OWNER);
    const clearDevices = vi.spyOn(artemida, 'clearDevices').mockResolvedValue();

    expect((await POST(request(), idContext(''))).status).toBe(400);
    expect(clearDevices).not.toHaveBeenCalled();
  });

  it('does not mutate the provider for a non-owned key (404)', async () => {
    await authorize(OTHER);
    const clearDevices = vi.spyOn(artemida, 'clearDevices').mockResolvedValue();

    const res = await POST(request(), idContext(KEY_ID));

    expect(res.status).toBe(404);
    expect(clearDevices).not.toHaveBeenCalled();
  });

  it('clears devices on an owned key', async () => {
    await authorize(OWNER);
    const clearDevices = vi.spyOn(artemida, 'clearDevices').mockResolvedValue();

    const res = await POST(request(), idContext(KEY_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(clearDevices).toHaveBeenCalledWith(KEY_ID);
  });
});

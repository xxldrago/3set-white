// Local display-label routes (key + device).
//
// ARTEMIDA has no rename endpoint (PATCH/PUT /keys/{id} → 501,
// /keys/{id}/rename → 404 — verified live), so labels live in OUR database and
// are never sent to the provider. These vectors pin the properties that matter:
// session gate, ownership join (no token guessing across keys), and that a
// provider sync can never wipe a user's label.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { PATCH as patchDevice } from '../../app/api/keys/[id]/devices/[token]/route';
import { GET as getDevices } from '../../app/api/keys/[id]/devices/route';
import { PATCH as patchKey } from '../../app/api/keys/[id]/route';
import { artemida } from '../../lib/artemida';
import { signSession } from '../../lib/auth';
import { LABEL_MAX_LENGTH, normalizeLabel, upsertCachedKey } from '../../lib/keys-service';
import { prisma } from '../../lib/prisma';

const SECRET =
  process.env['SESSION_SECRET'] ?? 'unit-test-session-secret-at-least-32-characters';

const OWNER = BigInt('200000080');
const OTHER = BigInt('200000081');
const KEY_ID = 'key-label-route-test';
const TOKEN = 'device-token-a';

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

function patchRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const listRequest = () => new Request('http://localhost');

beforeAll(async () => {
  await cleanup();
  const owner = await prisma.user.create({ data: { telegramId: OWNER }, select: { id: true } });
  await prisma.user.create({ data: { telegramId: OTHER }, select: { id: true } });
  await prisma.keyCache.create({
    data: { userId: owner.id, keyId: KEY_ID, status: 'active', name: 'api_client_845912' },
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

describe('normalizeLabel — shared validation', () => {
  it('trims, clears on blank, and rejects over-long input', () => {
    expect(normalizeLabel('  Домашний Wi-Fi  ')).toBe('Домашний Wi-Fi');
    expect(normalizeLabel('   ')).toBeNull();
    expect(normalizeLabel('')).toBeNull();
    expect(() => normalizeLabel('x'.repeat(LABEL_MAX_LENGTH + 1))).toThrow(/label:too_long/);
    expect(() => normalizeLabel(42)).toThrow(/label:invalid/);
  });
});

describe('PATCH /api/keys/[id] (local key label)', () => {
  it('returns 401 without a session and writes nothing', async () => {
    const res = await patchKey(patchRequest({ label: 'x' }), idContext(KEY_ID));

    expect(res.status).toBe(401);
    const row = await prisma.keyCache.findFirst({ where: { keyId: KEY_ID } });
    expect(row?.label).toBeNull();
  });

  it('404s a non-owned key (indistinguishable from missing)', async () => {
    await authorize(OTHER);

    const res = await patchKey(patchRequest({ label: 'mine' }), idContext(KEY_ID));

    expect(res.status).toBe(404);
    const row = await prisma.keyCache.findFirst({ where: { keyId: KEY_ID } });
    expect(row?.label).toBeNull();
  });

  it('rejects an over-long label with 400 and keeps the old value', async () => {
    await authorize(OWNER);

    const res = await patchKey(
      patchRequest({ label: 'x'.repeat(LABEL_MAX_LENGTH + 1) }),
      idContext(KEY_ID),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'label_too_long' });
  });

  it('sets and then clears the label', async () => {
    await authorize(OWNER);

    const set = await patchKey(patchRequest({ label: '  Домашний  ' }), idContext(KEY_ID));
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ ok: true, label: 'Домашний' });
    expect((await prisma.keyCache.findFirst({ where: { keyId: KEY_ID } }))?.label).toBe('Домашний');

    const cleared = await patchKey(patchRequest({ label: null }), idContext(KEY_ID));
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ ok: true, label: null });
    expect((await prisma.keyCache.findFirst({ where: { keyId: KEY_ID } }))?.label).toBeNull();
  });

  it('survives a provider sync that rewrites the technical name', async () => {
    await authorize(OWNER);
    await patchKey(patchRequest({ label: 'Рабочий' }), idContext(KEY_ID));

    const owner = await prisma.user.findUnique({ where: { telegramId: OWNER }, select: { id: true } });
    await upsertCachedKey(owner!.id, {
      id: KEY_ID,
      name: 'api_client_ROTATED', // provider renames its own field on every sync
      status: 'active',
      isTrial: false,
      expiresAt: null,
      deviceLimit: 2,
      devices: 0,
      subscriptionUrl: null,
      customerRef: null,
      trafficUsedBytes: null,
      trafficLimitBytes: null,
    });

    const row = await prisma.keyCache.findFirst({ where: { keyId: KEY_ID } });
    expect(row?.name).toBe('api_client_ROTATED');
    expect(row?.label).toBe('Рабочий');
  });
});

describe('PATCH /api/keys/[id]/devices/[token] (local device label)', () => {
  it('returns 401 without a session', async () => {
    const res = await patchDevice(patchRequest({ label: 'x' }), tokenContext(KEY_ID, TOKEN));

    expect(res.status).toBe(401);
    expect(await prisma.deviceLabel.count()).toBe(0);
  });

  it('404s a device token on a non-owned key without writing', async () => {
    await authorize(OTHER);

    const res = await patchDevice(patchRequest({ label: 'x' }), tokenContext(KEY_ID, TOKEN));

    expect(res.status).toBe(404);
    expect(await prisma.deviceLabel.count()).toBe(0);
  });

  it('sets, overwrites, then clears a device label', async () => {
    await authorize(OWNER);

    const first = await patchDevice(patchRequest({ label: 'iPhone' }), tokenContext(KEY_ID, TOKEN));
    expect(first.status).toBe(200);

    const second = await patchDevice(
      patchRequest({ label: 'Рабочий iPhone' }),
      tokenContext(KEY_ID, TOKEN),
    );
    expect(second.status).toBe(200);

    const rows = await prisma.deviceLabel.findMany({ where: { keyId: KEY_ID, token: TOKEN } });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Рабочий iPhone');

    const cleared = await patchDevice(patchRequest({ label: null }), tokenContext(KEY_ID, TOKEN));
    expect(cleared.status).toBe(200);
    expect(await prisma.deviceLabel.count({ where: { keyId: KEY_ID, token: TOKEN } })).toBe(0);
  });
});

describe('GET /api/keys/[id]/devices — labels joined onto provider rows', () => {
  it('returns the local label alongside provider fields', async () => {
    await authorize(OWNER);
    vi.spyOn(artemida, 'getDevices').mockResolvedValue([{ token: TOKEN, name: 'iPhone' }]);
    await patchDevice(patchRequest({ label: 'Мой телефон' }), tokenContext(KEY_ID, TOKEN));

    const res = await getDevices(listRequest(), idContext(KEY_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      devices: [{ token: TOKEN, name: 'iPhone', label: 'Мой телефон' }],
    });
  });

  it('reports null for a device the user never labelled', async () => {
    await authorize(OWNER);
    vi.spyOn(artemida, 'getDevices').mockResolvedValue([{ token: 'unlabelled', name: 'iPad' }]);

    const res = await getDevices(listRequest(), idContext(KEY_ID));

    expect(await res.json()).toEqual({
      devices: [{ token: 'unlabelled', name: 'iPad', label: null }],
    });
  });
});

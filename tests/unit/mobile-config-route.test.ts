// GET /api/mobile/config vectors (Phase 20, D-01/D-02/D-03/D-04/D-08):
// JWT 401, per-request active-key 403, serverId-only selection, complete TUN
// schema, WireGuard-in-endpoints, provider-error degradation (no 5xx), and
// secret discipline in BOTH response body and logs. All collaborators mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RenderedKey } from '../../lib/keys-service';
import { parseShareLink, type Server } from '../../lib/server-pool';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  listKeys: vi.fn(),
  days: vi.fn(() => 7),
  // The shared grace helper imports this; mirror the real time-based derivation
  // so the route fixtures exercise the actual predicate (no status is faked).
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
  source: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/keys-service', () => ({
  listKeysByUserId: mocks.listKeys,
  daysUntilExpiry: mocks.days,
  deriveStatusKind: mocks.deriveStatusKind,
}));
vi.mock('../../lib/servers-source', () => ({ getSubscriptionLinksCacheFirst: mocks.source }));
vi.mock('../../lib/logger', () => ({
  logger: { info: mocks.info, error: mocks.error, warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../../app/api/mobile/config/route';
import { buildMobileConfig, serverMeta } from '../../lib/mobile-config';
import { artemida } from '../../lib/artemida';

const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
// Outside any 24h grace window — an expired fixture must stay denied.
const PAST = new Date(Date.now() - 3 * 86_400_000).toISOString();
const GRACE_MS = 24 * 86_400_000;

const NL = '🇳🇱';
const VLESS = `vless://uuid-abc@nl.example.com:443?encryption=none&security=tls&sni=tls.example.com&type=ws&host=cdn.example.com&path=%2Fws#${encodeURIComponent(`${NL} Amsterdam`)}`;
const REALITY = `vless://uuid-reality@reality.example.com:443?security=reality&sni=reality.example.com&flow=xtls-rprx-vision&pbk=peer-key&sid=abc123#${encodeURIComponent('🇺🇸 Reality')}`;
const WG = `wg://private-key@wg.example.com:51820?publickey=peer-pub&address=10.0.0.2%2F32,fd00::2%2F128&mtu=1420&allowedips=0.0.0.0%2F0&keepalive=25#${encodeURIComponent('WG WL')}`;
// Decoy carries a marker secret; it is parsed but never selected, so neither
// the returned config nor the logs may contain it.
const DECOY = 'vless://SUPERSECRET@decoy.example.com:443?security=tls&sni=decoy.example.com#Decoy';

const vlessId = parseShareLink(VLESS)!.id;
const wgId = parseShareLink(WG)!.id;
/** The selected outbound/endpoint tag must be the route target, never direct. */
const tagOf = (link: string) => parseShareLink(link)!.outbound.tag!;

function key(overrides: Partial<RenderedKey> = {}): RenderedKey {
  return {
    id: 'key-active',
    name: '3set VPN',
    status: 'active',
    isTrial: false,
    expiresAt: FUTURE,
    deviceLimit: 2,
    devices: 1,
    subscriptionUrl: null,
    customerRef: 'email:1',
    trafficUsedBytes: 0,
    trafficLimitBytes: null,
    statusKind: 'active',
    ...overrides,
  };
}

function request(serverId?: string | null): NextRequest {
  const query = serverId === undefined ? '' : `?serverId=${encodeURIComponent(serverId ?? '')}`;
  return new Request(`http://localhost/api/mobile/config${query}`) as NextRequest;
}

const okSource = (links: string[] = []) => Promise.resolve({ links, stale: false, error: null });
const logText = () => JSON.stringify(mocks.info.mock.calls) + JSON.stringify(mocks.error.mock.calls);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ userId: 1, telegramId: null });
  mocks.listKeys.mockResolvedValue([key()]);
  mocks.source.mockResolvedValue(okSource([]));
  mocks.days.mockReturnValue(7);
});

describe('JWT gate (D-03 / T-20-01)', () => {
  it('401 without a JWT and never reads keys or links', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await GET(request(vlessId));
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ ok: false, error: 'unauthorized' });
    expect(body.config).toBeUndefined();
    expect(mocks.listKeys).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });
});

describe('active-key gate on every request (D-03 / T-20-01)', () => {
  it('403 no_active_key with no config when the user has no key', async () => {
    mocks.listKeys.mockResolvedValue([]);
    const res = await GET(request(vlessId));
    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ ok: false, error: 'no_active_key' });
    expect(body.config).toBeUndefined();
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it('rejects expired / revoked / trial-expired / empty-id keys', async () => {
    const bad = [
      key({ id: 'expired', statusKind: 'expired', expiresAt: PAST }),
      key({ id: 'trial-expired', status: 'trial-expired', isTrial: true, statusKind: 'active' }),
      key({ id: 'revoked', status: 'REVOKED', statusKind: 'active' }),
      key({ id: '   ', statusKind: 'active' }),
      key({ id: 'pending', statusKind: 'pending' }),
    ];
    mocks.listKeys.mockResolvedValue(bad);
    const res = await GET(request(vlessId));
    expect(res.status).toBe(403);
    expect((await res.json() as Record<string, unknown>).error).toBe('no_active_key');
    expect(mocks.source).not.toHaveBeenCalled();
  });
});

describe('shared grace gate (D-10)', () => {
  it('allows a graced expired key and denies one past the 24h boundary', async () => {
    const inside = new Date(Date.now() - GRACE_MS + 120_000).toISOString();
    const outside = new Date(Date.now() - GRACE_MS - 120_000).toISOString();

    mocks.listKeys.mockResolvedValue([
      key({ id: 'grace', status: 'active', expiresAt: inside, statusKind: 'expired' }),
    ]);
    mocks.source.mockResolvedValue(okSource([VLESS]));
    const allowed = await GET(request(vlessId));
    expect(allowed.status).toBe(200);
    expect((await allowed.json() as Record<string, unknown>).ok).toBe(true);

    mocks.listKeys.mockResolvedValue([
      key({ id: 'past-grace', status: 'active', expiresAt: outside, statusKind: 'expired' }),
    ]);
    const denied = await GET(request(vlessId));
    expect(denied.status).toBe(403);
    expect((await denied.json() as Record<string, unknown>).error).toBe('no_active_key');
    expect(mocks.source).toHaveBeenCalledTimes(1);
  });

  it('a trial key gets no grace even inside the window', async () => {
    const inside = new Date(Date.now() - GRACE_MS + 120_000).toISOString();
    mocks.listKeys.mockResolvedValue([
      key({ id: 'trial', status: 'active', isTrial: true, expiresAt: inside, statusKind: 'expired' }),
    ]);
    const res = await GET(request(vlessId));
    expect(res.status).toBe(403);
    expect((await res.json() as Record<string, unknown>).error).toBe('no_active_key');
  });
});

describe('serverId-only selection (D-02 / D-04 / T-20-03)', () => {
  it('unknown serverId returns server_not_found, never a config', async () => {
    mocks.source.mockResolvedValue(okSource([VLESS]));
    const res = await GET(request('not-a-server-id'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ ok: false, error: 'server_not_found' });
    expect(body.config).toBeUndefined();
  });

  it.each([undefined, ''])('empty or missing serverId returns server_not_found', async (serverId) => {
    const res = await GET(request(serverId));
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>).error).toBe('server_not_found');
  });
});

describe('complete TUN config + minimal metadata (D-01 / D-08)', () => {
  it('returns the CheckConfig-shaped config with no raw link, load, or secret', async () => {
    mocks.source.mockResolvedValue(okSource([VLESS, DECOY]));
    const pricingSpy = vi.spyOn(artemida, 'getPricing').mockRejectedValue(new Error('must not be called'));

    const res = await GET(request(vlessId));
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(body.ok).toBe(true);

    const config = body.config as {
      log: Record<string, unknown>;
      dns: Record<string, unknown>;
      inbounds: Array<Record<string, unknown>>;
      endpoints: Array<Record<string, unknown>>;
      outbounds: Array<Record<string, unknown>>;
      route: Record<string, unknown>;
    };
    expect(config.log).toEqual({ level: 'error' });
    expect(config.dns).toEqual({ servers: [{ type: 'local', tag: 'local' }], final: 'local' });
    expect(config.inbounds).toHaveLength(1);
    expect(config.inbounds[0]).toMatchObject({
      type: 'tun', tag: 'tun-in',
      address: ['172.18.0.1/30', 'fdfe:dcba:9876::1/126'],
      mtu: 1500, dns_mode: 'hijack',
      dns_address: ['172.18.0.2', 'fdfe:dcba:9876::2'],
      auto_route: true, strict_route: true, stack: 'gvisor',
    });
    expect(config.endpoints).toEqual([]);
    expect(config.outbounds[0]).toEqual({ type: 'direct', tag: 'direct' });
    expect(config.outbounds[1]).toMatchObject({ type: 'vless', tag: `srv-${vlessId}` });
    // CR-01: the paid server is the effective default, not a dead outbound.
    expect(config.route).toEqual({
      rules: [{ outbound: tagOf(VLESS) }],
      final: tagOf(VLESS),
    });
    expect(config.route.final).not.toBe('direct');

    const meta = body.server as Record<string, unknown>;
    expect(Object.keys(meta).sort()).toEqual(['city', 'flag', 'id', 'proto', 'tab']);
    expect(meta).toMatchObject({ id: vlessId, city: 'Amsterdam', flag: NL, proto: 'VLESS', tab: 'simple' });

    const text = JSON.stringify(body);
    expect(text).not.toContain('vless://');
    expect(text).not.toContain('SUPERSECRET');
    expect(text).not.toContain('"load"');
    expect(text).not.toContain('"links"');
    expect(pricingSpy).not.toHaveBeenCalled();
    pricingSpy.mockRestore();

    expect(logText()).not.toContain('SUPERSECRET');
    expect(logText()).not.toContain('vless://');
    expect(logText()).not.toContain('authorization');
    expect(logText()).not.toContain('uuid-abc');
  });

  it('places a WireGuard outbound in endpoints only, never in outbounds', async () => {
    mocks.source.mockResolvedValue(okSource([WG]));
    const res = await GET(request(wgId));
    expect(res.status).toBe(200);
    const config = (await res.json() as Record<string, unknown>).config as {
      endpoints: Array<Record<string, unknown>>;
      outbounds: Array<Record<string, unknown>>;
      route: Record<string, unknown>;
    };
    expect(config.endpoints).toHaveLength(1);
    expect(config.endpoints[0]).toMatchObject({ type: 'wireguard', private_key: 'private-key' });
    expect(config.outbounds).toEqual([{ type: 'direct', tag: 'direct' }]);
    expect(JSON.stringify(config.outbounds)).not.toContain('wireguard');
    // CR-01: a WireGuard endpoint is routed through its own tag as default.
    expect(config.route).toEqual({
      rules: [{ outbound: tagOf(WG) }],
      final: tagOf(WG),
    });
    expect(config.route.final).not.toBe('direct');
  });
});

describe('route targets the selected server for every endpoint kind (CR-01)', () => {
  const server = (link: string): Server => parseShareLink(link)!;

  it.each([
    ['VLESS/TLS', VLESS],
    ['VLESS/Reality', REALITY],
    ['WireGuard endpoint', WG],
  ])('builds a config whose default outbound is the %s server', (_label, link) => {
    const config = buildMobileConfig(server(link));
    const tag = tagOf(link);
    expect(config.route.rules).toEqual([{ outbound: tag }]);
    expect(config.route.final).toBe(tag);
    expect(config.route.final).not.toBe('direct');
    // The chosen tag really exists in the section sing-box reads it from.
    if (parseShareLink(link)!.outbound.type === 'wireguard') {
      expect(config.endpoints.map((out) => out.tag)).toContain(tag);
    } else {
      expect(config.outbounds.map((out) => out.tag)).toContain(tag);
    }
  });

  it('falls back to direct only when no outbound could be selected', () => {
    const config = buildMobileConfig({});
    expect(config.route).toEqual({ final: 'direct' });
    expect(config.route.rules).toBeUndefined();
  });
});

describe('provider error degradation (D-22 / T-20-04)', () => {
  it('maps provider unauthorized to no_active_key-safe 403', async () => {
    mocks.source.mockResolvedValue({ links: [], stale: false, error: 'unauthorized' });
    const res = await GET(request(vlessId));
    expect(res.status).toBe(403);
    expect((await res.json() as Record<string, unknown>).error).toBe('no_active_key');
  });

  it('returns 200 with stable code, stale flag and Retry-After on provider failure', async () => {
    mocks.source.mockResolvedValue({ links: [], stale: true, error: 'rate_limited', retryAfterSec: 9 });
    const res = await GET(request(vlessId));
    expect(res.status).toBe(200);
    expect(res.headers.get('retry-after')).toBe('9');
    expect(await res.json()).toEqual({
      ok: false, error: 'rate_limited', stale: true, retryAfterSec: 9,
    });
  });

  it('degrades an internal throw to 200 internal instead of 5xx', async () => {
    mocks.listKeys.mockRejectedValue(new Error('db down'));
    const res = await GET(request(vlessId));
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>).error).toBe('internal');
    expect(mocks.error).toHaveBeenCalled();
  });
});

describe('pure builder vectors (D-08 / never-throw)', () => {
  const server = (link: string): Server => parseShareLink(link)!;

  it('never throws on malformed input and emits only a direct outbound', () => {
    expect(() => buildMobileConfig(null)).not.toThrow();
    const config = buildMobileConfig({});
    expect(config.inbounds[0].type).toBe('tun');
    expect(config.endpoints).toEqual([]);
    expect(config.outbounds).toEqual([{ type: 'direct', tag: 'direct' }]);
  });

  it('keeps a non-WireGuard outbound verbatim in outbounds', () => {
    const parsed = server(VLESS);
    const config = buildMobileConfig(parsed);
    expect(config.endpoints).toEqual([]);
    expect(config.outbounds[1]).toEqual(parsed.outbound);
    expect(config.outbounds[1]).not.toBe(parsed.outbound); // copied, not mutated in place
  });

  it('omits sni from metadata when the server has none / is not whitelist', () => {
    const simple = server(VLESS);
    expect(serverMeta(simple).sni).toBeUndefined();
    const wg = server(WG); // whitelist tab but the link has no sni
    expect(wg.tab).toBe('whitelist');
    expect(serverMeta(wg)).not.toHaveProperty('sni');
  });
});

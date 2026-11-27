// Phase 19 parser vectors (D-01/D-02/D-03/D-05): every allowlisted scheme,
// WL/Reality pool split, remark+flag parsing, unparseable skipping, stable ids,
// no `load`, no raw link / secret in rendered card fields.
import { describe, expect, it } from 'vitest';
import {
  ccToFlag,
  classifyPool,
  flagToCc,
  parsePools,
  parseRemark,
  parseShareLink,
  type Server,
} from '../../lib/server-pool';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const b64url = (s: string) => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const NL = '🇳🇱'; // regional-indicator pair for NL
const DE = '🇩🇪';

describe('parseShareLink — VLESS', () => {
  it('parses a basic VLESS TLS link with D-03 metadata fields', () => {
    const link = `vless://uuid-abc@nl.example.com:443?encryption=none&security=tls&sni=tls.example.com&type=ws&host=cdn.example.com&path=%2Fws#${encodeURIComponent(`${NL} Amsterdam`)}`;
    const server = parseShareLink(link);
    expect(server).not.toBeNull();
    expect(server!.proto).toBe('VLESS');
    expect(server!.protocol).toBe('vless');
    expect(server!.host).toBe('nl.example.com');
    expect(server!.port).toBe(443);
    expect(server!.tab).toBe('simple');
    expect(server!.cc).toBe('NL');
    expect(server!.flag).toBe(NL);
    expect(server!.city).toBe('Amsterdam');
    expect(server!.name).toBe('Amsterdam');
    expect(server!.sni).toBeUndefined(); // simple never surfaces SNI
    expect(server!.outbound.type).toBe('vless');
    expect(server!.outbound.fingerprint).toBeUndefined();
    expect((server!.outbound.tls as Record<string, unknown>).serverName).toBe('tls.example.com');
    expect((server!.outbound.transport as Record<string, unknown>).type).toBe('ws');
  });

  it('parses VLESS Reality (pbk/sid/sni/fp/flow) and falls back to whitelist', () => {
    const link = `vless://uuid-real@reality.example.com:443?security=reality&pbk=pubkey-value&sid=shortid&sni=reality.example.com&fp=chrome&flow=xtls-rprx-vision#${encodeURIComponent('Vless Reality DE')}`;
    const server = parseShareLink(link);
    expect(server!.proto).toBe('VLESS · Reality');
    expect(server!.tab).toBe('whitelist');
    expect(server!.sni).toBe('reality.example.com');
    expect((server!.outbound.tls as Record<string, unknown>).security).toBe('reality');
    expect((server!.outbound.tls as Record<string, unknown>).pbk).toBe('pubkey-value');
    expect((server!.outbound.tls as Record<string, unknown>).shortId).toBe('shortid');
    expect(server!.outbound.flow).toBe('xtls-rprx-vision');
  });

  it('accepts serverName as the SNI alias for whitelist only', () => {
    const link = 'vless://uuid@reality.example.com:443?security=reality&serverName=alias.example.com#WL Server';
    expect(parseShareLink(link)!.sni).toBe('alias.example.com');
    const simple = 'vless://uuid@plain.example.com:443?security=tls&sni=plain.example.com#Simple';
    expect(parseShareLink(simple)!.sni).toBeUndefined();
  });

  it('treats encryption=none and a non-tcp network without throwing', () => {
    const link = 'vless://uuid@grpc.example.com:443?encryption=none&security=none&type=grpc&serviceName=svc#Grpc';
    const server = parseShareLink(link);
    expect(server!.outbound.encryption).toBe('none');
    expect((server!.outbound.transport as Record<string, unknown>).service_name).toBe('svc');
    expect(server!.outbound.tls).toBeUndefined();
  });
});

describe('parseShareLink — Shadowsocks', () => {
  it('parses SIP002 base64url(method:password) with padding tolerance', () => {
    const link = `ss://${b64url('aes-256-gcm:secret-pass')}@ss.example.com:8388#${encodeURIComponent(`${DE} Frankfurt`)}`;
    const server = parseShareLink(link);
    expect(server!.proto).toBe('Shadowsocks');
    expect(server!.protocol).toBe('ss');
    expect(server!.tab).toBe('simple'); // ss is NOT VLESS+Reality
    expect(server!.cc).toBe('DE');
    expect(server!.outbound.method).toBe('aes-256-gcm');
    expect(server!.outbound.password).toBe('secret-pass');
    expect(server!.port).toBe(8388);
  });

  it('parses the legacy whole-info base64 form and SIP003 plugin', () => {
    const legacy = `ss://${b64('chacha20-ietf-poly1305:pw@legacy.example.com:8389')}#Legacy`;
    const server = parseShareLink(legacy);
    expect(server!.host).toBe('legacy.example.com');
    expect(server!.outbound.method).toBe('chacha20-ietf-poly1305');
    const sip003 = `ss://${b64url('none:pw')}@plugin.example.com:8388?plugin=v2ray-plugin&plugin_opts=tls#Plugin`;
    const withPlugin = parseShareLink(sip003);
    expect(withPlugin!.outbound.plugin).toBe('v2ray-plugin');
    expect(withPlugin!.outbound.plugin_opts).toBe('tls');
  });
});

describe('parseShareLink — Hysteria2 / hy2', () => {
  it('parses hysteria2 with port hopping (first port), obfs and insecure', () => {
    const link = `hysteria2://hy-pass@hy.example.com:443,444-500?mport=443,444-500&insecure=1&obfs=salamander&obfs-password=obfs#${encodeURIComponent('HY2 WL')}`;
    const server = parseShareLink(link);
    expect(server!.proto).toBe('Hysteria2');
    expect(server!.protocol).toBe('hysteria2');
    expect(server!.port).toBe(443);
    expect(server!.tab).toBe('whitelist'); // WL marker
    expect(server!.outbound.obfs).toMatchObject({ type: 'salamander' });
    expect((server!.outbound.tls as Record<string, unknown>).insecure).toBe(true);
  });

  it('accepts the hy2 alias', () => {
    const server = parseShareLink('hy2://pw@hy2.example.com:8443?obfs=salamander#Hy2');
    expect(server!.proto).toBe('Hysteria2');
    expect(server!.protocol).toBe('hysteria2');
    expect(server!.port).toBe(8443);
  });
});

describe('parseShareLink — Trojan', () => {
  it('defaults to TLS and parses sni/peer/fp/alpn', () => {
    const link = 'trojan://trojan-pass@tr.example.com:443?sni=tr.example.com&fp=chrome&alpn=h2,http%2F1.1#Trojan';
    const server = parseShareLink(link);
    expect(server!.proto).toBe('Trojan');
    expect(server!.tab).toBe('simple');
    expect((server!.outbound.tls as Record<string, unknown>).enabled).toBe(true);
    expect((server!.outbound.tls as Record<string, unknown>).fingerprint).toBe('chrome');
    expect((server!.outbound.tls as Record<string, unknown>).alpn).toEqual(['h2', 'http/1.1']);
  });

  it('parses Trojan Reality params', () => {
    const server = parseShareLink('trojan://pw@tr-reality.example.com:443?security=reality&pbk=pbk&sid=sid&sni=tr.example.com#Trojan Reality');
    expect((server!.outbound.tls as Record<string, unknown>).security).toBe('reality');
    expect((server!.outbound.tls as Record<string, unknown>).pbk).toBe('pbk');
  });
});

describe('parseShareLink — VMess', () => {
  it('parses base64 JSON with ps remark, add/port and security fields', () => {
    const json = {
      v: '2', ps: `${NL} VMess City`, add: 'vmess.example.com', port: '443',
      id: 'uuid-vmess', aid: '0', scy: 'aes-128-gcm', net: 'ws',
      type: 'none', host: 'cdn.example.com', path: '/vmess', tls: 'tls',
      sni: 'vmess.example.com', fp: 'chrome',
    };
    const server = parseShareLink(`vmess://${b64(JSON.stringify(json))}`);
    expect(server!.proto).toBe('VMess');
    expect(server!.protocol).toBe('vmess');
    expect(server!.host).toBe('vmess.example.com');
    expect(server!.port).toBe(443);
    expect(server!.cc).toBe('NL');
    expect(server!.outbound.security).toBe('aes-128-gcm');
    expect(server!.outbound.alter_id).toBe(0);
    expect((server!.outbound.transport as Record<string, unknown>).type).toBe('ws');
  });
});

describe('parseShareLink — WireGuard', () => {
  it('parses wg:// into a sing-box 1.14 endpoint (NOT an outbound)', () => {
    const link = `wg://private-key@wg.example.com:51820?publickey=peer-pub&address=10.0.0.2%2F32,fd00::2%2F128&mtu=1420&reserved=1,2,3&presharedkey=psk&allowedips=0.0.0.0%2F0&keepalive=25#${encodeURIComponent('WG WL')}`;
    const server = parseShareLink(link);
    expect(server!.proto).toBe('WireGuard');
    expect(server!.protocol).toBe('wg');
    expect(server!.tab).toBe('whitelist');
    expect(server!.outbound.type).toBe('wireguard');
    expect(server!.outbound.mtu).toBe(1420);
    const peer = (server!.outbound.peers as Record<string, unknown>[])[0];
    expect(peer.address).toBe('wg.example.com');
    expect(peer.public_key).toBe('peer-pub');
    expect(peer.pre_shared_key).toBe('psk');
  });

  it('accepts the wireguard:// alias', () => {
    const server = parseShareLink('wireguard://pk@wg2.example.com:51820?publickey=pub&address=10.0.0.3%2F32#WG2');
    expect(server!.proto).toBe('WireGuard');
    expect(server!.protocol).toBe('wg');
  });

  it('parses all WireGuard address entries and reserved bytes', () => {
    const server = parseShareLink('wg://pk@wg3.example.com:51820?publickey=pub&address=10.0.0.2%2F32,fd00::2%2F128&reserved=1,22,33#WG3');
    expect(server!.outbound.address).toEqual(['10.0.0.2/32', 'fd00::2/128']);
    expect((server!.outbound.peers as Record<string, unknown>[])[0].reserved).toEqual([1, 22, 33]);
  });
});

describe('unparseable links are skipped, never thrown', () => {
  it('skips placeholder / empty / non-string / unsupported / hostless', () => {
    const bad: unknown[] = [
      'vless://placeholder', '', '   ', null, undefined, 42, {},
      'http://example.com:443#not-a-proxy',
      'vless://uuid@:443#hostless',
      'vmess://not-base64-json',
      'ss://!!!@ss.example.com:8388#bad-base64',
    ];
    for (const link of bad) {
      expect(parseShareLink(link as string)).toBeNull();
    }
  });

  it('skips links longer than the length limit', () => {
    expect(parseShareLink(`vless://uuid@ok.example.com:443#${'x'.repeat(9000)}`)).toBeNull();
  });
});

describe('remark + flag parsing (D-03)', () => {
  it('derives cc from a regional-indicator pair and reconstructs the flag', () => {
    const info = parseRemark(`${NL} Amsterdam WL`);
    expect(info.cc).toBe('NL');
    expect(info.flag).toBe(NL);
    expect(info.city).toBe('Amsterdam');
    expect(info.name).toBe('Amsterdam'); // WL stripped
    expect(flagToCc(NL)).toBe('NL');
    expect(ccToFlag('nl')).toBe(NL);
  });

  it('falls back to name=remark with empty city/cc/flag when no flag is present', () => {
    const info = parseRemark('Just A Name');
    expect(info.name).toBe('Just A Name');
    expect(info.city).toBe('');
    expect(info.cc).toBe('');
    expect(info.flag).toBe('');
    expect(ccToFlag('X')).toBe('');
    expect(flagToCc('')).toBe('');
  });

  it('strips whitelist / обход markers case-insensitively', () => {
    expect(parseRemark('Frankfurt whitelist server').name).toBe('Frankfurt server');
    expect(parseRemark('Обход Stochastic').name).toBe('Stochastic');
  });
});

describe('classifyPool (D-02)', () => {
  it('uses markers with marker-over-Reality precedence', () => {
    expect(classifyPool('WL Server', 'vless', 'none')).toBe('whitelist');
    expect(classifyPool('my whitelist node', 'ss', '')).toBe('whitelist');
    expect(classifyPool('обход 1', 'trojan', 'tls')).toBe('whitelist');
    expect(classifyPool('WLAN router', 'vless', 'none')).toBe('simple'); // token-ish WL
    expect(classifyPool('No marker', 'vless', 'reality')).toBe('whitelist'); // fallback
    expect(classifyPool('No marker', 'ss', '')).toBe('simple');
    expect(classifyPool('WL and reality', 'vless', 'reality')).toBe('whitelist'); // marker wins
  });
});

describe('parsePools (XOR, dedupe, order, secrecy)', () => {
  const simpleLink = `vless://uuid-s@vsimple.example.com:443?security=tls&sni=sni.example.com#${encodeURIComponent(`${NL} Simple`)}`;
  const wlLink = 'vless://uuid-w@vreality.example.com:443?security=reality&pbk=pbk&sni=wl.example.com#WL reality';
  const dup = 'vless://uuid-w@vreality.example.com:443?security=reality&pbk=pbk&sni=wl.example.com#WL reality';

  it('splits exactly one pool per server and de-duplicates by stable id', () => {
    const pools = parsePools([simpleLink, dup, wlLink, 'vless://placeholder']);
    expect(pools.simple).toHaveLength(1);
    expect(pools.whitelist).toHaveLength(1);
    const ids = [...pools.simple, ...pools.whitelist].map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
    expect(pools.simple[0].id).not.toBe(pools.whitelist[0].id);
  });

  it('preserves input order and never emits load / raw link / secret in cards', () => {
    const first = 'ss://' + b64url('none:pw1') + '@a.example.com:8388#A';
    const second = 'ss://' + b64url('none:pw2') + '@b.example.com:8388#B';
    const pools = parsePools([second, first]);
    expect(pools.simple.map((s) => s.host)).toEqual(['b.example.com', 'a.example.com']);
    for (const s of [...pools.simple, ...pools.whitelist] as Server[]) {
      expect(s).not.toHaveProperty('load');
      expect(s.name).not.toContain('ss://');
      expect(s.city).not.toContain('password');
      expect(s.id).not.toContain('://');
      expect(s.id).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('returns empty pools for empty / null / non-array input', () => {
    expect(parsePools([])).toEqual({ simple: [], whitelist: [] });
    expect(parsePools(null)).toEqual({ simple: [], whitelist: [] });
    expect(parsePools('not-an-array')).toEqual({ simple: [], whitelist: [] });
    expect(parsePools([null, 42, {}, 'vless://placeholder'])).toEqual({ simple: [], whitelist: [] });
  });

  it('gives byte-identical links the same stable id (not the raw link)', () => {
    const first = parseShareLink(simpleLink);
    const second = parseShareLink(simpleLink);
    expect(first!.id).toBe(second!.id);
    expect(first!.id).toMatch(/^[0-9a-f]{16}$/);
    expect(simpleLink).not.toContain(first!.id);
  });

  it('uses the vmess ps remark for pool classification', () => {
    const json = { ps: 'vmess whitelist node', add: 'vmess2.example.com', port: '443', id: 'uuid-2' };
    const server = parseShareLink(`vmess://${b64(JSON.stringify(json))}`);
    expect(server!.tab).toBe('whitelist');
    expect(server!.name).toBe('vmess node');
  });
});

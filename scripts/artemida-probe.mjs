#!/usr/bin/env node
// ARTEMIDA Paid API V1 live probe — read-only + guarded-trial diagnostic.
//
// Reads ARTEMIDA_API_KEY (never printed) and ARTEMIDA_BASE_URL
// (default https://artemida.cc/v1) from the process env, calls the V1
// endpoints, and prints the real response shapes so the contract every later
// Phase 2 slice builds against is observed, not guessed.
//
// Usage:
//   node scripts/artemida-probe.mjs --dry-run
//   node --env-file=.env.local scripts/artemida-probe.mjs
//   node --env-file=.env.local scripts/artemida-probe.mjs --json > docs/artemida-v1-contract.json
//   node --env-file=.env.local scripts/artemida-probe.mjs --confirm-trial <customerRef>
//   node --env-file=.env.local scripts/artemida-probe.mjs --confirm-create-key <customerRef>   # PAID: consumes balance
//   node --env-file=.env.local scripts/artemida-probe.mjs --confirm-upgrade <keyId> <addDevices>  # PAID: consumes balance
//
// Standalone dev script: imports nothing from lib/ and must keep running before
// lib/env.ts gains the ARTEMIDA vars. Never prints or writes the API key or the
// Authorization header.

const BASE_URL = (process.env.ARTEMIDA_BASE_URL ?? 'https://artemida.cc/v1').replace(/\/+$/, '');
const API_KEY = process.env.ARTEMIDA_API_KEY ?? '';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const JSON_MODE = argv.includes('--json');
const TRIAL_FLAG_INDEX = argv.indexOf('--confirm-trial');
const CONFIRM_TRIAL = TRIAL_FLAG_INDEX !== -1;
const CUSTOMER_REF = CONFIRM_TRIAL ? argv[TRIAL_FLAG_INDEX + 1] : undefined;
const NO_KEY_AVAILABLE = 'UNKNOWN (no key available)';
const TRIAL_NOT_RUN = 'UNKNOWN (trial not run)';
const CREATE_NOT_RUN = 'UNKNOWN (create not run)';
const UPGRADE_NOT_RUN = 'UNKNOWN (upgrade not run)';

const CREATE_FLAG = '--confirm-create-key';
const UPGRADE_FLAG = '--confirm-upgrade';
const CREATE_FLAG_INDEX = argv.indexOf(CREATE_FLAG);
const CONFIRM_CREATE = CREATE_FLAG_INDEX !== -1;
const CREATE_CUSTOMER_REF = CONFIRM_CREATE ? argv[CREATE_FLAG_INDEX + 1] : undefined;
const UPGRADE_FLAG_INDEX = argv.indexOf(UPGRADE_FLAG);
const CONFIRM_UPGRADE = UPGRADE_FLAG_INDEX !== -1;
const UPGRADE_KEY_ID = CONFIRM_UPGRADE ? argv[UPGRADE_FLAG_INDEX + 1] : undefined;
const UPGRADE_ADD_DEVICES_RAW = CONFIRM_UPGRADE ? argv[UPGRADE_FLAG_INDEX + 2] : undefined;
const UPGRADE_ADD_DEVICES =
  UPGRADE_ADD_DEVICES_RAW === undefined ? undefined : Number(UPGRADE_ADD_DEVICES_RAW);

// Candidate route × body sweep for the unobserved paid-key create (RESEARCH Open
// Q1). Route-major: once a route returns 404 the remaining bodies for it are
// skipped; the sweep stops the instant a success envelope is seen (one charge max).
const CREATE_ROUTES = ['/keys', '/keys/create'];
const createBodyCandidates = (ref) => [
  { customerRef: ref },
  { customerRef: ref, days: 30, devices: 2 },
];

// ── argument validation ────────────────────────────────────────────────────
const unexpected = [];
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--dry-run' || arg === '--json') continue;
  if (arg === '--confirm-trial') {
    i += 1; // consume its <customerRef> value
    continue;
  }
  if (arg === CREATE_FLAG) {
    i += 1; // consume its <customerRef> value
    continue;
  }
  if (arg === UPGRADE_FLAG) {
    i += 2; // consume its <keyId> and <addDevices> values
    continue;
  }
  unexpected.push(arg);
}
if (unexpected.length > 0) {
  process.stderr.write(`artemida-probe: unexpected argument(s): ${unexpected.join(' ')}\n`);
  process.exit(2);
}
if (CONFIRM_TRIAL && !CUSTOMER_REF) {
  process.stderr.write('artemida-probe: --confirm-trial requires a <customerRef> argument\n');
  process.exit(2);
}
if (CONFIRM_CREATE && !CREATE_CUSTOMER_REF) {
  process.stderr.write(`artemida-probe: ${CREATE_FLAG} requires a <customerRef> argument\n`);
  process.exit(2);
}
if (
  CONFIRM_UPGRADE &&
  (!UPGRADE_KEY_ID ||
    UPGRADE_ADD_DEVICES_RAW === undefined ||
    !Number.isInteger(UPGRADE_ADD_DEVICES) ||
    UPGRADE_ADD_DEVICES < 1)
) {
  process.stderr.write(
    `artemida-probe: ${UPGRADE_FLAG} requires a <keyId> and a positive integer <addDevices>\n`,
  );
  process.exit(2);
}

// ── planned request manifest ───────────────────────────────────────────────
const PRICING_CALLS = [
  { method: 'GET', path: '/pricing?days=7&devices=2', note: '' },
  { method: 'GET', path: '/pricing?days=30&devices=2', note: '' },
  { method: 'GET', path: '/pricing?days=90&devices=2', note: '' },
  { method: 'GET', path: '/pricing?days=7&devices=1', note: 'A7 minimum-devices question' },
];
const UNCONDITIONAL_CALLS = [
  ...PRICING_CALLS,
  { method: 'GET', path: '/keys', note: '' },
  { method: 'GET', path: '/balance', note: '' },
];
const KEY_SCOPED_CALLS = [
  { method: 'GET', path: '/keys/{firstId}', note: 'conditional on /keys returning a key' },
  {
    method: 'GET',
    path: '/keys/{firstId}/subscription-links',
    note: 'conditional on /keys returning a key',
  },
  {
    method: 'GET',
    path: '/keys/{firstId}/devices',
    note: 'conditional on /keys returning a key',
  },
];

// ── output helpers (JSON mode keeps stdout pure for redirection) ───────────
function out(line = '') {
  const stream = JSON_MODE ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function pretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ── dry-run ───────────────────────────────────────────────────────────────
if (DRY_RUN) {
  out('DRY RUN — no network calls, ARTEMIDA_API_KEY not required');
  out(
    `base URL: ${BASE_URL}` +
      (process.env.ARTEMIDA_BASE_URL ? ' (from ARTEMIDA_BASE_URL)' : ' (default)'),
  );
  out(`auth: Authorization: Bearer <redacted> (ARTEMIDA_API_KEY present: ${Boolean(API_KEY)})`);
  out(`trial: ${CONFIRM_TRIAL ? `POST /trial (customerRef=${CUSTOMER_REF}, one call)` : 'skipped (pass --confirm-trial <customerRef> to consume the one-time offer)'}`);
  out('');
  out('unconditional GET:');
  for (const call of UNCONDITIONAL_CALLS) {
    out(`  GET ${call.path}${call.note ? `   # ${call.note}` : ''}`);
  }
  out('');
  out('key-scoped GET (conditional on /keys returning at least one key):');
  for (const call of KEY_SCOPED_CALLS) {
    out(`  GET ${call.path}   # ${call.note}`);
  }
  out('');
  out('trial POST (only with --confirm-trial <customerRef>):');
  out('  POST /trial   body {"customerRef":"<arg>"} + header Idempotency-Key=<uuid>');
  out('');
  out(`paid-key create POST (only with ${CREATE_FLAG} <customerRef>, consumes real balance):`);
  for (const route of CREATE_ROUTES) {
    out(`  POST ${route}   body {"customerRef":"<arg>"} then {"customerRef":"<arg>","days":30,"devices":2}`);
  }
  out('  each candidate carries header Idempotency-Key=<uuid>; the sweep stops at the first success envelope');
  out('');
  out(`upgrade POST (only with ${UPGRADE_FLAG} <keyId> <addDevices>, consumes real balance):`);
  out('  GET  /keys/{keyId}   # tolerant read of the current device count + plan days');
  out('  POST /keys/{keyId}/upgrade   body {"days":<unchanged>,"devices":<current+addDevices>} + header Idempotency-Key=<uuid>');
  out('  GET  /balance before/after the upgrade to derive the exact charged amount');
  process.exit(0);
}

// ── HTTP transport ─────────────────────────────────────────────────────────
// Returns a diagnostic record for one call. Never includes the Authorization
// header value and never throws on a provider/network error — the probe is
// diagnostic, not fail-fast.
async function request(method, path, { body, idempotencyKey } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { Accept: 'application/json' };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const record = { method, path, url, status: null };
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    record.status = res.status;
    record.requestId = res.headers.get('x-request-id') ?? undefined;
    record.retryAfter = res.headers.get('retry-after') ?? undefined;
    record.rateLimitPolicy = res.headers.get('x-ratelimit-policy') ?? undefined;
    const text = await res.text();
    record.raw = text;
    try {
      record.body = JSON.parse(text);
    } catch {
      record.body = undefined; // non-JSON body stays available as raw text
    }
  } catch (err) {
    record.error = err?.message ?? String(err);
  }
  return record;
}

async function runCall(method, path, opts) {
  out('');
  out(`── ${method} ${path}`);
  const record = await request(method, path, opts);
  out(`   status: ${record.status ?? 'ERROR'}`);
  if (record.requestId) out(`   X-Request-Id: ${record.requestId}`);
  if (record.retryAfter !== undefined) out(`   Retry-After: ${record.retryAfter}`);
  if (record.rateLimitPolicy) out(`   X-RateLimit-Policy: ${record.rateLimitPolicy}`);
  if (record.error) out(`   error: ${record.error}`);
  if (record.body !== undefined) out(`   body: ${pretty(record.body)}`);
  else if (record.raw !== undefined) out(`   body(raw): ${record.raw}`);
  return record;
}

// Tolerant first-key extraction: success shapes are `[ASSUMED]` until this run,
// so accept the plausible containers/field names instead of assuming one.
function extractFirstKey(body) {
  const containers = [body?.data?.items, body?.data?.keys, body?.data, body?.items, body?.keys];
  for (const container of containers) {
    if (!Array.isArray(container) || container.length === 0) continue;
    const first = container[0];
    if (!first || typeof first !== 'object') continue;
    const id = first.id ?? first.uuid ?? first.shortUuid;
    if (typeof id === 'string' && id.length > 0) return { id, raw: first };
  }
  return null;
}

// Success envelope observed in Phase 2: {ok:true, data:{…}, meta:{requestId}}.
function isSuccessEnvelope(body) {
  return body !== null && typeof body === 'object' && body.ok === true;
}

// Single-key responses may nest under data.key / data / key; reuse the tolerant
// id vocabulary from extractFirstKey without requiring an array container.
function extractKeySummary(body) {
  const candidates = [body?.data?.key, body?.data, body?.key];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id = candidate.id ?? candidate.uuid ?? candidate.shortUuid ?? candidate.keyId;
    if (typeof id === 'string' && id.length > 0) return { id, raw: candidate };
  }
  return null;
}

function firstFiniteNumber(object, keys) {
  if (!object || typeof object !== 'object') return null;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

// Current device count: a number field, or the length of the devices array.
function extractDeviceCount(key) {
  if (!key || typeof key !== 'object') return null;
  if (Array.isArray(key.devices)) return key.devices.length;
  return firstFiniteNumber(key, ['devices', 'deviceLimit', 'device_limit', 'deviceCount']);
}

function extractPlanDays(key) {
  return firstFiniteNumber(key, ['days', 'planDays', 'plan_days', 'periodDays', 'period_days']);
}

function balanceAmount(body) {
  const value = body?.data?.balance;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compact(record) {
  const result = { request: `${record.method} ${record.path}`, status: record.status };
  if (record.requestId) result.requestId = record.requestId;
  if (record.retryAfter !== undefined) result.retryAfter = record.retryAfter;
  if (record.error) result.error = record.error;
  if (record.body !== undefined) result.body = record.body;
  else if (record.raw !== undefined) result.bodyRaw = record.raw;
  return result;
}

function unavailable(method, path, marker) {
  return { request: `${method} ${path}`, status: null, unavailable: marker };
}

// ── main probe ─────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date().toISOString();
  out(`ARTEMIDA V1 probe — base ${BASE_URL}`);
  out(`started: ${startedAt}`);
  if (!API_KEY) {
    out('WARNING: ARTEMIDA_API_KEY is not set — calls will return the 401 missing-key envelope.');
  }

  const summary = { startedAt, baseUrl: BASE_URL, pricing: [], keys: null, balance: null };

  for (const call of PRICING_CALLS) {
    const record = await runCall(call.method, call.path);
    summary.pricing.push(compact(record));
  }

  const keysRecord = await runCall('GET', '/keys');
  summary.keys = compact(keysRecord);

  const firstKey = keysRecord.body !== undefined ? extractFirstKey(keysRecord.body) : null;
  if (firstKey) {
    out('');
    out(`first key id: ${firstKey.id}`);
    const detailPath = `/keys/${encodeURIComponent(firstKey.id)}`;
    const detail = await runCall('GET', detailPath);
    summary.keyDetail = compact(detail);

    const links = await runCall('GET', `${detailPath}/subscription-links`);
    summary.subscriptionLinks = compact(links);

    const devices = await runCall('GET', `${detailPath}/devices`);
    summary.devices = compact(devices);
  } else {
    out('');
    out(`no key available — recording key-scoped shapes as ${NO_KEY_AVAILABLE}`);
    summary.keyDetail = unavailable('GET', '/keys/{firstId}', NO_KEY_AVAILABLE);
    summary.subscriptionLinks = unavailable('GET', '/keys/{firstId}/subscription-links', NO_KEY_AVAILABLE);
    summary.devices = unavailable('GET', '/keys/{firstId}/devices', NO_KEY_AVAILABLE);
  }

  const balanceRecord = await runCall('GET', '/balance');
  summary.balance = compact(balanceRecord);

  if (CONFIRM_TRIAL) {
    out('');
    out('consuming the one-time trial offer (explicit --confirm-trial)…');
    const trialRecord = await runCall('POST', '/trial', {
      body: { customerRef: CUSTOMER_REF },
      idempotencyKey: crypto.randomUUID(),
    });
    summary.trial = compact(trialRecord);
  } else {
    out('');
    out(`trial not run — ${TRIAL_NOT_RUN}`);
  }

  if (CONFIRM_CREATE) {
    out('');
    out(`paid-key create sweep (explicit ${CREATE_FLAG}; consumes real balance)…`);
    summary.createKey = { attempts: [], observed: null };
    outer: for (const route of CREATE_ROUTES) {
      for (const body of createBodyCandidates(CREATE_CUSTOMER_REF)) {
        const record = await runCall('POST', route, {
          body,
          idempotencyKey: crypto.randomUUID(),
        });
        summary.createKey.attempts.push({ ...compact(record), requestBody: body });
        if (record.status === 404) {
          out('   route not found — skipping remaining bodies for this route');
          continue outer;
        }
        if (isSuccessEnvelope(record.body)) {
          const key = extractKeySummary(record.body);
          summary.createKey.observed = {
            path: route,
            requestBody: body,
            keyId: key?.id ?? null,
          };
          out(`   OBSERVED create: POST ${route} (key id ${key?.id ?? 'not extracted'})`);
          break outer;
        }
      }
    }
    if (!summary.createKey.observed) {
      out(`   create shape not observed — ${CREATE_NOT_RUN}`);
    }
  }

  if (CONFIRM_UPGRADE) {
    out('');
    out(`upgrade probe (explicit ${UPGRADE_FLAG}; consumes real balance)…`);
    const upgradeKeyPath = `/keys/${encodeURIComponent(UPGRADE_KEY_ID)}`;
    const detail = await runCall('GET', upgradeKeyPath);
    const detailKey = detail.body !== undefined ? extractKeySummary(detail.body) : null;
    const currentDevices = extractDeviceCount(detailKey?.raw);
    const planDays = extractPlanDays(detailKey?.raw);
    const days = planDays ?? 30;
    const upgradeBody = { days, devices: (currentDevices ?? 0) + UPGRADE_ADD_DEVICES };

    const balanceBefore = await request('GET', '/balance');
    out(`   balance before upgrade: ${balanceAmount(balanceBefore.body) ?? 'unknown'}`);
    const upgradeRecord = await runCall('POST', `${upgradeKeyPath}/upgrade`, {
      body: upgradeBody,
      idempotencyKey: crypto.randomUUID(),
    });
    const balanceAfter = await request('GET', '/balance');
    out(`   balance after upgrade: ${balanceAmount(balanceAfter.body) ?? 'unknown'}`);

    const before = balanceAmount(balanceBefore.body);
    const after = balanceAmount(balanceAfter.body);
    const chargedAmount = before !== null && after !== null ? before - after : null;
    summary.upgrade = {
      keyId: UPGRADE_KEY_ID,
      addDevices: UPGRADE_ADD_DEVICES,
      derived: { currentDevices, planDays, usedDays: days },
      keyDetail: compact(detail),
      requestBody: upgradeBody,
      result: compact(upgradeRecord),
      balanceBefore: before,
      balanceAfter: after,
      chargedAmount,
      observed: isSuccessEnvelope(upgradeRecord.body) ? { chargedAmount } : null,
    };
    if (summary.upgrade.observed) {
      out(`   OBSERVED upgrade charge: ${chargedAmount ?? 'not derivable from balance delta'} RUB`);
    } else {
      out(`   upgrade shape not observed — ${UPGRADE_NOT_RUN}`);
    }
  }

  out('');
  out(`done: ${new Date().toISOString()}`);
  if (JSON_MODE) emitJson(summary);
}

main().catch((err) => {
  process.stderr.write(`artemida-probe: fatal: ${err?.stack ?? err}\n`);
  process.exitCode = 1;
});

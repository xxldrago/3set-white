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

// ── argument validation ────────────────────────────────────────────────────
const unexpected = [];
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--dry-run' || arg === '--json') continue;
  if (arg === '--confirm-trial') {
    i += 1; // consume its <customerRef> value
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

  out('');
  out(`done: ${new Date().toISOString()}`);
  if (JSON_MODE) emitJson(summary);
}

main().catch((err) => {
  process.stderr.write(`artemida-probe: fatal: ${err?.stack ?? err}\n`);
  process.exitCode = 1;
});

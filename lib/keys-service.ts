// Keys/trial service — the SINGLE read/write path shared by the bot and the
// BFF routes (RESEARCH "Bot + PWA shared path"). Both call `startTrial`, so
// there is no duplicated Prisma or fetch logic between channels.
//
// Trial anti-abuse (D-21..D-24, PITFALLS §5):
// - The gate is an atomic `UPDATE ... WHERE trial_used=false`, not a client
//   flag (D-22). Two concurrent taps can never both win.
// - A provider failure rolls the claim back so the user can retry (D-23), but
//   the rollback is guarded by `trialKeyId: null` so a recorded success is
//   never reopened (Pitfall 5).
import { ArtemidaError, artemida, type Device, type NormalizedKey } from "./artemida";
import { t } from "./i18n";
import { prisma } from "./prisma";

export type StartTrialResult =
  | { kind: "created"; key: NormalizedKey }
  | { kind: "already_used" };

// ---------------------------------------------------------------------------
// Cache-first subscription read (D-29) + correctness (Pitfall 6 / T-02-14).
//
// The card's status is derived from `expiresAt` against `now`, NEVER from the
// stored `status` string: a stale cache must not claim more validity than the
// expiry supports. `status.unknown` covers absent status/expiry.
// ---------------------------------------------------------------------------

export type StatusKind = "active" | "expiring" | "expired" | "pending" | "unknown";

export type RenderedKey = NormalizedKey & { statusKind: StatusKind };

type KeyCacheRow = Awaited<ReturnType<typeof prisma.keyCache.findMany>>[number];

const DAY_MS = 86_400_000;
// A key with ≤3 days of validity is "expiring" (UI-SPEC status.expiring).
const EXPIRING_WINDOW_MS = 3 * DAY_MS;

// UI-SPEC populated state order: active → expiring → expired → pending.
const STATUS_ORDER: Record<StatusKind, number> = {
  active: 0,
  expiring: 1,
  expired: 2,
  pending: 3,
  unknown: 4,
};

/**
 * Derive the display status from expiry vs `now` (Pitfall 6). The stored
 * `status` string is only consulted when there is no expiry at all, and then
 * only to recognise the non-time lifecycle states `pending`/`expired`.
 */
export function deriveStatusKind(status: string, expiresAt: Date | null): StatusKind {
  if (expiresAt) {
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining <= 0) return "expired";
    if (remaining <= EXPIRING_WINDOW_MS) return "expiring";
    return "active";
  }
  if (status === "pending") return "pending";
  if (status === "expired") return "expired";
  return "unknown";
}

/**
 * Localised badge label for a status kind. The five literal `t("status.…")`
 * calls below are the single registration point for the scanner — never build
 * the key by interpolation. Shared by the cabinet card and the bot summary.
 */
export function statusLabel(kind: StatusKind, expiresAt: string | null): string {
  switch (kind) {
    case "active":
      return t("status.active");
    case "expiring": {
      const days = expiresAt
        ? Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS))
        : 0;
      return t("status.expiring", { days });
    }
    case "expired":
      return t("status.expired");
    case "pending":
      return t("status.pending");
    default:
      return t("status.unknown");
  }
}

/** `DD.MM.YYYY` (ru-RU) for a card / bot expiry line. */
export function formatKeyDate(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toRenderedKey(row: KeyCacheRow): RenderedKey {
  return {
    id: row.keyId,
    name: row.name,
    status: row.status,
    isTrial: row.isTrial,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    deviceLimit: row.deviceLimit,
    devices: row.devices,
    subscriptionUrl: row.subscriptionUrl,
    customerRef: row.customerRef,
    trafficUsedBytes: row.trafficUsedBytes === null ? null : Number(row.trafficUsedBytes),
    trafficLimitBytes: row.trafficLimitBytes === null ? null : Number(row.trafficLimitBytes),
    statusKind: deriveStatusKind(row.status, row.expiresAt),
  };
}

/**
 * Read the user's keys from `keys_cache` (instant, D-29), scoped by the owning
 * user row resolved from the session telegram id (T-02-13 IDOR). Rows are
 * ordered active → expiring → expired → pending and rendered with a derived
 * status.
 */
export async function listKeys(telegramId: bigint): Promise<RenderedKey[]> {
  const rows = await prisma.keyCache.findMany({
    where: { user: { telegramId } },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map(toRenderedKey)
    .sort((a, b) => STATUS_ORDER[a.statusKind] - STATUS_ORDER[b.statusKind]);
}

/**
 * Phase 6 (D-82) counterpart of `listKeys`, scoped by the users.id row for
 * email-only sessions (G-06-9). Same RenderedKey mapping and status ordering;
 * the session userId is resolved server-side, never client-supplied
 * (T-06-07-03 IDOR).
 */
export async function listKeysByUserId(userId: number): Promise<RenderedKey[]> {
  const rows = await prisma.keyCache.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map(toRenderedKey)
    .sort((a, b) => STATUS_ORDER[a.statusKind] - STATUS_ORDER[b.statusKind]);
}

/**
 * Background refresh from ARTEMIDA `GET /keys` (D-29). Called from the BFF
 * route and the cabinet page via `after()`, and fire-and-forget from the bot.
 *
 * OWNERSHIP FILTER (T-02-22, gap #5/#6): the service runs on a single
 * service-wide `ARTEMIDA_API_KEY`, so `GET /keys` returns EVERY user's keys.
 * Only entries whose normalized `customerRef` equals the caller's telegram id
 * are mirrored into the caller's `keys_cache` — a key owned by another user, or
 * one with a null/absent `customerRef`, is skipped. Absent ownership evidence
 * is never treated as ownership. Filtering on the observed `customerRef` at the
 * population step is authoritative regardless of the provider's unverified `q`
 * semantics (ASSUMP-A6).
 *
 * Upserts each owned provider key by the unique `(userId, keyId)` pair and
 * stamps `lastSyncedAt`. Removals are reconciled conservatively: provider
 * omissions (pagination/revocation) must never delete a local cache row.
 */
export async function revalidateKeys(telegramId: bigint): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true },
  });
  if (!user) return; // no local identity row to attach the mirror to
  const list = await artemida.listKeys();
  const ownerRef = String(telegramId);
  for (const key of list.items) {
    if (key.customerRef !== ownerRef) continue; // not owned — never mirror
    await upsertCachedKey(user.id, key);
  }
}

/**
 * UserId-keyed counterpart of `revalidateKeys` (G-06-9). Email trials/keys are
 * created under `customerRef = email:{userId}` (D-80), so only entries carrying
 * that exact ownership reference are mirrored into the caller's cache — the
 * same T-02-22 ownership-filter discipline as the TG path.
 */
export async function revalidateKeysByUserId(userId: number): Promise<void> {
  const ownerRef = `email:${userId}`;
  const list = await artemida.listKeys();
  for (const key of list.items) {
    if (key.customerRef !== ownerRef) continue; // not owned — never mirror
    await upsertCachedKey(userId, key);
  }
}

/**
 * Ownership-joined detail read: resolve the key row scoped by the owning user
 * from the session telegram id (T-02-17 IDOR). A key the caller does not own
 * is indistinguishable from a missing one — both return `null`.
 */
export async function getKeyForUser(
  telegramId: bigint,
  keyId: string,
): Promise<RenderedKey | null> {
  const row = await prisma.keyCache.findFirst({
    where: { keyId, user: { telegramId } },
  });
  return row ? toRenderedKey(row) : null;
}

/**
 * Ownership read scoped by the local `userId` (email-only accounts included).
 * The mirror of `getKeyForUser` for the userId-keyed cabinet path (G-06-9):
 * a non-owned/missing key is indistinguishable from a missing one — both `null`.
 */
export async function getKeyForUserId(
  userId: number,
  keyId: string,
): Promise<RenderedKey | null> {
  const row = await prisma.keyCache.findFirst({
    where: { keyId, user: { id: userId } },
  });
  return row ? toRenderedKey(row) : null;
}

export interface SubscriptionForUser {
  subscriptionUrl: string | null;
  links: string[];
  traffic: { usedBytes: number | null; limitBytes: number | null };
}

/**
 * Fresh subscription-link + traffic read for one owned key (CAB-04 / D-30/D-31).
 *
 * Ownership is joined on `(userId, keyId)` before any provider call, so a
 * non-owned key never triggers a provider request and can never leak another
 * user's link (T-02-17). The sub-link fetch propagates an `ArtemidaError` so
 * the caller can render `key.linkError`; the traffic read is display-only
 * (D-31) and degrades to nulls rather than failing the link. Traffic and the
 * sub-link URL are mirrored back into `keys_cache` so later cache-first reads
 * stay fresh — but the URL write is guarded on a non-null normalized value
 * (T-02-23): a tolerant-normalizer null on a 2xx must never overwrite a
 * previously good cached URL. Provider shapes for these endpoints are
 * UNKNOWN (02-01 probe, 0-key account): the client normalizers are tolerant
 * and a missing field surfaces as the RU `key.linkUnavailable` fallback —
 * never a fabricated URL.
 */
export async function getSubscriptionForUser(
  telegramId: bigint,
  keyId: string,
): Promise<SubscriptionForUser | null> {
  return getSubscriptionForOwnedKey({ telegramId }, keyId);
}

/** userId-scoped subscription read (email-only accounts included). */
export async function getSubscriptionForUserId(
  userId: number,
  keyId: string,
): Promise<SubscriptionForUser | null> {
  return getSubscriptionForOwnedKey({ id: userId }, keyId);
}

async function getSubscriptionForOwnedKey(
  ownerWhere: { telegramId: bigint } | { id: number },
  keyId: string,
): Promise<SubscriptionForUser | null> {
  const row = await prisma.keyCache.findFirst({
    where: { keyId, user: ownerWhere },
    select: { id: true },
  });
  if (!row) return null; // not owned / missing — same result (no oracle)

  // Propagates ArtemidaError: the caller distinguishes a fetch failure
  // (`key.linkError`) from a valid response with no URL (`key.linkUnavailable`).
  const links = await artemida.getSubscriptionLinks(keyId);

  let traffic: { usedBytes: number | null; limitBytes: number | null } = {
    usedBytes: null,
    limitBytes: null,
  };
  try {
    traffic = await artemida.getTraffic(keyId);
  } catch {
    // Traffic is display-only (D-31): a failure must not block the link.
  }

  await prisma.keyCache.update({
    where: { id: row.id },
    data: {
      // Gap #7 (T-02-23): the normalizer is tolerant and yields null on a 2xx
      // shape mismatch. Write subscription_url ONLY when a real URL was
      // recognized; omitting the field leaves a previously good cached value
      // untouched. Traffic/lastSyncedAt still refresh on every successful read.
      ...(links.subscriptionUrl !== null ? { subscriptionUrl: links.subscriptionUrl } : {}),
      trafficUsedBytes: toBigIntOrNull(traffic.usedBytes),
      trafficLimitBytes: toBigIntOrNull(traffic.limitBytes),
      lastSyncedAt: new Date(),
    },
  });

  return { subscriptionUrl: links.subscriptionUrl, links: links.links, traffic };
}

// ---------------------------------------------------------------------------
// Device management (CAB-03 / D-32). Every operation resolves the owning key
// row from the session telegram id BEFORE any provider call (T-02-21), so a
// key the caller does not own can never mutate another user's devices: the
// caller sees the same result as for a missing key (null / false → 404).
//
// The provider shape for `GET /keys/{id}/devices` was UNKNOWN in the 02-01
// probe (0-key account). The client normalizer accepts both `token` and `id`
// (ASSUMP-A5); here we additionally drop entries with no addressable token so
// the UI never renders a delete control that would target an empty token —
// absence degrades to the RU `devices.empty` fallback rather than a fabricated
// row (02-01 KEY CONTRACT).
// ---------------------------------------------------------------------------

/** Owned `keys_cache` row id for (telegramId, keyId), or null when not owned. */
async function ownedKeyRowId(telegramId: bigint, keyId: string): Promise<number | null> {
  const row = await prisma.keyCache.findFirst({
    where: { keyId, user: { telegramId } },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Ownership-joined device list; null for a non-owned/missing key (no oracle). */
export async function listDevices(
  telegramId: bigint,
  keyId: string,
): Promise<Device[] | null> {
  if ((await ownedKeyRowId(telegramId, keyId)) === null) return null;
  const devices = await artemida.getDevices(keyId);
  return devices.filter((device) => device.token.length > 0);
}

/** Delete one device on an owned key. Returns false (→ 404) when not owned. */
export async function removeDevice(
  telegramId: bigint,
  keyId: string,
  token: string,
): Promise<boolean> {
  if ((await ownedKeyRowId(telegramId, keyId)) === null) return false;
  await artemida.deleteDevice(keyId, token);
  return true;
}

/** Clear every device on an owned key. Returns false (→ 404) when not owned. */
export async function clearDevices(telegramId: bigint, keyId: string): Promise<boolean> {
  if ((await ownedKeyRowId(telegramId, keyId)) === null) return false;
  await artemida.clearDevices(keyId);
  return true;
}

/**
 * Atomically claim the one-time trial for a telegram id. A SINGLE statement
 * (`updateMany`) makes the race safe (D-22): `count === 1` means we won the
 * claim, `count === 0` means the flag was already set (or the row is absent).
 */
export async function claimTrial(telegramId: bigint): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { telegramId, trialUsed: false },
    data: { trialUsed: true },
  });
  return count === 1;
}

/**
 * Compensating rollback for a failed provider call (D-23). The
 * `trialKeyId: null` guard means only an in-flight claim (no key recorded
 * yet) is released — a concurrent success can never be clobbered (Pitfall 5).
 */
export async function releaseTrialOnFailure(telegramId: bigint): Promise<void> {
  await prisma.user.updateMany({
    where: { telegramId, trialUsed: true, trialKeyId: null },
    data: { trialUsed: false },
  });
}

/**
 * Phase 6 email identity (D-80): the same atomic one-trial-per-account claim
 * as `claimTrial`, keyed by the users.id row instead of telegramId. Email
 * accounts without Telegram claim their trial through this path; the
 * `trialUsed` flag stays the single source of truth (trialUsed OR on merge
 * in plan 06-02 keeps it that way).
 */
export async function claimTrialByUserId(userId: number): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, trialUsed: false },
    data: { trialUsed: true },
  });
  return count === 1;
}

/**
 * UserId-keyed counterpart of `releaseTrialOnFailure`: releases only an
 * in-flight email-trial claim, never a recorded success.
 */
export async function releaseTrialOnFailureByUserId(userId: number): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, trialUsed: true, trialKeyId: null },
    data: { trialUsed: false },
  });
}

function toBigIntOrNull(value: number | null): bigint | null {
  if (value === null || !Number.isFinite(value)) return null;
  return BigInt(Math.trunc(value));
}

function parseExpiry(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Upsert a normalized provider key into the cache-first read mirror (D-29).
 * Exported so the fulfillment worker can persist a freshly created paid key
 * through the SAME cache path as `revalidateKeys`/`startTrial` — one mapping,
 * no duplicated field normalization.
 */
export async function upsertCachedKey(userId: number, key: NormalizedKey): Promise<void> {
  const data = {
    name: key.name,
    status: key.status,
    isTrial: key.isTrial,
    expiresAt: parseExpiry(key.expiresAt),
    deviceLimit: key.deviceLimit,
    devices: key.devices,
    trafficUsedBytes: toBigIntOrNull(key.trafficUsedBytes),
    trafficLimitBytes: toBigIntOrNull(key.trafficLimitBytes),
    subscriptionUrl: key.subscriptionUrl,
    customerRef: key.customerRef,
    lastSyncedAt: new Date(),
  };
  await prisma.keyCache.upsert({
    where: { userId_keyId: { userId, keyId: key.id } },
    update: data,
    create: { userId, keyId: key.id, ...data },
  });
}

/**
 * Claim → issue → persist, or a clean `already_used` signal.
 *
 * On a provider failure the claim is released and the error rethrown so the
 * route/bot can map it. A provider `conflict` (409) means the provider itself
 * already considers this account ineligible: that is terminal, not transient,
 * so we keep the claim and surface `already_used` rather than reopening a
 * retry loop (RESEARCH Open Q3, D-24).
 */
export async function startTrial(telegramId: bigint): Promise<StartTrialResult> {
  if (!(await claimTrial(telegramId))) {
    return { kind: "already_used" };
  }

  let key: NormalizedKey;
  try {
    key = await artemida.createTrial({ customerRef: String(telegramId) });
  } catch (err) {
    if (err instanceof ArtemidaError && err.code === "conflict") {
      // Provider already enforces one trial for this account: keep trialUsed
      // set (non-retryable) and report it as used.
      return { kind: "already_used" };
    }
    await releaseTrialOnFailure(telegramId);
    throw err;
  }

  // Provider success: record the success sentinel before the cache write so a
  // cache-upsert failure can never reopen the trial (D-23/Pitfall 5).
  const user = await prisma.user.update({
    where: { telegramId },
    data: { trialKeyId: key.id },
    select: { id: true },
  });
  await upsertCachedKey(user.id, key);

  return { kind: "created", key };
}

/**
 * UserId-keyed counterpart of `startTrial` (G-06-9, D-80). Email-only accounts
 * claim through `claimTrialByUserId` and create the provider key under
 * `customerRef = email:{userId}`, so the provider enforces one trial per email
 * account in addition to the atomic local claim. The compensating rollback is
 * `releaseTrialOnFailureByUserId` (guarded on `trialKeyId: null`, Pitfall 5).
 * A provider `conflict` (409) is terminal: keep the claim, report `already_used`.
 */
export async function startTrialByUserId(userId: number): Promise<StartTrialResult> {
  if (!(await claimTrialByUserId(userId))) {
    return { kind: "already_used" };
  }

  let key: NormalizedKey;
  try {
    key = await artemida.createTrial({ customerRef: `email:${userId}` });
  } catch (err) {
    if (err instanceof ArtemidaError && err.code === "conflict") {
      // Provider already enforces one trial for this email account: terminal.
      return { kind: "already_used" };
    }
    await releaseTrialOnFailureByUserId(userId);
    throw err;
  }

  // Record the success sentinel before the cache write (D-23/Pitfall 5).
  await prisma.user.update({
    where: { id: userId },
    data: { trialKeyId: key.id },
  });
  await upsertCachedKey(userId, key);

  return { kind: "created", key };
}

// D-10 shared grace predicate boundary vectors. The 24h window is authoritative
// on the SERVER; ±1ms fixtures pin the exact edge, and trial keys never grace.
// Pure unit tests: fake clock, no DB, no network, no provider text anywhere.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GRACE_MS,
  deriveSubscriptionStatus,
  isKeyConnectable,
} from '../../lib/subscription-view';
import type { RenderedKey } from '../../lib/keys-service';

// Pin 24 HOURS independently of the helper — 86_400_000ms is one day, and a
// stray `24 * DAY_MS` would silently turn the grace into 24 days.
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const E = new Date('2026-01-01T00:00:00.000Z'); // fixed expiry, in the past at test time
const BOUNDARY = E.getTime() + TWENTY_FOUR_HOURS_MS; // graceUntil for an expired key

function expiredKey(overrides: Partial<RenderedKey> = {}): RenderedKey {
  return {
    id: 'key-expired',
    name: '3set VPN',
    status: 'active', // raw status is not a permanent disqualifier
    isTrial: false,
    expiresAt: E.toISOString(),
    deviceLimit: 2,
    devices: 1,
    subscriptionUrl: null,
    customerRef: 'email:1',
    trafficUsedBytes: 0,
    trafficLimitBytes: null,
    statusKind: 'expired',
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe('24h grace boundary (D-10 / T-21-12)', () => {
  it('the grace constant is exactly 24 hours, not 24 days', () => {
    expect(GRACE_MS).toBe(TWENTY_FOUR_HOURS_MS);
  });

  it('at expiresAt + 24h - 1ms the key is inGrace and connectable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BOUNDARY - 1));
    const view = deriveSubscriptionStatus(expiredKey());
    expect(view.statusKind).toBe('expired');
    expect(view.graceUntil).toBe(new Date(BOUNDARY).toISOString());
    expect(view.inGrace).toBe(true);
    expect(isKeyConnectable(expiredKey())).toBe(true);
  });

  it('at expiresAt + 24h + 1ms the key is not inGrace and not connectable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BOUNDARY + 1));
    const view = deriveSubscriptionStatus(expiredKey());
    expect(view.statusKind).toBe('expired');
    expect(view.graceUntil).toBe(new Date(BOUNDARY).toISOString());
    expect(view.inGrace).toBe(false);
    expect(isKeyConnectable(expiredKey())).toBe(false);
  });

  it('an expired trial key has graceUntil null and stays blocked inside the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BOUNDARY - 1));
    const trial = expiredKey({ id: 'trial', isTrial: true });
    const view = deriveSubscriptionStatus(trial);
    expect(view.statusKind).toBe('expired');
    expect(view.graceUntil).toBeNull();
    expect(view.inGrace).toBe(false);
    expect(isKeyConnectable(trial)).toBe(false);
  });

  it('a future-expiry active key has no grace window but stays connectable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const active = expiredKey({
      id: 'key-active',
      expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      statusKind: 'active',
    });
    const view = deriveSubscriptionStatus(active);
    expect(view.statusKind).toBe('active');
    expect(view.graceUntil).toBeNull();
    expect(view.inGrace).toBe(false);
    expect(isKeyConnectable(active)).toBe(true);
  });

  it('raw revoked/disabled/trial-expired stay disqualified even with a future expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
    for (const status of ['revoked', 'disabled', 'trial-expired']) {
      const k = expiredKey({ id: status, status, expiresAt: future, statusKind: 'active' });
      expect(deriveSubscriptionStatus(k).statusKind).toBe('active');
      expect(isKeyConnectable(k)).toBe(false);
    }
  });

  it('an empty/whitespace key id is never connectable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BOUNDARY - 1));
    expect(isKeyConnectable(expiredKey({ id: '   ' }))).toBe(false);
  });
});

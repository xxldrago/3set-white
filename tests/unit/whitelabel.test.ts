// White Label sub-link host verification (OPS-02 / D-72..D-74): a matching host
// passes unchanged; a mismatch falls back to the provider URL with a warning and
// NEVER rewrites/constructs a host (T-05-20); empty/malformed input never throws
// (OPS-02 encoding edge). Pure — no DB, no network.
import { describe, expect, it } from "vitest";
import { env } from "../../lib/env";
import {
  WHITELABEL_HOST,
  resolveSubscriptionUrl,
  verifySubscriptionHost,
} from "../../lib/whitelabel";

const PROVIDER_URL = "https://xskx.artemida.live/M2HGD-qjFynCB9Ns";
const WL_PATH = "/M2HGD-qjFynCB9Ns";
const WL_URL = `https://${WHITELABEL_HOST}${WL_PATH}`;

describe("whitelabel host verification", () => {
  it("reads the WL host from env (single source, not hardcoded)", () => {
    expect(WHITELABEL_HOST).toBe(env.WHITELABEL_HOST);
    expect(env.WHITELABEL_HOST).toBe("sub.my.3set.online");
  });

  it("passes a provider URL whose host equals the WL host unchanged", () => {
    const check = verifySubscriptionHost(WL_URL);
    expect(check.host).toBe(WHITELABEL_HOST);
    expect(check.matches).toBe(true);
    expect(check.warning).toBeUndefined();

    const resolved = resolveSubscriptionUrl(WL_URL);
    expect(resolved.url).toBe(WL_URL);
    expect(resolved.fallback).toBe(false);
    expect(resolved.warning).toBeUndefined();
  });

  it("falls back to the provider URL on a host mismatch — never rewrites it", () => {
    const check = verifySubscriptionHost(PROVIDER_URL);
    expect(check.host).toBe("xskx.artemida.live");
    expect(check.matches).toBe(false);
    expect(check.warning).toBe("subscription_host_mismatch");

    const resolved = resolveSubscriptionUrl(PROVIDER_URL);
    // Byte-for-byte the provider URL: no fabricated/rewritten host.
    expect(resolved.url).toBe(PROVIDER_URL);
    expect(resolved.fallback).toBe(true);
    expect(resolved.warning).toBe("subscription_host_mismatch");
    expect(resolved.url).not.toContain(WHITELABEL_HOST);
  });

  it("returns a null/empty result for empty or missing input without throwing", () => {
    for (const input of [null, undefined, "", "   "]) {
      const resolved = resolveSubscriptionUrl(input);
      expect(resolved.url).toBeNull();
      expect(resolved.fallback).toBe(false);
      expect(resolved.warning).toBe("subscription_url_empty");
    }
    expect(verifySubscriptionHost(null).matches).toBe(false);
  });

  it("handles a malformed URL string without throwing", () => {
    for (const input of ["not a url", "http://", "://missing-scheme"]) {
      expect(() => resolveSubscriptionUrl(input)).not.toThrow();
      const resolved = resolveSubscriptionUrl(input);
      expect(resolved.url).toBeNull();
      expect(resolved.fallback).toBe(false);
      expect(resolved.warning).toBe("subscription_url_malformed");
      expect(() => verifySubscriptionHost(input)).not.toThrow();
    }
  });

  it("does not rewrite the host when the expected host is overridden", () => {
    const resolved = resolveSubscriptionUrl(PROVIDER_URL);
    // The returned URL still carries the provider host, not the override.
    expect(new URL(resolved.url as string).hostname).toBe("xskx.artemida.live");
  });
});

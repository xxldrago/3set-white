// White Label subscription-host verification + safe fallback (OPS-02 /
// D-72..D-74).
//
// The provider (ARTEMIDA) is the ONLY source of a subscription URL. This module
// never constructs or rewrites a host: it verifies the provider-returned URL's
// host against the configured White Label host (`WHITELABEL_HOST`, D-72) and, on
// a mismatch, returns the provider URL UNCHANGED with a warning so the caller
// can log and use the provider default (D-74). Empty/malformed input is handled
// without throwing (OPS-02 encoding edge). Pure module: no Next runtime, no
// Prisma, no network — unit-testable.
import { env } from "./env";
import { logger } from "./logger";

/** The expected White Label subscription host (read from env — one source). */
export const WHITELABEL_HOST: string = env.WHITELABEL_HOST;

export interface SubscriptionHostVerification {
  /** Lowercased hostname of the provider URL, or null when unparseable/empty. */
  host: string | null;
  /** True only when the URL is well-formed and its host equals the expected. */
  matches: boolean;
  /** Stable machine reason when not matching (for logs); absent on a match. */
  warning?: string;
}

export interface ResolvedSubscriptionUrl {
  /** Provider URL unchanged when usable, otherwise null (never fabricated). */
  url: string | null;
  /** True when a non-matching host forced the provider-default fallback. */
  fallback: boolean;
  warning?: string;
}

/**
 * Compare a provider-returned subscription URL's host to the expected White
 * Label host. Never throws. `expectedHost` defaults to the env-configured host.
 */
export function verifySubscriptionHost(
  url: string | null | undefined,
  expectedHost: string = WHITELABEL_HOST,
): SubscriptionHostVerification {
  if (url === null || url === undefined || url.trim().length === 0) {
    return { host: null, matches: false, warning: "subscription_url_empty" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { host: null, matches: false, warning: "subscription_url_malformed" };
  }
  const host = parsed.hostname.toLowerCase();
  const expected = expectedHost.trim().toLowerCase();
  if (host === expected) return { host, matches: true };
  return { host, matches: false, warning: "subscription_host_mismatch" };
}

/**
 * Resolve the URL to hand to a user. The provider URL is returned UNCHANGED when
 * its host matches, or as the provider-default fallback when it does not (D-74);
 * a non-matching host emits a warn log. Empty/malformed input yields `url: null`
 * without throwing. This function NEVER builds a host from `WHITELABEL_HOST`
 * (T-05-20).
 */
export function resolveSubscriptionUrl(
  providerUrl: string | null | undefined,
): ResolvedSubscriptionUrl {
  const verification = verifySubscriptionHost(providerUrl);
  if (verification.host === null) {
    return { url: null, fallback: false, warning: verification.warning };
  }
  if (verification.matches) {
    return { url: providerUrl as string, fallback: false };
  }
  // Mismatch: warn and fall back to the provider URL as-is — never rewrite it.
  logger.warn({
    route: "whitelabel",
    outcome: "subscription_host_fallback",
    host: verification.host,
    expected: WHITELABEL_HOST,
  });
  return { url: providerUrl as string, fallback: true, warning: verification.warning };
}

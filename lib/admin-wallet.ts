// Shared helpers for the administrator-only provider-wallet surface.
//
// Kept out of the route files: Next.js route modules may only export handlers
// and route config, so the gate/status mapping lives here and both the balance
// and the top-up routes import it.
import type { ArtemidaError } from "./artemida";
import { AdminError, SessionError } from "./session";

/** Provider error code → HTTP status for a BFF response. */
export function mapArtemidaStatus(code: ArtemidaError["code"]): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "payment_required":
      return 402;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "rate_limited":
      return 429;
    case "bad_gateway":
    case "unavailable":
      return 502;
    default:
      return 500;
  }
}

/**
 * Map an administrator-gate failure to a response.
 *
 * Signed out → 401, wrong role → 404 (a non-administrator must not learn that
 * the route exists). Returns null for anything else so the caller can log and
 * answer 500.
 */
export function gateErrorResponse(err: unknown): Response | null {
  if (err instanceof SessionError) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (err instanceof AdminError) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

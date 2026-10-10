// POST /api/auth/email/verify/confirm — redeem a confirmation token.
// Public endpoint (the clicker arrives without a session): invalid, used,
// and expired tokens share one generic 400 — no oracle on token existence.
// Success stamps `emailVerifiedAt`, unlocking the email-only trial.
import { z } from "zod";
import { confirmVerification } from "../../../../../../lib/email-verify";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1).max(256),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const result = await confirmVerification(parsed.data.token);
    if (!result.ok) {
      logger.warn({ route: "email-verify-confirm", outcome: result.reason });
      return Response.json({ error: "invalid_token" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "email-verify-confirm", outcome: "confirm_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

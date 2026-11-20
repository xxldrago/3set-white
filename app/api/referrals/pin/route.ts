// POST /api/referrals/pin — pin the inviter for the session account.
//
// Used by the `?ref=` landing after a Telegram/widget login (the widget payload
// cannot carry our ref). First valid code wins; self/unknown codes and re-pins
// are silent no-ops returning `{ ok: true, pinned: false }` — no oracle on code
// existence.
//
// This is NOT a click beacon: `/api/referrals/click` owns the funnel top and is
// called alongside this route by `RefCapture`. An earlier revision replaced this
// handler with a copy of that beacon, which silently dropped attribution for
// every signed-in visitor arriving from a referral link.
import { z } from "zod";
import { pinReferrer } from "../../../../lib/referrals";
import { logger } from "../../../../lib/logger";
import { SessionError, requireSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(32),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      // Signed out: the register flow carries its own `ref`, and the click
      // beacon has already recorded the funnel top. Nothing to pin.
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "referrals-pin", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
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
    const pinned = await pinReferrer(userId, parsed.data.code);
    return Response.json({ ok: true, pinned: pinned !== null });
  } catch {
    logger.error({ route: "referrals-pin", outcome: "pin_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

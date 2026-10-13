// POST /api/keys/[id]/bonus — extend one owned key by bonus days.
// Body `{ days }` (1..balance). Ownership resolves through the
// (userId, keyId) join (foreign → 404, no oracle); trial keys → 409;
// short balance → 400; provider failure → 502 with the balance refunded.
import { z } from "zod";
import { redeemBonusDays } from "../../../../../lib/referrals";
import { logger } from "../../../../../lib/logger";
import { requireSession, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);
const bodySchema = z.object({
  days: z.number().int().min(1).max(3650),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "keys-bonus", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const result = await redeemBonusDays(userId, parsedId.data, parsedBody.data.days);
    if (!result.ok) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "trial"
            ? 409
            : result.reason === "insufficient"
              ? 400
              : 502;
      return Response.json({ error: result.reason }, { status });
    }
    return Response.json({ ok: true, days: result.days, expiresAt: result.expiresAt });
  } catch {
    logger.error({ route: "keys-bonus", outcome: "redeem_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

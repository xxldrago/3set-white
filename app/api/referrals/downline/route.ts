// PUT /api/referrals/downline — set the caller's own downline rate (what
// THEIR referrals earn when those bring buyers). Body
// `{ kind: "percent"|"fixed"|"days"|null, value?: number }`; null clears back
// to global. Session-gated; anyone may only narrow their own share (the
// residual math floors at zero, so no money is ever created).
import { z } from "zod";
import { setSubRate } from "../../../../lib/referrals";
import { logger } from "../../../../lib/logger";
import { SessionError, requireSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["percent", "fixed", "days"]).nullable(),
  value: z.number().int().min(0).max(1_000_000).optional(),
});

export async function PUT(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "referrals-downline", outcome: "session_error" });
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
    const rate =
      parsed.data.kind === null
        ? null
        : { kind: parsed.data.kind, value: parsed.data.value ?? 0 };
    const saved = await setSubRate(userId, rate);
    return Response.json({ ok: true, downline: saved });
  } catch {
    logger.error({ route: "referrals-downline", outcome: "save_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

// POST /api/referrals/click — public click beacon for the funnel top.
// Body `{ code }` (a referral code, any case). Always 200: unknown codes
// record nothing but answer identically (codes are public strings, yet no
// oracle is offered). Hourly per-IP dedupe lives in the service.
import { z } from "zod";
import { clientIp } from "../../../../lib/client-ip";
import { logger } from "../../../../lib/logger";
import { prisma } from "../../../../lib/prisma";
import { recordClick } from "../../../../lib/referral-stats";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(32),
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
    const code = parsed.data.code.trim().toUpperCase();
    const owner = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (owner) {
      await recordClick(owner.id, code, clientIp(req), "link");
    }
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "referrals-click", outcome: "record_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

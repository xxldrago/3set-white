// POST /api/referrals/pin — mirror of click for ?ref=CODE links
// Always 200, no oracle
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
    const ip = clientIp(req);
    const owner = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (owner) {
      await recordClick(owner.id, code, ip, "link", { kind: "referral" });
    } else {
      await recordClick(null, code, ip, "link", { kind: "promo", promoCodeId: code });
    }
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "referrals-pin", outcome: "record_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

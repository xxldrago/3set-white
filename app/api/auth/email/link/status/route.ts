// POST /api/auth/email/link/status — poll the link-token state.
// Session-gated AND token-scoped: a token belonging to another account
// reports `expired` (no oracle, no cross-account polling). Read-only —
// never mints, never merges.
import { z } from "zod";
import { LINK_TOKEN_SHAPE, linkTokenStatus } from "../../../../../../lib/telegram-link";
import { prisma } from "../../../../../../lib/prisma";
import { logger } from "../../../../../../lib/logger";
import { SessionError, requireSession } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1).max(256),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-link-status", outcome: "session_error" });
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
  if (!LINK_TOKEN_SHAPE.test(parsed.data.token)) {
    return Response.json({ status: "expired" });
  }
  try {
    const row = await prisma.telegramLinkToken.findUnique({
      where: { token: parsed.data.token },
      select: { userId: true },
    });
    if (!row || row.userId !== userId) {
      return Response.json({ status: "expired" });
    }
    return Response.json({ status: await linkTokenStatus(parsed.data.token) });
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

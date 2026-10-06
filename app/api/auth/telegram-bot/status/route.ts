// POST /api/auth/telegram-bot/status — poll the login-token state (G-06-4b).
//
// Read-only: NEVER mints a session (T-06-06-01) and returns no user data
// (T-06-06-03). Unknown and malformed-but-non-empty tokens both report
// `expired`, so the endpoint is not an oracle for token existence. Malformed
// bodies (missing/non-string) → 400.
import { z } from "zod";
import { LOGIN_TOKEN_SHAPE } from "../../../../../lib/telegram-login";
import { prisma } from "../../../../../lib/prisma";

export const dynamic = "force-dynamic";

const statusSchema = z.object({
  token: z.string().min(1).max(256),
});

type LoginStatus = "pending" | "ready" | "consumed" | "expired";

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { token } = parsed.data;
  // Non-shape tokens are indistinguishable from unknown ones (no oracle).
  if (!LOGIN_TOKEN_SHAPE.test(token)) {
    return Response.json({ status: "expired" satisfies LoginStatus });
  }
  try {
    const row = await prisma.telegramLoginToken.findUnique({
      where: { token },
      select: { telegramId: true, expiresAt: true, consumedAt: true },
    });
    let status: LoginStatus;
    if (!row || row.expiresAt.getTime() <= Date.now()) status = "expired";
    else if (row.consumedAt !== null) status = "consumed";
    else if (row.telegramId !== null) status = "ready";
    else status = "pending";
    return Response.json({ status });
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

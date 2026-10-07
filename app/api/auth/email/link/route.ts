// POST /api/auth/email/link — bind a Telegram identity to the session
// account (D-81, AUTH-03, T-06-05).
//
// Both proofs required: a valid session (email side — requireSession FIRST)
// PLUS a valid Telegram widget payload (verifyWidget + one-time replay
// consume). Pure-TG rows merge fully (keys/orders/tickets, trialUsed OR);
// a Telegram bound to another email account → 409 with NO merge (T-06-05).
// The session is re-minted after the merge so its tid claim matches the
// linked identity (privilege change, T-06-03 follow-through).
import { z } from "zod";
import {
  buildSessionCookie,
  signSession,
  verifyWidget,
} from "../../../../../lib/auth";
import { AccountConflictError, AccountNotFoundError, linkAccounts } from "../../../../../lib/accounts";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";
import { revalidateKeys } from "../../../../../lib/keys-service";
import { consumeWidgetHash } from "../../../../../lib/replay";
import { SessionError, requireSession } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

// looseObject: the HMAC covers every field Telegram signed except hash —
// same discipline as app/api/auth/telegram/route.ts.
const widgetSchema = z.looseObject({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-link", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = widgetSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const widget = parsed.data;
  if (!verifyWidget(widget, env.BOT_TOKEN)) {
    logger.warn({ route: "email-link", outcome: "rejected" });
    return Response.json({ error: "invalid_telegram" }, { status: 401 });
  }
  if (!(await consumeWidgetHash(widget.hash))) {
    logger.warn({ route: "email-link", outcome: "rejected" });
    return Response.json({ error: "invalid_telegram" }, { status: 401 });
  }

  try {
    const result = await linkAccounts({ userId, telegramId: widget.id });
    // Privilege change: re-mint so the cookie carries the linked tid.
    const token = await signSession(result.userId, widget.id, env.SESSION_SECRET);
    logger.info({ route: "email-link", outcome: result.merged ? "merged" : "attached" });
    void revalidateKeys(BigInt(widget.id)).catch(() => undefined);
    return Response.json(
      { ok: true, merged: result.merged },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(token, env.NODE_ENV === "production"),
        },
      },
    );
  } catch (err) {
    if (err instanceof AccountConflictError) {
      logger.warn({ route: "email-link", outcome: "conflict" });
      return Response.json({ error: "telegram_taken" }, { status: 409 });
    }
    if (err instanceof AccountNotFoundError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "email-link", outcome: "error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

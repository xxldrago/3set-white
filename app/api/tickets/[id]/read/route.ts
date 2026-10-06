// POST /api/tickets/[id]/read — session-gated mark-read (D-58).
//
// The telegram id comes from the signed cookie (T-04-14) and `markTicketRead`
// joins ownership: a non-owned ticket returns `false` → 404 exactly like a
// missing one (no oracle). Clears `unreadForUser` for the owner only; the
// counter is never touched anywhere else (Pitfall 6).
import { z } from "zod";
import { logger } from "../../../../../lib/logger";
import { requireTelegramSession, SessionError } from "../../../../../lib/session";
import { markTicketRead } from "../../../../../lib/tickets-service";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(200);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "tickets-read", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const ok = await markTicketRead(BigInt(telegramId), parsed.data);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "tickets-read", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

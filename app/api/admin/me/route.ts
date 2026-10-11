// GET /api/admin/me — caller's own staff role (or null). Powers the cabinet
// header admin shortcut. Session-gated; returns the caller's OWN role only,
// so there is no cross-user oracle. Unknown rows → { role: null }.
import { getAdminRole } from "../../../../lib/admin-auth";
import { logger } from "../../../../lib/logger";
import { SessionError, requireTelegramSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "admin-me", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  try {
    return Response.json({ role: await getAdminRole(telegramId) });
  } catch {
    logger.error({ route: "admin-me", outcome: "role_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

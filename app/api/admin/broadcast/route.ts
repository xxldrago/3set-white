import { z } from "zod";
import { requireRole } from "../../../../lib/admin-auth";
import { logger } from "../../../../lib/logger";
import { enqueueBroadcastNotifications } from "../../../../lib/outbox";
import { AdminError, SessionError } from "../../../../lib/session";
import { prisma } from "../../../../lib/prisma";
import { loadBroadcastStatus } from "../../../../lib/broadcast";

export const dynamic = "force-dynamic";
const bodySchema = z.string().trim().min(1).max(4000);

export async function POST(req: Request): Promise<Response> {
  let authorTelegramId: number;
  try {
    ({ telegramId: authorTelegramId } = await requireRole("administrator"));
  } catch (error) {
    if (error instanceof SessionError) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof AdminError) return Response.json({ error: "not_found" }, { status: 404 });
    logger.error({ route: "admin-broadcast", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = ((await req.json()) as { body?: unknown } | null)?.body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const recipients = await prisma.user.findMany({ where: { chatId: { not: null } }, select: { id: true } });
    const broadcast = await prisma.broadcast.create({
      data: { authorTelegramId: BigInt(authorTelegramId), body: parsed.data, total: recipients.length },
    });
    await enqueueBroadcastNotifications(broadcast.id, recipients.map(({ id }) => id));
    return Response.json(await loadBroadcastStatus(broadcast.id));
  } catch {
    logger.error({ route: "admin-broadcast", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

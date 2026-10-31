import { z } from "zod";
import { requireRole } from "../../../../lib/admin-auth";
import { logger } from "../../../../lib/logger";
import { enqueueBroadcastNotifications } from "../../../../lib/outbox";
import { AdminError, SessionError } from "../../../../lib/session";
import { prisma } from "../../../../lib/prisma";
import { loadBroadcastStatus } from "../../../../lib/broadcast";
import { SEGMENT_SLUGS } from "../../../../lib/analytics/rfm";

export const dynamic = "force-dynamic";
const bodySchema = z.string().trim().min(1).max(4000);
const segmentSchema = z.union([z.literal("all"), z.enum(SEGMENT_SLUGS as [string, ...string[]])]);

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
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Back-compat: bare string body → { body }
  let bodyRaw: unknown;
  let segmentRaw: unknown = "all";
  if (typeof raw === "string") {
    bodyRaw = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as { body?: unknown; segment?: unknown };
    bodyRaw = obj.body;
    segmentRaw = obj.segment ?? "all";
  } else {
    bodyRaw = "";
  }

  const parsedBody = bodySchema.safeParse(typeof bodyRaw === "string" ? bodyRaw : "");
  if (!parsedBody.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const parsedSegment = segmentSchema.safeParse(segmentRaw);
  if (!parsedSegment.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const segment = parsedSegment.data;

  try {
    let recipients: { id: number }[];
    if (segment === "all") {
      recipients = await prisma.user.findMany({ where: { chatId: { not: null } }, select: { id: true } });
    } else {
      recipients = await prisma.user.findMany({
        where: { chatId: { not: null }, rfm: { segment } },
        select: { id: true },
      });
    }
    const broadcast = await prisma.broadcast.create({
      data: { authorTelegramId: BigInt(authorTelegramId), body: parsedBody.data, total: recipients.length },
    });
    await enqueueBroadcastNotifications(broadcast.id, recipients.map(({ id }) => id));
    return Response.json(await loadBroadcastStatus(broadcast.id));
  } catch {
    logger.error({ route: "admin-broadcast", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

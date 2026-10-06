// POST /api/telegram/webhook/[secret] — Telegraf intake (T-03-03).
//
// Spoofing chain: BOTH the path component and the Telegram
// secret-token header must equal WEBHOOK_SECRET before the update touches
// Telegraf — mismatch answers 403 fast. Minimal zod shape guard
// (update_id number, rest passed through) answers 400 on garbage, never
// 500. Handler errors are logged and acked 200 to avoid redelivery loops.
import { z } from "zod";
import { bot, WEBHOOK_SECRET } from "../../../../../lib/bot";
import { logger } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";

const updateSchema = z.looseObject({
  update_id: z.number(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
): Promise<Response> {
  const { secret } = await params;
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== WEBHOOK_SECRET || header !== WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Bad Request", { status: 400 });
  }
  try {
    await bot.handleUpdate(parsed.data as unknown as Parameters<typeof bot.handleUpdate>[0]);
    logger.info({ updateId: parsed.data.update_id, outcome: "webhook-handled" });
  } catch {
    logger.warn({ updateId: parsed.data.update_id, outcome: "webhook-handler-error" });
  }
  return Response.json({ ok: true });
}

// POST /api/auth/telegram — dual-payload identity intake (D-09).
//
// Accepts EITHER a classic Login Widget object OR { initData } (WebApp
// bridge from the bot), verifies via lib/auth.ts, consumes the Widget hash
// one-time (D-11), upserts the single users row keyed by telegram id (D-12),
// and mints one httpOnly session cookie (D-10).
//
// Failure discipline (V7, plan prohibitions): auth failures → generic 401
// without a reason oracle; malformed bodies → 400, never 500 on garbage;
// unexpected errors → generic 500 with no details. No other user's
// identifiers or session material ever leave this route.
import { z } from "zod";
import {
  buildSessionCookie,
  signSession,
  verifyInitData,
  verifyWidget,
} from "../../../../lib/auth";
import { env } from "../../../../lib/env";
import { logger } from "../../../../lib/logger";
import { prisma } from "../../../../lib/prisma";
import { consumeWidgetHash } from "../../../../lib/replay";

export const dynamic = "force-dynamic";

// looseObject: the HMAC covers every field Telegram signed except hash —
// stripping unknown keys before verify would break future Telegram fields.
const widgetSchema = z.looseObject({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

const initDataSchema = z.object({
  initData: z.string().min(1),
});

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // initData shape takes precedence; anything else must satisfy the Widget
  // shape (validated separately so the loose Widget index signature cannot
  // blur the branch — TS cannot narrow a z.union with a loose member).
  const initParsed = initDataSchema.safeParse(raw);
  if (initParsed.success) {
    const fields = verifyInitData(initParsed.data.initData, env.BOT_TOKEN);
    if (!fields) {
      logger.warn({ via: "initdata", outcome: "rejected" });
      return unauthorized();
    }
    let user: { id?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown };
    try {
      user = JSON.parse(fields["user"] ?? "null") as typeof user;
    } catch {
      logger.warn({ via: "initdata", outcome: "rejected" });
      return unauthorized();
    }
    if (typeof user?.id !== "number" || !Number.isFinite(user.id)) {
      logger.warn({ via: "initdata", outcome: "rejected" });
      return unauthorized();
    }
    try {
      await prisma.user.upsert({
        where: { telegramId: BigInt(user.id) },
        update: {
          firstName: typeof user.first_name === "string" ? user.first_name : undefined,
          lastName: typeof user.last_name === "string" ? user.last_name : undefined,
          username: typeof user.username === "string" ? user.username : undefined,
        },
        create: {
          telegramId: BigInt(user.id),
          firstName: typeof user.first_name === "string" ? user.first_name : undefined,
          lastName: typeof user.last_name === "string" ? user.last_name : undefined,
          username: typeof user.username === "string" ? user.username : undefined,
        },
      });
      const token = await signSession(user.id, env.SESSION_SECRET);
      logger.info({ via: "initdata", telegramId: user.id, outcome: "issued" });
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": buildSessionCookie(token, env.NODE_ENV === "production"),
          },
        },
      );
    } catch {
      return Response.json({ error: "internal" }, { status: 500 });
    }
  }

  // Widget path: shape-check, then HMAC + freshness, then one-time consume.
  const widgetParsed = widgetSchema.safeParse(raw);
  if (!widgetParsed.success) {
    logger.warn({ via: "widget", outcome: "rejected" });
    return unauthorized();
  }
  const widget = widgetParsed.data;
  if (!verifyWidget(widget, env.BOT_TOKEN)) {
    logger.warn({ via: "widget", outcome: "rejected" });
    return unauthorized();
  }
  if (!(await consumeWidgetHash(widget.hash))) {
    logger.warn({ via: "widget", outcome: "rejected" });
    return unauthorized();
  }
  try {
    await prisma.user.upsert({
      where: { telegramId: BigInt(widget.id) },
      update: {
        firstName: widget.first_name,
        lastName: widget.last_name,
        username: widget.username,
      },
      create: {
        telegramId: BigInt(widget.id),
        firstName: widget.first_name,
        lastName: widget.last_name,
        username: widget.username,
      },
    });
    const token = await signSession(widget.id, env.SESSION_SECRET);
    logger.info({ via: "widget", telegramId: widget.id, outcome: "issued" });
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": buildSessionCookie(token, env.NODE_ENV === "production"),
        },
      },
    );
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

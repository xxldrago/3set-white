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

const bodySchema = z.union([widgetSchema, initDataSchema]);

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return unauthorized();

  if ("initData" in parsed.data) {
    const fields = verifyInitData(parsed.data.initData, env.BOT_TOKEN);
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

  // Widget path: verify HMAC + freshness, then one-time hash consume.
  if (!verifyWidget(parsed.data, env.BOT_TOKEN)) {
    logger.warn({ via: "widget", outcome: "rejected" });
    return unauthorized();
  }
  if (!(await consumeWidgetHash(parsed.data.hash))) {
    logger.warn({ via: "widget", outcome: "rejected" });
    return unauthorized();
  }
  try {
    await prisma.user.upsert({
      where: { telegramId: BigInt(parsed.data.id) },
      update: {
        firstName: parsed.data.first_name,
        lastName: parsed.data.last_name,
        username: parsed.data.username,
      },
      create: {
        telegramId: BigInt(parsed.data.id),
        firstName: parsed.data.first_name,
        lastName: parsed.data.last_name,
        username: parsed.data.username,
      },
    });
    const token = await signSession(parsed.data.id, env.SESSION_SECRET);
    logger.info({ via: "widget", telegramId: parsed.data.id, outcome: "issued" });
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

// POST /api/auth/email/logout — shared session clear (D-86).
//
// One logout for every auth method: clears the SAME httpOnly cookie Telegram
// auth mints. Always 200 — no oracle on whether a session existed.
import { buildClearSessionCookie } from "../../../../../lib/auth";
import { env } from "../../../../../lib/env";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": buildClearSessionCookie(env.NODE_ENV === "production"),
      },
    },
  );
}

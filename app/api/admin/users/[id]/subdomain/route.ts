// POST /api/admin/users/[id]/subdomain — personal partner subdomain
// (administrator-only). Body `{ name: string | null }`: lowercase handle
// (`<name>.3set.online`) or null to clear. Outcomes: ok / taken (409) /
// invalid (400) / unknown user (404). Requires wildcard DNS + nginx + cert
// on the ops side (see middleware.ts) — otherwise the host never arrives.
import { z } from "zod";
import { requireRole } from "../../../../../../lib/admin-auth";
import { logger } from "../../../../../../lib/logger";
import { prisma } from "../../../../../../lib/prisma";
import { setCustomSubdomain } from "../../../../../../lib/referrals";
import { AdminError, SessionError } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(32).nullable(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-user-subdomain", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) return Response.json({ error: "not_found" }, { status: 404 });
    const outcome = await setCustomSubdomain(userId, parsed.data.name);
    if (outcome === "taken") {
      return Response.json({ error: "subdomain_taken" }, { status: 409 });
    }
    if (outcome === "invalid") {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    if (outcome === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, name: parsed.data.name?.trim().toLowerCase() ?? null });
  } catch {
    logger.error({ route: "admin-user-subdomain", outcome: "save_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

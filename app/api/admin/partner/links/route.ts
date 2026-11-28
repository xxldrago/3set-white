// /api/admin/partner/links — partner-only management of their own referral
// links. GET lists them, POST mints a new one. A link either attributes to the
// partner (`targetUserId` omitted) or to one of their DIRECT subpartners; the
// service scopes that check, so a foreign id is a 404.
import { z } from "zod";
import { resolvePartnerApiUserId } from "@/lib/admin-partner";
import { logger } from "@/lib/logger";
import { createPartnerLink, deletePartnerLink, listPartnerLinks } from "@/lib/referrals";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  label: z.string().trim().max(60).nullish(),
  targetUserId: z.number().int().positive().nullish(),
});

export async function GET(): Promise<Response> {
  const partner = await resolvePartnerApiUserId();
  if (!partner.ok) {
    return Response.json(
      { error: partner.error },
      { status: partner.error === "unauthorized" ? 401 : 404 },
    );
  }
  try {
    const links = await listPartnerLinks(partner.userId);
    return Response.json({ ok: true, links });
  } catch {
    logger.error({ route: "partner-links", outcome: "list_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const partner = await resolvePartnerApiUserId();
  if (!partner.ok) {
    return Response.json(
      { error: partner.error },
      { status: partner.error === "unauthorized" ? 401 : 404 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await createPartnerLink(partner.userId, {
      label: parsed.data.label ?? null,
      targetUserId: parsed.data.targetUserId ?? null,
    });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 400;
      return Response.json({ error: result.reason }, { status });
    }
    return Response.json({ ok: true, link: result.link });
  } catch {
    logger.error({ route: "partner-links", outcome: "create_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const partner = await resolvePartnerApiUserId();
  if (!partner.ok) {
    return Response.json(
      { error: partner.error },
      { status: partner.error === "unauthorized" ? 401 : 404 },
    );
  }
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const removed = await deletePartnerLink(partner.userId, id);
    if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    logger.error({ route: "partner-links", outcome: "delete_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

// POST /api/admin/providers/switch — switch active payment provider
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { AdminError, SessionError } from "@/lib/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err instanceof AdminError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { provider } = body as { provider?: string };
  if (!provider || !["platega", "oneplat"].includes(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  // Cannot switch to oneplat if not configured
  if (provider === "oneplat" && !env.ONPLAT_API_KEY) {
    return NextResponse.json({ error: "provider_not_configured" }, { status: 400 });
  }

  // In production, this would need to update a database setting or restart the app
  // For now, we update the in-memory env (works in single-instance deployments)
  // TODO: Persist to DB setting for multi-instance or restart scenarios
  process.env.PAYMENT_PROVIDER = provider;

  return NextResponse.json({ ok: true, active: provider });
}
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { AdminError, SessionError } from "@/lib/session";
import { loadPromoQuality } from "@/lib/analytics/growth-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err instanceof AdminError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }

  try {
    const { searchParams } = new URL(req.url);
    const period = parseInt(searchParams.get("period") || "30");
    const data = await loadPromoQuality(period);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

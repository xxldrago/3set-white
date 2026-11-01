import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { AdminError, SessionError } from "@/lib/session";
import { requireTelegramSession } from "@/lib/session";
import { dismissSignal } from "@/lib/fraud-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err instanceof AdminError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }

  try {
    const telegramId = await requireTelegramSession();
    const body = await req.json();
    const { signalId, reason } = body;
    const result = await dismissSignal(signalId, reason, telegramId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

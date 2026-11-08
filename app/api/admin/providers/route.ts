// GET /api/admin/providers — list available payment providers and active one
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { AdminError, SessionError } from "@/lib/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err instanceof AdminError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }

  const active = env.PAYMENT_PROVIDER;
  const providers = [
    { id: "platega", name: "Platega.io", available: true },
    { id: "oneplat", name: "1plat.cash", available: Boolean(env.ONPLAT_API_KEY) },
  ];

  return NextResponse.json({ active, providers });
}
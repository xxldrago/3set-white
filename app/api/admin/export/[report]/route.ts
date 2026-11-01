import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { AdminError, SessionError } from "@/lib/session";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err instanceof AdminError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }

  const { report } = await params;
  const csv = toCsv([["test"]], ["Тест"]);
  
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

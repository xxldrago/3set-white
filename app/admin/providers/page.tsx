import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/admin-auth";
import { AdminError, SessionError } from "@/lib/session";
import { ProvidersClient } from "./ProvidersClient";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) redirect("/login");
    if (err instanceof AdminError) notFound();
    throw err;
  }

  // Fetch active provider server-side
  const res = await fetch(`${process.env.APP_BASE_URL || "http://localhost:3000"}/api/admin/providers`, {
    cache: "no-store",
  });
  const data = res.ok ? await res.json() : { active: "platega", providers: [] };

  return <ProvidersClient initialData={data} />;
}
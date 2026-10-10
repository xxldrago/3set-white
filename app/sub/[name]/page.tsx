// /sub/[name] — partner-subdomain resolver (server-side, Node runtime).
// The edge middleware forwards `<name>.3set.online` here; this page resolves
// the owner and redirects to `/?ref=CODE` (permanent attribution happens at
// registration via the first-wins pin). Unknown/reserved names → home.
// Sessions are pinned immediately when signed in (best-effort).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { resolveSubdomainOwner } from "@/lib/referrals";
import { pinReferrer } from "@/lib/referrals";
import { recordClick } from "@/lib/referral-stats";
import { requireSession, SessionError } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SubPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const owner = await resolveSubdomainOwner(name).catch(() => null);
  if (!owner) redirect("/");
  // Funnel top: server-side click with the trusted edge IP (deduped hourly).
  const headerList = await headers();
  const probe = new Request("http://localhost/", { headers: headerList });
  void recordClick(owner.userId, owner.code, clientIp(probe), "subdomain").catch(
    () => undefined,
  );

  try {
    const { userId } = await requireSession();
    if (userId !== owner.userId) {
      await pinReferrer(userId, owner.code).catch(() => null);
    }
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
    // Anonymous: the ref code travels in the URL for register/RefCapture.
  }
  redirect(`/?ref=${owner.code}`);
}

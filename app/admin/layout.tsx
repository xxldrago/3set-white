// Admin shell (UI-SPEC §1). The session + role gate here is UX/nav filtering
// ONLY — Next.js layouts are not a security boundary (partial rendering means a
// segment/RSC payload can be fetched without re-running the layout), so every
// /admin page and every /api/admin route re-checks requireRole (T-05-01).
//
// Signed-out → redirect('/login'). A signed-in caller with no staff role gets
// the same nav-less shell; the page below resolves to 404 (never a distinct
// forbidden page — D-51).
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import RoleChip, { roleLabel } from '@/components/admin/RoleChip';
import { can, getAdminRole, type AdminSection } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { requireTelegramSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Nav destinations in display order — filtered server-side by `can()`. */
const NAV_SECTIONS: AdminSection[] = ['overview', 'users', 'tickets', 'broadcast', 'roles'];

const CABINET_LINK =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const role = await getAdminRole(telegramId);
  const allowed = role ? NAV_SECTIONS.filter((section) => can(role, section)) : [];

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <main className="flex flex-1 w-full max-w-6xl flex-col gap-8 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
              {t('admin.title')}
            </h1>
            <Link href="/" className={CABINET_LINK}>
              {t('admin.toCabinet')}
            </Link>
          </div>
          {role && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {t('admin.currentRole', { role: roleLabel(role) })}
              <RoleChip role={role} />
            </p>
          )}
        </header>

        {role && <AdminNav sections={allowed} />}

        {children}
      </main>
    </div>
  );
}
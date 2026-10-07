// /admin/roles — administrator-only role management (ADM-01 / UI-SPEC §6).
// Enforcement lives HERE (layouts are not a boundary — T-05-01): signed-out →
// /login, no/wrong role → 404. The roster is read server-side behind a Suspense
// boundary; an empty roster renders its own card, a failed read renders
// `common.errorLoad` + `common.retry` (never a raw DB string). The role-change
// mutation is a client island (`RolesManager`) so the confirm panel and the
// role picker stay interactive.
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import RolesManager from '@/components/admin/RolesManager';
import { requireRole } from '@/lib/admin-auth';
import { loadAdminRoster } from '@/lib/admin-service';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';

/** Loading fallback while the roster resolves (UI-SPEC §6). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-foreground/5"
        />
      ))}
    </section>
  );
}

async function RosterSection({ callerTelegramId }: { callerTelegramId: number }) {
  let rows;
  try {
    rows = await loadAdminRoster();
  } catch {
    logger.error({ route: 'admin-roles', outcome: 'roster_load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-muted">{t('common.errorLoad')}</p>
        <Link href="/admin/roles" className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className={CARD}>
        <p className="text-muted">{t('admin.rolesEmpty')}</p>
      </section>
    );
  }

  return <RolesManager rows={rows} callerTelegramId={callerTelegramId} />;
}

export default async function AdminRolesPage() {
  let caller: { telegramId: number };
  try {
    caller = await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">
          {t('admin.rolesTitle')}
        </h2>
        <p className="text-sm text-muted">{t('admin.rolesSubtitle')}</p>
      </header>

      <Suspense fallback={<SkeletonRows />}>
        <RosterSection callerTelegramId={caller.telegramId} />
      </Suspense>
    </section>
  );
}

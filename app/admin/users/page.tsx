// /admin/users — ADM-02 user directory. Enforcement lives HERE, not only in the
// layout (layouts are not a security boundary — T-05-01). The `users` section is
// held by all three staff roles (UI-SPEC §1); signed-out → /login, no/wrong role
// → 404 (never a distinct forbidden page, D-51).
//
// The page resolves the first directory view server-side (so the table is
// present in the HTML and works without JS), then hands it to the client island
// which refetches `/api/admin/users/directory` for search, filter, sort and
// pagination. Nothing is rendered from fixtures: every row and counter is a
// real query over `users` + `keys_cache` + `orders` + `admin_users`.
import { notFound, redirect } from 'next/navigation';
import UsersApp from './UsersApp';
import { requireRole } from '@/lib/admin-auth';
import { DIRECTORY_DEFAULT_PAGE_SIZE, adminUsersDirectory } from '@/lib/admin-users-directory';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('admin.searchLabel')} — ${t('app.name')}`,
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ segment?: string }>;
} = {}) {
  let telegramId: number;
  try {
    const caller = await requireRole('administrator', 'support', 'manager');
    telegramId = caller.telegramId;
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const sp = (await searchParams) ?? {};
  const { SEGMENT_SLUGS } = await import('@/lib/analytics/rfm');
  const segment =
    sp.segment && (SEGMENT_SLUGS as readonly string[]).includes(sp.segment)
      ? sp.segment
      : undefined;

  const initial = await adminUsersDirectory({
    pageSize: DIRECTORY_DEFAULT_PAGE_SIZE,
    segment,
  });

  return (
    <UsersApp initial={initial} segment={segment} callerTelegramId={telegramId} />
  );
}

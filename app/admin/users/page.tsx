// /admin/users — ADM-02 user search. Enforcement lives HERE, not only in the
// layout (layouts are not a security boundary — T-05-01). The `users` section is
// held by all three staff roles (UI-SPEC §1); signed-out → /login, no/wrong role
// → 404 (never a distinct forbidden page, D-51). The search itself is the
// `UserSearchForm` client island, which calls only the role-gated
// `/api/admin/users/search` BFF route.
import { notFound, redirect } from 'next/navigation';
import UserSearchForm from '@/components/admin/UserSearchForm';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('admin.searchLabel')} — ${t('app.name')}`,
};

export default async function AdminUsersPage() {
  try {
    await requireRole('administrator', 'support', 'manager');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">
        {t('admin.searchLabel')}
      </h2>
      <UserSearchForm />
    </section>
  );
}

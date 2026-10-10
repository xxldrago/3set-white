// /admin/users — ADM-02 user search. Enforcement lives HERE, not only in the
// layout (layouts are not a security boundary — T-05-01). The `users` section is
// held by all three staff roles (UI-SPEC §1); signed-out → /login, no/wrong role
// → 404 (never a distinct forbidden page, D-51). The search itself is the
// `UserSearchForm` client island, which calls only the role-gated
// `/api/admin/users/search` BFF route.
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import UserSearchForm from '@/components/admin/UserSearchForm';
import { requireRole } from '@/lib/admin-auth';
import { loadAdminUsersTable } from '@/lib/admin-service';
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

  const table = await loadAdminUsersTable();

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">
        {t('admin.searchLabel')}
      </h2>
      <UserSearchForm />

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm text-left">
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Telegram</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Ключи</th>
              <th className="px-4 py-3">Заказы</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Создан</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {table.map((row) => (
              <tr key={row.id} className="hover:bg-foreground/5">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/users/${row.id}`} className="hover:underline">
                    {row.id}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.telegramId ?? '—'}</td>
                <td className="px-4 py-3 truncate max-w-[12rem]">{row.email ?? '—'}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/users/${row.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {row.username ?? row.firstName ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.keysCount}</td>
                <td className="px-4 py-3">{row.ordersCount}</td>
                <td className="px-4 py-3">{row.role ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted">{row.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

'use client';

// All-users role assignment table (roles page extension). Lists registered
// accounts with their current staff role (if any) and a RoleChangeControl
// per Telegram-linked row — assigning to a row without a staff row creates
// it (the route falls back to assign). Email-only rows carry no control:
// staff roles require a Telegram identity (the admin panel is Telegram-
// gated); their profile link leads to the per-user settings instead.
import Link from 'next/link';
import RoleChangeControl from './RoleChangeControl';
import { t } from '@/lib/i18n';
import type { AdminRole } from '@/lib/admin-auth';
import type { AdminUserTableRow } from '@/lib/admin-service';

export default function AllUsersRolesTable({
  rows,
  callerTelegramId,
}: {
  rows: AdminUserTableRow[];
  callerTelegramId: number;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-3 py-2 font-semibold text-muted">
              {t('admin.rolesColName')}
            </th>
            <th scope="col" className="px-3 py-2 font-semibold text-muted">
              {t('admin.rolesColRole')}
            </th>
            <th scope="col" className="px-3 py-2 font-semibold text-muted">
              {t('admin.rolesColAction')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name =
              row.username ??
              row.email ??
              (row.telegramId !== null ? row.telegramId : `#${row.id}`);
            const current: AdminRole | null = row.role;
            return (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-3 py-3 align-middle">
                  <div className="flex flex-col">
                    <Link
                      href={`/admin/users/${row.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="text-xs tabular-nums text-muted">
                      {row.telegramId ?? t('admin.profileNoTelegram')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 align-middle text-muted">
                  {current ?? '—'}
                </td>
                <td className="px-3 py-3 align-middle">
                  {row.telegramId !== null ? (
                    <RoleChangeControl
                      telegramId={row.telegramId}
                      currentRole={current ?? 'support'}
                      name={name}
                      self={row.telegramId === String(callerTelegramId)}
                    />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

'use client';

// Administrator-only roles roster (UI-SPEC §6). Renders the `admin_users` list
// as a real `<table>` inside an `overflow-x-auto` container at `sm+`, and the
// SAME rows as stacked label/value cards below `sm` — no column is ever clipped
// without a scroll affordance. Each row carries the staff `RoleChip` and the
// role-change control; the caller's own row shows the disabled control with
// `admin.rolesSelf` (the backend independently rejects a self-change). Data is
// passed in by the server page — this island holds no roster state.
import RoleChip from './RoleChip';
import RoleChangeControl from './RoleChangeControl';
import { t } from '@/lib/i18n';
import type { AdminRosterRow } from '@/lib/admin-service';

const TABLE_HEAD =
  'px-3 py-2 text-sm font-semibold text-muted';
const TABLE_CELL = 'px-3 py-3 align-middle';
const CARD =
  'flex flex-col gap-3 rounded-2xl border border-line p-4 border-line';
const LABEL = 'text-sm text-muted';

function displayName(row: AdminRosterRow): string {
  return row.displayName ?? '—';
}

export default function RolesManager({
  rows,
  callerTelegramId,
}: {
  rows: AdminRosterRow[];
  /** The signed-in administrator's telegram id — its own row is self-blocked. */
  callerTelegramId: number;
}) {
  const isSelf = (row: AdminRosterRow) => row.telegramId === String(callerTelegramId);

  return (
    <>
      {/* sm+ : real table with horizontal scroll rather than a clipped column. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TABLE_HEAD}>
                {t('admin.rolesColTelegramId')}
              </th>
              <th scope="col" className={TABLE_HEAD}>
                {t('admin.rolesColName')}
              </th>
              <th scope="col" className={TABLE_HEAD}>
                {t('admin.rolesColRole')}
              </th>
              <th scope="col" className={TABLE_HEAD}>
                {t('admin.rolesColAction')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.telegramId}
                className="border-b border-line/5"
              >
                <td className={`${TABLE_CELL} whitespace-nowrap tabular-nums text-foreground`}>
                  {row.telegramId}
                </td>
                <td className={TABLE_CELL}>
                  <span
                    className="block max-w-[16rem] truncate text-foreground"
                    title={displayName(row)}
                  >
                    {displayName(row)}
                  </span>
                </td>
                <td className={TABLE_CELL}>
                  <RoleChip role={row.role} />
                </td>
                <td className={TABLE_CELL}>
                  <RoleChangeControl
                    telegramId={row.telegramId}
                    currentRole={row.role}
                    name={displayName(row)}
                    self={isSelf(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* below sm : the same rows as stacked label/value cards. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((row) => (
          <article key={row.telegramId} className={CARD}>
            <div className="flex items-center justify-between gap-3">
              <span className="tabular-nums text-foreground">{row.telegramId}</span>
              <RoleChip role={row.role} />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className={`${LABEL} shrink-0`}>{t('admin.rolesColName')}</span>
              <span className="min-w-0 truncate text-foreground" title={displayName(row)}>
                {displayName(row)}
              </span>
            </div>
            <RoleChangeControl
              telegramId={row.telegramId}
              currentRole={row.role}
              name={displayName(row)}
              self={isSelf(row)}
            />
          </article>
        ))}
      </div>
    </>
  );
}

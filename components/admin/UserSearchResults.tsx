// Presentational admin search results (ADM-02 / UI-SPEC §3).
//
// No data fetching here: the client island passes already-PII-minimal
// `AdminSearchResult` rows (userId/telegramId/displayName/staffRole only). A
// raw chat id, token, or subscription URL never reaches this component. The
// count header renders only at ≥2 matches; over 50 matches renders the first 50
// plus `admin.searchMore`. Long names truncate 1 line with the full value in
// `title`; the telegram id is `tabular-nums`.
import Link from 'next/link';
import RoleChip from './RoleChip';
import { t, tp } from '@/lib/i18n';
import type { AdminSearchResult } from '@/lib/admin-service';

const CARD = 'rounded-2xl border border-line p-6 border-line';

export default function UserSearchResults({
  rows,
  count,
  truncated,
}: {
  rows: AdminSearchResult[];
  count: number;
  truncated: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      {count >= 2 && (
        <span className="text-sm text-muted">
          {tp('admin.searchCount', count)}
        </span>
      )}

      {truncated && (
        <p className="text-sm text-muted">{t('admin.searchMore')}</p>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((row) => {
          const label = row.displayName ?? '—';
          return (
            <article key={row.userId} className={CARD}>
              <Link
                href={`/admin/users/${row.userId}`}
                className="flex flex-col gap-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="min-w-0 flex-1 truncate text-xl font-semibold text-foreground"
                    title={label}
                  >
                    {label}
                  </span>
                  {row.staffRole && <RoleChip role={row.staffRole} />}
                </div>
                <span className="text-sm tabular-nums text-muted">
                  {t('admin.profileTelegramId', { id: row.telegramId })}
                </span>
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

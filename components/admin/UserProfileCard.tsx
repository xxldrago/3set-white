// Presentational admin user-profile header (ADM-02 / UI-SPEC §4).
//
// Renders the profile anchor: `admin.profileTitle`, the identity lines
// (`admin.profileUsername` / `admin.profileEmail` when known,
// `admin.profileTelegramId` or the `admin.profileNoTelegram` fallback),
// the `DD.MM.YYYY` registration date, and the staff `RoleChip` when the user
// is staff. `children` is the reserved slot for the administrator-only role
// action added by a later plan (UI-SPEC §4) — this plan does not define that
// control.
import type { ReactNode } from 'react';
import RoleChip from './RoleChip';
import { formatKeyDate } from '@/lib/keys-service';
import { t } from '@/lib/i18n';
import type { AdminProfileHeader } from '@/lib/admin-service';

export default function UserProfileCard({
  header,
  children,
}: {
  header: AdminProfileHeader;
  children?: ReactNode;
}) {
  const created = formatKeyDate(header.createdAt.toISOString());

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line p-6 border-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">
            {t('admin.profileTitle')}
          </h2>
          {header.username && (
            <p className="text-sm text-muted">
              {t('admin.profileUsername', { name: header.username })}
            </p>
          )}
          {header.email && (
            <p className="truncate text-sm text-muted" title={header.email}>
              {t('admin.profileEmail', { email: header.email })}
            </p>
          )}
          <p className="text-sm tabular-nums text-muted">
            {header.telegramId === null
              ? t('admin.profileNoTelegram')
              : t('admin.profileTelegramId', { id: header.telegramId })}
          </p>
          <p className="text-sm text-muted">
            {t('admin.profileCreated', { date: created })}
          </p>
          {header.referralCode && (
            <p className="font-mono text-sm text-muted">{header.referralCode}</p>
          )}
        </div>
        {header.staffRole && <RoleChip role={header.staffRole} />}
      </div>

      {/* Reserved slot: the administrator-only role action lands here in a
          later plan (UI-SPEC §4) — not defined by this plan. */}
      {children}
    </section>
  );
}

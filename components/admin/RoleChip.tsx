// Presentational staff-role identity chip (UI-SPEC §1).
//
// Role is identity, not status: all three roles use the neutral zinc tint with
// the literal RU label — no hierarchy color-coding. The literal
// `t('admin.role…')` calls below are the single i18n registration point; never
// build the key by interpolation.
import { t } from '@/lib/i18n';
import type { AdminRole } from '@/lib/admin-auth';

const BADGE_BASE = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold';
const ROLE_TINT = 'bg-background0/10 text-dim';

/** Literal RU label for a role — shared by the chip and the shell header. */
export function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'administrator':
      return t('admin.roleAdmin');
    case 'support':
      return t('admin.roleSupport');
    case 'manager':
      return t('admin.roleManager');
    case 'partner':
      return t('admin.rolePartner');
  }
}

export default function RoleChip({ role }: { role: AdminRole }) {
  return <span className={`${BADGE_BASE} ${ROLE_TINT}`}>{roleLabel(role)}</span>;
}
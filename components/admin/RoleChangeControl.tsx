'use client';

// Administrator-only role-change control (UI-SPEC §4/§6). A role picker plus an
// `admin.rolesChange` trigger that opens the shared `AdminConfirmPanel` — the
// raise/assign path uses the `primary` variant, while any change that removes
// administrator access uses the red `destructive` variant and the downgrade
// copy. The current administrator's own row renders a DISABLED control with
// `admin.rolesSelf` (the backend independently rejects a self-change). Used by
// both the roles table and the user-profile role action.
import { useState } from 'react';
import AdminConfirmPanel from './AdminConfirmPanel';
import { roleLabel } from './RoleChip';
import { t } from '@/lib/i18n';
import type { AdminRole } from '@/lib/admin-auth';

const ROLES: AdminRole[] = ['administrator', 'support', 'manager'];

const SELECT =
  'h-11 rounded-2xl border border-line bg-panel px-3 text-sm text-foreground border-line bg-panel text-foreground';
const DISABLED_TRIGGER =
  'flex h-11 shrink-0 items-center justify-center rounded-full border border-solid border-line px-4 text-sm opacity-50 border-line';

export default function RoleChangeControl({
  telegramId,
  currentRole,
  name,
  self = false,
}: {
  /** Target staff telegram id (string — BigInt is not JSON-safe). */
  telegramId: string;
  currentRole: AdminRole;
  /** Display name for the downgrade copy; falls back to the telegram id. */
  name: string;
  /** True when the row is the caller's own account (self-change blocked). */
  self?: boolean;
}) {
  const [selected, setSelected] = useState<AdminRole>(currentRole);

  if (self) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled className={DISABLED_TRIGGER}>
          {t('admin.rolesChange')}
        </button>
        <span className="text-sm text-muted">{t('admin.rolesSelf')}</span>
      </div>
    );
  }

  const downgrade = currentRole === 'administrator' && selected !== 'administrator';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={t('admin.rolesChange')}
        value={selected}
        onChange={(event) => setSelected(event.target.value as AdminRole)}
        className={SELECT}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {roleLabel(role)}
          </option>
        ))}
      </select>

      <AdminConfirmPanel
        variant={downgrade ? 'destructive' : 'primary'}
        triggerLabel={t('admin.rolesChange')}
        title={downgrade ? t('admin.roleDowngradeTitle') : t('admin.roleChangeTitle')}
        body={
          downgrade
            ? t('admin.roleDowngradeBody', { name })
            : t('admin.roleChangeBody', { role: roleLabel(selected) })
        }
        confirmLabel={downgrade ? t('admin.roleDowngradeConfirm') : t('admin.roleChangeConfirm')}
        errorLabel={t('admin.roleChangeError')}
        url="/api/admin/roles"
        payload={{ telegramId, role: selected }}
      />
    </div>
  );
}

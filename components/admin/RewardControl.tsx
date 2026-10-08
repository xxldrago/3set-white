'use client';

// Per-user inviter reward override (administrator-only, UI-SPEC §4 pattern
// mirroring RoleChangeControl). A fixed RUB sum this account's referrals earn
// instead of the global rate; clearing returns to global. Posts to the
// role-gated user reward route; success refreshes the server header.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50';
const PRIMARY =
  'flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm text-lime transition-colors hover:bg-[#383838] disabled:opacity-50';

export default function RewardControl({
  userId,
  current,
  currentKind,
}: {
  userId: number;
  current: number | null;
  currentKind: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current === null ? '' : String(current));
  const [kind, setKind] = useState<'percent' | 'fixed' | ''>(
    currentKind === 'percent' || currentKind === 'fixed' ? currentKind : '',
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = useCallback(async () => {
    if (saving) return;
    const trimmed = value.trim();
    const amount = trimmed.length === 0 ? null : Number(trimmed);
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) {
      setFailed(true);
      return;
    }
    setSaving(true);
    setFailed(false);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // An empty kind keeps the stored kind (global when never set); an
        // empty amount clears back to the global rate entirely.
        body: JSON.stringify({ amount, kind: kind === '' ? null : kind }),
      });
      if (!res.ok) setFailed(true);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [saving, value, kind, userId, router]);

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="text-base text-foreground">{t('admin.refCustomTitle')}</span>
      <p className="text-sm text-muted">{t('admin.refCustomHint')}</p>
      <div className="flex items-center gap-2">
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as 'percent' | 'fixed' | '')}
          disabled={saving}
          aria-label={t('admin.refCustomKind')}
          className="h-12 shrink-0 rounded-2xl border border-line bg-panel px-3 text-sm text-foreground"
        >
          <option value="">{t('admin.refCustomGlobal')}</option>
          <option value="percent">%</option>
          <option value="fixed">₽</option>
        </select>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="—"
          disabled={saving}
          aria-label={t('admin.refCustomTitle')}
          className={INPUT}
        />
        <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY}>
          {t('admin.refCustomSave')}
        </button>
      </div>
      {saved && (
        <p role="status" className="text-sm text-green">
          {t('admin.refCustomSaved')}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          {t('admin.refError')}
        </p>
      )}
    </div>
  );
}

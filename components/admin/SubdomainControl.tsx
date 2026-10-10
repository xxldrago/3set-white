'use client';

// Per-user personal subdomain control (administrator-only, mirrors
// RewardControl). Empty clears. Posts to the role-gated route; the ops side
// (wildcard DNS + nginx + cert, see middleware.ts) must exist or the host
// never arrives — the UI states the full host for copy-paste clarity.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50';
const PRIMARY =
  'flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm text-lime transition-colors hover:bg-[#383838] disabled:opacity-50';

export default function SubdomainControl({
  userId,
  current,
}: {
  userId: number;
  current: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (saving) return;
    const name = value.trim().toLowerCase();
    setSaving(true);
    setFailed(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/users/${userId}/subdomain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.length === 0 ? null : name }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
        setFailed(
          code === 'subdomain_taken' ? t('admin.subTaken') : t('admin.subError'),
        );
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFailed(t('admin.subError'));
    } finally {
      setSaving(false);
    }
  }, [saving, value, userId, router]);

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="text-base text-foreground">{t('admin.subTitle')}</span>
      <p className="text-sm text-muted">{t('admin.subHint')}</p>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) =>
            setValue(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
          }
          placeholder="partner1"
          disabled={saving}
          autoComplete="off"
          aria-label={t('admin.subTitle')}
          className={INPUT}
        />
        <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY}>
          {t('admin.refCustomSave')}
        </button>
      </div>
      {current && (
        <p className="font-mono text-sm text-muted">{current}.3set.online</p>
      )}
      {saved && (
        <p role="status" className="text-sm text-green">
          {t('admin.refCustomSaved')}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          {failed}
        </p>
      )}
    </div>
  );
}

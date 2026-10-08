'use client';

// Balance auto-renew toggle for one key. Loads the flag via the
// ownership-checked GET; trial keys never render this (the parent keeps it
// out of the DOM, D-44). A failed toggle restores the previous state — the
// server is the source of truth.
import { useCallback, useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

export default function AutoRenewToggle({ keyId }: { keyId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/keys/${encodeURIComponent(keyId)}/autorenew`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { autoRenew?: unknown };
        if (typeof body.autoRenew === 'boolean' && !cancelled) setEnabled(body.autoRenew);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [keyId]);

  const toggle = useCallback(async () => {
    if (enabled === null || saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(keyId)}/autorenew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) setEnabled(!next);
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }, [enabled, saving, keyId]);

  if (enabled === null) return null;

  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        checked={enabled}
        onChange={() => void toggle()}
        disabled={saving}
        className="h-4 w-4 accent-[#0c4f36]"
      />
      {t('renew.autoRenew')}
    </label>
  );
}

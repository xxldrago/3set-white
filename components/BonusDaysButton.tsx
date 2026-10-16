'use client';

// Bonus-day redemption for one key: shows the spendable balance and extends
// the key by the chosen days via the ownership-checked bonus route (trial
// keys are rejected server-side). Non-trial cards only — the parent keeps
// this out of trial cards.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus } from 'lucide-react';
import { t } from '@/lib/i18n';

const SECONDARY =
  'flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-bold text-muted transition-colors hover:bg-foreground/5 disabled:opacity-50';

export default function BonusDaysButton({ keyId }: { keyId: string }) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/wallet')
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { bonusDays?: unknown };
        if (typeof body.bonusDays === 'number' && !cancelled) {
          setBalance(Math.max(0, Math.floor(body.bonusDays)));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const redeem = useCallback(async () => {
    const value = Number(days);
    if (busy || !Number.isSafeInteger(value) || value < 1) return;
    setBusy(true);
    setFailed(false);
    setDone(null);
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(keyId)}/bonus`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: value }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setDays('');
      setDone(t('auth.bonusDone', { n: value }));
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, days, keyId, router]);

  if (balance === null || balance <= 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">
        {t('auth.bonusBalance', { n: balance })}
      </span>
      <div className="flex items-center gap-2">
        <input
          value={days}
          onChange={(event) => setDays(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="30"
          disabled={busy}
          aria-label={t('auth.bonusDaysLabel')}
          className="h-11 w-full min-w-0 flex-1 rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void redeem()}
          disabled={busy || days.length === 0}
          className={SECONDARY}
        >
          <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
          {t('auth.bonusCta')}
        </button>
      </div>
      {done && (
        <p role="status" className="text-sm text-green">
          {done}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          {t('auth.bonusError')}
        </p>
      )}
    </div>
  );
}

// Client island for /admin/partner/links: one percent input per subpartner.
// Saves through the partner-only API, which re-checks the role and that the
// target is a direct referral.
'use client';

import { useState } from 'react';

type State = 'idle' | 'saving' | 'saved' | 'error';

export default function SubpartnerRateForm({
  userId,
  initialPercent,
  maxPercent,
}: {
  userId: number;
  initialPercent: number | null;
  /** Partner's own percent, or null when their earnings are not a percent. */
  maxPercent: number | null;
}) {
  const [value, setValue] = useState(initialPercent === null ? '' : String(initialPercent));
  const [state, setState] = useState<State>('idle');

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState('saving');
    const trimmed = value.trim();
    try {
      const res = await fetch('/api/admin/partner/links/rate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subpartnerId: userId,
          percent: trimmed === '' ? null : Number(trimmed),
        }),
      });
      setState(res.ok ? 'saved' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`rate-${userId}`}>
        Процент субпартнёру
      </label>
      <input
        id={`rate-${userId}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={maxPercent ?? 100}
        step={1}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setState('idle');
        }}
        placeholder="—"
        className="h-10 w-20 rounded-lg border border-line bg-transparent px-2 text-sm tabular-nums text-foreground"
      />
      <span className="text-sm text-muted">%</span>
      <button
        type="submit"
        disabled={state === 'saving'}
        className="h-10 rounded-lg border border-line px-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
      >
        {state === 'saving' ? '…' : 'Сохранить'}
      </button>
      {state === 'saved' && <span className="text-sm text-foreground">✓</span>}
      {state === 'error' && <span className="text-sm text-red-500">Ошибка</span>}
    </form>
  );
}

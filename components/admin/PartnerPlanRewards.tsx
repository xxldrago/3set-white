'use client';

// Per-term partner payouts (administrator-only): a fixed RUB sum the partner
// earns for each SOLD key of a given duration, regardless of whether the buyer
// arrived via the partner's referral link or promo code. Empty = fall back to
// the account's custom/global rate.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'h-11 w-full rounded-xl border border-line bg-panel px-3 text-base tabular-nums text-foreground placeholder:text-dim disabled:opacity-50';

const PRESETS: { days: number; label: string }[] = [
  { days: 7, label: '1 неделя' },
  { days: 30, label: '1 месяц' },
  { days: 90, label: '3 месяца' },
  { days: 180, label: '6 месяцев' },
  { days: 365, label: '1 год' },
];

export default function PartnerPlanRewards({
  userId,
  initial,
}: {
  userId: number;
  /** Configured payouts (days → amount). */
  initial: { days: number; amount: number }[];
}) {
  const router = useRouter();
  const days = [
    ...PRESETS.map((preset) => preset.days),
    ...initial.map((row) => row.days).filter((d) => !PRESETS.some((p) => p.days === d)),
  ].sort((a, b) => a - b);
  const labelOf = (value: number): string =>
    PRESETS.find((preset) => preset.days === value)?.label ?? `${value} дн.`;

  const [values, setValues] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const d of days) {
      const row = initial.find((item) => item.days === d);
      map[d] = row ? String(row.amount) : '';
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    setSaved(false);
    const rows = days.map((d) => {
      const raw = (values[d] ?? '').trim();
      return { days: d, amount: raw === '' ? null : Number(raw) };
    });
    try {
      const res = await fetch(`/api/admin/users/${userId}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex flex-col gap-1">
        <span className="text-base text-foreground">Выплата партнёру по срокам ключа</span>
        <p className="text-sm text-muted">
          Фиксированная сумма в рублях за каждый купленный ключ такого срока — по реферальной
          ссылке или промокоду партнёра. Пустое поле — обычная ставка аккаунта.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {days.map((d) => (
          <label key={d} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-muted">{labelOf(d)}</span>
            <input
              value={values[d] ?? ''}
              onChange={(event) => {
                const next = event.target.value.replace(/[^0-9]/g, '');
                setValues((prev) => ({ ...prev, [d]: next }));
                setSaved(false);
                setFailed(false);
              }}
              inputMode="numeric"
              placeholder="—"
              disabled={saving}
              aria-label={`Выплата за ${labelOf(d)}, ₽`}
              className={INPUT}
            />
            <span className="text-sm text-muted">₽</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-sm text-lime transition-colors hover:bg-[#383838] disabled:opacity-50"
        >
          {saving ? 'Сохраняем…' : 'Сохранить выплаты'}
        </button>
        {saved && (
          <span role="status" className="text-sm text-green">
            Сохранено
          </span>
        )}
        {failed && (
          <span role="alert" className="text-sm text-red-600">
            Ошибка сохранения
          </span>
        )}
      </div>
    </div>
  );
}

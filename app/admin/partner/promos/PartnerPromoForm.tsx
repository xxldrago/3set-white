'use client';

// Partner self-service promo creation. The owner is resolved server-side from
// the session; this form only sends code/type/discount/limits.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50';
const LABEL = 'text-sm text-muted';

export default function PartnerPromoForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [discount, setDiscount] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const limit = type === 'percentage' ? 50 : 1000;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const value = Number(discount);
    if (!Number.isSafeInteger(value) || value < 1 || value > limit) {
      setError(`Скидка должна быть от 1 до ${limit}${type === 'percentage' ? '%' : ' ₽'}.`);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/partner/promos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          type,
          discount: value,
          maxUses: maxUses.trim() === '' ? null : Number(maxUses),
          expiresAt: expiresAt === '' ? null : `${expiresAt}T23:59:59+03:00`,
        }),
      });
      if (res.status === 409) {
        setError('Такой код уже существует — выберите другой.');
        return;
      }
      if (!res.ok) {
        setError('Не удалось создать промокод. Проверьте поля и попробуйте ещё раз.');
        return;
      }
      setCode('');
      setDiscount('');
      setMaxUses('');
      setExpiresAt('');
      setSaved(true);
      router.refresh();
    } catch {
      setError('Не удалось создать промокод. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Код</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="PARTNER-10"
            disabled={saving}
            className={INPUT}
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Тип скидки</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as 'percentage' | 'fixed')}
            disabled={saving}
            className={INPUT}
          >
            <option value="percentage">Процент</option>
            <option value="fixed">Фиксированная сумма</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Скидка ({type === 'percentage' ? '%' : '₽'})</span>
          <input
            value={discount}
            onChange={(event) => setDiscount(event.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder={type === 'percentage' ? '10' : '100'}
            disabled={saving}
            className={INPUT}
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Лимит использований (пусто — без лимита)</span>
          <input
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="100"
            disabled={saving}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Действует до (пусто — бессрочно)</span>
          <input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            disabled={saving}
            className={INPUT}
          />
        </label>
      </div>

      <p className="text-xs text-muted">
        Партнёрские коды: до 50% или до 1000 ₽. Покупатель по вашему коду закрепляется за вами.
      </p>

      {saved && (
        <p role="status" className="text-sm text-green">
          Промокод создан.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || code.trim().length < 3}
        className="flex h-12 w-full items-center justify-center rounded-lg bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {saving ? 'Создаём…' : 'Создать промокод'}
      </button>
    </form>
  );
}

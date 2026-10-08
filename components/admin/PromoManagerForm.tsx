'use client';

// Administrator promo manager (administrator-only page). Lists codes with
// usage/expiry, a create form (code auto-uppercased), and per-row delete.
// Mutations go through the role-gated /api/admin/promos routes; the server
// list re-renders via router.refresh() on success. Client validation mirrors
// the zod bounds in lib/promo.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import type { PromoRow } from '@/lib/promo';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50';
const SECONDARY =
  'flex h-9 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50';
const FIELD_LABEL = 'text-sm text-muted';

function formatDiscount(row: PromoRow): string {
  return row.type === 'fixed' ? `${row.discount} ₽` : `${row.discount}%`;
}

function formatUses(row: PromoRow): string {
  const used = `${row.usedCount}`;
  return row.maxUses === null ? `${used} / ${t('admin.promoUnlimited')}` : `${used} / ${row.maxUses}`;
}

function formatExpiry(row: PromoRow): string {
  if (!row.expiresAt) return t('admin.promoNever');
  return new Date(row.expiresAt).toISOString().slice(0, 10);
}

export default function PromoManagerForm({ initialPromos }: { initialPromos: PromoRow[] }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [discount, setDiscount] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [failed, setFailed] = useState(false);
  const [taken, setTaken] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const discountNum = Number(discount);
  const valid =
    /^[A-Z0-9-]{3,32}$/.test(code.trim().toUpperCase()) &&
    Number.isSafeInteger(discountNum) &&
    discountNum >= 1 &&
    (type === 'fixed' || discountNum <= 100) &&
    (maxUses.trim().length === 0 ||
      (Number.isSafeInteger(Number(maxUses)) && Number(maxUses) >= 1)) &&
    (expiresAt.trim().length === 0 || !Number.isNaN(Date.parse(expiresAt))) &&
    !loading;

  const create = useCallback(async () => {
    if (!valid || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setFailed(false);
    setTaken(false);
    setDone(false);
    try {
      const owner = ownerUserId.trim().length === 0 ? null : Number(ownerUserId);
      const res = await fetch('/api/admin/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discount: discountNum,
          type,
          maxUses: maxUses.trim().length === 0 ? null : Number(maxUses),
          expiresAt:
            expiresAt.trim().length === 0 ? null : new Date(expiresAt).toISOString(),
          ownerUserId: owner,
        }),
        signal: controller.signal,
      });
      if (res.ok) {
        setCode('');
        setDiscount('');
        setMaxUses('');
        setExpiresAt('');
        setOwnerUserId('');
        setDone(true);
        router.refresh();
        return;
      }
      let error: unknown = null;
      try {
        error = ((await res.json()) as { error?: unknown }).error;
      } catch {
        error = null;
      }
      if (res.status === 409 && error === 'code_taken') setTaken(true);
      else setFailed(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [valid, loading, code, discountNum, type, maxUses, expiresAt, ownerUserId, router]);

  const remove = useCallback(
    async (id: string) => {
      if (deleting !== null) return;
      setDeleting(id);
      try {
        const res = await fetch(`/api/admin/promos/${id}`, { method: 'DELETE' });
        if (res.ok) router.refresh();
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setDeleting(null);
      }
    },
    [deleting, router],
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-line p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="promo-code" className={FIELD_LABEL}>
              {t('admin.promoCodeLabel')}
            </label>
            <input
              id="promo-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder={t('admin.promoCodePlaceholder')}
              disabled={loading}
              autoComplete="off"
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="promo-value" className={FIELD_LABEL}>
              {t('admin.promoValueLabel')}
            </label>
            <input
              id="promo-value"
              value={discount}
              onChange={(event) => setDiscount(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              disabled={loading}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="promo-type" className={FIELD_LABEL}>
              {t('admin.promoTypeLabel')}
            </label>
            <select
              id="promo-type"
              value={type}
              onChange={(event) => setType(event.target.value as 'percentage' | 'fixed')}
              disabled={loading}
              className={INPUT}
            >
              <option value="percentage">{t('admin.promoTypePercentage')}</option>
              <option value="fixed">{t('admin.promoTypeFixed')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="promo-max-uses" className={FIELD_LABEL}>
              {t('admin.promoMaxUsesLabel')}
            </label>
            <input
              id="promo-max-uses"
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              disabled={loading}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="promo-expires" className={FIELD_LABEL}>
              {t('admin.promoExpiresLabel')}
            </label>
            <input
              id="promo-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              disabled={loading}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="promo-owner" className={FIELD_LABEL}>
              {t('admin.promoOwnerLabel')}
            </label>
            <input
              id="promo-owner"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder={t('admin.promoOwnerPlaceholder')}
              disabled={loading}
              className={INPUT}
            />
          </div>
        </div>

        {done && (
          <p role="status" className="text-sm text-green">
            {t('admin.promoCreated')}
          </p>
        )}
        {taken && (
          <p role="alert" className="text-sm text-red-600">
            {t('admin.promoCodeTaken')}
          </p>
        )}
        {failed && (
          <p role="alert" className="text-sm text-red-600">
            {t('admin.promoError')}
          </p>
        )}

        <button type="submit" disabled={!valid} className={PRIMARY}>
          {loading ? t('admin.promoCreating') : t('admin.promoCreate')}
        </button>
      </form>

      {initialPromos.length === 0 ? (
        <p className="text-sm text-muted">{t('admin.promoEmpty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t('admin.promoColCode')}</th>
                <th className="px-4 py-3">{t('admin.promoColDiscount')}</th>
                <th className="px-4 py-3">{t('admin.promoColUses')}</th>
                <th className="px-4 py-3">{t('admin.promoColExpires')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {initialPromos.map((row) => (
                <tr key={row.id} className="hover:bg-foreground/5">
                  <td className="px-4 py-3 font-mono">{row.code}</td>
                  <td className="px-4 py-3">{formatDiscount(row)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatUses(row)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{formatExpiry(row)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      disabled={deleting !== null}
                      className={SECONDARY}
                    >
                      {deleting === row.id ? t('admin.promoDeleting') : t('admin.promoDelete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

// Promo code field shared by the checkout islands (new/renew/upgrade).
// The parent passes its own pricing query (`days=..&devices=..[&kind=..]`)
// so the preview hits the SAME quote the order will charge; the applied code
// flows back up via `onCode` and is sent with the order body (the server
// re-validates + consumes — this preview never spends a use).
//
// Invalid/expired codes preview as `promo: null`: the list price stands and
// the field shows the generic copy (codes are public strings — no oracle
// discipline needed here, unlike credentials).
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50';
const APPLY =
  'flex h-12 shrink-0 items-center justify-center rounded-full border border-solid border-line px-5 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50';

interface PromoPreview {
  price: number;
  promo: { code: string; finalPrice: number } | null;
}

export default function PromoField({
  query,
  onCode,
}: {
  /** Pricing query without promo, e.g. `days=30&devices=2` or `kind=upgrade&…`. */
  query: string;
  /** Applied code (uppercased) or null when cleared/invalid. */
  onCode: (code: string | null) => void;
}) {
  const [value, setValue] = useState('');
  const [applied, setApplied] = useState<{
    code: string;
    finalPrice: number;
    saving: number;
  } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [checking, setChecking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // NOTE: parents render `<PromoField key={query} …/>` so a term/devices
  // change remounts the field — the preview (and the applied code) never goes
  // stale. The order re-validates + consumes server-side regardless.

  const apply = useCallback(async () => {
    const code = value.trim().toUpperCase();
    if (code.length === 0 || checking) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setChecking(true);
    setInvalid(false);
    try {
      const res = await fetch(`/api/pricing?${query}&promo=${encodeURIComponent(code)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        setInvalid(true);
        setApplied(null);
        onCode(null);
        return;
      }
      const body = (await res.json()) as PromoPreview;
      if (body.promo) {
        const saving = Math.max(0, body.price - body.promo.finalPrice);
        setApplied({ ...body.promo, saving });
        onCode(body.promo.code);
      } else {
        setInvalid(true);
        setApplied(null);
        onCode(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setInvalid(true);
      setApplied(null);
      onCode(null);
    } finally {
      setChecking(false);
    }
  }, [value, checking, query, onCode]);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="promo-field" className="text-sm text-muted">
        {t('admin.promoFieldLabel')}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="promo-field"
          value={value}
          onChange={(event) => {
            setValue(event.target.value.toUpperCase());
            setInvalid(false);
          }}
          placeholder="SALE10"
          autoComplete="off"
          disabled={checking}
          className={INPUT}
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={value.trim().length === 0 || checking}
          className={APPLY}
        >
          {t('admin.promoCheck')}
        </button>
      </div>
      {applied && (
        <p role="status" className="text-sm text-green">
          {t('admin.promoApplied', {
            code: applied.code,
            off: `${applied.saving} ₽`,
          })}
        </p>
      )}
      {invalid && !applied && (
        <p role="alert" className="text-sm text-red-600">
          {t('admin.promoInvalid')}
        </p>
      )}
    </div>
  );
}

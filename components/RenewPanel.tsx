'use client';

// Renew panel (UI-SPEC §3, PAY-02). Rendered only for NON-trial keys — the
// parent (`SubscriptionCard`) keeps it out of the DOM entirely for a trial key
// (D-44). Extends the live-price pattern from `TariffPicker`: the period
// selector stays disabled until the first quote lands, a failed quote clears the
// last-good price (never a stale number), and the pay CTA is disabled while the
// price is null. The device count is fixed at the key's current limit (D-45
// adds only days); the browser sends no price — the server re-quotes
// (T-03-amount).
import { useCallback, useEffect, useRef, useState } from 'react';
import PayCta from './PayCta';
import { t } from '@/lib/i18n';

const DAYS = [7, 30, 90] as const;
const DEBOUNCE_MS = 300;

const CARD =
  'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const TRIGGER =
  'flex h-11 flex-1 items-center justify-center rounded-full border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';

const priceFormatter = new Intl.NumberFormat('ru-RU');

export default function RenewPanel({
  keyId,
  deviceLimit,
}: {
  keyId: string;
  deviceLimit: number;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(30);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPrice = useCallback(
    async (nextDays: number) => {
      // Cancel a previous in-flight request so a fast tap cannot race a stale
      // price onto the screen.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(false);
      try {
        const res = await fetch(
          `/api/pricing?days=${nextDays}&devices=${deviceLimit}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('pricing_request_failed');
        const body = (await res.json()) as { price?: unknown };
        if (typeof body.price !== 'number' || !Number.isFinite(body.price)) {
          throw new Error('pricing_shape_invalid');
        }
        setPrice(body.price);
      } catch {
        if (controller.signal.aborted) return;
        // Clear the last-good price rather than showing a stale number.
        setPrice(null);
        setError(true);
      }
    },
    [deviceLimit],
  );

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void fetchPrice(days), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, days, fetchPrice]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={TRIGGER}>
        {t('renew.cta')}
      </button>
    );
  }

  const controlsDisabled = price === null;

  return (
    <section className={CARD}>
      <h3 className="text-xl font-semibold text-foreground">{t('renew.title')}</h3>
      <p className="text-muted">{t('renew.body')}</p>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">
          {t('pricing.daysLabel')}
        </span>
        <div className="flex gap-3">
          {DAYS.map((value) => {
            const selected = value === days;
            const label =
              value === 7
                ? t('pricing.days7')
                : value === 30
                  ? t('pricing.days30')
                  : t('pricing.days90');
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={controlsDisabled}
                onClick={() => setDays(value)}
                className={
                  selected
                    ? 'h-11 flex-1 rounded-full bg-foreground px-4 text-lime transition-colors disabled:opacity-50'
                    : 'h-11 flex-1 rounded-full border border-line px-4 transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line '
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">
          {t('pricing.priceLabel')}
        </span>
        <span className="text-3xl font-semibold tabular-nums" aria-live="polite">
          {price === null
            ? '—'
            : t('pricing.price', { price: priceFormatter.format(price) })}
        </span>
      </div>

      {error && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-red-600">{t('pricing.error')}</p>
          <button
            type="button"
            onClick={() => void fetchPrice(days)}
            className={SECONDARY}
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      <PayCta kind="renew" days={days} keyId={keyId} disabled={price === null} />

      <button type="button" onClick={() => setOpen(false)} className={SECONDARY}>
        {t('common.cancel')}
      </button>
    </section>
  );
}

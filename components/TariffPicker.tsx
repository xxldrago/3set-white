'use client';

// Live tariff picker (D-25/D-27/D-28). Calls only the session-gated BFF
// `/api/pricing`; the ARTEMIDA key never reaches the browser. The rendered
// price is the number ARTEMIDA returned, verbatim — never recomputed.
import { useCallback, useEffect, useRef, useState } from 'react';
import PayCta from './PayCta';
import { t } from '@/lib/i18n';

const DAYS = [7, 30, 90] as const;
// Provider minDevices=2 (contract lock 02-01); requirement clamps 2..10.
const MIN_DEVICES = 2;
const MAX_DEVICES = 10;
const DEBOUNCE_MS = 300;

const priceFormatter = new Intl.NumberFormat('ru-RU');

export default function TariffPicker() {
  const [days, setDays] = useState<number>(30);
  const [devices, setDevices] = useState<number>(MIN_DEVICES);
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPrice = useCallback(async (nextDays: number, nextDevices: number) => {
    // Cancel the previous in-flight request so a fast tap cannot race a stale
    // price onto the screen (Pitfall 7).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/pricing?days=${nextDays}&devices=${nextDevices}`, {
        signal: controller.signal,
      });
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
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Debounced load: fires on mount and on every days/devices change.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void fetchPrice(days, devices);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [days, devices, fetchPrice]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Controls stay disabled until the first price lands; afterwards changes
  // update in place (D-27) and never disable.
  const controlsDisabled = price === null;

  const stepDevices = (delta: number) => {
    setDevices((current) => Math.min(MAX_DEVICES, Math.max(MIN_DEVICES, current + delta)));
  };

  return (
    <section className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-black/10 p-6 dark:border-white/15">
      {loading && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-foreground"
        />
      )}

      <h2 className="text-xl font-semibold">{t('pricing.title')}</h2>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
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
                    ? 'h-11 flex-1 rounded-full bg-foreground px-4 text-background transition-colors disabled:opacity-50'
                    : 'h-11 flex-1 rounded-full border border-black/[.08] px-4 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]'
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('pricing.devicesLabel')}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={t('pricing.devicesLabel')}
            disabled={controlsDisabled || devices <= MIN_DEVICES}
            onClick={() => stepDevices(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-black/[.08] text-xl transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            −
          </button>
          <span className="min-w-11 text-center text-xl font-semibold tabular-nums">
            {devices}
          </span>
          <button
            type="button"
            aria-label={t('pricing.devicesLabel')}
            disabled={controlsDisabled || devices >= MAX_DEVICES}
            onClick={() => stepDevices(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-black/[.08] text-xl transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('pricing.priceLabel')}
        </span>
        <span
          className="text-3xl font-semibold tabular-nums"
          aria-live="polite"
        >
          {price === null
            ? '—'
            : t('pricing.price', { price: priceFormatter.format(price) })}
        </span>
      </div>

      {/* Primary pay CTA: disabled until a price lands (no order without a price). */}
      <PayCta kind="new" days={days} devices={devices} disabled={price === null} />

      {error && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-red-600 dark:text-red-400">{t('pricing.error')}</p>
          <button
            type="button"
            onClick={() => void fetchPrice(days, devices)}
            className="flex h-11 items-center justify-center rounded-full border border-black/[.08] px-4 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
    </section>
  );
}

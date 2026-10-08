'use client';

// Upgrade panel (UI-SPEC §4, PAY-03). Rendered only for NON-trial keys — the
// parent (`SubscriptionCard`) keeps it out of the DOM entirely for a trial key
// (D-44). An integer stepper chooses devices to add within `1 … (10 − current
// limit)`; the live prorated quote comes from `GET /api/pricing` (the provider
// exposes no upgrade-quote endpoint — D-43). Controls stay disabled until the
// first quote lands and a failed quote clears the last-good price, matching
// `TariffPicker`. The browser sends no price (T-03-amount/T-03-upgrade-amount).
import { useCallback, useEffect, useRef, useState } from 'react';
import PayCta from './PayCta';
import PromoField from './PromoField';
import { t } from '@/lib/i18n';

const MAX_DEVICES = 10;
const DEBOUNCE_MS = 300;

const CARD =
  'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const TRIGGER =
  'flex h-11 flex-1 items-center justify-center rounded-full border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';
const STEP =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-xl transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';

const priceFormatter = new Intl.NumberFormat('ru-RU');

export default function UpgradePanel({
  keyId,
  deviceLimit,
}: {
  keyId: string;
  deviceLimit: number;
}) {
  const maxAdd = MAX_DEVICES - deviceLimit;
  const [open, setOpen] = useState(false);
  const [addDevices, setAddDevices] = useState(1);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPrice = useCallback(
    async (nextAdd: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(false);
      try {
        const res = await fetch(
          `/api/pricing?kind=upgrade&days=30&devices=${deviceLimit}&addDevices=${nextAdd}`,
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
        setPrice(null);
        setError(true);
      }
    },
    [deviceLimit],
  );

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void fetchPrice(addDevices), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, addDevices, fetchPrice]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // At the device ceiling there is nothing to add — render no control at all
  // (server also rejects currentLimit + add > 10, T-03-device-ceiling).
  if (maxAdd < 1) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={TRIGGER}>
        {t('upgrade.cta')}
      </button>
    );
  }

  const controlsDisabled = price === null;

  return (
    <section className={CARD}>
      <h3 className="text-xl font-semibold text-foreground">{t('upgrade.title')}</h3>
      <p className="text-muted">{t('upgrade.body')}</p>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">
          {t('upgrade.addLabel')}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={t('upgrade.addLabel')}
            disabled={controlsDisabled || addDevices <= 1}
            onClick={() => setAddDevices((current) => Math.max(1, current - 1))}
            className={STEP}
          >
            −
          </button>
          <span className="min-w-11 text-center text-xl font-semibold tabular-nums">
            {addDevices}
          </span>
          <button
            type="button"
            aria-label={t('upgrade.addLabel')}
            disabled={controlsDisabled || addDevices >= maxAdd}
            onClick={() => setAddDevices((current) => Math.min(maxAdd, current + 1))}
            className={STEP}
          >
            +
          </button>
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
            onClick={() => void fetchPrice(addDevices)}
            className={SECONDARY}
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      <PromoField
        key={`kind=upgrade&days=30&devices=${deviceLimit}&addDevices=${addDevices}`}
        query={`kind=upgrade&days=30&devices=${deviceLimit}&addDevices=${addDevices}`}
        onCode={setPromoCode}
      />

      <PayCta
        kind="upgrade"
        addDevices={addDevices}
        keyId={keyId}
        disabled={price === null}
        promoCode={promoCode}
      />

      <button type="button" onClick={() => setOpen(false)} className={SECONDARY}>
        {t('common.cancel')}
      </button>
    </section>
  );
}

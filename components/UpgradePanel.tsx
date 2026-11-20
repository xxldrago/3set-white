'use client';

// Upgrade panel (UI-SPEC §4, PAY-03). Rendered only for NON-trial keys — the
// parent (`SubscriptionCard`) keeps it out of the DOM entirely for a trial key
// (D-44). Devices to add are chosen within `1 … (9999 − current limit)` via
// presets, a stepper, or a typed number (stepping to thousands is impractical);
// the live prorated quote comes from `GET /api/pricing` (the provider exposes no
// upgrade-quote endpoint — D-43). Controls stay disabled until the first quote
// lands and a failed quote clears the last-good price, matching `TariffPicker`.
// The browser sends no price (T-03-amount/T-03-upgrade-amount).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import PayCta from './PayCta';
import PromoField from './PromoField';
import { t } from '@/lib/i18n';
import { TARIFF_MAX_DEVICES } from '@/lib/tariff-grid';

const DEBOUNCE_MS = 300;
/** One-tap amounts for the common cases; any other count is typed. */
const ADD_PRESETS = [1, 2, 3, 5] as const;

const CARD =
  'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const TRIGGER =
  'flex h-12 flex-1 min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';
const SECONDARY =
  'flex h-12 min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';
const STEP =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-xl transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';

const priceFormatter = new Intl.NumberFormat('ru-RU');

export default function UpgradePanel({
  keyId,
  deviceLimit,
}: {
  keyId: string;
  deviceLimit: number;
}) {
  const maxAdd = TARIFF_MAX_DEVICES - deviceLimit;
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
  // (the server rejects currentLimit + add > 9999, T-03-device-ceiling).
  if (maxAdd < 1) return null;

  /** Clamp a typed amount into the legal range (empty/invalid keeps current). */
  const onAddDevicesTyped = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    setAddDevices(Math.min(maxAdd, Math.max(1, parsed)));
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={TRIGGER}>
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
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

        <div className="flex flex-wrap items-center gap-2">
          {ADD_PRESETS.filter((preset) => preset <= maxAdd).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAddDevices(preset)}
              aria-pressed={addDevices === preset}
              className={
                addDevices === preset
                  ? 'h-10 rounded-lg bg-foreground px-4 text-sm font-bold text-lime'
                  : 'h-10 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:bg-foreground/5'
              }
            >
              +{preset}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('upgrade.addLabel')}
            disabled={controlsDisabled || addDevices <= 1}
            onClick={() => setAddDevices((current) => Math.max(1, current - 1))}
            className={STEP}
          >
            <Minus className="h-4 w-4 shrink-0" aria-hidden />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={maxAdd}
            value={addDevices}
            onChange={(event) => onAddDevicesTyped(event.target.value)}
            aria-label={t('upgrade.addLabel')}
            className="h-11 w-24 rounded-lg border border-line bg-transparent text-center text-xl font-semibold tabular-nums text-foreground outline-none focus:border-lime"
          />
          <button
            type="button"
            aria-label={t('upgrade.addLabel')}
            disabled={controlsDisabled || addDevices >= maxAdd}
            onClick={() => setAddDevices((current) => Math.min(maxAdd, current + 1))}
            className={STEP}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        </div>

        <p className="text-xs text-dim">
          {t('upgrade.maxHint', {
            max: priceFormatter.format(TARIFF_MAX_DEVICES),
          })}
        </p>
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
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
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
        <X className="h-4 w-4 shrink-0" aria-hidden />
        {t('common.cancel')}
      </button>
    </section>
  );
}

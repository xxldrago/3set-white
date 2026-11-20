'use client';

// Administrator pricing editor (administrator-only page). Two levers:
//
// 1. Markup — the PRIMARY lever. The storefront sells 1..9999 devices, so a
//    per-cell price table cannot cover the range; every price without an exact
//    manual cell is the live ARTEMIDA quote plus this markup (percent or a
//    fixed RUB amount).
// 2. Manual grid — an exact override for the small range
//    (≤ TARIFF_GRID_MAX_DEVICES devices × the offered terms). A blank cell
//    means "no override — use the markup". This keeps promo prices and rounding
//    fixes possible without a 50k-input form.
//
// Save sends the whole matrix ({days, devices, amount|null}) to the role-gated
// PUT route and reloads the server copy on success (router.refresh) so stale
// rows cannot linger. The markup saves through PATCH. Client-side validation
// mirrors the service bounds; amounts must be whole RUB.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, tp } from '@/lib/i18n';
import type { TariffPriceRow } from '@/lib/pricing';
import {
  MARKUP_PER_DEVICE_MAX,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_AMOUNT,
  TARIFF_MIN_AMOUNT,
  TARIFF_MIN_DEVICES,
  tariffDaysLabel,
} from '@/lib/tariff-grid';

type SaveState = 'idle' | 'loading' | 'saved' | 'error';

const key = (days: number, devices: number) => `${days}:${devices}`;

function isValidAmountText(value: string): boolean {
  if (value.trim().length === 0) return true;
  if (!/^\d+$/.test(value.trim())) return false;
  const amount = Number(value.trim());
  return (
    Number.isSafeInteger(amount) && amount >= TARIFF_MIN_AMOUNT && amount <= TARIFF_MAX_AMOUNT
  );
}

export default function TariffPricingForm({
  initialRows,
  initialMarkups,
}: {
  initialRows: TariffPriceRow[];
  initialMarkups: Record<number, number>;
}) {
  const router = useRouter();
  const initial = useCallback(() => {
    const map: Record<string, string> = {};
    for (const days of TARIFF_DAYS) {
      for (let devices = TARIFF_MIN_DEVICES; devices <= TARIFF_GRID_MAX_DEVICES; devices += 1) {
        map[key(days, devices)] = '';
      }
    }
    for (const row of initialRows) {
      // Rows above the grid ceiling can exist from an older, larger grid; they
      // stay untouched because the form never submits a cell for them.
      if (row.devices <= TARIFF_GRID_MAX_DEVICES) {
        map[key(row.days, row.devices)] = String(row.amount);
      }
    }
    return map;
  }, [initialRows]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [markups, setMarkups] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const days of TARIFF_DAYS) map[days] = String(initialMarkups[days] ?? 0);
    return map;
  });
  const [markupState, setMarkupState] = useState<SaveState>('idle');
  const abortRef = useRef<AbortController | null>(null);

  // Note: no effect syncing `initialRows` back into state — the parent only
  // re-renders with fresh rows after a successful save (router.refresh), by
  // which point `values` already holds the saved grid.
  useEffect(() => () => abortRef.current?.abort(), []);

  const invalid = Object.values(values).some((value) => !isValidAmountText(value));

  const save = useCallback(async () => {
    if (invalid) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState('loading');
    try {
      const rows = [] as { days: number; devices: number; amount: number | null }[];
      for (const days of TARIFF_DAYS) {
        for (let devices = TARIFF_MIN_DEVICES; devices <= TARIFF_GRID_MAX_DEVICES; devices += 1) {
          const text = (values[key(days, devices)] ?? '').trim();
          rows.push({ days, devices, amount: text.length === 0 ? null : Number(text) });
        }
      }
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('pricing_save_failed');
      setState('saved');
      router.refresh();
    } catch {
      if (controller.signal.aborted) return;
      setState('error');
    }
  }, [invalid, router, values]);

  const markupInvalid = TARIFF_DAYS.some((days) => {
    const raw = (markups[days] ?? '').trim();
    if (!/^\d+$/.test(raw)) return true;
    const value = Number(raw);
    return !Number.isSafeInteger(value) || value < 0 || value > MARKUP_PER_DEVICE_MAX;
  });

  const saveMarkups = useCallback(async () => {
    if (markupInvalid) return;
    setMarkupState('loading');
    try {
      for (const days of TARIFF_DAYS) {
        const res = await fetch('/api/admin/pricing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days, value: Number(markups[days]) }),
        });
        if (!res.ok) throw new Error('markup_save_failed');
      }
      setMarkupState('saved');
      router.refresh();
    } catch {
      setMarkupState('error');
    }
  }, [markupInvalid, markups, router]);

  return (
    <div className="flex flex-col gap-6">
      {/* Per-device markups — the primary lever for every offered term. */}
      <section className="flex flex-col gap-3 rounded-2xl border border-line p-6">
        <h3 className="text-lg font-semibold text-foreground">{t('admin.markupTitle')}</h3>
        <p className="text-sm text-muted">{t('admin.markupHint')}</p>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TARIFF_DAYS.map((days) => {
            const raw = markups[days] ?? '';
            const invalid = !/^\d+$/.test(raw.trim()) || Number(raw) > MARKUP_PER_DEVICE_MAX;
            return (
              <label key={days} className="flex flex-col gap-1">
                <span className="text-xs text-muted">{tariffDaysLabel(days)}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={raw}
                  onChange={(event) => {
                    setMarkups((prev) => ({ ...prev, [days]: event.target.value }));
                    setMarkupState('idle');
                  }}
                  aria-invalid={invalid}
                  className={`h-11 w-full rounded-xl border bg-transparent px-3 text-base tabular-nums text-foreground outline-none ${
                    invalid ? 'border-red-600' : 'border-line'
                  }`}
                />
              </label>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void saveMarkups()}
          disabled={markupInvalid || markupState === 'loading'}
          className="flex h-11 w-fit items-center justify-center rounded-lg bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50"
        >
          {markupState === 'loading' ? t('admin.pricingSaving') : t('admin.markupSave')}
        </button>

        {markupState === 'saved' && (
          <p role="status" className="text-sm text-green">{t('admin.markupSaved')}</p>
        )}
        {markupState === 'error' && (
          <p role="alert" className="text-sm text-red-600">{t('admin.markupError')}</p>
        )}
        {markupInvalid && <p className="text-sm text-red-600">{t('admin.markupInvalid')}</p>}
        <p className="text-xs text-dim">{t('admin.markupFormula')}</p>
      </section>

      {state === 'saved' && (
        <p role="status" className="rounded-2xl border border-line bg-panel p-4 text-sm text-green">
          {t('admin.pricingSaved')}
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="rounded-2xl border border-line bg-panel p-4 text-sm text-red-600">
          {t('admin.pricingError')}
        </p>
      )}

      {TARIFF_DAYS.map((days) => (
        <section key={days} className="flex flex-col gap-3 rounded-2xl border border-line p-6">
          <h3 className="text-lg font-semibold text-foreground">{tariffDaysLabel(days)}</h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
            {Array.from(
              { length: TARIFF_GRID_MAX_DEVICES - TARIFF_MIN_DEVICES + 1 },
              (_, i) => TARIFF_MIN_DEVICES + i,
            ).map((devices) => {
              const cell = key(days, devices);
              const bad = !isValidAmountText(values[cell] ?? '');
              return (
                <label key={cell} className="flex flex-col gap-1">
                  <span className="text-xs tabular-nums text-muted">
                    {tp('admin.pricingDevice', devices)}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={values[cell] ?? ''}
                    onChange={(event) => {
                      setValues((prev) => ({ ...prev, [cell]: event.target.value }));
                      setState((prev) => (prev === 'saved' || prev === 'error' ? 'idle' : prev));
                    }}
                    placeholder="₽"
                    aria-invalid={bad}
                    className={`h-11 w-full rounded-xl border bg-transparent px-3 text-base tabular-nums text-foreground outline-none transition-colors ${
                      bad ? 'border-red-600' : 'border-line'
                    }`}
                  />
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex flex-col gap-2">
        {invalid && <p className="text-sm text-red-600">{t('admin.pricingInvalid')}</p>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={invalid || state === 'loading'}
          className="flex h-12 items-center justify-center rounded-lg bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50"
        >
          {state === 'loading' ? t('admin.pricingSaving') : t('admin.pricingSave')}
        </button>
      </div>
    </div>
  );
}

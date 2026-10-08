'use client';

// Pay CTA client island (UI-SPEC §1). Creates the order via the session-gated
// BFF, then redirects SAME-TAB to the Platega hosted page. The browser sends
// only `{kind, days?, devices?, addDevices?, keyId?}` — never a price (the
// server re-quotes, T-03-amount). An in-flight lock disables the CTA and swaps
// the label so a double tap cannot create two orders (T-03-double-submit). The
// returned provider URL is used solely for `window.location.assign` and is
// never held in state (T-03-url-state). A failure renders `pay.createError` +
// `common.retry` and re-enables the CTA — never a raw provider string.
import { useCallback, useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

type PayKind = 'new' | 'renew' | 'upgrade';
type PayState = 'idle' | 'loading' | 'error';

interface PayCtaProps {
  kind: PayKind;
  days?: number;
  devices?: number;
  addDevices?: number;
  keyId?: string;
  /** Disabled until a price lands (or while a parent control is unavailable). */
  disabled?: boolean;
  /** Override the idle label (e.g. «Купить» in the tariff picker). */
  label?: string;
  /** Applied promo code (uppercased) — validated + consumed server-side. */
  promoCode?: string | null;
}

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';
const SECONDARY =
  'flex h-11 w-full items-center justify-center rounded-full border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';

export default function PayCta({
  kind,
  days,
  devices,
  addDevices,
  keyId,
  disabled = false,
  label,
  promoCode = null,
}: PayCtaProps) {
  const [state, setState] = useState<PayState>('idle');
  const [promoRejected, setPromoRejected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [useBalance, setUseBalance] = useState(false);

  // Referral balance (best-effort): a missing/failed read hides the toggle.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/wallet')
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { balance?: unknown };
        if (typeof body.balance === 'number' && body.balance > 0 && !cancelled) {
          setBalance(Math.floor(body.balance));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const createOrder = useCallback(async () => {
    if (state === 'loading') return; // in-flight lock
    setState('loading');
    setPromoRejected(false);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `undefined` fields are dropped by JSON.stringify — only the intent
        // for this kind is sent; no price. The promo is re-validated +
        // consumed server-side (a code exhausted after preview fails here);
        // the balance applies server-side (remainder via Platega).
        body: JSON.stringify({
          kind,
          days,
          devices,
          addDevices,
          keyId,
          promoCode,
          useBalance: useBalance && balance !== null && balance > 0,
        }),
      });
      if (!res.ok) {
        let code: unknown = null;
        try {
          code = ((await res.json()) as { error?: unknown }).error;
        } catch {
          code = null;
        }
        if (code === 'promo_invalid') {
          setPromoRejected(true);
          setState('idle');
          return;
        }
        throw new Error('order_create_failed');
      }
      const body = (await res.json()) as { url?: unknown };
      if (typeof body.url !== 'string' || body.url.length === 0) {
        throw new Error('order_url_missing');
      }
      // Same-tab redirect to the Platega hosted page (never stored in state).
      window.location.assign(body.url);
    } catch {
      setState('error');
    }
  }, [state, kind, days, devices, addDevices, keyId, promoCode, useBalance, balance]);

  return (
    <div className="flex flex-col gap-2">
      {balance !== null && balance > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={useBalance}
            onChange={(event) => setUseBalance(event.target.checked)}
            disabled={state === 'loading'}
            className="h-4 w-4 accent-[#0c4f36]"
          />
          {t('auth.refUseBalance')} ({balance} ₽)
        </label>
      )}
      <button
        type="button"
        onClick={() => void createOrder()}
        disabled={disabled || state === 'loading'}
        className={PRIMARY}
      >
        {state === 'loading' ? t('pay.ctaLoading') : (label ?? t('pay.cta'))}
      </button>

      {promoRejected && state === 'idle' && (
        <p role="alert" className="text-sm text-red-600">
          {t('admin.promoInvalid')}
        </p>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-red-600">{t('pay.createError')}</p>
          <button type="button" onClick={() => void createOrder()} className={SECONDARY}>
            {t('common.retry')}
          </button>
        </div>
      )}
    </div>
  );
}

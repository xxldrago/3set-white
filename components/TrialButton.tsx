'use client';

// One-tap trial CTA (TRIAL-01 / UI-SPEC loading + Pitfall 6).
//
// Calls only the session-gated BFF `/api/trial`; the ARTEMIDA key never
// reaches the browser. An in-flight lock disables the button and swaps the
// label so a double tap cannot submit twice. A repeat trial (409) renders the
// clean "already used" copy + a «Купить подписку» CTA — never raw API text.
import { useCallback, useEffect, useState } from 'react';
import { Mail, RotateCcw, ShoppingCart, Zap } from 'lucide-react';
import { t } from '@/lib/i18n';

type TrialState = 'idle' | 'loading' | 'used' | 'unverified' | 'error';

const PRIMARY =
  'flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';
const SECONDARY =
  'flex h-12 min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold border border-line px-4 transition-colors hover:bg-foreground/5 border-line ';

export default function TrialButton() {
  const [state, setState] = useState<TrialState>('idle');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Paying customers never see the trial CTA: hide it instead of offering a
  // button that can only 409. Trial-claimed accounts stay on the "used"
  // path (their upsell CTA), so only has_subscription hides.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/trial')
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { eligible?: unknown; reason?: unknown };
        if (body.eligible === false && body.reason === 'has_subscription' && !cancelled) {
          setHidden(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const requestTrial = useCallback(async () => {
    if (state === 'loading') return; // in-flight lock
    setState('loading');
    let res: Response;
    try {
      res = await fetch('/api/trial', { method: 'POST' });
    } catch {
      setState('error');
      return;
    }
    if (res.status === 409) {
      setState('used');
      return;
    }
    if (res.status === 403) {
      // Email-only account with an unconfirmed mailbox — verify first.
      setState('unverified');
      return;
    }
    if (!res.ok) {
      setState('error');
      return;
    }
    // Created: reload so the server-rendered cabinet reflects the new key.
    window.location.reload();
  }, [state]);

  const resend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    try {
      const res = await fetch('/api/auth/email/verify/request', { method: 'POST' });
      if (res.ok) setResent(true);
    } catch {
      // Stays silent — the button remains for retry.
    } finally {
      setResending(false);
    }
  }, [resending]);

  if (hidden) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line p-6 border-line">
      {state === 'used' ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t('trial.usedHeading')}</h2>
          <p className="text-muted">{t('trial.usedBody')}</p>
          <a href="#tariff" className={PRIMARY}>
            <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
            {t('key.buyCta')}
          </a>
        </div>
      ) : state === 'unverified' ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t('trial.verifyHeading')}</h2>
          <p className="text-muted">{t('trial.verifyBody')}</p>
          {resent ? (
            <p role="status" className="text-sm text-green">
              {t('trial.verifyResent')}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void resend()}
              disabled={resending}
              className={SECONDARY}
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {t('trial.verifyResend')}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void requestTrial()}
          disabled={state === 'loading'}
          className={PRIMARY}
        >
          <Zap className="h-4 w-4 shrink-0" aria-hidden />
          {state === 'loading' ? t('trial.ctaLoading') : t('trial.cta')}
        </button>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-red-600">{t('trial.error')}</p>
          <button type="button" onClick={() => void requestTrial()} className={SECONDARY}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
            {t('common.retry')}
          </button>
        </div>
      )}
    </section>
  );
}

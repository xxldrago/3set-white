'use client';

// One-tap trial CTA (TRIAL-01 / UI-SPEC loading + Pitfall 6).
//
// Calls only the session-gated BFF `/api/trial`; the ARTEMIDA key never
// reaches the browser. An in-flight lock disables the button and swaps the
// label so a double tap cannot submit twice. A repeat trial (409) renders the
// clean "already used" copy + a «Купить подписку» CTA — never raw API text.
import { useCallback, useState } from 'react';
import { t } from '@/lib/i18n';

type TrialState = 'idle' | 'loading' | 'used' | 'error';

const PRIMARY =
  'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-black/[.08] px-4 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

export default function TrialButton() {
  const [state, setState] = useState<TrialState>('idle');

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
    if (!res.ok) {
      setState('error');
      return;
    }
    // Created: reload so the server-rendered cabinet reflects the new key.
    window.location.reload();
  }, [state]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15">
      {state === 'used' ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t('trial.usedHeading')}</h2>
          <p className="text-zinc-600 dark:text-zinc-400">{t('trial.usedBody')}</p>
          <a href="#tariff" className={PRIMARY}>
            {t('key.buyCta')}
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void requestTrial()}
          disabled={state === 'loading'}
          className={PRIMARY}
        >
          {state === 'loading' ? t('trial.ctaLoading') : t('trial.cta')}
        </button>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-red-600 dark:text-red-400">{t('trial.error')}</p>
          <button type="button" onClick={() => void requestTrial()} className={SECONDARY}>
            {t('common.retry')}
          </button>
        </div>
      )}
    </section>
  );
}

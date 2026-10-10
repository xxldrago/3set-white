'use client';

// Email-confirmation island: redeems the `?token=` link via the public
// confirm route (the token travels only in the POST body, never rendered).
// Invalid/used/expired links share one panel with a login shortcut;
// success links into the cabinet — the trial is now unlocked.
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { t } from '@/lib/i18n';

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';
const CARD = 'rounded-2xl border border-line p-6 border-line';

type State = 'loading' | 'done' | 'invalid' | 'error';

export default function VerifyConfirmForm({ token }: { token: string | null }) {
  const [state, setState] = useState<State>('loading');

  const confirm = useCallback(async (value: string) => {
    setState('loading');
    try {
      const res = await fetch('/api/auth/email/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      setState(res.ok ? 'done' : 'invalid');
    } catch {
      setState('error');
    }
  }, []);

  // Explicit click (not auto-confirm on mount): mail scanners prefetch
  // links, which would burn the single-use token before the user arrives.
  if (token === null && state === 'loading') {
    return (
      <div className={`${CARD} flex flex-col gap-4`}>
        <h2 className="text-xl font-semibold text-foreground">{t('auth.verifyInvalid')}</h2>
        <p className="text-sm text-muted">{t('auth.verifyInvalidBody')}</p>
        <Link href="/login" className={PRIMARY}>
          {t('auth.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      {state === 'loading' && token && (
        <>
          <p className="text-muted">{t('auth.verifyIntro')}</p>
          <button type="button" onClick={() => void confirm(token)} className={PRIMARY}>
            {t('auth.verifyCta')}
          </button>
        </>
      )}
      {state === 'done' && (
        <>
          <h2 className="text-xl font-semibold text-foreground">{t('auth.verifyDone')}</h2>
          <Link href="/" className={PRIMARY}>
            {t('auth.verifyToCabinet')}
          </Link>
        </>
      )}
      {state === 'invalid' && (
        <>
          <h2 className="text-xl font-semibold text-foreground">{t('auth.verifyInvalid')}</h2>
          <p className="text-sm text-muted">{t('auth.verifyInvalidBody')}</p>
          <Link href="/login" className={PRIMARY}>
            {t('auth.backToLogin')}
          </Link>
        </>
      )}
      {state === 'error' && (
        <>
          <p role="alert" className="text-sm text-red-600">
            {t('common.errorLoad')}
          </p>
          {token && (
            <button type="button" onClick={() => void confirm(token)} className={PRIMARY}>
              {t('common.retry')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

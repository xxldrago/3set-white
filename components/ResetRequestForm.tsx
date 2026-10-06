'use client';

// Reset-request client island (Phase 6 UI-SPEC §2, AUTH-04 surface, D-89).
//
// Single email field + primary CTA with in-flight lock. Sent → success panel
// (role=status) + back-to-login; unknown email → the honest no-account answer
// (the ONLY surface that discloses account existence, owner-accepted D-89);
// transport failure → generic copy + retry with the email retained. 429 reuses
// the shared rate-limit copy with the server-provided wait (06-03 note).
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

const INPUT =
  'h-12 w-full rounded-2xl border border-black/[.08] bg-white px-4 text-base text-black placeholder:text-zinc-500 disabled:opacity-50 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500';
const INPUT_INVALID = 'border-red-600/50 dark:border-red-400/50';
const FIELD_LABEL = 'text-sm text-zinc-600 dark:text-zinc-400';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

const CARD = 'rounded-2xl border border-black/10 p-6 dark:border-white/15';
const EMAIL_SHAPE = /[^@\s]+@[^@\s]+\.[^@\s]+/;

type RequestState = 'form' | 'loading' | 'sent' | 'noAccount' | 'error';

export default function ResetRequestForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [state, setState] = useState<RequestState>('form');
  const [rateWaitSec, setRateWaitSec] = useState<number | null>(null);
  const rateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (rateTimer.current !== null) clearTimeout(rateTimer.current);
    },
    [],
  );

  const locked = state === 'loading' || rateWaitSec !== null;
  const canSubmit = email.trim().length > 0 && !locked;

  const submit = useCallback(async () => {
    if (state === 'loading' || rateWaitSec !== null) return;
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setEmailError(t('auth.fieldRequired'));
      return;
    }
    if (!EMAIL_SHAPE.test(trimmed)) {
      setEmailError(t('auth.emailInvalid'));
      return;
    }
    setEmailError(null);
    setState('loading');
    try {
      const res = await fetch('/api/auth/email/password/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        setState('sent');
        return;
      }
      let payload: { error?: unknown; retryAfterSec?: unknown };
      try {
        payload = (await res.json()) as { error?: unknown; retryAfterSec?: unknown };
      } catch {
        payload = {};
      }
      if (res.status === 429 && payload.error === 'rate_limited') {
        const wait =
          typeof payload.retryAfterSec === 'number' && Number.isFinite(payload.retryAfterSec)
            ? Math.max(1, Math.ceil(payload.retryAfterSec))
            : 60;
        setRateWaitSec(wait);
        if (rateTimer.current !== null) clearTimeout(rateTimer.current);
        rateTimer.current = setTimeout(() => setRateWaitSec(null), wait * 1000);
        setState('form');
        return;
      }
      if (res.status === 404 && payload.error === 'reset_no_account') {
        setState('noAccount');
        return;
      }
      setState('error');
    } catch {
      setState('error');
    }
  }, [email, state, rateWaitSec]);

  if (state === 'sent') {
    return (
      <div className={`${CARD} flex flex-col gap-5`}>
        <div role="status" className="text-base text-black dark:text-zinc-50">
          {t('auth.resetSent')}
        </div>
        <a href="/login" className={SECONDARY}>
          {t('auth.backToLogin')}
        </a>
      </div>
    );
  }

  if (state === 'noAccount') {
    return (
      <div className={`${CARD} flex flex-col gap-5`}>
        <div role="alert" className="text-base text-black dark:text-zinc-50">
          {t('auth.resetNoAccount')}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href="/login?mode=register" className={`${SECONDARY} flex-1`}>
            {t('auth.modeRegister')}
          </a>
          <a href="/login" className={`${SECONDARY} flex-1`}>
            {t('auth.backToLogin')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} flex flex-col gap-5`}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="reset-email" className={FIELD_LABEL}>
            {t('auth.emailLabel')}
          </label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            disabled={locked}
            className={`${INPUT} ${emailError ? INPUT_INVALID : ''}`}
          />
          <div className="min-h-5">
            {emailError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {emailError}
              </p>
            )}
          </div>
        </div>

        <div className="min-h-5">
          {rateWaitSec !== null && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {t('auth.rateLimited', { n: rateWaitSec })}
            </p>
          )}
        </div>

        {state === 'error' && (
          <div className="flex flex-col gap-2" role="alert">
            <p className="text-sm text-red-600 dark:text-red-400">{t('auth.resetError')}</p>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className={SECONDARY}
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        <button type="submit" disabled={!canSubmit} className={PRIMARY}>
          {state === 'loading' ? t('auth.resetRequestLoading') : t('auth.resetRequestCta')}
        </button>
      </form>
    </div>
  );
}

'use client';

// Email login/register client island (Phase 6 UI-SPEC §1, D-91/AUTH-01/02).
//
// Posts credentials to the BFF email routes and follows with a full redirect
// on success (same discipline as LoginButton.postPayload). The session cookie
// stays httpOnly and is never read, written, or rendered here (threat
// boundary browser→BFF). No-enumeration: wrong email and wrong password —
// and a duplicate email on register (D-89 reserves the honest answer for the
// reset-request surface only) — all render the identical generic copy.
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import PasswordField from './PasswordField';

const INPUT =
  'h-12 w-full rounded-2xl border border-black/[.08] bg-white px-4 text-base text-black placeholder:text-zinc-500 disabled:opacity-50 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500';
const INPUT_INVALID = 'border-red-600/50 dark:border-red-400/50';
const FIELD_LABEL = 'text-sm text-zinc-600 dark:text-zinc-400';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SEGMENT_ACTIVE =
  'flex h-11 flex-1 items-center justify-center rounded-full bg-foreground px-4 text-sm text-background transition-colors';
const SEGMENT_IDLE =
  'flex h-11 flex-1 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

const CARD = 'rounded-2xl border border-black/10 p-6 dark:border-white/15';
const EMAIL_SHAPE = /[^@\s]+@[^@\s]+\.[^@\s]+/;

export type AuthMode = 'login' | 'register';

export default function EmailAuthCard({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rateWaitSec, setRateWaitSec] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const rateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (rateTimer.current !== null) clearTimeout(rateTimer.current);
    },
    [],
  );

  const locked = loading || rateWaitSec !== null;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !locked;

  const switchMode = useCallback((next: AuthMode) => {
    // Retain the typed email; clear passwords and every error (UI-SPEC §1).
    setMode(next);
    setPassword('');
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
  }, []);

  const submit = useCallback(async () => {
    if (loading || rateWaitSec !== null) return; // in-flight / rate-limit lock
    const trimmed = email.trim();
    let bad = false;
    if (trimmed.length === 0) {
      setEmailError(t('auth.fieldRequired'));
      bad = true;
    } else if (!EMAIL_SHAPE.test(trimmed)) {
      setEmailError(t('auth.emailInvalid'));
      bad = true;
    } else {
      setEmailError(null);
    }
    if (password.length === 0) {
      setPasswordError(t('auth.fieldRequired'));
      bad = true;
    } else if (mode === 'register' && password.length < 8) {
      setPasswordError(t('auth.passwordTooShort'));
      bad = true;
    } else {
      setPasswordError(null);
    }
    if (bad) return;
    setLoading(true);
    setFormError(null);
    try {
      const endpoint = mode === 'login' ? '/api/auth/email/login' : '/api/auth/email/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, password }),
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      let payload: { error?: unknown; retryAfterSec?: unknown };
      try {
        payload = (await res.json()) as { error?: unknown; retryAfterSec?: unknown };
      } catch {
        payload = {};
      }
      const code = payload.error;
      if (res.status === 429 && code === 'rate_limited') {
        // Server-provided wait only — never fabricated client-side (D-84).
        const wait =
          typeof payload.retryAfterSec === 'number' && Number.isFinite(payload.retryAfterSec)
            ? Math.max(1, Math.ceil(payload.retryAfterSec))
            : 60;
        setFormError(null);
        setRateWaitSec(wait);
        if (rateTimer.current !== null) clearTimeout(rateTimer.current);
        rateTimer.current = setTimeout(() => setRateWaitSec(null), wait * 1000);
        setPassword('');
        return;
      }
      if (code === 'invalid_credentials' || code === 'email_taken') {
        // email_taken maps to the same generic copy: registration must not
        // disclose account existence (only reset-request may, per D-89).
        setFormError(t('auth.invalidCredentials'));
        setPassword('');
        return;
      }
      setFormError(t('login.error'));
    } catch {
      setFormError(t('login.error'));
    } finally {
      setLoading(false);
    }
  }, [email, password, mode, loading, rateWaitSec]);

  return (
    <div className={`${CARD} flex flex-col gap-5`}>
      <div role="group" aria-label={mode === 'login' ? t('auth.modeLogin') : t('auth.modeRegister')} className="flex gap-2">
        <button
          type="button"
          onClick={() => switchMode('login')}
          disabled={locked}
          aria-pressed={mode === 'login'}
          className={mode === 'login' ? SEGMENT_ACTIVE : SEGMENT_IDLE}
        >
          {t('auth.modeLogin')}
        </button>
        <button
          type="button"
          onClick={() => switchMode('register')}
          disabled={locked}
          aria-pressed={mode === 'register'}
          className={mode === 'register' ? SEGMENT_ACTIVE : SEGMENT_IDLE}
        >
          {t('auth.modeRegister')}
        </button>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="email-auth-email" className={FIELD_LABEL}>
            {t('auth.emailLabel')}
          </label>
          <input
            id="email-auth-email"
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

        <PasswordField
          id="email-auth-password"
          label={t('auth.passwordLabel')}
          value={password}
          onChange={setPassword}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={mode === 'register' ? 8 : undefined}
          hint={mode === 'register' ? t('auth.passwordHint') : undefined}
          error={passwordError}
          disabled={locked}
        />

        <div className="min-h-5">
          {(formError || rateWaitSec !== null) && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {rateWaitSec !== null ? t('auth.rateLimited', { n: rateWaitSec }) : formError}
            </p>
          )}
        </div>

        <button type="submit" disabled={!canSubmit} className={PRIMARY}>
          {mode === 'login'
            ? loading
              ? t('auth.loginCtaLoading')
              : t('auth.loginCta')
            : loading
              ? t('auth.registerCtaLoading')
              : t('auth.registerCta')}
        </button>

        {mode === 'login' && (
          <a
            href="/reset"
            className="text-center text-sm text-zinc-600 underline dark:text-zinc-400"
          >
            {t('auth.forgotPassword')}
          </a>
        )}
      </form>
    </div>
  );
}

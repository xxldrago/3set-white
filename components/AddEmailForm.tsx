'use client';

// Add-email client island (TG → email capability, AUTH-01 symmetric to
// LinkTelegramRow): the email + password pair that the login route will
// accept afterwards. Shown only when the account has no email yet — the
// Account section renders it in place of the email row.
//
// Validation copy and values live here (same discipline as EmailAuthCard);
// the httpOnly cookie is never read. Failures are deliberately generic
// (email_taken on attach would be the same account-existence oracle register
// refuses to open, D-89). Success re-fetches the profile so the server-rendered
// email row + change-password form replace this form.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import PasswordField from './PasswordField';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50 border-line bg-panel text-foreground';
const INPUT_INVALID = 'border-red-600/50';
const FIELD_LABEL = 'text-sm text-muted';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';

const EMAIL_SHAPE = /[^@\s]+@[^@\s]+\.[^@\s]+/;

export default function AddEmailForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rateWaitSec, setRateWaitSec] = useState<number | null>(null);
  const rateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (rateTimer.current !== null) clearTimeout(rateTimer.current);
    },
    [],
  );

  const locked = loading || rateWaitSec !== null;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !locked;

  const submit = useCallback(async () => {
    if (locked) return; // in-flight / rate-limit lock
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
    } else if (password.length < 8) {
      setPasswordError(t('auth.passwordTooShort'));
      bad = true;
    } else {
      setPasswordError(null);
    }
    if (bad) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/auth/email/attach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, password }),
      });
      if (res.ok) {
        setEmail('');
        setPassword('');
        // Server re-render: the email row + change-password form replace this
        // island (the visible confirmation).
        router.refresh();
        return;
      }
      let payload: { error?: unknown; retryAfterSec?: unknown };
      try {
        payload = (await res.json()) as { error?: unknown; retryAfterSec?: unknown };
      } catch {
        payload = {};
      }
      if (res.status === 429 && payload.error === 'rate_limited') {
        // Server-provided wait only — never fabricated client-side (D-84).
        const wait =
          typeof payload.retryAfterSec === 'number' && Number.isFinite(payload.retryAfterSec)
            ? Math.max(1, Math.ceil(payload.retryAfterSec))
            : 60;
        setRateWaitSec(wait);
        if (rateTimer.current !== null) clearTimeout(rateTimer.current);
        rateTimer.current = setTimeout(() => setRateWaitSec(null), wait * 1000);
        setPassword('');
        return;
      }
      // 409 (email_taken / email_exists) and unexpected failures render the
      // identical generic copy — no account-existence oracle (D-89).
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [email, password, locked, router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-foreground">{t('auth.addEmailTitle')}</h3>
        <p className="text-sm text-muted">{t('auth.addEmailIntro')}</p>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="attach-email" className={FIELD_LABEL}>
            {t('auth.emailLabel')}
          </label>
          <input
            id="attach-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            disabled={locked}
            className={`${INPUT} ${emailError ? INPUT_INVALID : ''}`}
          />
          <div className="min-h-5">
            {emailError && (
              <p role="alert" className="text-sm text-red-600">
                {emailError}
              </p>
            )}
          </div>
        </div>

        <PasswordField
          id="attach-password"
          label={t('auth.passwordLabel')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          hint={t('auth.passwordHint')}
          error={passwordError}
          disabled={locked}
        />

        {rateWaitSec !== null && (
          <p role="status" className="text-sm text-muted">
            {t('auth.rateLimited', { n: rateWaitSec })}
          </p>
        )}
        {failed && (
          <p role="alert" className="text-sm text-red-600">
            {t('auth.addEmailError')}
          </p>
        )}

        <button type="submit" disabled={!canSubmit} className={PRIMARY}>
          {loading ? t('auth.addEmailLoading') : t('auth.addEmailCta')}
        </button>
      </form>
    </div>
  );
}

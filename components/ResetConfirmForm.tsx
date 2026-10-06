'use client';

// Reset-confirm client island (Phase 6 UI-SPEC §2, AUTH-04 surface, D-88).
//
// The token arrives as a prop read server-side from the URL and is only ever
// sent back in the POST body — it is never rendered. Two PasswordFields +
// policy hint; mismatch is a client check. Token states (invalid/expired/
// used) each get their own panel with a request-new-link action and cleared
// passwords. Success shows explicit re-login — the confirm route mints NO
// session (06-03), so there is deliberately no redirect to `/`.
import { useCallback, useState } from 'react';
import { t } from '@/lib/i18n';
import PasswordField from './PasswordField';

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

const CARD = 'rounded-2xl border border-black/10 p-6 dark:border-white/15';

type TokenState = 'ok' | 'invalid' | 'expired' | 'used';
type ConfirmState = 'form' | 'loading' | 'done' | 'token' | 'error';

export default function ResetConfirmForm({ token }: { token: string | null }) {
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [state, setState] = useState<ConfirmState>(token === null ? 'token' : 'form');
  const [tokenState, setTokenState] = useState<TokenState>(token === null ? 'invalid' : 'ok');

  const loading = state === 'loading';
  const canSubmit =
    token !== null && newPassword.length > 0 && repeatPassword.length > 0 && !loading;

  const submit = useCallback(async () => {
    if (loading || token === null) return; // in-flight lock; null token never posts
    let bad = false;
    if (newPassword.length === 0) {
      setNewError(t('auth.fieldRequired'));
      bad = true;
    } else if (newPassword.length < 8) {
      setNewError(t('auth.passwordTooShort'));
      bad = true;
    } else {
      setNewError(null);
    }
    if (repeatPassword.length === 0) {
      setRepeatError(t('auth.fieldRequired'));
      bad = true;
    } else if (repeatPassword !== newPassword) {
      setRepeatError(t('auth.passwordsMismatch'));
      bad = true;
    } else {
      setRepeatError(null);
    }
    if (bad) return;
    setState('loading');
    try {
      const res = await fetch('/api/auth/email/password/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (res.ok) {
        setNewPassword('');
        setRepeatPassword('');
        setState('done');
        return;
      }
      let code: unknown;
      try {
        code = ((await res.json()) as { error?: unknown }).error;
      } catch {
        code = null;
      }
      // Typed passwords clear on every failure (UI-SPEC §2).
      setNewPassword('');
      setRepeatPassword('');
      if (code === 'reset_invalid' || code === 'reset_expired' || code === 'reset_used') {
        setTokenState(
          code === 'reset_expired' ? 'expired' : code === 'reset_used' ? 'used' : 'invalid',
        );
        setState('token');
        return;
      }
      setState('error');
    } catch {
      setNewPassword('');
      setRepeatPassword('');
      setState('error');
    }
  }, [loading, token, newPassword, repeatPassword]);

  if (state === 'done') {
    return (
      <div className={`${CARD} flex flex-col gap-5`}>
        <div role="status" className="text-base text-black dark:text-zinc-50">
          {t('auth.resetDone')}
        </div>
        <a href="/login" className={SECONDARY}>
          {t('auth.backToLogin')}
        </a>
      </div>
    );
  }

  if (state === 'token') {
    return (
      <div className={`${CARD} flex flex-col gap-5`}>
        <div role="alert" className="text-base text-black dark:text-zinc-50">
          {tokenState === 'expired'
            ? t('auth.resetExpired')
            : tokenState === 'used'
              ? t('auth.resetUsed')
              : t('auth.resetInvalid')}
        </div>
        <a href="/reset" className={SECONDARY}>
          {t('auth.requestNewLink')}
        </a>
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
        <PasswordField
          id="reset-new-password"
          label={t('auth.newPasswordLabel')}
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={8}
          hint={t('auth.passwordHint')}
          error={newError}
          disabled={loading}
        />
        <PasswordField
          id="reset-repeat-password"
          label={t('auth.repeatPasswordLabel')}
          value={repeatPassword}
          onChange={setRepeatPassword}
          autoComplete="new-password"
          minLength={8}
          error={repeatError}
          disabled={loading}
        />

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
          {loading ? t('auth.resetConfirmLoading') : t('auth.resetConfirmCta')}
        </button>
      </form>
    </div>
  );
}

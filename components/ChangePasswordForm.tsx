'use client';

// Change-password client island (Phase 6 UI-SPEC §3, D-92). Current + new
// PasswordFields with the same lock/loading discipline as the login card.
// Success → role=status copy + cleared fields. A wrong current password
// renders the dedicated generic copy (current-password check is not an
// enumeration surface). Unexpected failures reuse the shared load-error copy
// + retry — the contract keys no other failure string for this form.
import { useCallback, useState } from 'react';
import { t } from '@/lib/i18n';
import PasswordField from './PasswordField';

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = currentPassword.length > 0 && newPassword.length > 0 && !loading;

  const submit = useCallback(async () => {
    if (loading) return; // in-flight lock
    let bad = false;
    if (currentPassword.length === 0) {
      setCurrentError(t('auth.fieldRequired'));
      bad = true;
    } else {
      setCurrentError(null);
    }
    if (newPassword.length === 0) {
      setNewError(t('auth.fieldRequired'));
      bad = true;
    } else if (newPassword.length < 8) {
      setNewError(t('auth.passwordTooShort'));
      bad = true;
    } else {
      setNewError(null);
    }
    if (bad) return;
    setLoading(true);
    setFailed(false);
    setDone(false);
    try {
      const res = await fetch('/api/auth/email/password/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setCurrentPassword('');
        setNewPassword('');
        setDone(true);
        return;
      }
      let code: unknown;
      try {
        code = ((await res.json()) as { error?: unknown }).error;
      } catch {
        code = null;
      }
      if (res.status === 401 && code === 'current_password_wrong') {
        setCurrentError(t('auth.currentPasswordWrong'));
        setCurrentPassword('');
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loading, currentPassword, newPassword]);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xl font-semibold text-foreground">
        {t('auth.changePasswordTitle')}
      </h3>
      {done && (
        <div role="status" className="text-sm text-muted">
          {t('auth.passwordChanged')}
        </div>
      )}
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <PasswordField
          id="change-current-password"
          label={t('auth.currentPasswordLabel')}
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          error={currentError}
          disabled={loading}
        />
        <PasswordField
          id="change-new-password"
          label={t('auth.newPasswordLabel')}
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={8}
          hint={t('auth.passwordHint')}
          error={newError}
          disabled={loading}
        />

        {failed && (
          <div className="flex flex-col gap-2" role="alert">
            <p className="text-sm text-red-600">{t('common.errorLoad')}</p>
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
          {loading ? t('auth.changePasswordLoading') : t('auth.changePasswordCta')}
        </button>
      </form>
    </div>
  );
}

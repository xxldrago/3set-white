'use client';

// Inline unlink confirmation (Phase 6 UI-SPEC §3, D-93, T-06-06). Copies the
// ConfirmPanel anatomy: the first tap opens this panel (no request yet),
// Escape/cancel dismiss with NO request, the mutation fires ONLY on the
// explicit second (red) tap — never `window.confirm`. Destructive red
// variant: unlinking removes an access path. When this is the last login
// method the copy swaps to the lockout warning (unlink stays allowed per
// D-93 — the UI warns, it does not block). The lastMethod hint comes from
// the route's own `confirmation_required` 400, so the warning renders BEFORE
// any mutation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';
const DESTRUCTIVE =
  'flex h-11 items-center justify-center rounded-full bg-red-600 px-4 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-400 dark:text-black dark:hover:bg-red-300';

interface UnlinkConfirmPanelProps {
  onClose: () => void;
  onDone: () => void;
}

export default function UnlinkConfirmPanel({ onClose, onDone }: UnlinkConfirmPanelProps) {
  const [lastMethod, setLastMethod] = useState<boolean | null>(null);
  const [hintFailed, setHintFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // First tap opened the panel: ask the route whether this removes the last
  // method. A body without `confirm: true` never unlinks — the 400 carries
  // the hint for the warning copy.
  const loadHint = useCallback(async () => {
    setHintFailed(false);
    try {
      const res = await fetch('/api/auth/email/unlink', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await res.json()) as { lastMethod?: unknown };
      setLastMethod(payload.lastMethod === true);
    } catch {
      setHintFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadHint();
  }, [loadHint]);

  // Escape dismisses with NO request; Tab cycles within the two buttons while
  // the panel is open (ConfirmPanel focus-trap discipline).
  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = [cancelRef.current, confirmRef.current].filter(
        (el): el is HTMLButtonElement => el !== null,
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const confirm = useCallback(async () => {
    setPending(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/email/unlink', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error('unlink_failed');
      onDone();
    } catch {
      setError(true);
      setPending(false);
    }
  }, [onDone]);

  return (
    <div
      role="group"
      aria-label={t('auth.unlinkTitle')}
      className="flex w-full flex-col gap-2 rounded-2xl border border-red-600/30 p-3 dark:border-red-400/30"
    >
      <p className="text-sm font-semibold text-black dark:text-zinc-50">{t('auth.unlinkTitle')}</p>
      {hintFailed ? (
        <>
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {t('auth.unlinkError')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onClose} className={`${SECONDARY} flex-1`}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void loadHint()}
              className={`${SECONDARY} flex-1`}
            >
              {t('common.retry')}
            </button>
          </div>
        </>
      ) : lastMethod === null ? (
        <div className="h-5 animate-pulse rounded-full bg-black/5 dark:bg-white/10" aria-hidden />
      ) : (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {lastMethod ? t('auth.unlinkLastBody') : t('auth.unlinkBody')}
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {t('auth.unlinkError')}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              ref={cancelRef}
              type="button"
              onClick={onClose}
              disabled={pending}
              className={`${SECONDARY} flex-1`}
            >
              {t('common.cancel')}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={() => void confirm()}
              disabled={pending}
              className={`${DESTRUCTIVE} flex-1`}
            >
              {lastMethod ? t('auth.unlinkLastConfirm') : t('auth.unlinkConfirm')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

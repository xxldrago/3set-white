'use client';

// Inline destructive confirmation (D-32 / T-02-22). Rendered INSIDE the affected
// device row / section — never `window.confirm`, never a native `<dialog>`, never
// an alert. The trigger opens a local panel; the mutation fires ONLY on the
// explicit second (red) tap. Cancel and Escape dismiss with NO request. While
// open, focus is trapped between the two buttons. Mutations still go through the
// session-gated BFF device routes; on failure a RU error key is shown — never a
// raw provider/API message (D-19).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

export type ConfirmKind = 'delete' | 'clear';

interface ConfirmPanelProps {
  kind: ConfirmKind;
  url: string;
  method: 'DELETE' | 'POST';
  /** Device label for `devices.deleteBody` interpolation (delete only). */
  deviceName?: string;
  /** Device count for `devices.clearBody` interpolation (clear only). */
  deviceCount?: number;
}

const TRIGGER =
  'flex h-11 shrink-0 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';
const DESTRUCTIVE =
  'flex h-11 items-center justify-center rounded-full bg-red-600 px-4 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50';

export default function ConfirmPanel({
  kind,
  url,
  method,
  deviceName,
  deviceCount,
}: ConfirmPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const isDelete = kind === 'delete';
  const triggerLabel = isDelete ? t('devices.delete') : t('devices.clear');

  const close = useCallback(() => {
    setOpen(false);
    setPending(false);
    setError(false);
  }, []);

  // Escape dismisses with NO request; Tab cycles within the two buttons while
  // the panel is open (D-32 focus trap).
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
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
  }, [open, close]);

  const confirm = useCallback(async () => {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(url, { method });
      if (!res.ok) throw new Error('device_mutation_failed');
      close();
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }, [close, router, url, method]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={TRIGGER}>
        {triggerLabel}
      </button>
    );
  }

  const title = isDelete ? t('devices.deleteTitle') : t('devices.clearTitle');
  const body = isDelete
    ? t('devices.deleteBody', { name: deviceName ?? '' })
    : t('devices.clearBody', { n: deviceCount ?? 0 });
  const confirmLabel = isDelete ? t('devices.deleteConfirm') : t('devices.clearConfirm');
  const errorLabel = isDelete ? t('devices.deleteError') : t('devices.clearError');

  return (
    <div
      role="group"
      aria-label={title}
      className="flex w-full flex-col gap-2 rounded-2xl border border-red-600/30 p-3"
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted">{body}</p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {errorLabel}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          ref={cancelRef}
          type="button"
          onClick={close}
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
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

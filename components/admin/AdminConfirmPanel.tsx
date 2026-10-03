'use client';

// Inline admin confirmation panel (UI-SPEC §5/§6). Modeled on the Phase 3
// `ConfirmPanel` (D-32): the trigger opens a local panel; the mutation fires
// ONLY on the explicit second tap. Cancel and Escape dismiss with NO request,
// and while open focus is trapped between the two buttons. Unlike the device
// panel this one supports a `primary` (non-destructive) variant — role raises
// and broadcasts are not deletions — alongside the red `destructive` variant.
// The mutation is a JSON POST to a role-gated BFF route; on failure a keyed RU
// error is shown and the panel stays open — never a raw provider/DB message.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

export type AdminConfirmVariant = 'primary' | 'destructive';

interface AdminConfirmPanelProps {
  variant: AdminConfirmVariant;
  /** Label of the first-tap trigger button. */
  triggerLabel: string;
  title: string;
  body: string;
  confirmLabel: string;
  errorLabel: string;
  /** JSON POST target (role-gated BFF route). */
  url: string;
  payload: Record<string, unknown>;
  triggerClassName?: string;
}

const TRIGGER =
  'flex h-11 shrink-0 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';
const PRIMARY =
  'flex h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const DESTRUCTIVE =
  'flex h-11 items-center justify-center rounded-full bg-red-600 px-4 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-400 dark:text-black dark:hover:bg-red-300';

export default function AdminConfirmPanel({
  variant,
  triggerLabel,
  title,
  body,
  confirmLabel,
  errorLabel,
  url,
  payload,
  triggerClassName = TRIGGER,
}: AdminConfirmPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const destructive = variant === 'destructive';
  const panelBorder = destructive
    ? 'border-red-600/30 dark:border-red-400/30'
    : 'border-black/10 dark:border-white/15';
  const confirmClass = destructive ? DESTRUCTIVE : PRIMARY;

  const close = useCallback(() => {
    setOpen(false);
    setPending(false);
    setError(false);
  }, []);

  // Escape dismisses with NO request; Tab cycles within the two buttons while
  // the panel is open (focus trap).
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
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('admin_mutation_failed');
      close();
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }, [close, router, url, payload]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={title}
      className={`flex w-full flex-col gap-2 rounded-2xl border p-3 ${panelBorder}`}
    >
      <p className="text-sm font-semibold text-black dark:text-zinc-50">{title}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
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
          className={`${confirmClass} flex-1`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

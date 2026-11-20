'use client';

// Inline label editor for a key or a device.
//
// The provider cannot rename anything (PATCH/PUT /keys/{id} → 501,
// /keys/{id}/rename → 404 — verified live), so the label is a local value sent
// to our own BFF route and stored in our DB. The UI makes that explicit in a
// hint so nobody expects the provider panel to change.
//
// Behaviour:
// - opens on demand, pre-filled with the current label;
// - Save sends `{label}`; an empty field sends `{label: null}` (clear);
// - a failed save keeps the panel open and shows the error, never a silent loss.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { t } from '@/lib/i18n';

export interface LabelEditorProps {
  /** Route to PATCH, e.g. `/api/keys/<id>` or `/api/keys/<id>/devices/<token>`. */
  url: string;
  /** Current label (null when the item has none). */
  value: string | null;
  /** Accessible name for the trigger button. */
  triggerLabel: string;
  /** Heading shown inside the editor. */
  title: string;
  /** Hint explaining that the label is local to this service. */
  hint?: string;
  /** Maximum accepted length, mirrored from the server rule. */
  maxLength?: number;
  /** Called with the new label after a successful save. */
  onSaved?: (label: string | null) => void;
  /** Renders as a compact icon button (used inside dense device rows). */
  compact?: boolean;
}

export default function LabelEditor({
  url,
  value,
  triggerLabel,
  title,
  hint,
  maxLength = 64,
  onSaved,
  compact = false,
}: LabelEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync when the parent hands down a new value (e.g. after a refresh).
  useEffect(() => {
    if (!open) setDraft(value ?? '');
  }, [value, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setError(false);
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    const trimmed = draft.trim();
    if (trimmed.length > maxLength) {
      setError(true);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        // Empty input clears the label rather than storing an empty string.
        body: JSON.stringify({ label: trimmed.length === 0 ? null : trimmed }),
      });
      if (!res.ok) throw new Error('label_save_failed');
      onSaved?.(trimmed.length === 0 ? null : trimmed);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [draft, maxLength, onSaved, saving, url]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={
          compact
            ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-foreground/5'
            : 'flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-muted transition-colors hover:bg-foreground/5'
        }
      >
        <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {compact ? null : t('key.renameKey')}
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <button
          type="button"
          onClick={close}
          aria-label={t('common.cancel')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/5"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={maxLength}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save();
          if (event.key === 'Escape') close();
        }}
        placeholder={t('key.labelPlaceholder')}
        className="h-10 w-full rounded-lg border border-line bg-transparent px-3 text-sm text-foreground outline-none focus:border-lime"
      />

      <p className="text-[11px] leading-relaxed text-dim">{hint ?? t('key.renameKeyHint')}</p>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {draft.trim().length > maxLength
            ? t('key.labelTooLong', { max: String(maxLength) })
            : t('key.labelError')}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-bold text-lime transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('key.labelSave')}
        </button>
        {value !== null && (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              void save();
            }}
            disabled={saving}
            className="flex h-9 items-center justify-center rounded-lg border border-line px-3 text-xs font-bold text-muted transition-colors hover:bg-foreground/5 disabled:opacity-50"
          >
            {t('key.labelClear')}
          </button>
        )}
      </div>
    </div>
  );
}

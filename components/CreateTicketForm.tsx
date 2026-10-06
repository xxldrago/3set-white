'use client';

// Ticket composer client island (SUP-01/SUP-02, UI-SPEC §3).
//
// Modeled on PayCta: an in-flight lock disables the CTA and swaps its label so
// a double tap cannot create two tickets (T-04-23); a failure renders
// `ticket.sendError` + `common.retry` and retains the typed text and selected
// file. Client-side validation (<= 5 MiB, jpeg/png/webp) is UX ONLY — the BFF
// re-validates the bytes via `normalizeImage` (T-04-21). The request body is
// `FormData` sent WITHOUT a manual `Content-Type`, so the browser sets the
// multipart boundary (D-53/D-55). No raw provider/DB error is ever shown.
import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type FormState = 'idle' | 'loading' | 'error';
type FieldError = 'tooLarge' | 'badType' | null;

const INPUT =
  'h-12 w-full rounded-2xl border border-black/[.08] bg-white px-4 text-base text-black placeholder:text-zinc-500 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500';
const TEXTAREA = `${INPUT} min-h-28 resize-y py-3`;
const FIELD_LABEL = 'text-sm text-zinc-600 dark:text-zinc-400';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

export default function CreateTicketForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<FormState>('idle');
  const [fieldError, setFieldError] = useState<FieldError>(null);

  const loading = state === 'loading';
  const canSubmit = subject.trim().length > 0 && body.trim().length > 0 && !loading;

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      setFieldError(null);
      return;
    }
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      setFile(null);
      setFieldError('tooLarge');
      return;
    }
    if (!ALLOWED_TYPES.includes(picked.type)) {
      setFile(null);
      setFieldError('badType');
      return;
    }
    setFile(picked);
    setFieldError(null);
  };

  const removeFile = () => {
    setFile(null);
    setFieldError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = useCallback(async () => {
    if (state === 'loading') return; // in-flight lock
    if (subject.trim().length === 0 || body.trim().length === 0) return;
    setState('loading');
    try {
      const form = new FormData();
      form.set('subject', subject.trim());
      form.set('body', body.trim());
      if (file) form.set('attachment', file);
      // No Content-Type header: the browser sets the multipart boundary.
      const res = await fetch('/api/tickets', { method: 'POST', body: form });
      if (!res.ok) throw new Error('ticket_create_failed');
      const payload = (await res.json()) as { id?: unknown };
      if (typeof payload.id !== 'string' || payload.id.length === 0) {
        throw new Error('ticket_id_missing');
      }
      router.push(`/support/${encodeURIComponent(payload.id)}`);
    } catch {
      setState('error');
    }
  }, [state, subject, body, file, router]);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-2">
        <span className={FIELD_LABEL}>{t('ticket.subjectLabel')}</span>
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={120}
          placeholder={t('ticket.subjectPlaceholder')}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={FIELD_LABEL}>{t('ticket.messageLabel')}</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={4000}
          placeholder={t('ticket.messagePlaceholder')}
          className={TEXTAREA}
        />
      </label>

      <div className="flex flex-col gap-2">
        <input
          id="ticket-attachment"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPickFile}
          className="sr-only"
        />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <span
              className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400"
              title={file.name}
            >
              {t('ticket.attachSelected', { name: file.name })}
            </span>
            <button
              type="button"
              onClick={removeFile}
              disabled={loading}
              className={SECONDARY}
            >
              {t('ticket.attachRemove')}
            </button>
          </div>
        ) : (
          <label htmlFor="ticket-attachment" className={`${SECONDARY} w-fit cursor-pointer`}>
            {t('ticket.attachCta')}
          </label>
        )}
      </div>

      {fieldError === 'tooLarge' && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t('ticket.attachTooLarge')}
        </p>
      )}
      {fieldError === 'badType' && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t('ticket.attachBadType')}
        </p>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-red-600 dark:text-red-400">{t('ticket.sendError')}</p>
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
        {loading ? t('ticket.submitLoading') : t('ticket.submit')}
      </button>
    </form>
  );
}

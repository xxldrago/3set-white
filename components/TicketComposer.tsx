'use client';

// In-thread reply composer (SUP-01/D-59, UI-SPEC §2/§3). Modeled on PayCta: an
// in-flight lock disables the CTA and swaps its label so a double tap cannot
// post twice (T-04-27). The reply is sent as multipart FormData with NO manual
// content type, so the browser sets the boundary (D-53/D-55) and an image-only
// reply is valid (body OR attachment). The BFF route reopens an answered/closed
// thread IN PLACE and never creates a ticket; success refreshes the RSC so the
// new message appears. A failure shows keyed copy + retry and RETAINS the typed
// text and selected file — never a raw provider/DB error (T-04-27/D-19).
import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type FormState = 'idle' | 'loading' | 'error';
type FieldError = 'tooLarge' | 'badType' | null;

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim border-line bg-panel text-foreground';
const TEXTAREA = `${INPUT} min-h-28 resize-y py-3`;
const FIELD_LABEL = 'text-sm text-muted';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';

export default function TicketComposer({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<FormState>('idle');
  const [fieldError, setFieldError] = useState<FieldError>(null);

  const loading = state === 'loading';
  const canSubmit = (body.trim().length > 0 || file !== null) && !loading;

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
    if (body.trim().length === 0 && !file) return;
    setState('loading');
    try {
      const form = new FormData();
      form.set('body', body.trim());
      if (file) form.set('attachment', file);
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/messages`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error('ticket_reply_failed');
      // Clear ONLY on success; a failure keeps the typed text and file.
      setBody('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setState('idle');
      router.refresh();
    } catch {
      setState('error');
    }
  }, [state, body, file, ticketId, router]);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
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
          id="ticket-reply-attachment"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPickFile}
          className="sr-only"
        />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <span
              className="min-w-0 flex-1 truncate text-sm text-muted"
              title={file.name}
            >
              {t('ticket.attachSelected', { name: file.name })}
            </span>
            <button type="button" onClick={removeFile} disabled={loading} className={SECONDARY}>
              {t('ticket.attachRemove')}
            </button>
          </div>
        ) : (
          <label
            htmlFor="ticket-reply-attachment"
            className={`${SECONDARY} w-fit cursor-pointer`}
          >
            {t('ticket.attachCta')}
          </label>
        )}
      </div>

      {fieldError === 'tooLarge' && (
        <p role="alert" className="text-sm text-red-600">
          {t('ticket.attachTooLarge')}
        </p>
      )}
      {fieldError === 'badType' && (
        <p role="alert" className="text-sm text-red-600">
          {t('ticket.attachBadType')}
        </p>
      )}

      {state === 'error' && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-red-600">{t('ticket.sendError')}</p>
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

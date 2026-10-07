'use client';

// Admin/support reply composer (UI-SPEC §7). The admin reply route is JSON
// (`{ body }`) rather than the cabinet's multipart FormData, so this is a small
// sibling of `TicketComposer` sharing its lock/retain/refresh discipline: the
// CTA locks in flight (a double tap cannot post twice), success refreshes the
// RSC, and a failure shows keyed copy + retry while RETAINING the typed text —
// never a raw provider/DB error (D-19). No attachment input: the admin reply
// route accepts text only.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

const TEXTAREA =
  'h-12 w-full min-h-28 resize-y rounded-2xl border border-line bg-panel px-4 py-3 text-base text-foreground placeholder:text-dim border-line bg-panel text-foreground';
const FIELD_LABEL = 'text-sm text-muted';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';

export default function AdminReplyComposer({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const canSubmit = body.trim().length > 0 && !loading;

  const submit = useCallback(async () => {
    if (loading) return;
    if (body.trim().length === 0) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) throw new Error('admin_ticket_reply_failed');
      // Clear ONLY on success; a failure keeps the typed text.
      setBody('');
      setLoading(false);
      router.refresh();
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [loading, body, ticketId, router]);

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

      {error && (
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

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
import { TICKET_TEMPLATES } from '@/lib/ticket-templates';

const TEXTAREA =
  'h-12 w-full min-h-28 resize-y rounded-2xl border border-line bg-panel px-4 py-3 text-base text-foreground placeholder:text-dim border-line bg-panel text-foreground';
const SELECT =
  'h-11 w-full rounded-2xl border border-line bg-panel px-3 text-sm text-foreground';
const FIELD_LABEL = 'text-sm text-muted';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-lg bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50 ';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-lg text-sm font-bold border border-solid border-line px-4 transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';

export default function AdminReplyComposer({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [templateError, setTemplateError] = useState(false);

  const canSubmit = body.trim().length > 0 && !loading;

  const insertTemplate = useCallback(() => {
    const template = TICKET_TEMPLATES.find((item) => item.id === templateId);
    if (!template) {
      setTemplateError(true);
      return;
    }
    setTemplateError(false);
    setBody((previous) =>
      (previous.trim().length > 0 ? `${previous.trimEnd()}\n\n${template.body}` : template.body).slice(
        0,
        4000,
      ),
    );
    setTemplateId('');
  }, [templateId]);

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
        setTemplateId('');
        setTemplateError(false);
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-2">
          <span className={FIELD_LABEL}>{t('admin.templatesLabel')}</span>
          <select
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setTemplateError(false);
            }}
            className={SELECT}
          >
            <option value="">{t('admin.templatesPlaceholder')}</option>
            {TICKET_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={insertTemplate}
          disabled={templateId.length === 0}
          className={SECONDARY}
        >
          {t('admin.templatesInsert')}
        </button>
      </div>

      {templateError && (
        <p role="alert" className="text-sm text-red-600">
          {t('admin.templatesPlaceholder')}
        </p>
      )}

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

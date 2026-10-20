'use client';

// Goodwill compensation from inside a ticket: pick days + reason, confirm, and
// the server credits `User.bonusDays`, writes the audit row and appends the
// support message. The request id is stable across retries (idempotent grant)
// and is rotated after a successful response.
import { useState } from 'react';
import AdminConfirmPanel from './AdminConfirmPanel';
import { t } from '@/lib/i18n';
import {
  COMPENSATION_MAX_DAYS,
  COMPENSATION_REASONS,
  compensationReasonLabel,
  type CompensationReason,
} from '@/lib/ticket-compensation-reasons';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6';
const LABEL = 'text-sm text-muted';
const INPUT =
  'h-11 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim';
const QUICK =
  'h-9 min-w-11 rounded-lg border border-solid border-line px-3 text-sm tabular-nums transition-colors hover:bg-foreground/5 disabled:opacity-50';

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export default function TicketCompensation({
  ticketId,
  bonusDays,
  used,
  maxDays,
}: {
  ticketId: string;
  bonusDays: number;
  used: number;
  maxDays: number;
}) {
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState<CompensationReason>('goodwill');
  const [comment, setComment] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);

  const value = Number(days);
  const remaining = Math.max(0, maxDays - used);
  const valid =
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= COMPENSATION_MAX_DAYS &&
    value <= remaining;
  const reasonLabel = compensationReasonLabel(reason);

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">
          {t('admin.ticketCompensationTitle')}
        </h2>
        <p className="text-sm text-muted">{t('admin.ticketCompensationHint')}</p>
        <p className="text-sm text-muted">{t('admin.ticketCompensationTrialHint')}</p>
      </div>

      <dl className="flex flex-col gap-1 text-sm tabular-nums text-muted">
        <div>
          <dd>{t('admin.ticketCompensationBalance', { days: bonusDays })}</dd>
        </div>
        <div>
          <dd>{t('admin.ticketCompensationUsed', { days: used, max: maxDays })}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className={LABEL}>{t('admin.ticketCompensationDays')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.min(COMPENSATION_MAX_DAYS, remaining)}
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            aria-label={t('admin.ticketCompensationDays')}
            className={INPUT}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {[1, 3, 7, 14, 30].map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => setDays(String(quick))}
              disabled={quick > remaining}
              className={QUICK}
            >
              {quick}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-2">
          <span className={LABEL}>{t('admin.ticketCompensationReason')}</span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as CompensationReason)}
            aria-label={t('admin.ticketCompensationReason')}
            className={INPUT}
          >
            {COMPENSATION_REASONS.map((option) => (
              <option key={option} value={option}>
                {compensationReasonLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className={LABEL}>{t('admin.ticketCompensationComment')}</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 500))}
            maxLength={500}
            rows={2}
            className={`${INPUT} h-auto min-h-20 resize-y py-3`}
          />
        </label>
      </div>

      {remaining <= 0 && (
        <p role="status" className="text-sm text-amber-600">
          {t('admin.ticketCompensationLimit')}
        </p>
      )}

      <AdminConfirmPanel
        variant="primary"
        triggerLabel={t('admin.ticketCompensationCta')}
        title={t('admin.ticketCompensationConfirmTitle')}
        body={t('admin.ticketCompensationConfirmBody', {
          days: valid ? value : '—',
          reason: reasonLabel,
        })}
        confirmLabel={t('admin.ticketCompensationConfirm')}
        errorLabel={t('admin.ticketCompensationError')}
        url={`/api/admin/tickets/${encodeURIComponent(ticketId)}/compensate`}
        payload={{
          days: value,
          reason,
          comment: comment.trim(),
          requestId,
        }}
        disabled={!valid}
        onSuccess={() => {
          setRequestId(newRequestId());
          setComment('');
        }}
      />
    </section>
  );
}

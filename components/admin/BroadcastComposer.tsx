'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminConfirmPanel from './AdminConfirmPanel';
import BroadcastStatusChip from './BroadcastStatusChip';
import { t, tp } from '@/lib/i18n';

type SegmentOption = { segment: string; size: number; chatCount: number };

type Result = { status?: string; total?: number; sent?: number; failed?: number };

export default function BroadcastComposer({ segments }: { segments: SegmentOption[] }) {
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const fetchCount = useCallback(async (seg: string) => {
    setCountLoading(true);
    try {
      const res = await fetch(`/api/admin/segments/${encodeURIComponent(seg)}/count`);
      if (!res.ok) { setCount(null); return; }
      const data = await res.json();
      setCount(typeof data.count === 'number' ? data.count : null);
    } catch {
      setCount(null);
    } finally {
      setCountLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount('all');
  }, [fetchCount]);

  const onAudienceChange = useCallback((value: string) => {
    setAudience(value);
    fetchCount(value);
  }, [fetchCount]);

  const onSuccess = useCallback((next: unknown) => {
    const value = next as Result;
    setResult(value);
    if (value.status === 'sent') setBody('');
  }, []);

  const trimmed = body.trim();
  const payload: { body: string; segment?: string } = { body: trimmed };
  if (audience !== 'all') payload.segment = audience;

  const disabled = !trimmed || countLoading || count === 0 || count === null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line p-6 border-line">
      <label htmlFor="broadcast-body" className="text-sm font-semibold">{t('admin.broadcastLabel')}</label>
      <textarea id="broadcast-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} placeholder={t('admin.broadcastPlaceholder')} className="min-h-28 resize-y rounded-xl border border-line p-3 border-line" />

      <label htmlFor="broadcast-audience" className="text-sm font-semibold">{t('admin.broadcastAudience')}</label>
      <select
        id="broadcast-audience"
        value={audience}
        onChange={(e) => onAudienceChange(e.target.value)}
        className="h-11 rounded-xl border border-line p-2"
      >
        <option value="all">{t('admin.broadcastAudienceAll')}</option>
        {segments.map((s) => (
          <option key={s.segment} value={s.segment}>
            {s.segment} ({s.size})
          </option>
        ))}
      </select>

      <div role="status" className="text-sm text-muted">
        {countLoading
          ? t('admin.broadcastCountLoading')
          : count === null
            ? ''
            : t('admin.broadcastCount', { n: count })}
      </div>

      <AdminConfirmPanel
        variant="primary"
        triggerLabel={t('admin.broadcastCta')}
        title={t('admin.broadcastConfirmTitle')}
        body={t('admin.broadcastConfirmBody')}
        confirmLabel={t('admin.broadcastConfirmCta')}
        errorLabel={t('admin.broadcastError')}
        url="/api/admin/broadcast"
        payload={payload}
        onSuccess={onSuccess}
        disabled={disabled}
        triggerClassName="flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-lime disabled:opacity-50"
      />
      {result && <div role="status" className="flex items-center gap-3"><BroadcastStatusChip status={result.status ?? 'unknown'} />{result.failed ? <button type="button" onClick={() => setResult(null)} className="text-sm underline">{t('common.retry')}</button> : null}</div>}
    </section>
  );
}

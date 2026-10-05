'use client';

import { useCallback, useState } from 'react';
import AdminConfirmPanel from './AdminConfirmPanel';
import BroadcastStatusChip from './BroadcastStatusChip';
import { t } from '@/lib/i18n';

type Result = { status?: string; total?: number; sent?: number; failed?: number };
export default function BroadcastComposer() {
  const [body, setBody] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const onSuccess = useCallback((next: unknown) => {
    const value = next as Result;
    setResult(value);
    if (value.status === 'sent') setBody('');
  }, []);
  const trimmed = body.trim();
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15">
      <label htmlFor="broadcast-body" className="text-sm font-semibold">{t('admin.broadcastLabel')}</label>
      <textarea id="broadcast-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} placeholder={t('admin.broadcastPlaceholder')} className="min-h-28 resize-y rounded-xl border border-black/10 p-3 dark:border-white/15" />
      <AdminConfirmPanel
        variant="primary"
        triggerLabel={t('admin.broadcastCta')}
        title={t('admin.broadcastConfirmTitle')}
        body={t('admin.broadcastConfirmBody')}
        confirmLabel={t('admin.broadcastConfirmCta')}
        errorLabel={t('admin.broadcastError')}
        url="/api/admin/broadcast"
        payload={{ body: trimmed }}
        onSuccess={onSuccess}
        disabled={!trimmed}
        triggerClassName="flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-background disabled:opacity-50"
      />
      {result && <div role="status" className="flex items-center gap-3"><BroadcastStatusChip status={result.status ?? 'unknown'} />{result.failed ? <button type="button" onClick={() => setResult(null)} className="text-sm underline">{t('common.retry')}</button> : null}</div>}
    </section>
  );
}

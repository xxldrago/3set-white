'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import type { ThresholdsData } from '@/lib/analytics/rfm-service';

export default function SegmentThresholdsForm({ initial }: { initial: ThresholdsData }) {
  const [values, setValues] = useState<ThresholdsData>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  function update<K extends keyof ThresholdsData>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: Number(v) }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      const res = await fetch('/api/admin/segments/thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('bad');
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof ThresholdsData; label: string }[] = [
    { key: 'newPayerDays', label: t('admin.segmentsThresholdNewPayerDays') },
    { key: 'activeDays', label: t('admin.segmentsThresholdActiveDays') },
    { key: 'atRiskDays', label: t('admin.segmentsThresholdAtRiskDays') },
    { key: 'churnedDays', label: t('admin.segmentsThresholdChurnedDays') },
    { key: 'vipPercent', label: t('admin.segmentsThresholdVipPercent') },
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{f.label}</span>
          <input
            type="number"
            min={1}
            step={1}
            value={values[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            className="rounded-xl border border-line p-2"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={saving}
        className="flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-lime disabled:opacity-50"
      >
        {saving ? t('admin.segmentsSaving') : t('admin.segmentsSave')}
      </button>
      {saved && <div role="status" className="text-sm text-muted">{t('admin.segmentsSaved')}</div>}
      {error && <div role="status" className="text-sm text-muted">{t('admin.segmentsSaveError')}</div>}
    </form>
  );
}

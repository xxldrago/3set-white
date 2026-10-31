import Link from 'next/link';
import { Sprout, Sparkles, Crown, Activity, AlertTriangle, UserX, Moon } from 'lucide-react';
import { loadSegments, loadThresholds } from '@/lib/analytics/rfm-service';
import { t, tp } from '@/lib/i18n';
import { SEGMENT_SLUGS } from '@/lib/analytics/rfm';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'trial-only': Sprout,
  'new payer': Sparkles,
  'VIP': Crown,
  'active': Activity,
  'at-risk': AlertTriangle,
  'churned': UserX,
  'sleeping': Moon,
};

export default async function SegmentCards() {
  let segments;
  let thresholds;
  try {
    [segments, thresholds] = await Promise.all([loadSegments(), loadThresholds()]);
  } catch {
    return (
      <div className="rounded-2xl border border-line p-6 text-sm text-muted">
        {t('common.errorLoad')}
      </div>
    );
  }

  if (segments.total === 0) {
    return (
      <div className="rounded-2xl border border-line p-6 text-sm text-muted" role="status">
        {t('admin.segmentsEmpty')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {segments.segments.map((s) => {
        const Icon = ICONS[s.segment] ?? Activity;
        const rule = segmentRule(s.segment, thresholds);
        return (
          <Link
            key={s.segment}
            href={`/admin/users?segment=${encodeURIComponent(s.segment)}`}
            className="flex flex-col gap-2 rounded-2xl border border-line p-4 hover:bg-foreground/5"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-foreground" />
              <span className="text-sm font-semibold text-foreground">{segmentLabel(s.segment)}</span>
            </div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{s.size}</div>
            <div className="text-xs text-muted">
              {t('admin.segmentsCardChat', { n: s.chatCount })}
            </div>
            <div className="text-xs text-muted">{rule}</div>
          </Link>
        );
      })}
    </div>
  );
}

function segmentLabel(slug: string): string {
  switch (slug) {
    case 'trial-only': return t('admin.segmentTrialOnly');
    case 'new payer': return t('admin.segmentNewPayer');
    case 'VIP': return t('admin.segmentVip');
    case 'active': return t('admin.segmentActive');
    case 'at-risk': return t('admin.segmentAtRisk');
    case 'churned': return t('admin.segmentChurned');
    case 'sleeping': return t('admin.segmentSleeping');
    default: return slug;
  }
}

function segmentRule(slug: string, th: { newPayerDays: number; activeDays: number; atRiskDays: number; churnedDays: number; vipPercent: number }): string {
  switch (slug) {
    case 'trial-only': return t('admin.segmentTrialOnlyRule');
    case 'new payer': return t('admin.segmentNewPayerRule', { days: th.newPayerDays });
    case 'VIP': return t('admin.segmentVipRule', { pct: th.vipPercent });
    case 'active': return t('admin.segmentActiveRule', { days: th.activeDays });
    case 'at-risk': return t('admin.segmentAtRiskRule', { from: th.activeDays, to: th.atRiskDays });
    case 'churned': return t('admin.segmentChurnedRule', { days: th.churnedDays });
    case 'sleeping': return t('admin.segmentSleepingRule', { days: th.churnedDays });
    default: return '';
  }
}

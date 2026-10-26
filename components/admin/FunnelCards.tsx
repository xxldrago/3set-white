// Admin analytics — block: payment funnel (ANL-08, D-02/D-05/D-06). Async
// server component with its own try/catch (D-05: every block degrades alone).
// Windowed by ?period; the meta reuses the shared «{n} дн. · МСК» key. Four
// cards in GRID in the fixed funnel order — the first card is the funnel base
// and has no rate, cards 2-4 carry conversion + drop-off from the PREVIOUS
// step. Exact rationals arrive in the payload; the ×100 and the Intl
// formatting happen here. A null rate (zero previous step, empty funnel)
// renders «—» — never 0 %, while a real zero count renders truthfully.
import { t } from '@/lib/i18n';
import { loadFunnel, type FunnelData } from '@/lib/analytics/service';
import type { FunnelStep } from '@/lib/analytics/funnel';
import { MetricCard, CARD, GRID } from './MetricCard';

const countFmt = new Intl.NumberFormat('ru-RU');
const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/**
 * Step labels via a literal switch: the i18n suite only registers keys that
 * appear as quotes directly inside a t() call, so a Record map would leave
 * every label unregistered (and fail the unused-key scan).
 */
function funnelStepLabel(step: FunnelStep): string {
  switch (step) {
    case 'pending':
      return t('admin.analyticsFunnelStepPending');
    case 'paid':
      return t('admin.analyticsFunnelStepPaid');
    case 'provisioning':
      return t('admin.analyticsFunnelStepProvisioning');
    case 'provisioned':
      return t('admin.analyticsFunnelStepProvisioned');
  }
}

export default async function FunnelCards({ period }: { period: 7 | 30 | 90 }) {
  let data: FunnelData;
  try {
    data = await loadFunnel(period);
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">
        {t('admin.analyticsFunnelCardsTitle')}
      </h3>
      <span className="text-xs text-muted">{t('admin.analyticsWindowDays', { n: period })}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className={GRID}>
        {data.steps.map((step, index) => (
          <MetricCard
            key={step.step}
            size="compact"
            label={funnelStepLabel(step.step)}
            value={countFmt.format(step.count)}
            sub={
              index === 0
                ? t('admin.analyticsFunnelBaseSub')
                : t('admin.analyticsFunnelConvSub', {
                    conv: step.conversion === null ? '—' : pct.format(step.conversion * 100),
                    drop: step.dropOff === null ? '—' : pct.format(step.dropOff * 100),
                  })
            }
          />
        ))}
      </div>
    </div>
  );
}

import { t } from '@/lib/i18n';
import { loadPayerCohorts, loadRegistrationCohorts } from '@/lib/analytics/service';

interface CohortMatrixProps {
  kind: 'registration' | 'payer';
  channel: string;
  deviceBucket?: string;
}

const CHANNELS = ['all', 'referral', 'promo', 'organic'] as const;
const DEVICES = ['all', '1', '2', '3', '4', '5+'] as const;

function whitelistChannel(v: string | undefined): string {
  return (CHANNELS as readonly string[]).includes(v ?? '') ? (v as string) : 'all';
}
function whitelistDevice(v: string | undefined): string {
  return (DEVICES as readonly string[]).includes(v ?? '') ? (v as string) : 'all';
}

const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const countFmt = new Intl.NumberFormat('ru-RU');
const moneyFmt = new Intl.NumberFormat('ru-RU');

type RegCohort = { month: string; size: number; retained: (number | null)[] };
type PayCohort = { month: string; size: number; baseRevenue: number | null; revenue: (number | null)[] };

function renderRegCells(cohort: RegCohort) {
  const size = cohort.size;
  return cohort.retained.map((cell, i) => {
    const isEmpty = cell === null || size === 0;
    const alpha = isEmpty ? 0 : Math.min(1, (cell as number) / size) * 0.32;
    return (
      <td key={i} className="px-2 py-2 text-center whitespace-nowrap">
        <div
          className="rounded-lg px-2 py-1"
          style={{
            background: isEmpty
              ? 'transparent'
              : `linear-gradient(180deg, rgba(183,255,69,0.04), rgba(183,255,69,${alpha}))`,
          }}
        >
          {isEmpty ? (
            <span className="text-muted">—</span>
          ) : (
            <>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {pctFmt.format(((cell as number) / size) * 100)}%
              </span>
              <span className="text-xs tabular-nums text-muted">
                {' '}
                ({countFmt.format(cell as number)}/{countFmt.format(size)})
              </span>
            </>
          )}
        </div>
      </td>
    );
  });
}

function renderPayCells(cohort: PayCohort) {
  const size = cohort.size;
  const base = cohort.baseRevenue;
  return cohort.revenue.map((rev, i) => {
    const isEmpty = rev === null || base === null || base === 0;
    const ratio = isEmpty ? 0 : (rev as number) / (base as number);
    const alpha = isEmpty ? 0 : Math.min(1, ratio) * 0.32;
    return (
      <td key={i} className="px-2 py-2 text-center whitespace-nowrap">
        <div
          className="rounded-lg px-2 py-1"
          style={{
            background: isEmpty
              ? 'transparent'
              : `linear-gradient(180deg, rgba(183,255,69,0.04), rgba(183,255,69,${alpha}))`,
          }}
        >
          {isEmpty ? (
            <span className="text-muted">—</span>
          ) : (
            <>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {pctFmt.format(ratio * 100)}%
              </span>
              <span className="text-xs tabular-nums text-muted">
                {' '}
                ({moneyFmt.format(Math.round(rev as number))} ₽)
              </span>
            </>
          )}
        </div>
      </td>
    );
  });
}

export default async function CohortMatrix({ kind, channel, deviceBucket }: CohortMatrixProps) {
  const ch = whitelistChannel(channel);
  const dev = whitelistDevice(deviceBucket);

  const heading =
    kind === 'registration'
      ? t('admin.analyticsCohortRegMatrixTitle')
      : t('admin.analyticsCohortPayerMatrixTitle');

  type RegData = { cohorts: RegCohort[] };
  type PayData = { cohorts: PayCohort[] };

  let data: RegData | PayData;
  try {
    if (kind === 'registration') {
      data = await loadRegistrationCohorts(ch as never);
    } else {
      data = await loadPayerCohorts(ch as never, dev as never);
    }
  } catch {
    return (
      <div className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="text-base font-semibold text-foreground">{heading}</h3>
        <p className="mt-2 text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const cohorts = data.cohorts;
  const allEmpty = cohorts.every((c) => c.size === 0);

  if (allEmpty) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">{heading}</h3>
          <span className="text-xs text-muted">{t('admin.analyticsCohortMeta')}</span>
        </div>
        <p className="mt-4 text-sm text-muted">{t('admin.analyticsCohortEmpty')}</p>
      </div>
    );
  }

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={heading}
      className="overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
    >
      <table className="w-full min-w-[60rem] text-left text-sm">
        <caption className="sr-only">{t('admin.analyticsCohortMatrixCaption')}</caption>
        <thead className="bg-panel text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              {t('admin.analyticsTableMonth')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {t('admin.analyticsCohortSize')}
            </th>
            {Array.from({ length: 12 }, (_, i) => (
              <th key={i} scope="col" className="px-2 py-3 text-center font-semibold">
                M{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cohorts.map((cohort) => (
            <tr key={cohort.month}>
              <th scope="row" className="px-4 py-3 font-normal text-muted whitespace-nowrap">
                {cohort.month.slice(5, 7)}.{cohort.month.slice(0, 4)}
              </th>
              <td className="px-4 py-3 text-right tabular-nums">
                {countFmt.format(cohort.size)}
              </td>
              {kind === 'registration'
                ? renderRegCells(cohort as RegCohort)
                : renderPayCells(cohort as PayCohort)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

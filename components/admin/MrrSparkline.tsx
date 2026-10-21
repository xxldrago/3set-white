// Admin analytics — block 3: the MRR sparkline (UI-SPEC §5.5). Window =
// the selected period's MSK days. Pure-SVG server component: no 'use client',
// no chart library, no tooltips and NO last-point marker — under
// preserveAspectRatio="none" a dot would render as an ellipse, so the latest
// value is stated as text in the header instead. The aria-hidden SVG is
// paired with an sr-only table (the single source of truth for AT).
//
// x follows the WINDOW DAY INDEX, not data spacing: days with no daily_metrics
// row simply have no point, so a gap renders as a longer segment — never a
// collapse and never an invented zero (D-12; the live today point is appended
// by the loader).
import { t } from '@/lib/i18n';
import { loadSparkline } from '@/lib/analytics/service';

const money = new Intl.NumberFormat('ru-RU');

const W = 320;
const H = 64;
const BASE_Y = H - 4; // 60 — the area drops down to here
const TOP_Y = 4; // min–max plot headroom

/** "YYYY-MM-DD" → absolute UTC-midnight millis (window index arithmetic only). */
function dayMs(label: string): number {
  return Date.parse(`${label}T00:00:00Z`);
}

const DAY_MS = 86_400_000;

export default async function MrrSparkline({ period }: { period: 7 | 30 | 90 }) {
  let points: { day: string; mrr: number }[];
  try {
    ({ points } = await loadSparkline(period));
  } catch {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-foreground">{t('admin.analyticsSparkTitle')}</h3>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-xl font-semibold text-foreground">{t('admin.analyticsSparkTitle')}</h3>
       {points.length > 0 && (
         <span className="text-xs text-muted">
           {t('admin.analyticsSparkMeta', { n: period, value: money.format(Math.round(points[points.length - 1]!.mrr)) })}
         </span>
       )}
    </div>
  );

  // «A single dot is not a trend» — no flat zero line is fabricated.
  if (points.length < 2) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-sm text-muted">{t('admin.analyticsSparkEmpty')}</p>
        </div>
      </div>
    );
  }

  const values = points.map((p) => p.mrr);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // x is indexed across the WHOLE window (last point ≈ today is the window
  // end), so leading data gaps keep their true width instead of being trimmed.
  const maxIndexMs = dayMs(points[points.length - 1]!.day);
  const fromMs = maxIndexMs - (period - 1) * DAY_MS; // window start
  const spanMs = Math.max(maxIndexMs - fromMs, DAY_MS); // never divide by 0

  // y scaling: min–max with an explicit degenerate branch — equal positive
  // values sit on the vertical centre, a truly zero series on the bottom edge.
  function yOf(v: number): number {
    if (max === min) return max === 0 ? BASE_Y : (BASE_Y + TOP_Y) / 2;
    return BASE_Y - ((v - min) / (max - min)) * (BASE_Y - TOP_Y);
  }
  function xOf(day: string): number {
    return ((dayMs(day) - fromMs) / spanMs) * W;
  }

  const coords = points.map((p) => `${xOf(p.day)},${yOf(p.mrr)}`);
  const area = `M${coords[0]} L${coords.join(' L')} L${coords[coords.length - 1]!.split(',')[0]},${BASE_Y} Z`;

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className="rounded-2xl border border-line bg-panel p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-16 w-full"
          aria-hidden="true"
          focusable="false"
        >
          <path d={area} className="fill-lime" fillOpacity={0.35} />
          <polyline
            points={coords.join(' ')}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-green"
          />
        </svg>
      </div>

      {/* The SVG is aria-hidden; this table carries the same numbers. */}
      <table className="sr-only">
        <caption>{t('admin.analyticsSparkTable')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('admin.analyticsTableDate')}</th>
            <th scope="col">{t('admin.analyticsTableMrr')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{p.day.split('-').reverse().join('.')}</th>
              <td>{money.format(Math.round(p.mrr))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

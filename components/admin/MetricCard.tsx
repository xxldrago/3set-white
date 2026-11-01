// Shared metric card, extracted from RevenuePanel (Phase 7 analytics work,
// UI-SPEC §5.3). The rendered default anatomy is behaviour-preserving:
// `default` keeps the shipped 24px vertical card /admin uses, `hero` is the
// 30px horizontal band the analytics MRR KPI and the /admin teaser share,
// `compact` is the same vertical anatomy at 20px for the supporting KPIs.
// CARD/GRID move with the card so every importer spells the same strings.
export const CARD = 'flex flex-col gap-2 rounded-2xl border border-line p-6 border-line';
export const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
// D-02 locks the funnel to four cards in one row; the shared three-up GRID
// would wrap the final `provisioned` step onto its own row. Every consumer
// (the block and the page's Suspense fallback) must use the same constant so
// the skeleton does not reflow into the grid on hydration.
export const FUNNEL_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4';

export interface MetricCardDelta {
  abs?: string | number;
  pct?: string | number | null;
  status?: 'ok' | 'no-base' | 'incomparable';
  baselineLabel?: string;
}

export interface MetricCardQuality {
  excluded: number;
  events?: any[];
}

export function MetricCard({
  label,
  value,
  sub,
  size = 'default',
  delta,
  quality,
}: {
  label: string;
  value: string;
  sub?: string;
  size?: 'hero' | 'default' | 'compact';
  delta?: MetricCardDelta;
  quality?: MetricCardQuality;
}) {
  const hasQualityBadge = quality && quality.excluded > 0;
  
  if (size === 'hero') {
    return (
      <div className={`${CARD} sm:col-span-2 sm:flex-row sm:items-end sm:justify-between`}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-muted">{label}</span>
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{value}</span>
          {delta && delta.status === 'ok' && delta.abs !== undefined && (
            <span className="text-xs tabular-nums text-muted">
              {typeof delta.abs === 'number' ? (delta.abs >= 0 ? `+${delta.abs}` : delta.abs) : delta.abs}
              {delta.pct !== null && delta.pct !== undefined && ` (${delta.pct})`}
              {delta.baselineLabel ? ` ${delta.baselineLabel}` : ''}
            </span>
          )}
          {delta && delta.status === 'no-base' && (
            <span className="text-xs text-muted">— нет базы</span>
          )}
          {delta && delta.status === 'incomparable' && (
            <span className="text-xs text-muted">сравнение недоступно</span>
          )}
          {hasQualityBadge && (
            <span className="rounded-lg px-2 py-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" title={quality.events?.[0]?.reason}>
              Данные неполные ({quality.excluded})
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={CARD}>
      <span className="text-sm text-muted">{label}</span>
      <span
        className={
          size === 'compact'
            ? 'text-xl font-semibold tabular-nums text-foreground'
            : 'text-2xl font-semibold tabular-nums text-foreground'
        }
      >
        {value}
      </span>
      {delta && delta.status === 'ok' && delta.abs !== undefined && (
        <span className="text-xs tabular-nums text-muted">
          {typeof delta.abs === 'number' ? (delta.abs >= 0 ? `+${delta.abs}` : delta.abs) : delta.abs}
          {delta.pct !== null && delta.pct !== undefined && ` (${delta.pct})`}
          {delta.baselineLabel ? ` ${delta.baselineLabel}` : ''}
        </span>
      )}
      {delta && delta.status === 'no-base' && (
        <span className="text-xs text-muted">— нет базы</span>
      )}
      {delta && delta.status === 'incomparable' && (
        <span className="text-xs text-muted">сравнение недоступно</span>
      )}
      {sub && !hasQualityBadge && <span className="text-xs text-muted">{sub}</span>}
      {hasQualityBadge && (
        <span className="rounded-lg px-2 py-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 w-fit" title={quality.events?.[0]?.reason}>
          Данные неполные ({quality.excluded})
        </span>
      )}
    </div>
  );
}

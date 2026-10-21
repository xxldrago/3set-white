// Shared metric card, extracted from RevenuePanel (Phase 7 analytics work,
// UI-SPEC §5.3). The rendered default anatomy is behaviour-preserving:
// `default` keeps the shipped 24px vertical card /admin uses, `hero` is the
// 30px horizontal band the analytics MRR KPI and the /admin teaser share,
// `compact` is the same vertical anatomy at 20px for the supporting KPIs.
// CARD/GRID move with the card so every importer spells the same strings.
export const CARD = 'flex flex-col gap-2 rounded-2xl border border-line p-6 border-line';
export const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';

export function MetricCard({
  label,
  value,
  sub,
  size = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  size?: 'hero' | 'default' | 'compact';
}) {
  if (size === 'hero') {
    return (
      <div className={`${CARD} sm:col-span-2 sm:flex-row sm:items-end sm:justify-between`}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-muted">{label}</span>
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </div>
        <span className="text-3xl font-semibold tabular-nums text-foreground">{value}</span>
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
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

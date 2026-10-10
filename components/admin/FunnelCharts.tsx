'use client';

// Funnel charts with date filtering (admin + partner dashboards share it).
// Presets (7/30/90 days) plus a custom range; granularity day/week/month/
// year. Series come from the scoped stats endpoint (`endpoint` prop):
// admin passes the global route, the partner page the own-scope route.
// Pure SVG bars (no chart deps): clicks/registrations/purchases as bars,
// revenue as a line with the scale on the side.
import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

type Granularity = 'day' | 'week' | 'month' | 'year';

interface Bucket {
  start: string;
  clicks: number;
  registrations: number;
  purchases: number;
  revenue: number;
  devices: number;
}

interface StatsPayload {
  stats: { clicks: number; registrations: number; purchases: number; revenue: number; devices: number };
  series: Bucket[];
}

const PRESETS = [7, 30, 90] as const;

const CARD = 'flex flex-col gap-2 rounded-2xl border border-line p-4';
const SEG =
  'h-10 flex-1 whitespace-nowrap rounded-full px-3 text-sm transition-colors disabled:opacity-50';
const SEG_ACTIVE = `${SEG} bg-foreground text-lime`;
const SEG_IDLE = `${SEG} border border-solid border-line hover:bg-foreground/5 border-line`;
const INPUT =
  'h-11 w-full rounded-2xl border border-line bg-panel px-3 text-sm text-foreground disabled:opacity-50';

const money = new Intl.NumberFormat('ru-RU');

function isoDay(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function shortLabel(iso: string, granularity: Granularity): string {
  const date = new Date(iso);
  if (granularity === 'year') return String(date.getFullYear());
  if (granularity === 'month')
    return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getFullYear()).slice(2)}`;
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function FunnelCharts({ endpoint }: { endpoint: string }) {
  const [preset, setPreset] = useState<number | null>(30);
  const [from, setFrom] = useState(isoDay(-30));
  const [to, setTo] = useState(isoDay(0));
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [data, setData] = useState<StatsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch-on-change via promise chains: the request fires on mount and on
  // every filter change; a newer request aborts the previous one so a fast
  // filter dance cannot race stale data. State updates happen only inside
  // the async continuations (stale-while-revalidate: the previous series
  // stays visible until the new one lands).
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(new Date(to).getTime() + 86_400_000 - 1).toISOString(),
      granularity,
    });
    fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('stats_failed');
        if (controller.signal.aborted) return;
        setData((await res.json()) as StatsPayload);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [endpoint, from, to, granularity]);

  const pickPreset = (days: number) => {
    setPreset(days);
    setFrom(isoDay(-days));
    setTo(isoDay(0));
  };

  const maxCount = Math.max(1, ...(data?.series.map((b) => Math.max(b.clicks, b.registrations, b.purchases)) ?? [1]));
  const maxRevenue = Math.max(1, ...(data?.series.map((b) => b.revenue) ?? [1]));
  // Adaptive axis: at most 8 evenly spaced labels so dates never overlap on
  // narrow screens (year granularity always fits — 1-2 labels per year cap).
  const labelStep = Math.max(1, Math.ceil((data?.series.length ?? 1) / 8));
  const W = 560;
  const H = 180;
  const PAD = 28;
  const n = Math.max(1, data?.series.length ?? 1);
  const slot = (W - PAD * 2) / n;
  const barW = Math.max(2, Math.min(18, slot / 4));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => pickPreset(days)}
            aria-pressed={preset === days}
            className={preset === days ? SEG_ACTIVE : SEG_IDLE}
          >
            {t('admin.statsLastDays', { n: days })}
          </button>
        ))}
        {(
          [
            ['day', t('admin.granDay')],
            ['week', t('admin.granWeek')],
            ['month', t('admin.granMonth')],
            ['year', t('admin.granYear')],
          ] as [Granularity, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setGranularity(value)}
            aria-pressed={granularity === value}
            className={granularity === value ? SEG_ACTIVE : SEG_IDLE}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('admin.statsFrom')}
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => {
              setFrom(event.target.value);
              setPreset(null);
            }}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('admin.statsTo')}
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => {
              setTo(event.target.value);
              setPreset(null);
            }}
            className={INPUT}
          />
        </label>
      </div>

      {failed && (
        <p role="alert" className="text-sm text-red-600">
          {t('common.errorLoad')}
        </p>
      )}
      {!data && !failed && (
        <div className="h-44 animate-pulse rounded-2xl bg-foreground/5" aria-hidden />
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ['clicks', data.stats.clicks, t('admin.funnelClicks')],
                ['registrations', data.stats.registrations, t('admin.funnelRegistrations')],
                ['purchases', data.stats.purchases, t('admin.funnelPurchases')],
                ['revenue', `${money.format(data.stats.revenue)} ₽`, t('admin.funnelRevenue')],
                ['devices', data.stats.devices, t('admin.funnelDevices')],
              ] as const
            ).map(([key, value, label]) => (
              <div key={key} className={CARD}>
                <span className="text-xs text-muted">{label}</span>
                <span className="truncate text-xl font-semibold tabular-nums text-foreground">
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line p-4">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="min-h-44 w-full"
              role="img"
              aria-label={t('admin.funnelChart')}
            >
              {[0.25, 0.5, 0.75, 1].map((fraction) => {
                const y = PAD + (H - PAD * 2) * (1 - fraction);
                return (
                  <line
                    key={fraction}
                    x1={PAD}
                    x2={W - PAD}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.1}
                  />
                );
              })}
              {data.series.map((bucket, index) => {
                const x = PAD + slot * index + slot / 2;
                const base = H - PAD;
                const bars: { value: number; max: number; color: string }[] = [
                  { value: bucket.clicks, max: maxCount, color: '#0c4f36' },
                  { value: bucket.registrations, max: maxCount, color: '#b7ff45' },
                  { value: bucket.purchases, max: maxCount, color: '#e4dfd1' },
                ];
                return (
                  <g key={bucket.start}>
                    {bars.map((bar, position) => {
                      const height = Math.max(
                        bar.value > 0 ? 2 : 0,
                        ((H - PAD * 2) * bar.value) / bar.max,
                      );
                      return (
                        <rect
                          key={position}
                          x={x - (barW * 3) / 2 + position * barW}
                          y={base - height}
                          width={barW - 1}
                          height={height}
                          rx={1}
                          fill={bar.color}
                        />
                      );
                    })}
                    {index % labelStep === 0 && (
                      <text
                        x={x}
                        y={H - 8}
                        textAnchor="middle"
                        fontSize={9}
                        fill="currentColor"
                        opacity={0.6}
                      >
                        {shortLabel(bucket.start, granularity)}
                      </text>
                    )}
                  </g>
                );
              })}
              {data.series.length > 0 && (
                <polyline
                  points={data.series
                    .map((bucket, index) => {
                      const x = PAD + slot * index + slot / 2;
                      const y = H - PAD - ((H - PAD * 2) * bucket.revenue) / maxRevenue;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#0e1512"
                  strokeWidth={1.5}
                />
              )}
            </svg>
            <p className="mt-2 text-xs text-muted">{t('admin.funnelLegend')}</p>
          </div>
        </>
      )}
    </div>
  );
}

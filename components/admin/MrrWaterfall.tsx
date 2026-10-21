// Admin analytics — block 2: the MRR waterfall (UI-SPEC §5.4). Trailing
// 6-MSK-month signed grouped-bar chart around a shared zero line: new ↑ /
// expansion ↑ / contraction ↓ / churned ↓ + a net marker (tick + dot) per
// group. Pure-SVG server component: no 'use client', no chart library, no
// JS tooltips — every mark carries a native <title>, and the aria-hidden
// SVG is paired with an sr-only data table (the single source of truth for
// assistive tech).
//
// Token colours only (fill-lime/stroke-green/fill-muted/fill-foreground,
// stroke-line-2 zero line) — no hex literals, no red, no amber: sign is
// carried by direction relative to the zero line, not hue.
import { t } from '@/lib/i18n';
import { loadWaterfall } from '@/lib/analytics/service';
import type { WaterfallRow } from '@/lib/analytics/waterfall';

const money = new Intl.NumberFormat('ru-RU');

const W = 640;
const H = 260;
const PAD_L = 64;
const PAD_R = 8;
const PAD_T = 16;
const PAD_B = 32; // plot height = H − PAD_T − PAD_B = 212
const ZERO_Y = PAD_T + 106; // 122 — the zero line
const MAX_BAR = 106 - 6; // 100 — a full-scale bar spans 100 user units
const BAR_W = 12;
const SUB_SLOTS = 5;

/** "2026-07-01" → "07.26" (numeric month axis, MM.YY). */
function monthLabel(label: string): string {
  return `${label.slice(5, 7)}.${label.slice(2, 4)}`;
}

/** "2026-07-01" → "07.2026" (native <title> and the sr-only table). */
function monthFull(label: string): string {
  return `${label.slice(5, 7)}.${label.slice(0, 4)}`;
}

const LEGEND: { key: 'analyticsWfNew' | 'analyticsWfExpansion' | 'analyticsWfContraction' | 'analyticsWfChurned' | 'analyticsWfNet'; swatch: string }[] = [
  { key: 'analyticsWfNew', swatch: 'h-2 w-2 rounded-sm bg-lime border border-green' },
  { key: 'analyticsWfExpansion', swatch: 'h-2 w-2 rounded-sm bg-green' },
  { key: 'analyticsWfContraction', swatch: 'h-2 w-2 rounded-sm bg-muted' },
  { key: 'analyticsWfChurned', swatch: 'h-2 w-2 rounded-sm bg-foreground' },
  { key: 'analyticsWfNet', swatch: 'h-0.5 w-3 rounded-full bg-foreground' },
];

/** Literal keyed legend label — never an interpolated key (i18n usage scan). */
function legendLabel(key: 'analyticsWfNew' | 'analyticsWfExpansion' | 'analyticsWfContraction' | 'analyticsWfChurned' | 'analyticsWfNet'): string {
  switch (key) {
    case 'analyticsWfNew':
      return t('admin.analyticsWfNew');
    case 'analyticsWfExpansion':
      return t('admin.analyticsWfExpansion');
    case 'analyticsWfContraction':
      return t('admin.analyticsWfContraction');
    case 'analyticsWfChurned':
      return t('admin.analyticsWfChurned');
    case 'analyticsWfNet':
      return t('admin.analyticsWfNet');
  }
}

/** One month group: four signed component bars + the net marker. */
function MonthGroup({ row, index, slot, maxAbs }: { row: WaterfallRow; index: number; slot: number; maxAbs: number }) {
  const groupX = PAD_L + slot * index;
  const subSlot = slot / SUB_SLOTS;
  const barH = (value: number): number => (maxAbs > 0 ? (Math.abs(value) / maxAbs) * MAX_BAR : 0);
  const yOf = (value: number): number => (maxAbs > 0 ? ZERO_Y - (value / maxAbs) * MAX_BAR : ZERO_Y);
  const netY = yOf(row.net);
  const tickTitle = `${t('admin.analyticsWfNet')} · ${monthFull(row.label)} — ${money.format(row.net)} ₽`;

  const bars: { value: number; up: boolean; className: string; label: string }[] = [
    { value: row.new, up: true, className: 'fill-lime stroke-green', label: t('admin.analyticsWfNew') },
    { value: row.expansion, up: true, className: 'fill-green', label: t('admin.analyticsWfExpansion') },
    { value: row.contraction, up: false, className: 'fill-muted', label: t('admin.analyticsWfContraction') },
    { value: row.churned, up: false, className: 'fill-foreground', label: t('admin.analyticsWfChurned') },
  ];

  return (
    <g>
      {bars.map((bar, si) => {
        // v === 0 renders NOTHING — zero must look like zero, no 2px stub.
        if (bar.value === 0) return null;
        const h = Math.max(2, barH(bar.value)); // visible floor of 2px
        const cx = groupX + subSlot * si + subSlot / 2;
        return (
          <rect
            key={bar.label}
            x={cx - BAR_W / 2}
            y={bar.up ? ZERO_Y - h : ZERO_Y}
            width={BAR_W}
            height={h}
            strokeWidth={1}
            className={bar.className}
          >
            <title>{`${bar.label} · ${monthFull(row.label)} — ${money.format(bar.value)} ₽`}</title>
          </rect>
        );
      })}
      {/* Net marker — a tick + dot, never a fifth bar. Always rendered so a
          sparse month keeps its dotted slot on the zero line. */}
      <line
        x1={groupX + slot * 0.15}
        x2={groupX + slot * 0.85}
        y1={netY}
        y2={netY}
        strokeWidth={2}
        className="stroke-foreground"
      >
        <title>{tickTitle}</title>
      </line>
      <circle cx={groupX + slot / 2} cy={netY} r={3} className="fill-foreground">
        <title>{tickTitle}</title>
      </circle>
      <text x={groupX + slot / 2} y={H - PAD_B + 24} textAnchor="middle" fontSize={9} className="fill-muted">
        {monthLabel(row.label)}
      </text>
    </g>
  );
}

export default async function MrrWaterfall() {
  let months: WaterfallRow[];
  try {
    ({ months } = await loadWaterfall());
  } catch {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-foreground">{t('admin.analyticsWaterfallTitle')}</h3>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  // Window label is derived from the RENDERED slot count — never hardcoded
  // (a young install is never told «6 месяцев»).
  const windowLabel =
    months.length === 1
      ? t('admin.analyticsWaterfallWindowSingle')
      : t('admin.analyticsWaterfallWindowMonths', { n: months.length });

  // Empty = no paid subscription ever → the single current-month slot is
  // all-zero. Sparse months INSIDE a populated window still keep their slot.
  const empty =
    months.length === 1 &&
    months[0].new === 0 &&
    months[0].expansion === 0 &&
    months[0].contraction === 0 &&
    months[0].churned === 0 &&
    months[0].net === 0;

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-xl font-semibold text-foreground">{t('admin.analyticsWaterfallTitle')}</h3>
      <span className="text-xs text-muted">{windowLabel}</span>
    </div>
  );

  if (empty) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-sm text-muted">{t('admin.analyticsWfEmpty')}</p>
        </div>
      </div>
    );
  }

  const maxAbs = Math.max(
    0,
    ...months.flatMap((m) => [m.new, m.expansion, m.contraction, m.churned, Math.abs(m.net)]),
  );
  const slot = (W - PAD_L - PAD_R) / months.length;

  const yTicks: { y: number; text: string }[] = [
    { y: ZERO_Y - MAX_BAR, text: maxAbs > 0 ? `+${money.format(maxAbs)}` : '0' },
    { y: ZERO_Y, text: '0' },
    { y: ZERO_Y + MAX_BAR, text: maxAbs > 0 ? money.format(-maxAbs) : '0' },
  ];

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div
        role="region"
        tabIndex={0}
        aria-label={t('admin.analyticsWaterfallTitle')}
        className="overflow-x-auto rounded-2xl border border-line bg-panel p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full min-w-[40rem]" aria-hidden="true" focusable="false">
          {/* Zero line — the only horizontal rule (passive reference, never a data mark). */}
          <line x1={PAD_L} x2={W - PAD_R} y1={ZERO_Y} y2={ZERO_Y} strokeWidth={1} className="stroke-line-2" />
          {yTicks.map((tick, index) => (
            <text key={index} x={PAD_L - 8} y={tick.y + 3} textAnchor="end" fontSize={9} className="fill-muted">
              {tick.text}
            </text>
          ))}
          {months.map((row, index) => (
            <MonthGroup key={row.label} row={row} index={index} slot={slot} maxAbs={maxAbs} />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        {LEGEND.map((item) => (
          <span key={item.key} className="flex items-center gap-1">
            <span className={item.swatch} />
            {legendLabel(item.key)}
          </span>
        ))}
      </div>

      {/* The SVG is aria-hidden; this table carries the same numbers. */}
      <table className="sr-only">
        <caption>{t('admin.analyticsWfTable')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('admin.analyticsTableMonth')}</th>
            <th scope="col">{t('admin.analyticsWfNew')}</th>
            <th scope="col">{t('admin.analyticsWfExpansion')}</th>
            <th scope="col">{t('admin.analyticsWfContraction')}</th>
            <th scope="col">{t('admin.analyticsWfChurned')}</th>
            <th scope="col">{t('admin.analyticsWfNet')}</th>
          </tr>
        </thead>
        <tbody>
          {months.map((row) => (
            <tr key={row.label}>
              <th scope="row">{monthFull(row.label)}</th>
              <td>{money.format(row.new)}</td>
              <td>{money.format(row.expansion)}</td>
              <td>{money.format(row.contraction)}</td>
              <td>{money.format(row.churned)}</td>
              <td>{money.format(row.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

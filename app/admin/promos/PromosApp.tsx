'use client';

// /admin/promos — promo registry client island.
//
// What the backend really supports (verified against lib/promo.ts,
// lib/admin-promos-directory.ts, prisma/schema.prisma):
//   * create one code (POST /api/admin/promos) or a batch of N distinct codes
//     (POST /api/admin/promos/batch);
//   * delete one code (DELETE /api/admin/promos/[id]) — historic orders keep
//     their own promoCode/finalAmount snapshot, so revenue never regresses;
//   * read-only validation of any code against the checkout logic
//     (GET /api/admin/promos/check), optionally priced against a base amount.
//
// `promo_codes` stores code/discount/type/maxUses/usedCount/expiresAt/
// ownerUserId ONLY. There is no `active` flag, no minimum-order column, no
// note/comment and no PATCH endpoint — so the template's disable toggle,
// min-order threshold, comments and bulk enable/disable render as explicitly
// disabled controls with a reason. Nothing is faked: status is DERIVED from
// usedCount/maxUses/expiresAt exactly the way checkout derives it, revenue and
// discount come from real paid orders, and clicks come from the public beacon
// (per-IP hourly dedupe, so a lower bound — stated as such).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  PromoDirectory,
  PromoFilter,
  PromoJournalRow,
  PromoRow,
  PromoSeriesPoint,
  PromoSort,
  PromoStats,
} from '@/lib/admin-promos-directory';

/* ------------------------------------------------------------- helpers */

function nf(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

function money(n: number): string {
  return `${nf(n)} ₽`;
}

function fmtDT(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtD(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}

/** `<input type="date">` value (YYYY-MM-DD, local) → end-of-day ISO. */
function endOfDayIso(dateValue: string): string | null {
  if (!dateValue) return null;
  const [y, m, d] = dateValue.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function discountLabel(row: Pick<PromoRow, 'type' | 'discount'>): string {
  return row.type === 'percentage' ? `${row.discount}%` : money(row.discount);
}

/** Russian plural pick: 1 заказ / 2 заказа / 5 заказов. */
function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

const FILTERS: { key: PromoFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'soon', label: 'Истекают' },
  { key: 'expired', label: 'Просрочены' },
  { key: 'exhausted', label: 'Исчерпаны' },
  { key: 'personal', label: 'Персональные' },
];

const STATUS_META: Record<string, { cls: string; label: string }> = {
  active: { cls: 'ok', label: 'Активен' },
  soon: { cls: 'warn', label: 'Истекает' },
  expired: { cls: 'bad', label: 'Просрочен' },
  exhausted: { cls: 'dim', label: 'Исчерпан' },
};

const SORTS: { key: PromoSort; label: string }[] = [
  { key: 'created', label: 'По созданию' },
  { key: 'code', label: 'По коду' },
  { key: 'used', label: 'По использованиям' },
  { key: 'revenue', label: 'По выручке' },
  { key: 'clicks', label: 'По кликам' },
  { key: 'expires', label: 'По сроку' },
];

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  provisioning: 'Выдаётся',
  provisioned: 'Выдан',
  failed: 'Ошибка',
  canceled: 'Отменён',
  refunded: 'Возврат',
};

/** Orders in these states are the ones that actually produced money. */
const PAID_STATUSES = new Set(['paid', 'provisioning', 'provisioned']);

type ToastType = '' | 'err' | 'warn';

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

export default function PromosApp({ initial }: { initial: PromoDirectory }) {
  const [data, setData] = useState<PromoDirectory>(initial);
  const [filter, setFilter] = useState<PromoFilter>(initial.filter);
  const [sort, setSort] = useState<PromoSort>(initial.sort);
  const [q, setQ] = useState(initial.q);
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [discount, setDiscount] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [creating, setCreating] = useState(false);
  const [codeTaken, setCodeTaken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // batch modal
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCount, setBatchCount] = useState('10');
  const [batchPrefix, setBatchPrefix] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<{ created: string[]; failed: string[] } | null>(
    null,
  );

  // checker
  const [checkCode, setCheckCode] = useState('');
  const [checkAmount, setCheckAmount] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkNotFound, setCheckNotFound] = useState<string | null>(null);

  // ui
  const [detail, setDetail] = useState<PromoRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PromoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQ, setCmdQ] = useState('');
  const [cmdSel, setCmdSel] = useState(0);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((msg: string, t: ToastType = '') => {
    const id = (toastId.current += 1);
    setToasts((prev) => [...prev, { id, msg, type: t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3600);
  }, []);

  const load = useCallback(
    async (opts?: { q?: string; filter?: PromoFilter; sort?: PromoSort; page?: number }) => {
      const nextQ = opts?.q ?? q;
      const nextFilter = opts?.filter ?? filter;
      const nextSort = opts?.sort ?? sort;
      const nextPage = opts?.page ?? page;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (nextQ.trim()) params.set('q', nextQ.trim());
        if (nextFilter !== 'all') params.set('filter', nextFilter);
        if (nextSort !== 'created') params.set('sort', nextSort);
        if (nextPage > 1) params.set('page', String(nextPage));
        const res = await fetch(`/api/admin/promos/directory?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('failed');
        setData((await res.json()) as PromoDirectory);
        setError(null);
      } catch {
        setError('Не удалось загрузить промокоды. Проверьте соединение и попробуйте снова.');
      } finally {
        setLoading(false);
      }
    },
    [q, filter, sort, page],
  );

  /* ------------------------------------------------------------ create */

  async function create() {
    setCodeTaken(false);
    setFormError(null);
    const rawCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,32}$/.test(rawCode)) {
      setFormError('Код: 3–32 символа, латиница в верхнем регистре, цифры и дефис.');
      return;
    }
    const value = Number(discount);
    if (!Number.isInteger(value) || value < 1) {
      setFormError('Укажите целое положительное значение скидки.');
      return;
    }
    if (type === 'percentage' && value > 100) {
      setFormError('Процент не может превышать 100.');
      return;
    }
    if (type === 'fixed' && value > 1_000_000) {
      setFormError('Фиксированная скидка не может превышать 1 000 000 ₽.');
      return;
    }
    const limit = maxUses.trim() === '' ? null : Number(maxUses);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      setFormError('Лимит использований — целое число от 1 (пусто — без лимита).');
      return;
    }
    const owner = ownerUserId.trim() === '' ? null : Number(ownerUserId);
    if (owner !== null && (!Number.isInteger(owner) || owner < 1)) {
      setFormError('ID владельца — целое положительное число (пусто — общий код).');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: rawCode,
          discount: value,
          type,
          maxUses: limit,
          expiresAt: endOfDayIso(expires),
          ownerUserId: owner,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { promo?: { code?: string } };
        const made = body.promo?.code ?? rawCode;
        setCode('');
        setDiscount('');
        setMaxUses('');
        setExpires('');
        setOwnerUserId('');
        setFreshCode(made);
        toast(`Промокод ${made} создан`);
        burstConfetti();
        setFilter('all');
        setPage(1);
        await load({ filter: 'all', page: 1 });
        return;
      }
      let body: unknown = null;
      try {
        body = ((await res.json()) as { error?: unknown }).error;
      } catch {
        body = null;
      }
      if (res.status === 409 && body === 'code_taken') {
        setCodeTaken(true);
        setFormError('Такой код уже существует.');
      } else if (res.status === 400) {
        setFormError('Сервер отклонил данные. Проверьте поля и попробуйте снова.');
      } else {
        setFormError('Не удалось создать промокод. Попробуйте ещё раз.');
      }
    } catch {
      setFormError('Не удалось создать промокод. Попробуйте ещё раз.');
    } finally {
      setCreating(false);
    }
  }

  /* ------------------------------------------------------------- batch */

  async function runBatch() {
    setBatchResult(null);
    const count = Number(batchCount);
    const value = Number(discount);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      toast('Количество — целое число от 1 до 50', 'err');
      return;
    }
    if (!Number.isInteger(value) || value < 1) {
      toast('Сначала задайте корректную скидку в форме создания', 'err');
      return;
    }
    if (type === 'percentage' && value > 100) {
      toast('Процент не может превышать 100', 'err');
      return;
    }
    setBatchRunning(true);
    try {
      const res = await fetch('/api/admin/promos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          prefix: batchPrefix.trim().toUpperCase() || undefined,
          discount: value,
          type,
          maxUses: maxUses.trim() === '' ? null : Number(maxUses),
          expiresAt: endOfDayIso(expires),
        }),
      });
      if (!res.ok) throw new Error('failed');
      const body = (await res.json()) as {
        created: { code: string }[];
        failed: string[];
      };
      const codes = body.created.map((c) => c.code);
      setBatchResult({ created: codes, failed: body.failed ?? [] });
      toast(`Создано ${codes.length} из ${count}`);
      burstConfetti();
      setFilter('all');
      setPage(1);
      await load({ filter: 'all', page: 1 });
    } catch {
      toast('Не удалось создать пакет кодов. Попробуйте ещё раз.', 'err');
    } finally {
      setBatchRunning(false);
    }
  }

  function copyBatch() {
    if (!batchResult || batchResult.created.length === 0) return;
    void navigator.clipboard
      ?.writeText(batchResult.created.join('\n'))
      .then(() => toast('Коды скопированы в буфер обмена'))
      .catch(() => toast('Не удалось скопировать', 'err'));
  }

  /* ------------------------------------------------------------- check */

  async function runCheck() {
    const raw = checkCode.trim().toUpperCase();
    if (raw.length === 0) return;
    setChecking(true);
    setCheckResult(null);
    setCheckNotFound(null);
    try {
      const params = new URLSearchParams({ code: raw });
      const amount = checkAmount.trim();
      if (amount !== '') params.set('amount', amount);
      const res = await fetch(`/api/admin/promos/check?${params.toString()}`, {
        cache: 'no-store',
      });
      if (res.status === 400) {
        toast('Код должен быть 3–32 символа: A–Z, 0–9, дефис', 'err');
        return;
      }
      if (!res.ok) throw new Error('failed');
      const body = (await res.json()) as CheckResponse;
      if (!body.found) {
        setCheckNotFound(raw);
        return;
      }
      setCheckResult(body as CheckResult);
    } catch {
      toast('Не удалось проверить код. Попробуйте ещё раз.', 'err');
    } finally {
      setChecking(false);
    }
  }

  /* ------------------------------------------------------------ delete */

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/promos/${encodeURIComponent(confirmDelete.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('failed');
      toast(`Промокод ${confirmDelete.code} удалён`);
      setConfirmDelete(null);
      setDetail(null);
      await load();
    } catch {
      toast('Не удалось удалить промокод. Попробуйте ещё раз.', 'err');
    } finally {
      setDeleting(false);
    }
  }

  function copyCode(value: string) {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast(`Скопировано: ${value}`))
      .catch(() => toast('Не удалось скопировать', 'err'));
  }

  /* -------------------------------------------------------------- csv */

  function exportCsv() {
    const head = [
      'code',
      'type',
      'discount',
      'max_uses',
      'used_count',
      'remaining',
      'expires_at',
      'created_at',
      'owner_user_id',
      'owner',
      'status',
      'clicks',
      'paid_orders',
      'revenue_rub',
      'discount_rub',
    ];
    const lines = [head.join(';')];
    for (const r of data.rows) {
      lines.push(
        [
          r.code,
          r.type,
          r.discount,
          r.maxUses ?? '',
          r.usedCount,
          r.remaining ?? '',
          r.expiresAt ?? '',
          r.createdAt,
          r.ownerUserId ?? '',
          `"${(r.ownerName ?? '').replace(/"/g, '""')}"`,
          r.status,
          r.clicks,
          r.paidOrders,
          r.revenue,
          r.discountGiven,
        ].join(';'),
      );
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '3set-promo-codes.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 1600);
    toast(`Выгружено ${data.rows.length} кодов текущей страницы`);
  }

  /* ----------------------------------------------------------- confetti */

  function burstConfetti() {
    if (typeof document === 'undefined') return;
    const host = document.createElement('div');
    host.className = 'confetti';
    const colors = ['#b7ff45', '#d4ff85', '#8fdc2c', '#63d7c8', '#ffd166'];
    for (let i = 0; i < 36; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'cf';
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDuration = `${1.4 + Math.random() * 1.1}s`;
      bit.style.animationDelay = `${Math.random() * 0.25}s`;
      host.appendChild(bit);
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 3000);
  }

  /* -------------------------------------------------------------- cmd */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setDetail(null);
        setConfirmDelete(null);
        setBatchOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stats = data.stats;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const rangeFrom = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const rangeTo = Math.min(data.page * data.pageSize, data.total);

  const cmdNeedle = cmdQ.trim().toLowerCase();
  type CmdKind = 'create' | 'batch' | 'export' | 'refresh' | 'check';
  const cmdActions = (
    [
      { kind: 'create', l: 'Создать промокод', h: 'форма' },
      { kind: 'batch', l: 'Пакетная генерация', h: 'до 50 кодов' },
      { kind: 'check', l: 'Проверить код', h: 'без списания' },
      { kind: 'export', l: 'Экспорт страницы в CSV', h: `${data.rows.length} кодов` },
      { kind: 'refresh', l: 'Обновить данные', h: 'с сервера' },
    ] as { kind: CmdKind; l: string; h: string }[]
  ).filter((a) => !cmdNeedle || a.l.toLowerCase().includes(cmdNeedle));
  const cmdCodes = data.rows
    .filter((r) => !cmdNeedle || r.code.toLowerCase().includes(cmdNeedle))
    .slice(0, 8);
  const cmdCount = cmdActions.length + cmdCodes.length;
  const cmdIndex = Math.min(cmdSel, Math.max(0, cmdCount - 1));

  function runAction(kind: CmdKind) {
    if (kind === 'create') {
      document.getElementById('pr-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('pr-code')?.focus();
    } else if (kind === 'batch') setBatchOpen(true);
    else if (kind === 'check') {
      document.getElementById('pr-check')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('pr-check-code')?.focus();
    } else if (kind === 'export') exportCsv();
    else void load();
  }

  function runAt(index: number) {
    if (index < cmdActions.length) {
      runAction(cmdActions[index].kind);
      return;
    }
    const row = cmdCodes[index - cmdActions.length];
    if (row) setDetail(row);
  }

  /* ------------------------------------------------------------ render */

  return (
    <div className="adm-pm">
      <div className="bg-fx" aria-hidden="true">
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
      </div>

      <div className="content">
        {/* ------------------------------------------------ header */}
        <div className="sec-head reveal in">
          <div className="t">
            <span className="kick">Маркетинг · Скидки</span>
            <h2 className="st">Промокоды</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.4, maxWidth: '80ch' }}>
              Скидочные коды для оформления заказов. Использование списывается атомарно при
              оплате, поэтому лимит нельзя превысить даже при одновременных заказах.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" type="button" onClick={exportCsv}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V3" />
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5 5 5-5" />
              </svg>
              Экспорт CSV
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setBatchOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Пакетная генерация
            </button>
          </div>
        </div>

        {error && (
          <div className="errbox show" role="alert">
            {error}
          </div>
        )}

        {/* ------------------------------------------------ KPI */}
        <KpiGrid stats={stats} />

        {/* ------------------------------------------------ registry + create */}
        <div className="g-2">
          <div className="card reveal in" id="pr-registry">
            <div className="card-h">
              <div>
                <span className="kick">Реестр</span>
                <h3 className="sub" style={{ marginTop: 6 }}>
                  Промокоды
                </h3>
                <p>
                  {data.total === 0
                    ? 'Пока нет кодов'
                    : `${rangeFrom}–${rangeTo} из ${nf(data.total)} · ${nf(stats.redemptions)} использований`}
                  {stats.truncated && ' · таблица усечена до 5000 последних кодов'}
                </p>
              </div>
            </div>

            <div className="chips" style={{ marginBottom: 12 }}>
              {FILTERS.map((f) => {
                const count =
                  f.key === 'all'
                    ? stats.codes
                    : f.key === 'personal'
                      ? stats.personal
                      : f.key === 'soon'
                        ? stats.soon
                        : f.key === 'expired'
                          ? stats.expired
                          : f.key === 'exhausted'
                            ? stats.exhausted
                            : stats.active;
                return (
                  <button
                    key={f.key}
                    type="button"
                    className={`chip${filter === f.key ? ' on' : ''}`}
                    onClick={() => {
                      setFilter(f.key);
                      setPage(1);
                      void load({ filter: f.key, page: 1 });
                    }}
                  >
                    {f.label}
                    <span>{nf(count)}</span>
                  </button>
                );
              })}
            </div>

            <div className="tbl-tools">
              <div className="search-inp">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.2-3.2" />
                </svg>
                <input
                  className="input"
                  placeholder="Поиск по коду или владельцу…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setPage(1);
                      void load({ q, page: 1 });
                    }
                  }}
                  aria-label="Поиск промокодов"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="select"
                  style={{ width: 'auto', minWidth: 150 }}
                  value={sort}
                  onChange={(e) => {
                    const next = e.target.value as PromoSort;
                    setSort(next);
                    setPage(1);
                    void load({ sort: next, page: 1 });
                  }}
                  aria-label="Сортировка"
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost sm"
                  type="button"
                  onClick={() => {
                    setPage(1);
                    void load({ q, page: 1 });
                  }}
                  disabled={loading}
                >
                  {loading ? <span className="spinner w" /> : 'Найти'}
                </button>
              </div>
            </div>

            {data.rows.length > 0 ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Код</th>
                      <th>Скидка</th>
                      <th>Использования</th>
                      <th>Остаток</th>
                      <th>Клики</th>
                      <th>Выручка</th>
                      <th>Истекает</th>
                      <th>Статус</th>
                      <th style={{ textAlign: 'right' }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => {
                      const meta = STATUS_META[r.status] ?? STATUS_META.active;
                      return (
                        <tr
                          key={r.id}
                          className={freshCode === r.code ? 'fresh' : undefined}
                          style={{ animationDelay: `${Math.min(i * 35, 300)}ms` }}
                        >
                          <td>
                            <div className="code-cell">
                              <span className="cc">{r.code}</span>
                              <button
                                className="cp"
                                type="button"
                                title="Скопировать код"
                                onClick={() => copyCode(r.code)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect width="14" height="14" x="8" y="8" rx="2" />
                                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                </svg>
                              </button>
                            </div>
                            {r.ownerUserId !== null && (
                              <span className="dim" style={{ fontSize: 10.8, display: 'block', marginTop: 3 }}>
                                персональный · {r.ownerName ?? `#${r.ownerUserId}`}
                              </span>
                            )}
                          </td>
                          <td>
                            <b className="num" style={{ color: 'var(--lime)' }}>
                              {discountLabel(r)}
                            </b>
                          </td>
                          <td>
                            <div className="usage">
                              <span className="num" style={{ fontSize: 12 }}>
                                {nf(r.usedCount)}
                                {r.maxUses === null ? ' / ∞' : ` / ${nf(r.maxUses)}`}
                              </span>
                              {r.usagePct !== null && (
                                <span className="ub">
                                  <i
                                    className={r.usagePct >= 100 ? 'full' : undefined}
                                    style={{ width: `${r.usagePct}%` }}
                                  />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="num">
                            {r.remaining === null ? (
                              <span className="dim">∞</span>
                            ) : (
                              nf(r.remaining)
                            )}
                          </td>
                          <td className="num">{nf(r.clicks)}</td>
                          <td className="num">{r.revenue > 0 ? money(r.revenue) : <span className="dim">—</span>}</td>
                          <td>
                            <span className="dim mono" style={{ fontSize: 11.2 }}>
                              {r.expiresAt ? fmtDT(r.expiresAt) : 'бессрочно'}
                            </span>
                          </td>
                          <td>
                            <span className={`pill ${meta.cls}`}>
                              <i />
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            <span className="acts">
                              <button className="ibtn" type="button" title="Подробнее" onClick={() => setDetail(r)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <button
                                className="ibtn dgr"
                                type="button"
                                title="Удалить код"
                                onClick={() => setConfirmDelete(r)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                                </svg>
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <span className="eic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-8.2-8.2a2 2 0 0 1-.6-1.4V3a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l8.2 8.2a2 2 0 0 1 0 2.8z" />
                    <circle cx="7" cy="7" r="1.6" />
                  </svg>
                </span>
                <b>{q || filter !== 'all' ? 'Ничего не найдено' : 'Промокодов пока нет'}</b>
                <p>
                  {q || filter !== 'all'
                    ? 'Измените запрос или сбросьте фильтр статуса.'
                    : 'Создайте первый код в форме справа — он сразу появится в реестре.'}
                </p>
              </div>
            )}

            {pages > 1 && (
              <div className="pager">
                <span className="hint">
                  Страница {data.page} из {pages}
                </span>
                <div className="pg">
                  <button
                    type="button"
                    disabled={data.page <= 1 || loading}
                    onClick={() => {
                      const next = data.page - 1;
                      setPage(next);
                      void load({ page: next });
                    }}
                  >
                    ‹
                  </button>
                  <button type="button" className="on" disabled>
                    {data.page}
                  </button>
                  <button
                    type="button"
                    disabled={data.page >= pages || loading}
                    onClick={() => {
                      const next = data.page + 1;
                      setPage(next);
                      void load({ page: next });
                    }}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---------------------------------------------- create column */}
          <div className="sticky-col">
            <div className="card reveal in" id="pr-create">
              <div className="card-h">
                <div>
                  <span className="kick">Новый код</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Создать промокод
                  </h3>
                </div>
              </div>

              <div className="field">
                <label htmlFor="pr-code">
                  Код <span className="req">*</span>
                </label>
                <input
                  id="pr-code"
                  className={`input${codeTaken ? ' err' : ''}`}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setCodeTaken(false);
                    setFormError(null);
                  }}
                  placeholder="SALE10"
                  maxLength={32}
                  autoComplete="off"
                />
                <span className="hint">3–32 символа: A–Z, 0–9, дефис</span>
              </div>

              <div className="field">
                <label htmlFor="pr-type">Тип скидки</label>
                <select
                  id="pr-type"
                  className="select"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as 'percentage' | 'fixed');
                    setFormError(null);
                  }}
                >
                  <option value="percentage">Процент (%)</option>
                  <option value="fixed">Фикс. сумма (₽)</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="pr-discount">
                  Размер скидки <span className="req">*</span>
                </label>
                <input
                  id="pr-discount"
                  className="input"
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => {
                    setDiscount(e.target.value.replace(/[^\d]/g, ''));
                    setFormError(null);
                  }}
                  placeholder={type === 'percentage' ? '10' : '500'}
                />
                <span className="hint">
                  {type === 'percentage' ? 'От 1 до 100%' : 'От 1 до 1 000 000 ₽'}
                </span>
              </div>

              <div className="field">
                <label htmlFor="pr-max">Лимит использований</label>
                <input
                  id="pr-max"
                  className="input"
                  inputMode="numeric"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Без лимита"
                />
                <span className="hint">Пусто — без ограничения</span>
              </div>

              <div className="field">
                <label htmlFor="pr-expires">Истекает</label>
                <input
                  id="pr-expires"
                  className="input"
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                />
                <span className="hint">Пусто — бессрочно · действует до конца дня</span>
              </div>

              <div className="field">
                <label htmlFor="pr-owner">Владелец — ID пользователя</label>
                <input
                  id="pr-owner"
                  className="input"
                  inputMode="numeric"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Пусто — общий код"
                />
                <span className="hint">
                  Персональный код партнёра: покупки атрибутируются этому аккаунту
                </span>
              </div>

              {formError && (
                <p className="hint bad" role="alert" style={{ margin: '0 0 10px' }}>
                  {formError}
                </p>
              )}

              <button
                className="btn btn-primary block"
                type="button"
                onClick={() => void create()}
                disabled={creating}
              >
                {creating ? <span className="spinner" /> : null}
                {creating ? 'Создаём…' : 'Создать промокод'}
              </button>

              <div className="lockbox" style={{ marginTop: 12 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  <b>Редактирования нет.</b> Поля кода после создания неизменяемы: в схеме нет
                  PATCH-эндпоинта. Чтобы изменить условия — удалите код и создайте новый; история
                  заказов при этом сохраняется.
                </span>
              </div>
            </div>

            {/* -------------------------------------------- checker */}
            <div className="card reveal in" id="pr-check">
              <div className="card-h">
                <div>
                  <span className="kick">Проверка</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Проверить код
                  </h3>
                  <p>Считает по той же логике, что и оформление заказа. Ничего не списывает.</p>
                </div>
              </div>

              <div className="field">
                <label htmlFor="pr-check-code">Код</label>
                <input
                  id="pr-check-code"
                  className="input"
                  value={checkCode}
                  onChange={(e) => {
                    setCheckCode(e.target.value.toUpperCase());
                    setCheckResult(null);
                    setCheckNotFound(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runCheck();
                  }}
                  placeholder="SALE10"
                  maxLength={32}
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="pr-check-amount">Сумма заказа, ₽ (необязательно)</label>
                <input
                  id="pr-check-amount"
                  className="input"
                  inputMode="numeric"
                  value={checkAmount}
                  onChange={(e) => {
                    setCheckAmount(e.target.value.replace(/[^\d]/g, ''));
                    setCheckResult(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runCheck();
                  }}
                  placeholder="Например, 2990"
                />
              </div>

              <button
                className="btn btn-ghost block"
                type="button"
                onClick={() => void runCheck()}
                disabled={checking || checkCode.trim().length === 0}
              >
                {checking ? <span className="spinner w" /> : null}
                {checking ? 'Проверяем…' : 'Проверить'}
              </button>

              {checkNotFound && (
                <div className="lockbox" style={{ marginTop: 12 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <span>
                    Код <b>{checkNotFound}</b> не найден. Он ещё не создан или уже удалён.
                  </span>
                </div>
              )}

              {checkResult && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span className={`pill ${(STATUS_META[checkResult.status] ?? STATUS_META.active).cls}`}>
                      <i />
                      {(STATUS_META[checkResult.status] ?? STATUS_META.active).label}
                    </span>
                    <span className="pill dim">{discountLabel(checkResult)}</span>
                    <span className="pill dim">
                      {nf(checkResult.usedCount)}
                      {checkResult.maxUses === null ? ' / ∞' : ` / ${nf(checkResult.maxUses)}`}
                    </span>
                  </div>
                  {checkResult.amount !== null && checkResult.finalAmount !== null ? (
                    <div className="calc-out">
                      <span className="old">{money(checkResult.amount)}</span>
                      <span className="new">{money(checkResult.finalAmount)}</span>
                      <span className="save">
                        −{money(Math.max(0, checkResult.amount - checkResult.finalAmount))}
                      </span>
                    </div>
                  ) : checkResult.amount !== null ? (
                    <p className="hint bad" style={{ margin: 0 }}>
                      Код сейчас не применим — скидка не рассчитывается.
                    </p>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>
                      Введите сумму заказа, чтобы увидеть итоговую цену.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ charts row */}
        <div className="g-2e">
          <div className="card reveal in">
            <div className="card-h">
              <div>
                <span className="kick">Динамика</span>
                <h3 className="sub" style={{ marginTop: 6 }}>
                  Использования за 30 дней
                </h3>
                <p>Заказы с промокодом по дням · МСК-независимо, по времени сервера</p>
              </div>
              <div className="legend">
                <span>
                  <i style={{ background: 'var(--lime)' }} />
                  заказы
                </span>
                <span>
                  <i style={{ background: 'var(--amber)' }} />
                  скидка, ₽
                </span>
              </div>
            </div>
            <SeriesChart series={data.series} />
          </div>

          <div className="card reveal in">
            <div className="card-h">
              <div>
                <span className="kick">Топ кодов</span>
                <h3 className="sub" style={{ marginTop: 6 }}>
                  По оплаченным заказам
                </h3>
                <p>Только оплаченные заказы — ожидающие и отменённые не считаются</p>
              </div>
            </div>
            <TopDonut rows={data.top} total={stats.paidOrders} />
          </div>
        </div>

        {/* ------------------------------------------------ journal + rules */}
        <div className="g-2">
          <div className="card reveal in">
            <div className="card-h">
              <div>
                <span className="kick">Журнал</span>
                <h3 className="sub" style={{ marginTop: 6 }}>
                  Последние списания
                </h3>
                <p>Заказы, при оформлении которых применялся промокод</p>
              </div>
            </div>
            <Journal rows={data.journal} onCopy={copyCode} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="card reveal in">
              <div className="card-h">
                <div>
                  <span className="kick">Экономика</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Выручка и скидки
                  </h3>
                </div>
              </div>
              <div className="kv">
                <span>Выручка с промокодами</span>
                <b style={{ color: 'var(--lime)' }}>{money(stats.revenue)}</b>
              </div>
              <div className="kv">
                <span>Скидка предоставлена</span>
                <b style={{ color: 'var(--amber)' }}>{money(stats.discountGiven)}</b>
              </div>
              <div className="kv">
                <span>Доля скидки в обороте</span>
                <b>{stats.discountShare === null ? '—' : `${stats.discountShare}%`}</b>
              </div>
              <div className="kv">
                <span>Оплаченных заказов</span>
                <b>{nf(stats.paidOrders)}</b>
              </div>
              <div className="kv">
                <span>Средний процент кода</span>
                <b>{stats.avgPercent === null ? '—' : `${stats.avgPercent}%`}</b>
              </div>
              <div className="kv">
                <span>Кликов по ссылкам</span>
                <b>{nf(stats.clicks)}</b>
              </div>
              <p className="hint" style={{ margin: '11px 0 0' }}>
                Выручка — фактические деньги: <span className="mono">finalAmount − balanceUsed</span>{' '}
                по оплаченным заказам (рубли с баланса до провайдера не доходят). Клики — метка
                публичной ссылки с дедупликацией по IP за час, то есть нижняя оценка.
              </p>
            </div>

            <div className="card reveal in">
              <div className="card-h">
                <div>
                  <span className="kick">Ограничения</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Что бэкенд не умеет
                  </h3>
                  <p>Эти возможности шаблона недоступны — в схеме нет соответствующих полей</p>
                </div>
              </div>
              <div className="lockbox" style={{ marginBottom: 9 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  <b>Включение/выключение кода.</b> Флага <span className="mono">active</span> нет —
                  отключить код можно только удалением.
                </span>
              </div>
              <div className="lockbox" style={{ marginBottom: 9 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  <b>Минимальная сумма заказа.</b> Поля <span className="mono">minSum</span> нет —
                  код применяется к любой сумме.
                </span>
              </div>
              <div className="lockbox" style={{ marginBottom: 9 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  <b>Комментарий к коду.</b> Колонки для заметки нет — назначение кода видно только
                  по его имени и владельцу.
                </span>
              </div>
              <div className="lockbox">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  <b>Массовое включение/выключение.</b> Нет ни флага, ни PATCH-эндпоинта — только
                  удаление по одному.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ batch modal */}
      {batchOpen && (
        <div
          className="overlay open"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBatchOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal-h">
              <h3>Пакетная генерация</h3>
              <button className="icon-btn" type="button" onClick={() => setBatchOpen(false)} aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="hint" style={{ margin: '0 0 14px' }}>
              Создаёт N разных кодов с одинаковыми условиями. Скидка, тип, лимит и срок берутся из
              формы создания — заполните их до открытия окна.
            </p>

            <div className="preview-box" style={{ marginBottom: 14 }}>
              Скидка <b>{discount ? (type === 'percentage' ? `${discount}%` : money(Number(discount))) : 'не задана'}</b>
              {' · '}лимит <b>{maxUses ? `${maxUses} на код` : 'без лимита'}</b>
              {' · '}срок <b>{expires ? fmtD(new Date(expires).toISOString()) : 'бессрочно'}</b>
            </div>

            <div className="field">
              <label htmlFor="pr-batch-count">Сколько кодов</label>
              <input
                id="pr-batch-count"
                className="input"
                inputMode="numeric"
                value={batchCount}
                onChange={(e) => setBatchCount(e.target.value.replace(/[^\d]/g, ''))}
              />
              <span className="hint">От 1 до 50 за запрос</span>
            </div>

            <div className="field">
              <label htmlFor="pr-batch-prefix">Префикс (необязательно)</label>
              <input
                id="pr-batch-prefix"
                className="input"
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                placeholder="SUMMER"
                maxLength={20}
              />
              <span className="hint">
                Код будет вида <span className="mono">{batchPrefix || 'XXXXXX'}-A2C9K4</span>
              </span>
            </div>

            {batchResult && (
              <div style={{ marginBottom: 14 }}>
                <div className="kv">
                  <span>Создано</span>
                  <b style={{ color: 'var(--lime)' }}>{batchResult.created.length}</b>
                </div>
                {batchResult.failed.length > 0 && (
                  <div className="kv">
                    <span>Не удалось</span>
                    <b style={{ color: 'var(--red)' }}>{batchResult.failed.length}</b>
                  </div>
                )}
                {batchResult.created.length > 0 && (
                  <>
                    <div className="preview-box" style={{ marginTop: 10, maxHeight: 150, overflowY: 'auto' }}>
                      {batchResult.created.join('\n')}
                    </div>
                    <button className="btn btn-ghost sm" type="button" style={{ marginTop: 9 }} onClick={copyBatch}>
                      Скопировать все коды
                    </button>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-quiet" type="button" onClick={() => setBatchOpen(false)}>
                Закрыть
              </button>
              <button
                className="btn btn-primary"
                type="button"
                style={{ flex: 1 }}
                onClick={() => void runBatch()}
                disabled={batchRunning}
              >
                {batchRunning ? <span className="spinner" /> : null}
                {batchRunning ? 'Генерируем…' : 'Сгенерировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ detail modal */}
      {detail && (
        <div
          className="overlay open"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="modal">
            <div className="modal-h">
              <h3>{detail.code}</h3>
              <button className="icon-btn" type="button" onClick={() => setDetail(null)} aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className={`pill ${(STATUS_META[detail.status] ?? STATUS_META.active).cls}`}>
                <i />
                {(STATUS_META[detail.status] ?? STATUS_META.active).label}
              </span>
              <span className="pill dim">{detail.type === 'percentage' ? 'процент' : 'фикс. сумма'}</span>
              {detail.ownerUserId !== null && <span className="pill info">персональный</span>}
            </div>

            <div className="kv">
              <span>Скидка</span>
              <b style={{ color: 'var(--lime)' }}>{discountLabel(detail)}</b>
            </div>
            <div className="kv">
              <span>Использований</span>
              <b>
                {nf(detail.usedCount)}
                {detail.maxUses === null ? ' / ∞' : ` / ${nf(detail.maxUses)}`}
              </b>
            </div>
            <div className="kv">
              <span>Остаток</span>
              <b>{detail.remaining === null ? '∞' : nf(detail.remaining)}</b>
            </div>
            <div className="kv">
              <span>Кликов по ссылке</span>
              <b>{nf(detail.clicks)}</b>
            </div>
            <div className="kv">
              <span>Заказов с кодом</span>
              <b>
                {nf(detail.redemptions)}
                {detail.redemptions !== detail.paidOrders && (
                  <span className="dim" style={{ fontWeight: 600 }}>
                    {' '}
                    · оплачено {nf(detail.paidOrders)}
                  </span>
                )}
              </b>
            </div>
            <div className="kv">
              <span>Выручка</span>
              <b style={{ color: 'var(--lime)' }}>{money(detail.revenue)}</b>
            </div>
            <div className="kv">
              <span>Скидка предоставлена</span>
              <b style={{ color: 'var(--amber)' }}>{money(detail.discountGiven)}</b>
            </div>
            <div className="kv">
              <span>Создан</span>
              <b>{fmtDT(detail.createdAt)}</b>
            </div>
            <div className="kv">
              <span>Истекает</span>
              <b>{detail.expiresAt ? fmtDT(detail.expiresAt) : 'бессрочно'}</b>
            </div>
            <div className="kv">
              <span>Владелец</span>
              <b>
                {detail.ownerUserId === null
                  ? 'общий код'
                  : `${detail.ownerName ?? '—'} · #${detail.ownerUserId}`}
              </b>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" type="button" onClick={() => copyCode(detail.code)}>
                Скопировать код
              </button>
              <button
                className="btn btn-danger"
                type="button"
                style={{ marginLeft: 'auto' }}
                onClick={() => setConfirmDelete(detail)}
              >
                Удалить
              </button>
            </div>
            <p className="hint" style={{ margin: '11px 0 0' }}>
              Удаление не затрагивает историю: заказы хранят собственный снимок кода и суммы.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ confirm delete */}
      {confirmDelete && (
        <div
          className="overlay open"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="modal" style={{ width: 'min(460px,100%)' }}>
            <div className="modal-h">
              <h3>Удалить промокод?</h3>
              <button className="icon-btn" type="button" onClick={() => setConfirmDelete(null)} aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 13.2, color: 'var(--muted)' }}>
              Код <b style={{ color: 'var(--fg)' }}>{confirmDelete.code}</b> будет удалён безвозвратно.
              Покупатели больше не смогут его применить. История заказов сохранится.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-quiet" type="button" onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button
                className="btn btn-danger"
                type="button"
                style={{ flex: 1 }}
                onClick={() => void doDelete()}
                disabled={deleting}
              >
                {deleting ? <span className="spinner w" /> : null}
                {deleting ? 'Удаляем…' : 'Удалить навсегда'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ cmdk */}
      {cmdOpen && (
        <div
          className="cmdk open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCmdOpen(false);
          }}
        >
          <div className="cmdk-box">
            <div className="cmdk-in">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" />
              </svg>
              <input
                autoFocus
                value={cmdQ}
                onChange={(e) => {
                  setCmdQ(e.target.value);
                  setCmdSel(0);
                }}
                placeholder="Коды, действия…"
                aria-label="Командная строка"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCmdSel((s) => Math.max(0, Math.min(cmdCount - 1, s + (e.key === 'ArrowDown' ? 1 : -1))));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    runAt(cmdIndex);
                    setCmdOpen(false);
                  }
                }}
              />
            </div>
            <div className="cmdk-list">
              {cmdCount === 0 && <div className="cmdk-empty">Ничего не найдено</div>}

              {cmdActions.length > 0 && <div className="cmdk-g">Действия</div>}
              {cmdActions.map((action, i) => (
                <div
                  key={action.kind}
                  className={`cmdk-i${i === cmdIndex ? ' on' : ''}`}
                  onClick={() => {
                    runAction(action.kind);
                    setCmdOpen(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  {action.l}
                  <span className="h">{action.h}</span>
                </div>
              ))}

              {cmdCodes.length > 0 && <div className="cmdk-g">Коды</div>}
              {cmdCodes.map((row, i) => {
                const index = cmdActions.length + i;
                return (
                  <div
                    key={row.id}
                    className={`cmdk-i${index === cmdIndex ? ' on' : ''}`}
                    onClick={() => {
                      setDetail(row);
                      setCmdOpen(false);
                    }}
                  >
                    <span className="cav">{row.code.slice(0, 3)}</span>
                    {row.code}
                    <span className="h">{(STATUS_META[row.status] ?? STATUS_META.active).label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ toasts */}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast show${t.type ? ` ${t.type}` : ''}`}>
            <span className="ti">
              {t.type === 'err' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : t.type === 'warn' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- types */

interface CheckResult {
  code: string;
  found: true;
  status: 'active' | 'soon' | 'expired' | 'exhausted';
  usable: boolean;
  type: string;
  discount: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  ownerUserId: number | null;
  amount: number | null;
  finalAmount: number | null;
}

interface CheckResponse {
  code: string;
  found: boolean;
  status?: string;
}

/* -------------------------------------------------------------- KPI */

function KpiGrid({ stats }: { stats: PromoStats }) {
  // Every bar is a real ratio; null renders no bar rather than a decorative one.
  const fillable = stats.remaining === null ? null : stats.redemptions + stats.remaining;
  const fillPct =
    fillable === null || fillable === 0 ? null : Math.round((stats.redemptions / fillable) * 100);
  const personalPct = stats.codes === 0 ? null : Math.round((stats.personal / stats.codes) * 100);
  const livePct = stats.codes === 0 ? null : Math.round((stats.active / stats.codes) * 100);

  const cards: { t: string; v: string; sub: string; bar: number | null; amber?: boolean; ic: ReactNode }[] = [
    {
      t: 'Всего кодов',
      v: nf(stats.codes),
      sub: `${nf(stats.personal)} персональных`,
      bar: personalPct,
      ic: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-8.2-8.2a2 2 0 0 1-.6-1.4V3a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l8.2 8.2a2 2 0 0 1 0 2.8z" />
          <circle cx="7" cy="7" r="1.6" />
        </svg>
      ),
    },
    {
      t: 'Активные',
      v: nf(stats.active),
      sub: `${livePct === null ? '—' : `${livePct}%`} от всех`,
      bar: livePct,
      ic: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ),
    },
    {
      t: 'Истекают',
      v: nf(stats.soon),
      sub: 'в ближайшие 7 дней',
      bar: stats.codes === 0 ? null : Math.round((stats.soon / stats.codes) * 100),
      amber: true,
      ic: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      ),
    },
    {
      t: 'Использований',
      v: nf(stats.redemptions),
      sub: stats.remaining === null ? 'лимитов нет' : `${nf(stats.remaining)} осталось`,
      bar: fillPct,
      ic: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="m7 15 4-4 3 3 5-6" />
        </svg>
      ),
    },
    {
      t: 'Выручка',
      v: money(stats.revenue),
      sub: `${nf(stats.paidOrders)} ${plural(stats.paidOrders, 'оплаченный заказ', 'оплаченных заказа', 'оплаченных заказов')}`,
      bar: null,
      ic: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      t: 'Скидка',
      v: money(stats.discountGiven),
      sub: stats.discountShare === null ? 'нет данных' : `${stats.discountShare}% оборота`,
      bar: stats.discountShare,
      amber: true,
      ic: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="5" />
          <path d="m14 14 6 6M6 18 18 6" />
        </svg>
      ),
    },
  ];

  return (
    <div className="kpi-grid reveal in">
      {cards.map((card) => (
        <div className="kpi" key={card.t}>
          <span className="ic">{card.ic}</span>
          <span className="lbl">{card.t}</span>
          <b>{card.v}</b>
          <span className="hint">{card.sub}</span>
          {card.bar !== null && (
            <span className={`bar${card.amber ? ' amber' : ''}`}>
              <i style={{ width: `${Math.max(0, Math.min(100, card.bar))}%` }} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- chart */

function SeriesChart({ series }: { series: PromoSeriesPoint[] }) {
  const W = 460;
  const H = 200;
  const pl = 34;
  const pr = 12;
  const pt = 14;
  const pb = 26;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);

  const maxOrders = Math.max(1, ...series.map((p) => p.redemptions));
  const maxDiscount = Math.max(1, ...series.map((p) => p.discount));
  const slot = series.length > 0 ? iw / series.length : iw;
  const bw = Math.min(11, slot * 0.3);

  return (
    <div className="chart-box">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: 200 }}
        role="img"
        aria-label="Использования промокодов за 30 дней"
      >
        <g className="grid-l">
          {[0, 1, 2, 3, 4].map((k) => {
            const y = pt + (ih * k) / 4;
            return (
              <g key={k}>
                <line x1={pl} y1={y} x2={W - pr} y2={y} />
                <text className="axis" x={pl - 6} y={y + 3.4} textAnchor="end">
                  {Math.round(maxOrders * (1 - k / 4))}
                </text>
              </g>
            );
          })}
        </g>
        {series.map((p, i) => {
          const cx = pl + slot * i + slot / 2;
          const hOrders = Math.max(p.redemptions > 0 ? 2 : 0, (p.redemptions / maxOrders) * ih);
          const hDisc = Math.max(p.discount > 0 ? 2 : 0, (p.discount / maxDiscount) * ih * 0.55);
          return (
            <g key={p.day}>
              <rect x={cx - bw - 1} y={pt + ih - hOrders} width={bw} height={hOrders} rx={3} fill="var(--lime)" opacity={0.85} />
              <rect x={cx + 1} y={pt + ih - hDisc} width={bw} height={hDisc} rx={3} fill="var(--amber)" opacity={0.55} />
              {i % 5 === 0 && (
                <text className="axis" x={cx} y={H - 8} textAnchor="middle">
                  {fmtD(p.day)}
                </text>
              )}
              <rect
                x={pl + slot * i}
                y={pt}
                width={slot}
                height={ih}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({
                    x: ((cx - pl) / iw) * box.width,
                    y: 24,
                    text: `${nf(p.redemptions)} ${plural(p.redemptions, 'заказ', 'заказа', 'заказов')} · ${money(p.discount)} скидки`,
                    sub: fmtD(p.day),
                  });
                }}
                onMouseLeave={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="tip show" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
          <span>{tip.sub}</span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- donut */

function TopDonut({ rows, total }: { rows: { code: string; redemptions: number }[]; total: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const colors = ['#b7ff45', '#8fdc2c', '#63d7c8', '#ffd166', '#0c4f36'];
  const sum = rows.reduce((s, x) => s + x.redemptions, 0) || 1;
  const arcs = rows.map((s, i) => ({
    ...s,
    color: colors[i % colors.length],
    len: (s.redemptions / sum) * C,
    offset: rows.slice(0, i).reduce((acc, prev) => acc + (prev.redemptions / sum) * C, 0),
  }));

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14" />
          {arcs.map((s) => (
            <circle
              key={s.code}
              cx="65"
              cy="65"
              r={R}
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${s.len.toFixed(2)} ${(C - s.len).toFixed(2)}`}
              strokeDashoffset={(-s.offset).toFixed(2)}
            >
              <title>{`${s.code}: ${nf(s.redemptions)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="ct">
          <b>{nf(total)}</b>
          <span>{plural(total, 'заказ', 'заказа', 'заказов')}</span>
        </div>
      </div>
      <div className="dlist">
        {rows.length === 0 ? (
          <div className="dl">
            <span className="dim">Оплаченных заказов с промокодами пока нет</span>
          </div>
        ) : (
          rows.map((s) => (
            <div className="dl" key={s.code}>
              <i style={{ background: colors[rows.indexOf(s) % colors.length] }} />
              <span>{s.code}</span>
              <b>{nf(s.redemptions)}</b>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- journal */

function Journal({ rows, onCopy }: { rows: PromoJournalRow[]; onCopy: (code: string) => void }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <span className="eic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="m7 15 4-4 3 3 5-6" />
          </svg>
        </span>
        <b>Списаний пока нет</b>
        <p>Как только покупатель применит промокод, заказ появится здесь.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((row) => {
        const paid = PAID_STATUSES.has(row.status);
        return (
          <div className="lrow" key={row.orderId}>
            <div className="lt">
              <b>
                <button
                  type="button"
                  className="cc"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 12.4,
                    fontWeight: 800,
                    color: 'var(--lime)',
                  }}
                  onClick={() => onCopy(row.code)}
                  title="Скопировать код"
                >
                  {row.code}
                </button>
                <span className="dim" style={{ fontWeight: 600, marginLeft: 8, fontSize: 11.4 }}>
                  {row.userLabel}
                </span>
              </b>
              <span>
                {fmtDT(row.createdAt)} · {ORDER_STATUS_LABELS[row.status] ?? row.status}
              </span>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <b className="num" style={{ display: 'block', fontSize: 12.6, color: paid ? 'var(--fg)' : 'var(--dim)' }}>
                {money(row.finalAmount)}
              </b>
              <span className="dim mono" style={{ fontSize: 10.6 }}>
                −{money(row.discount)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

'use client';

// /admin/broadcast — Telegram broadcast composer + campaign history.
//
// What the backend actually supports (verified against lib/broadcast.ts,
// lib/outbox.ts, prisma/schema.prisma):
//   * one channel only — Telegram, via the `notifications` outbox;
//   * audience = "all" (users with a chat) or one RFM segment;
//   * body is sent VERBATIM (lib/broadcast.ts slices to BOT_REPLY_CAP, no
//     {{var}} substitution exists);
//   * `broadcasts` stores body/total/sent/failed/status/createdAt/finishedAt
//     only — no name, subject, schedule, drafts, templates or tracking.
//
// So this page ships the composer for what is real (message + segment), shows
// live delivery progress from `broadcasts.sent/failed` (the worker drains the
// outbox every 5s, so the numbers genuinely move), and renders every
// unsupported capability as an explicitly disabled row with a reason. Nothing
// is faked: no open/click rates, no scheduling, no drafts, no test sends.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AutomationRow,
  BroadcastDirectory,
  BroadcastFilter,
  BroadcastRow,
  BroadcastSeriesPoint,
  BroadcastStats,
} from '@/lib/admin-broadcast-directory';

type SegmentOption = { segment: string; size: number; chatCount: number };

const FILTERS: { key: BroadcastFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'queued', label: 'В очереди' },
  { key: 'sending', label: 'Отправляется' },
  { key: 'sent', label: 'Отправлено' },
  { key: 'failed', label: 'С ошибками' },
];

const STATUS_META: Record<
  string,
  { cls: string; label: string }
> = {
  queued: { cls: 'dim', label: 'В очереди' },
  sending: { cls: 'warn', label: 'Отправляется' },
  sent: { cls: 'ok', label: 'Отправлено' },
  failed: { cls: 'bad', label: 'С ошибками' },
};

/** Human labels for the automation types the worker really dispatches. */
const AUTOMATION_META: Record<string, { label: string; when: string; channel: string }> = {
  broadcast: {
    label: 'Ручная рассылка',
    when: 'запускается администратором вручную',
    channel: 'Telegram',
  },
  'remind-expiry': {
    label: 'Напоминание об окончании',
    when: 'за 3 дня до конца подписки',
    channel: 'Telegram',
  },
  'notify-ticket-reply': {
    label: 'Ответ поддержки',
    when: 'при каждом ответе в тикете',
    channel: 'Telegram',
  },
  'balance-alert': {
    label: 'Алерт баланса ARTEMIDA',
    when: 'при падении баланса ниже порога',
    channel: 'Telegram админам',
  },
  'alert-anomaly': {
    label: 'Алерт аномалии метрик',
    when: 'при отклонении бизнес-метрик',
    channel: 'Telegram админам',
  },
};

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

function nf(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

const SEGMENT_LABELS: Record<string, string> = {
  'trial-only': 'Только trial',
  'new payer': 'Новый плательщик',
  VIP: 'VIP',
  active: 'Активный',
  'at-risk': 'Под риском',
  churned: 'Ушедший',
  sleeping: 'Спящий',
};

function segmentLabel(segment: string): string {
  return segment === 'all' ? 'Все получатели' : (SEGMENT_LABELS[segment] ?? segment);
}

export default function BroadcastApp({
  initial,
  segments,
}: {
  initial: BroadcastDirectory;
  segments: SegmentOption[];
}) {
  const [data, setData] = useState<BroadcastDirectory>(initial);
  const [filter, setFilter] = useState<BroadcastFilter>(initial.filter);
  const [q, setQ] = useState(initial.q);
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // composer
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<string>('all');
  const [sending, setSending] = useState(false);

  // ui
  const [detail, setDetail] = useState<BroadcastRow | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: '' | 'err' | 'warn' }[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQ, setCmdQ] = useState('');
  const [cmdSel, setCmdSel] = useState(0);
  const toastId = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toast = useCallback((msg: string, type: '' | 'err' | 'warn' = '') => {
    const id = (toastId.current += 1);
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3400);
  }, []);

  const load = useCallback(
    async (opts?: { q?: string; filter?: BroadcastFilter; page?: number }) => {
      const nextQ = opts?.q ?? q;
      const nextFilter = opts?.filter ?? filter;
      const nextPage = opts?.page ?? page;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (nextQ.trim()) params.set('q', nextQ.trim());
        if (nextFilter !== 'all') params.set('filter', nextFilter);
        if (nextPage > 1) params.set('page', String(nextPage));
        const res = await fetch(`/api/admin/broadcast/directory?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('failed');
        setData((await res.json()) as BroadcastDirectory);
        setError(null);
      } catch {
        setError('Не удалось загрузить историю кампаний. Проверьте соединение и попробуйте снова.');
      } finally {
        setLoading(false);
      }
    },
    [q, filter, page],
  );

  // Live progress: while any campaign is queued/sending, re-read the page every
  // 5s — the same cadence as the worker drain, so counters track real delivery.
  useEffect(() => {
    const busy = data.rows.some((r) => r.status === 'queued' || r.status === 'sending');
    if (!busy) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      void load({ q, filter, page });
    }, 5000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data.rows, load, q, filter, page]);

  const selectedSegment = useMemo(
    () => segments.find((s) => s.segment === segment) ?? null,
    [segments, segment],
  );
  const recipients = segment === 'all' ? data.stats.reachable : (selectedSegment?.chatCount ?? 0);
  const bodyLen = body.trim().length;
  const canSend = bodyLen > 0 && recipients > 0 && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), segment }),
      });
      if (!res.ok) throw new Error('failed');
      const created = (await res.json()) as { status?: string; total?: number };
      toast(`Рассылка поставлена в очередь · ${nf(created.total ?? recipients)} получателей`);
      setBody('');
      setFilter('all');
      setPage(1);
      await load({ q, filter: 'all', page: 1 });
    } catch {
      toast('Не удалось поставить рассылку в очередь. Попробуйте ещё раз.', 'err');
    } finally {
      setSending(false);
    }
  }

  const stats = data.stats;
  const rangeFrom = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const rangeTo = Math.min(data.page * data.pageSize, data.total);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  // Command palette entries. Kept as separate groups (the same shape
  // /admin/tickets uses) so each section renders its own header.
  const cmdNeedle = cmdQ.trim().toLowerCase();

  type CmdKind = 'send' | 'audience-all' | 'export' | 'refresh';
  const allActions: { kind: CmdKind; l: string; h: string }[] = [
    { kind: 'send', l: 'Отправить рассылку', h: `${nf(recipients)} получателей` },
    { kind: 'audience-all', l: 'Все получатели', h: `${nf(stats.reachable)} с чатом` },
    { kind: 'export', l: 'Экспорт истории CSV', h: `${data.total} кампаний` },
    { kind: 'refresh', l: 'Обновить данные', h: 'с сервера' },
  ];
  const cmdActions = allActions.filter(
    (action) => !cmdNeedle || action.l.toLowerCase().includes(cmdNeedle),
  );
  const cmdSegments = segments.filter(
    (seg) => !cmdNeedle || segmentLabel(seg.segment).toLowerCase().includes(cmdNeedle),
  );
  const cmdCampaigns = data.rows
    .filter((row) => !cmdNeedle || row.preview.toLowerCase().includes(cmdNeedle))
    .slice(0, 8);
  const cmdCount = cmdActions.length + cmdSegments.length + cmdCampaigns.length;
  // Clamp during render instead of resetting from an effect.
  const cmdIndex = Math.min(cmdSel, Math.max(0, cmdCount - 1));

  function runAction(kind: CmdKind) {
    if (kind === 'send') void send();
    else if (kind === 'audience-all') setSegment('all');
    else if (kind === 'export') exportCsv();
    else void load();
  }

  function runAt(index: number) {
    if (index < cmdActions.length) {
      runAction(cmdActions[index].kind);
      return;
    }
    const segIndex = index - cmdActions.length;
    if (segIndex < cmdSegments.length) {
      setSegment(cmdSegments[segIndex].segment);
      return;
    }
    const campIndex = segIndex - cmdSegments.length;
    if (campIndex < cmdCampaigns.length) setDetail(cmdCampaigns[campIndex]);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setDetail(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function exportCsv() {
    const rows = ['id;status;total;sent;failed;pending;delivery_rate;created_at;finished_at;body'];
    for (const r of data.rows) {
      rows.push(
        [
          r.id,
          r.status,
          r.total,
          r.sent,
          r.failed,
          r.pending,
          r.deliveryRate ?? '',
          r.createdAt,
          r.finishedAt ?? '',
          `"${r.body.replace(/"/g, '""')}"`,
        ].join(';'),
      );
    }
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '3set-broadcasts.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 1600);
    toast(`История выгружена: ${data.total} кампаний`);
  }

  return (
    <div className="adm-bc">
      <div className="bg-fx" aria-hidden="true">
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
      </div>

      <div className="content">
        {/* ------------------------------------------------ header */}
        <div className="sec-head reveal in">
          <div className="t">
            <span className="kick">Коммуникации · Telegram</span>
            <h2 className="st">Рассылка по базе</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.4, maxWidth: '80ch' }}>
              Соберите сообщение, выберите сегмент и отправьте. Доставку выполняет воркер
              очереди — прогресс ниже обновляется по реальным счётчикам.
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
            <button
              className="btn btn-quiet"
              type="button"
              onClick={() => document.getElementById('bc-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              К композитору
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

        {/* ------------------------------------------------ composer + preview */}
        <div className="g-2" id="bc-composer">
          <div className="card reveal in">
            <div className="card-h">
              <div>
                <span className="kick">Новая кампания</span>
                <h3 className="sub" style={{ marginTop: 6 }}>
                  Композитор рассылки
                </h3>
                <p>
                  Канал один — Telegram. Сообщение уходит получателям как есть, без подстановки
                  переменных.
                </p>
              </div>
              <span className={`pill ${canSend ? 'ok' : 'dim'}`}>
                <i />
                {canSend ? 'Готово к отправке' : 'Черновик'}
              </span>
            </div>

            {/* step 01 — message */}
            <div className="cstep">
              <div className="step-h">
                <span className="n">01</span>
                <div>
                  <b>Текст сообщения</b>
                  <span>до 4000 символов · Telegram</span>
                </div>
              </div>
              <div className="field">
                <textarea
                  className="textarea"
                  maxLength={4000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Напишите сообщение для пользователей…"
                  aria-label="Текст рассылки"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginTop: 6 }}>
                  <span className="hint">
                    Переменные <span className="mono">{'{{name}}'}</span> не подставляются — текст
                    отправляется дословно.
                  </span>
                  <span className="hint mono">
                    {bodyLen} / 4000
                  </span>
                </div>
              </div>
            </div>

            {/* step 02 — channel */}
            <div className="cstep">
              <div className="step-h">
                <span className="n">02</span>
                <div>
                  <b>Каналы доставки</b>
                  <span>доступен только Telegram</span>
                </div>
              </div>
              <div className="chan">
                <div className="chan-b on" role="group" aria-label="Telegram включён">
                  <span className="ci">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m22 2-7 20-4-9-9-4z" />
                      <path d="M22 2 11 13" />
                    </svg>
                  </span>
                  <span>
                    <b>Telegram</b>
                    <span>{nf(recipients)} получателей</span>
                  </span>
                </div>
                <div className="chan-b off" aria-disabled="true">
                  <span className="ci">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m2 7 10 6 10-6" />
                    </svg>
                  </span>
                  <span>
                    <b>Email</b>
                    <span>нет рассылочного транспорта</span>
                  </span>
                </div>
              </div>
              <div className="lockbox" style={{ marginTop: 11 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  <b>Email-канал недоступен.</b> В системе нет массового email-транспорта
                  (lib/mail.ts отправляет только транзакционные письма по одному), поэтому
                  кнопка отключена, а не имитируется.
                </span>
              </div>
            </div>

            {/* step 03 — audience */}
            <div className="cstep">
              <div className="step-h">
                <span className="n">03</span>
                <div>
                  <b>Аудитория</b>
                  <span>один сегмент за рассылку</span>
                </div>
              </div>
              <div className="aud">
                <button
                  type="button"
                  className={`aud-i${segment === 'all' ? ' on' : ''}`}
                  onClick={() => setSegment('all')}
                >
                  <span className="box" />
                  <span className="at">
                    <b>Все получатели</b>
                    <span>Все пользователи с Telegram-чатом</span>
                  </span>
                  <span className="an">{nf(stats.reachable)}</span>
                </button>
                {segments.map((s) => (
                  <button
                    key={s.segment}
                    type="button"
                    className={`aud-i${segment === s.segment ? ' on' : ''}`}
                    onClick={() => setSegment(s.segment)}
                  >
                    <span className="box" />
                    <span className="at">
                      <b>{segmentLabel(s.segment)}</b>
                      <span>{nf(s.size)} в сегменте · {nf(s.chatCount)} с чатом</span>
                    </span>
                    <span className="an">{nf(s.chatCount)}</span>
                  </button>
                ))}
              </div>
              <div className="recipients" style={{ marginTop: 12 }}>
                <div>
                  <span className="lbl">Получателей</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                    <b>{nf(recipients)}</b>
                    <span className="hint">{segmentLabel(segment)}</span>
                  </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span className="hint">Только пользователи с chat_id</span>
                </div>
              </div>
            </div>

            {/* step 04 — send */}
            <div className="cstep">
              <div className="step-h">
                <span className="n">04</span>
                <div>
                  <b>Отправка</b>
                  <span>сразу после подтверждения</span>
                </div>
              </div>
              <div className="lockbox">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>
                  <b>Планирование и черновики недоступны.</b> В таблице <span className="mono">broadcasts</span>{' '}
                  нет полей расписания и черновика, а воркер отправляет только поставленные в
                  очередь кампании. Отправка происходит сразу.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', paddingTop: 16, marginTop: 4, borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-primary" type="button" onClick={() => void send()} disabled={!canSend} style={{ flex: 2, minWidth: 210 }}>
                  {sending ? (
                    <>
                      <span className="spinner" /> Ставим в очередь…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2 11 13" />
                        <path d="m22 2-7 20-4-9-9-4z" />
                      </svg>
                      {bodyLen === 0
                        ? 'Напишите сообщение'
                        : recipients === 0
                          ? 'Нет получателей с чатом'
                          : `Отправить · ${nf(recipients)}`}
                    </>
                  )}
                </button>
                <button
                  className="btn btn-quiet"
                  type="button"
                  onClick={() => toast('Тестовая отправка недоступна: нет отдельного эндпоинта для теста', 'warn')}
                  style={{ flex: 1, minWidth: 170 }}
                >
                  Отправить тест себе
                </button>
              </div>
            </div>
          </div>

          {/* right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="card reveal in">
              <div className="card-h">
                <div>
                  <span className="kick">Предпросмотр</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Как увидит получатель
                  </h3>
                </div>
              </div>
              <div className="device">
                <div className="bar-top">
                  <i />
                  <i />
                  <i />
                  <span>Telegram · бот 3set</span>
                </div>
                <div className="tgm">
                  <div className="th">
                    <span className="tav">3S</span>
                    <span>
                      <b>3set VPN</b>
                      <span>бот · онлайн</span>
                    </span>
                  </div>
                  <div className="bub">{body.trim() || 'Текст сообщения появится здесь…'}</div>
                  <span className="ttime">только что ✓✓</span>
                </div>
              </div>
              <p className="hint" style={{ margin: '11px 0 0' }}>
                Предпросмотр дословный — ровно то, что получит пользователь в Telegram.
              </p>
            </div>

            <div className="card reveal in">
              <div className="card-h">
                <div>
                  <span className="kick">Аудитория</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Состав базы
                  </h3>
                </div>
              </div>
              <Donut
                total={stats.reachable}
                slices={segments
                  .filter((s) => s.chatCount > 0)
                  .map((s, i) => ({
                    label: segmentLabel(s.segment),
                    value: s.chatCount,
                    color: ['#b7ff45', '#8fdc2c', '#d4ff85', '#63d7c8', '#0c4f36', '#ffd166', '#ff9f6b'][i % 7],
                  }))}
              />
            </div>

            <div className="card reveal in">
              <div className="card-h">
                <div>
                  <span className="kick">Доставка</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Реальные счётчики
                  </h3>
                </div>
              </div>
              <div className="kv">
                <span>Всего кампаний</span>
                <b>{nf(stats.campaigns)}</b>
              </div>
              <div className="kv">
                <span>Сообщений доставлено</span>
                <b style={{ color: 'var(--lime)' }}>{nf(stats.messagesSent)}</b>
              </div>
              <div className="kv">
                <span>Сообщений с ошибкой</span>
                <b>{nf(stats.messagesFailed)}</b>
              </div>
              <div className="kv">
                <span>В процессе сейчас</span>
                <b>{nf(stats.inFlight)}</b>
              </div>
              <div className="kv">
                <span>Доставляемость</span>
                <b>{stats.deliverability === null ? '—' : `${stats.deliverability}%`}</b>
              </div>
              <div className="kv">
                <span>Кампаний за 30 дней</span>
                <b>{nf(stats.last30d)}</b>
              </div>
              <p className="hint" style={{ margin: '11px 0 0' }}>
                Открытия и клики не отслеживаются: в Telegram их нельзя измерить, а трекинга
                ссылок в системе нет.
              </p>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ history + chart */}
        <div className="g-2">
          <div className="card reveal in" id="bc-history">
            <div className="card-h">
              <div>
                <span className="kick">История</span>
                <h3 className="sub" style={{ marginTop: 6 }}>
                  Кампании
                </h3>
                <p>
                  {data.total === 0
                    ? 'Пока нет кампаний'
                    : `${rangeFrom}–${rangeTo} из ${nf(data.total)} · ${nf(stats.messagesSent)} сообщений доставлено`}
                </p>
              </div>
              <div className="chips">
                {FILTERS.map((f) => (
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
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 180 }}
                placeholder="Поиск по тексту сообщения…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    void load({ q, page: 1 });
                  }
                }}
              />
              <button className="btn btn-ghost sm" type="button" onClick={() => { setPage(1); void load({ q, page: 1 }); }} disabled={loading}>
                {loading ? <span className="spinner w" /> : 'Найти'}
              </button>
            </div>

            {data.rows.length > 0 ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Сообщение</th>
                      <th>Получатели</th>
                      <th>Доставлено</th>
                      <th>Ошибки</th>
                      <th>Доставляемость</th>
                      <th>Статус</th>
                      <th>Создана</th>
                      <th style={{ textAlign: 'right' }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => {
                      const meta = STATUS_META[r.status] ?? STATUS_META.queued;
                      return (
                        <tr
                          key={r.id}
                          style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
                        >
                          <td>
                            <b style={{ fontSize: 12.9, display: 'block', maxWidth: 340 }}>
                              {r.preview}
                            </b>
                            <span className="dim mono" style={{ fontSize: 10.6 }}>
                              {r.id}
                            </span>
                          </td>
                          <td className="num">{nf(r.total)}</td>
                          <td className="num" style={{ color: 'var(--lime)' }}>
                            {nf(r.sent)}
                          </td>
                          <td className="num" style={{ color: r.failed > 0 ? 'var(--red)' : undefined }}>
                            {nf(r.failed)}
                          </td>
                          <td>
                            {r.deliveryRate === null ? (
                              <span className="dim">—</span>
                            ) : (
                              <span className="rate">
                                <span className="num" style={{ fontSize: 12 }}>
                                  {r.deliveryRate}%
                                </span>
                                <span className="rb">
                                  <i style={{ width: `${r.deliveryRate}%` }} />
                                </span>
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`pill ${meta.cls}`}>
                              <i />
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            <span className="dim mono" style={{ fontSize: 11.2 }}>
                              {fmtDT(r.createdAt)}
                            </span>
                          </td>
                          <td>
                            <span className="acts">
                              <button className="ibtn" type="button" title="Просмотр" onClick={() => setDetail(r)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <button
                                className="ibtn"
                                type="button"
                                title="Скопировать текст в композитор"
                                onClick={() => {
                                  setBody(r.body);
                                  toast('Текст скопирован в композитор');
                                  document.getElementById('bc-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect width="14" height="14" x="8" y="8" rx="2" />
                                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
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
                    <path d="m3 11 18-8-8 18-2-8-8-2z" />
                  </svg>
                </span>
                <b>{q || filter !== 'all' ? 'Ничего не найдено' : 'Кампаний пока нет'}</b>
                <p>
                  {q || filter !== 'all'
                    ? 'Измените запрос или сбросьте фильтр статуса.'
                    : 'Отправьте первую рассылку в композиторе выше — она появится здесь сразу после постановки в очередь.'}
                </p>
              </div>
            )}

            {pages > 1 && (
              <div className="pager">
                <span className="hint">
                  Страница {data.page} из {pages}
                </span>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button
                    className="btn btn-quiet xs"
                    type="button"
                    disabled={data.page <= 1 || loading}
                    onClick={() => {
                      const next = data.page - 1;
                      setPage(next);
                      void load({ page: next });
                    }}
                  >
                    Назад
                  </button>
                  <button
                    className="btn btn-quiet xs"
                    type="button"
                    disabled={data.page >= pages || loading}
                    onClick={() => {
                      const next = data.page + 1;
                      setPage(next);
                      void load({ page: next });
                    }}
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="card reveal in">
              <div className="card-h">
                <div>
                  <span className="kick">Динамика</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Доставка за 30 дней
                  </h3>
                  <p>Кампаний и доставленных сообщений по дням</p>
                </div>
                <div className="legend">
                  <span>
                    <i style={{ background: 'var(--lime)' }} />
                    кампании
                  </span>
                  <span>
                    <i style={{ background: 'var(--deep)' }} />
                    доставлено
                  </span>
                </div>
              </div>
              <SeriesChart series={data.series} />
            </div>

            <div className="card reveal in">
              <div className="card-h">
                <div>
                  <span className="kick">Автоматизация</span>
                  <h3 className="sub" style={{ marginTop: 6 }}>
                    Автоматические отправки
                  </h3>
                  <p>Реальные типы уведомлений в очереди</p>
                </div>
              </div>
              <AutomationList rows={data.automation} />
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ modal */}
      {detail && (
        <div className="overlay open" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="modal">
            <div className="modal-h">
              <h3>Кампания</h3>
              <button className="icon-btn" type="button" onClick={() => setDetail(null)} aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className={`pill ${(STATUS_META[detail.status] ?? STATUS_META.queued).cls}`}>
                <i />
                {(STATUS_META[detail.status] ?? STATUS_META.queued).label}
              </span>
              <span className="pill dim mono">{detail.id}</span>
              <span className="pill dim">автор #{detail.authorTelegramId}</span>
            </div>
            <div className="kv">
              <span>Создана</span>
              <b>{fmtDT(detail.createdAt)}</b>
            </div>
            <div className="kv">
              <span>Завершена</span>
              <b>{fmtDT(detail.finishedAt)}</b>
            </div>
            <div className="kv">
              <span>Получателей</span>
              <b>{nf(detail.total)}</b>
            </div>
            <div className="kv">
              <span>Доставлено</span>
              <b style={{ color: 'var(--lime)' }}>{nf(detail.sent)}</b>
            </div>
            <div className="kv">
              <span>Ошибок</span>
              <b>{nf(detail.failed)}</b>
            </div>
            <div className="kv">
              <span>В процессе</span>
              <b>{nf(detail.pending)}</b>
            </div>
            <div className="kv">
              <span>Доставляемость</span>
              <b>{detail.deliveryRate === null ? '—' : `${detail.deliveryRate}%`}</b>
            </div>
            {detail.status === 'sending' && (
              <div style={{ marginTop: 12 }}>
                <div className="prog">
                  <i style={{ width: `${detail.total > 0 ? Math.round(((detail.sent + detail.failed) / detail.total) * 100) : 0}%` }} />
                </div>
                <p className="hint" style={{ margin: '6px 0 0' }}>
                  Обработано {nf(detail.sent + detail.failed)} из {nf(detail.total)}
                </p>
              </div>
            )}
            <div className="preview-box" style={{ marginTop: 13 }}>
              {detail.body}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setDetail(null)}>
                Закрыть
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setBody(detail.body);
                  setDetail(null);
                  toast('Текст скопирован в композитор');
                  document.getElementById('bc-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                В композитор
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ cmdk */}
      {cmdOpen && (
        <div className="cmdk open" onClick={(e) => { if (e.target === e.currentTarget) setCmdOpen(false); }}>
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
                placeholder="Кампании, сегменты, команды…"
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

              {cmdSegments.length > 0 && <div className="cmdk-g">Сегменты</div>}
              {cmdSegments.map((seg, i) => {
                const index = cmdActions.length + i;
                return (
                  <div
                    key={seg.segment}
                    className={`cmdk-i${index === cmdIndex ? ' on' : ''}`}
                    onClick={() => {
                      setSegment(seg.segment);
                      setCmdOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 3a9 9 0 0 1 0 18M3.6 9h16.8M3.6 15h16.8" />
                    </svg>
                    {segmentLabel(seg.segment)}
                    <span className="h">{nf(seg.chatCount)} с чатом</span>
                  </div>
                );
              })}

              {cmdCampaigns.length > 0 && <div className="cmdk-g">Кампании</div>}
              {cmdCampaigns.map((row, i) => {
                const index = cmdActions.length + cmdSegments.length + i;
                return (
                  <div
                    key={row.id}
                    className={`cmdk-i${index === cmdIndex ? ' on' : ''}`}
                    onClick={() => {
                      setDetail(row);
                      setCmdOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 11 18-8-8 18-2-8-8-2z" />
                    </svg>
                    {row.preview.slice(0, 60)}
                    <span className="h">{STATUS_META[row.status]?.label ?? row.status}</span>
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

/* -------------------------------------------------------------- KPI */

function KpiGrid({ stats }: { stats: BroadcastStats }) {
  const processed = stats.messagesSent + stats.messagesFailed;
  // Every bar is a real ratio; `null` renders no bar rather than a decorative one.
  const cards: { t: string; v: string; sub: string; bar: number | null; ic: ReactNode }[] = [
    {
      t: 'Кампаний всего',
      v: nf(stats.campaigns),
      sub: `${nf(stats.last30d)} за 30 дней`,
      bar: stats.campaigns > 0 ? Math.round((stats.last30d / stats.campaigns) * 100) : null,
      ic: <path d="m3 11 18-8-8 18-2-8-8-2z" />,
    },
    {
      t: 'Сообщений доставлено',
      v: nf(stats.messagesSent),
      sub: `из ${nf(processed)} обработанных`,
      bar: processed > 0 ? Math.round((stats.messagesSent / processed) * 100) : null,
      ic: <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m2 7 10 6 10-6" /></>,
    },
    {
      t: 'Доставляемость',
      v: stats.deliverability === null ? '—' : `${stats.deliverability}%`,
      sub: `${nf(stats.messagesFailed)} ошибок`,
      bar: stats.deliverability,
      ic: <><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>,
    },
    {
      t: 'В процессе',
      v: nf(stats.inFlight),
      sub: 'кампании в очереди и отправке',
      bar: stats.campaigns > 0 ? Math.round((stats.inFlight / stats.campaigns) * 100) : null,
      ic: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    },
    {
      t: 'Получателей с чатом',
      v: nf(stats.reachable),
      sub: 'потолок для «Все получатели»',
      bar: null,
      ic: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
    },
  ];
  return (
    <div className="kpi-grid reveal in">
      {cards.map((c, i) => (
        <div className="kpi" key={c.t} style={{ animation: `adm-bc-rowIn .5s var(--ease) ${i * 45}ms both` }}>
          <span className="ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {c.ic}
            </svg>
          </span>
          <span className="lbl">{c.t}</span>
          <b>{c.v}</b>
          <span className="hint">{c.sub}</span>
          {c.bar !== null && (
            <div className="bar">
              <i style={{ width: `${Math.max(2, Math.min(100, c.bar))}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- donut */

function Donut({
  total,
  slices,
}: {
  total: number;
  slices: { label: string; value: number; color: string }[];
}) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const sum = slices.reduce((s, x) => s + x.value, 0) || 1;
  // Precompute each arc's start offset with a scan (no accumulator mutated
  // mid-render, which the react-hooks immutability rule flags).
  const arcs = slices.map((s, i) => ({
    ...s,
    len: (s.value / sum) * C,
    offset: slices.slice(0, i).reduce((acc, prev) => acc + (prev.value / sum) * C, 0),
  }));
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14" />
          {arcs.map((s) => (
            <circle
              key={s.label}
              cx="65"
              cy="65"
              r={R}
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${s.len.toFixed(2)} ${(C - s.len).toFixed(2)}`}
              strokeDashoffset={(-s.offset).toFixed(2)}
            >
              <title>{`${s.label}: ${nf(s.value)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="ct">
          <b>{nf(total)}</b>
          <span>с чатом</span>
        </div>
      </div>
      <div className="dlist">
        {slices.length === 0 ? (
          <div className="dl">
            <span className="dim">Сегменты ещё не рассчитаны</span>
          </div>
        ) : (
          slices.map((s) => (
            <div className="dl" key={s.label}>
              <i style={{ background: s.color }} />
              <span>{s.label}</span>
              <b>{nf(s.value)}</b>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- chart */

function SeriesChart({ series }: { series: BroadcastSeriesPoint[] }) {
  const W = 460;
  const H = 200;
  const pl = 30;
  const pr = 12;
  const pt = 14;
  const pb = 26;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);

  const maxDelivered = Math.max(1, ...series.map((p) => p.delivered));
  const maxCampaigns = Math.max(1, ...series.map((p) => p.campaigns));
  const slot = series.length > 0 ? iw / series.length : iw;
  const bw = Math.min(14, slot * 0.28);

  return (
    <div className="chart-box">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 200 }} role="img" aria-label="Доставка за 30 дней">
        <g className="grid-l">
          {[0, 1, 2, 3, 4].map((k) => {
            const y = pt + (ih * k) / 4;
            return (
              <g key={k}>
                <line x1={pl} y1={y} x2={W - pr} y2={y} />
                <text className="axis" x={pl - 6} y={y + 3.4} textAnchor="end">
                  {Math.round(maxDelivered * (1 - k / 4))}
                </text>
              </g>
            );
          })}
        </g>
        {series.map((p, i) => {
          const cx = pl + slot * i + slot / 2;
          const hDel = Math.max(p.delivered > 0 ? 2 : 0, (p.delivered / maxDelivered) * ih);
          const hCamp = Math.max(p.campaigns > 0 ? 2 : 0, (p.campaigns / maxCampaigns) * ih);
          return (
            <g key={p.day}>
              <rect
                x={cx - bw - 1}
                y={pt + ih - hDel}
                width={bw}
                height={hDel}
                rx={3}
                fill="var(--lime)"
                opacity={0.85}
              />
              <rect
                x={cx + 1}
                y={pt + ih - hCamp}
                width={bw}
                height={hCamp}
                rx={3}
                fill="#0c4f36"
              />
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
                    text: `${nf(p.delivered)} доставлено · ${nf(p.campaigns)} камп.`,
                    sub: p.day,
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

/* -------------------------------------------------------------- automation */

function AutomationList({ rows }: { rows: AutomationRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <span className="eic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
        <b>Автоматических отправок пока нет</b>
        <p>Счётчики появятся, как только воркер поставит первое уведомление в очередь.</p>
      </div>
    );
  }
  return (
    <div>
      {rows.map((r) => {
        const meta = AUTOMATION_META[r.type];
        return (
          <div
            key={r.type}
            className="mini"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, marginBottom: 9 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13, display: 'block' }}>{meta?.label ?? r.type}</b>
              <span className="h" style={{ display: 'block' }}>
                {meta?.when ?? 'тип уведомления'} · {meta?.channel ?? 'Telegram'}
              </span>
              <span className="h" style={{ display: 'block', marginTop: 3, color: 'var(--lime)' }}>
                доставлено: {nf(r.done)}
                {r.pending > 0 && ` · в очереди: ${nf(r.pending)}`}
                {r.failed > 0 && ` · ошибок: ${nf(r.failed)}`}
              </span>
            </div>
            <span className={`pill ${r.failed > 0 ? 'bad' : r.pending > 0 ? 'warn' : 'ok'}`}>
              <i />
              {nf(r.total)}
            </span>
          </div>
        );
      })}
      <p className="hint" style={{ margin: '11px 0 0' }}>
        Конструктора триггеров нет: цепочки заданы в коде воркера, а таблицы для
        пользовательских триггеров в схеме не существует.
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FAQ_CATEGORIES, FAQ_ITEMS } from './faq-data';

const QUICK_START: { n: string; icon: string; title: string; body: string }[] = [
  { n: '01', icon: '⌁', title: 'Откройте личную страницу', body: 'Кабинет → активная подписка. Ссылка уникальна и равна ключу доступа.' },
  { n: '02', icon: '↓', title: 'Установите клиент', body: 'Лучше использовать приложение, которое первым предлагается для вашей системы.' },
  { n: '03', icon: '＋', title: 'Добавьте подписку', body: 'Нажмите кнопку импорта либо вставьте полную ссылку через «Из буфера».' },
  { n: '04', icon: '✓', title: 'Обновите и подключитесь', body: 'Разрешите VPN, обновите профиль, выберите рабочий сервер и подключитесь.' },
];

const POPULAR = ['не работает vpn', 'настроить iphone', 'лимит устройств'];

const PAGE_SIZE = 10;

/** Normalize for search: lowercase + ё→е (both common typos). */
function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е');
}

export default function FaqClient() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    const byCat = FAQ_ITEMS.filter(
      (item) => category === 'all' || item.category === category,
    );
    if (words.length === 0) return byCat;
    const hay = (item: (typeof FAQ_ITEMS)[number]) =>
      norm(`${item.title} ${item.tag} ${item.search} ${item.answer}`);
    // Prefer items matching ALL words; if that yields nothing (e.g. a different
    // word form), fall back to ANY word so the search never looks dead.
    const all = byCat.filter((item) => words.every((w) => hay(item).includes(w)));
    return all.length > 0
      ? all
      : byCat.filter((item) => words.some((w) => hay(item).includes(w)));
  }, [query, category]);

  const shown = filtered.slice(0, visible);

  function pickCategory(key: string) {
    setCategory(key);
    setVisible(PAGE_SIZE);
  }

  function onQuery(value: string) {
    setQuery(value);
    setVisible(PAGE_SIZE);
  }

  function toggle(id: string) {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="flex flex-col gap-10">
      {/* HERO */}
      <section className="flex flex-col gap-4 rounded-2xl border-2 border-foreground/15 bg-panel p-6 shadow-[0_24px_60px_-30px_rgba(14,21,18,.35)] sm:p-8">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
          Помощь 3set
        </span>
        <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">Чем помочь?</h1>
        <p className="text-muted">
          Подключение, оплата и настройки — найдите ответ или выберите тему ниже.
        </p>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-3 focus-within:border-green">
          <span aria-hidden className="text-dim">⌕</span>
          <input
            type="search"
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Например: не работает VPN или как добавить ключ"
            aria-label="Поиск по вопросам и ответам"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-dim focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => onQuery('')}
              className="text-dim hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
            Часто ищут
          </span>
          {POPULAR.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onQuery(p)}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-green hover:text-green"
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      {/* QUICK START */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
            Быстрый старт
          </span>
          <h2 className="text-2xl font-semibold text-foreground">Первое подключение</h2>
          <p className="text-sm text-muted">
            Приложение — только клиент. Доступ появляется после импорта вашей подписки 3set.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_START.map((s) => (
            <article
              key={s.n}
              className="relative flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5"
            >
              <span className="font-mono text-[11px] text-dim">{s.n}</span>
              <span className="text-xl text-green" aria-hidden>
                {s.icon}
              </span>
              <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
              <p className="text-xs text-muted">{s.body}</p>
            </article>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-panel-2 p-4 text-sm text-muted">
          <b className="text-foreground">Важно.</b> Не отправляйте ссылку подписки в чат, не
          вставляйте её в онлайн-конвертеры и не публикуйте скриншот с QR-кодом.
        </div>
      </section>

      {/* Q&A */}
      <section id="answers" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
            {FAQ_ITEMS.length} ответов
          </span>
          <h2 className="text-2xl font-semibold text-foreground">Вопросы и ответы</h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="flex flex-col gap-1.5 lg:sticky lg:top-20 lg:self-start">
            <h3 className="mb-1 font-mono text-xs uppercase tracking-widest text-dim">Темы</h3>
            <button
              type="button"
              onClick={() => pickCategory('all')}
              className={chipClass(category === 'all')}
            >
              <span className="flex-1 text-left">Все</span>
              <span className="font-mono text-[10px] text-dim">{FAQ_ITEMS.length}</span>
            </button>
            {FAQ_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => pickCategory(c.key)}
                className={chipClass(category === c.key)}
              >
                <span className="flex-1 text-left">{c.label}</span>
                <span className="font-mono text-[10px] text-dim">{c.count}</span>
              </button>
            ))}
          </aside>

          <div className="flex flex-col gap-3">
            <div className="font-mono text-xs text-dim" aria-live="polite">
              {query.trim()
                ? `Найдено: ${filtered.length}`
                : `Показано ${Math.min(shown.length, filtered.length)} из ${filtered.length}`}
            </div>

            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-10 text-center">
                <span className="text-2xl text-dim" aria-hidden>⌕</span>
                <h3 className="font-semibold text-foreground">Ничего не найдено</h3>
                <p className="text-sm text-muted">
                  Попробуйте другой запрос или выберите тему слева.
                </p>
              </div>
            ) : (
              shown.map((item) => {
                const isOpen = !!open[item.id];
                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-2xl border border-line bg-panel"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 p-5 text-left"
                    >
                      <span className="flex flex-col gap-1">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-green">
                          {item.tag}
                        </span>
                        <span className="font-semibold text-foreground">{item.title}</span>
                      </span>
                      <span
                        className={`font-mono text-lg text-green transition-transform ${
                          isOpen ? 'rotate-45' : ''
                        }`}
                        aria-hidden
                      >
                        +
                      </span>
                    </button>
                    {isOpen && (
                      <div
                        className="faq-answer border-t border-line px-5 pb-5 pt-4 text-sm leading-relaxed text-muted"
                        // Trusted static HTML generated from the FAQ data file.
                        dangerouslySetInnerHTML={{ __html: item.answer }}
                      />
                    )}
                  </article>
                );
              })
            )}

            {visible < filtered.length && (
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="self-center rounded-lg border border-line px-5 py-2.5 text-sm text-muted transition-colors hover:bg-foreground/5"
              >
                Показать ещё · {filtered.length - visible}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* SUPPORT */}
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-panel p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
            Поддержка 3set
          </span>
          <h3 className="text-lg font-semibold text-foreground">Поможем разобраться</h3>
          <p className="text-sm text-muted">
            Не нашли ответ? Напишите, что случилось и на каком устройстве.
          </p>
        </div>
        <Link
          href="/support"
          className="flex h-12 items-center justify-center rounded-lg bg-foreground px-5 font-display text-sm font-medium tracking-wide text-lime transition-colors hover:opacity-90"
        >
          Открыть поддержку
        </Link>
      </section>
    </div>
  );
}

function chipClass(active: boolean): string {
  return `flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
    active
      ? 'border-green bg-lime/20 text-foreground'
      : 'border-line text-muted hover:bg-foreground/5'
  }`;
}

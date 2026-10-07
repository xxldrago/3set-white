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

const CHECKS: { title: string; hint: string }[] = [
  { title: 'Проверьте интернет без VPN', hint: 'Откройте несколько сайтов при выключенном клиенте.' },
  { title: 'Закройте другие VPN и прокси', hint: 'Одновременно должен работать только один VPN-клиент.' },
  { title: 'Обновите приложение', hint: 'Старые версии могут не понимать новый формат подписки.' },
  { title: 'Обновите профиль', hint: 'Нажмите обновление рядом с названием подписки.' },
  { title: 'Смените сервер', hint: 'Выберите другой узел с числовой задержкой.' },
  { title: 'Смените сеть', hint: 'Wi-Fi ↔ мобильный интернет.' },
  { title: 'Проверьте TUN и маршрутизацию', hint: 'Включите TUN; для теста переключите Rule/Global.' },
  { title: 'Попробуйте другой клиент', hint: 'Например, INCY вместо Happ или FlClashX на компьютере.' },
  { title: 'Проверьте доступность серверов', hint: 'Откройте список серверов и запустите проверку задержки.' },
];

const POPULAR = ['как настроить айфон', 'подключено но интернета нет', 'лимит устройств'];

const PAGE_SIZE = 10;

export default function FaqClient() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.tag.toLowerCase().includes(q) ||
        item.search.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  const shown = filtered.slice(0, visible);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  function pickCategory(key: string) {
    setCategory(key);
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
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Например: не работает VPN или как добавить ключ"
            aria-label="Поиск по вопросам и ответам"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-dim focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => setQuery('')}
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
              onClick={() => {
                setQuery(p);
                setVisible(PAGE_SIZE);
              }}
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

      {/* DIAGNOSTIC */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
            Диагностика
          </span>
          <h2 className="text-2xl font-semibold text-foreground">VPN не работает?</h2>
          <p className="text-sm text-muted">
            Отмечайте шаги по порядку. После каждого шага проверяйте соединение снова.
          </p>
        </div>
        <article className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted">
              {checkedCount} из {CHECKS.length}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <i
                className="block h-full rounded-full bg-lime transition-[width] duration-300"
                style={{ width: `${(checkedCount / CHECKS.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex flex-col divide-y divide-line">
            {CHECKS.map((c, i) => (
              <label key={c.title} className="flex cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={() => setChecked((p) => ({ ...p, [i]: !p[i] }))}
                  className="mt-0.5 h-4 w-4 accent-[#0c4f36]"
                />
                <span className="flex flex-col">
                  <b className="text-sm font-medium text-foreground">{c.title}</b>
                  <small className="text-xs text-muted">{c.hint}</small>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChecked({})}
            className="self-start rounded-lg border border-line px-4 py-2 text-xs text-muted transition-colors hover:bg-foreground/5"
          >
            Сбросить отметки
          </button>
        </article>
      </section>

      {/* Q&A */}
      <section className="flex flex-col gap-4">
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
              {filtered.length === FAQ_ITEMS.length
                ? `Показано ${Math.min(shown.length, filtered.length)} из ${filtered.length}`
                : `Найдено: ${filtered.length}`}
            </div>

            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-10 text-center">
                <span className="text-2xl text-dim" aria-hidden>⌕</span>
                <h3 className="font-semibold text-foreground">Ничего не найдено</h3>
                <p className="text-sm text-muted">Попробуйте другую тему или запрос.</p>
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

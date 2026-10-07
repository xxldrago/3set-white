'use client';

import { useEffect, useMemo, useState } from 'react';
import { APPS, PLATFORMS, PLATFORM_ORDER } from './install-data';

export interface InstallKey {
  id: string;
  name: string;
  daysLeft: number | null;
  devices: number | null;
  subscriptionUrl: string | null;
}

const OS_ICON: Record<string, 'phone' | 'desktop' | 'tv'> = {
  ios: 'phone',
  android: 'phone',
  windows: 'desktop',
  macos: 'desktop',
  linux: 'desktop',
  appletv: 'tv',
  androidtv: 'tv',
};

function OsIcon({ kind }: { kind: 'phone' | 'desktop' | 'tv' }) {
  if (kind === 'phone') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
        <rect x="7.5" y="2.5" width="9" height="19" rx="3" />
        <path d="M10 5.5h4" strokeLinecap="round" />
        <circle cx="12" cy="18.1" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === 'tv') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
        <rect x="3" y="5" width="18" height="12" rx="2.5" />
        <path d="M9 21h6m-3-4v4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <rect x="4" y="4" width="16" height="11" rx="2" />
      <path d="M2 18.5h20" strokeLinecap="round" />
    </svg>
  );
}

export default function InstallClient({
  keys,
  initialKeyId,
}: {
  keys: InstallKey[];
  initialKeyId?: string;
}) {
  const [os, setOs] = useState('macos');
  const [app, setApp] = useState('incy');
  const [keyId, setKeyId] = useState(initialKeyId ?? keys[0]?.id ?? '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setOs(
      /iphone|ipad|ipod/.test(ua)
        ? 'ios'
        : /android/.test(ua)
          ? 'android'
          : /mac os/.test(ua)
            ? 'macos'
            : /linux|x11/.test(ua)
              ? 'linux'
              : 'windows',
    );
  }, []);

  const platform = PLATFORMS[os] ?? PLATFORMS.macos!;
  const appList = platform.apps;
  const currentAppId = appList.includes(app) ? app : appList[0]!;
  const guideApp = APPS[currentAppId]!;
  const currentKey = useMemo(
    () => keys.find((k) => k.id === keyId) ?? keys[0] ?? null,
    [keys, keyId],
  );
  const subUrl = currentKey?.subscriptionUrl ?? '';

  const tv = /TV/.test(platform.name);
  const steps = [
    `Установите ${guideApp.name} из официального источника по кнопке ниже и откройте приложение.`,
    subUrl
      ? `Нажмите «Добавить подписку» — ${guideApp.name} откроется и получит вашу персональную ссылку автоматически.`
      : 'Сначала купите подписку — затем вернитесь сюда за персональной ссылкой и авто-импортом.',
    tv
      ? `Обновите подписку в ${guideApp.name}, выберите сервер и запустите подключение на ${platform.name}.`
      : `Обновите подписку в ${guideApp.name}, выберите сервер и включите VPN. Автообновление лучше оставить включённым.`,
  ];

  const downloads =
    guideApp.downloads[os] ?? [{ label: `${guideApp.name} — официальный источник`, url: '#' }];

  async function copy() {
    if (!subUrl) return;
    try {
      await navigator.clipboard.writeText(subUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      {/* Config */}
      <aside className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-mono text-xs text-lime">
            01
          </span>
          <div>
            <b className="block text-sm font-semibold text-foreground">Ваша подписка</b>
            <small className="text-xs text-muted">Выберите подключение</small>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {keys.length === 0 ? (
            <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm text-muted">
              Подписок пока нет.{' '}
              <a href="/#tariff" className="text-green underline">
                Купить подписку
              </a>
            </div>
          ) : (
            keys.map((k) => {
              const active = k.id === currentKey?.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKeyId(k.id)}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active ? 'border-green bg-lime/15' : 'border-line hover:bg-foreground/5'
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate text-sm text-foreground">{k.name}</b>
                    <small className="text-xs text-muted">
                      {k.daysLeft === null ? '—' : `${k.daysLeft} дн.`} ·{' '}
                      {k.devices === null ? '—' : `${k.devices} устр.`}
                    </small>
                  </span>
                  {active && <i className="text-green">✓</i>}
                </button>
              );
            })
          )}
        </div>

        <div className="h-px bg-line" />

        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-mono text-xs text-lime">
            02
          </span>
          <div>
            <b className="block text-sm font-semibold text-foreground">Устройство / ОС</b>
            <small className="text-xs text-muted">Где будет работать VPN</small>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_ORDER.map((key) => {
            const active = key === os;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOs(key)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  active ? 'border-green bg-lime/15 text-foreground' : 'border-line text-muted hover:bg-foreground/5'
                }`}
              >
                <span className="h-5 w-5 shrink-0">
                  <OsIcon kind={OS_ICON[key]!} />
                </span>
                <b className="truncate font-medium">{PLATFORMS[key]!.name}</b>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-line" />

        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground font-mono text-xs text-lime">
            03
          </span>
          <div>
            <b className="block text-sm font-semibold text-foreground">Приложение</b>
            <small className="text-xs text-muted">Доступные для выбранной системы</small>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {appList.map((id, index) => {
            const a = APPS[id]!;
            const active = id === currentAppId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setApp(id)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                  active ? 'border-green bg-lime/15' : 'border-line hover:bg-foreground/5'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel-2 font-display text-sm font-semibold text-green">
                    {a.name[0]}
                  </span>
                  <span className="flex flex-col">
                    <b className="text-sm text-foreground">
                      {a.name} {index === 0 && <em className="font-mono text-[10px] not-italic text-green">советуем</em>}
                    </b>
                    <small className="text-xs text-muted">{a.note}</small>
                  </span>
                </span>
                {active && <i className="text-green">✓</i>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Guide */}
      <article className="flex flex-col gap-5 rounded-2xl border-2 border-foreground/15 bg-panel p-6 shadow-[0_24px_60px_-30px_rgba(14,21,18,.35)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
              Готовая инструкция
            </span>
            <h2 className="text-2xl font-semibold text-foreground">
              {guideApp.name} · {platform.name}
            </h2>
            <p className="text-sm text-muted">
              Официальная загрузка и автоматический импорт персональной ссылки.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">
            3 шага
          </span>
        </div>

        {/* Selected subscription */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 p-3">
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
              Ссылка подписки
            </span>
            <b className="truncate text-sm text-foreground">{currentKey?.name ?? 'Подписка не выбрана'}</b>
            <code className="truncate font-mono text-xs text-muted" title={subUrl}>
              {subUrl || '—'}
            </code>
          </div>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!subUrl}
            className="flex h-10 shrink-0 items-center justify-center rounded-lg border border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-40"
          >
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
        </div>

        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-xs text-green">{`0${i + 1}`}</span>
              <p className="text-sm text-muted">{step}</p>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-3">
          {downloads.map((d, i) => (
            <a
              key={d.label}
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className={
                i === 0
                  ? 'flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 font-display text-sm font-medium tracking-wide text-lime transition-colors hover:opacity-90'
                  : 'flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:bg-foreground/5'
              }
            >
              {d.label}
            </a>
          ))}
          {subUrl ? (
            <a
              href={guideApp.importLink(subUrl)}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-green px-4 text-sm text-green transition-colors hover:bg-lime/15"
            >
              ＋ Добавить подписку
            </a>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <b className="text-sm text-foreground">Не получилось?</b>
            <p className="text-sm text-muted">
              Сначала откройте FAQ по приложению. Если ошибка останется — поддержка поможет по скриншоту.
            </p>
          </div>
          <div className="flex shrink-0 gap-4 text-sm">
            <a href="/faq" className="text-green hover:underline">
              FAQ по настройке →
            </a>
            <a href="/support" className="text-green hover:underline">
              Техподдержка ↗
            </a>
          </div>
        </div>
      </article>
    </div>
  );
}

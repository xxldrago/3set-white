'use client';

// Post-purchase device guide: detects the buyer's OS from the user agent and
// shows the matching install steps for the recommended app, with an OS/app
// switcher for any other device. Shares the install-data catalogue with
// /install (same apps, links, deep-link imports) but renders inline — no
// navigation needed right after payment.
import { useState } from 'react';
import CopyButton from './CopyButton';
import { t } from '@/lib/i18n';
import { APPS, PLATFORMS, PLATFORM_ORDER } from '@/app/install/install-data';

function detectOs(): string {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/mac os/.test(ua)) return 'macos';
  if (/linux|x11/.test(ua)) return 'linux';
  return 'windows';
}

const OS_PILL =
  'h-11 flex-1 whitespace-nowrap rounded-full border border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';
const OS_PILL_ACTIVE =
  'h-11 flex-1 whitespace-nowrap rounded-full bg-foreground px-4 text-sm text-lime transition-colors disabled:opacity-50';

export default function DeviceGuide({ subscriptionUrl }: { subscriptionUrl: string }) {
  // Lazy initializer (not an effect): the OS is read once from the buyer’s
  // own user agent on mount; the switcher below handles every other device.
  const [os, setOs] = useState<string>(() => detectOs());
  const [appId, setAppId] = useState<string | null>(null);

  const platform = PLATFORMS[os] ?? PLATFORMS.windows!;
  const appList = platform.apps;
  const currentAppId = appId && appList.includes(appId) ? appId : appList[0]!;
  const guideApp = APPS[currentAppId]!;
  const importUrl = guideApp.importLink(subscriptionUrl);
  const downloads = guideApp.downloads[os] ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
          {t('guides.title')}
        </span>
        <h3 className="text-xl font-semibold text-foreground">
          {t('guides.detected', { platform: platform.name })}
        </h3>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">{t('guides.osLabel')}</span>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setOs(key)}
              aria-pressed={os === key}
              className={os === key ? OS_PILL_ACTIVE : OS_PILL}
            >
              {PLATFORMS[key]!.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">{t('guides.appLabel')}</span>
        <div className="flex flex-wrap gap-2">
          {appList.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setAppId(id)}
              aria-pressed={currentAppId === id}
              className={currentAppId === id ? OS_PILL_ACTIVE : OS_PILL}
            >
              {APPS[id]!.name}
            </button>
          ))}
        </div>
      </div>

      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted">
        <li>{t('guides.stepInstall', { app: guideApp.name })}</li>
        <li>{t('guides.stepImport', { app: guideApp.name })}</li>
        <li>{t('guides.stepConnect', { app: guideApp.name, platform: platform.name })}</li>
      </ol>

      <div className="flex flex-col gap-2">
        {downloads.map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center rounded-full border border-line px-5 text-sm transition-colors hover:bg-foreground/5"
          >
            {item.label}
          </a>
        ))}
        <a
          href={importUrl}
          className="flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-sm text-lime transition-colors hover:opacity-90"
        >
          {t('guides.importCta', { app: guideApp.name })}
        </a>
        <div className="flex items-center gap-2">
          <code className="line-clamp-1 max-w-full flex-1 break-all text-xs text-muted">
            {subscriptionUrl}
          </code>
          <CopyButton value={subscriptionUrl} />
        </div>
      </div>
    </div>
  );
}

// Install-page data — apps, platforms and official download links, ported from
// the ARTΞMIDA install page and rebranded for 3set. Deep links use each client's
// URL scheme to import the personal subscription link.

export interface AppDownload {
  label: string;
  url: string;
}

export interface AppDef {
  id: string;
  name: string;
  note: string;
  /** Build the client deep link that imports the subscription URL. */
  importLink: (link: string) => string;
  downloads: Record<string, AppDownload[]>;
}

export interface PlatformDef {
  name: string;
  apps: string[];
}

const RELEASES = {
  incy: 'https://github.com/INCY-DEV/incy-platforms/releases/latest',
  happ: 'https://github.com/Happ-proxy/happ-desktop/releases/latest',
  clashmi: 'https://github.com/KaringX/clashmi/releases/latest',
  flclashx: 'https://github.com/pluralplay/FlClashX/releases/latest',
};

const APPLE: Record<string, string> = {
  incy: 'https://apps.apple.com/us/app/incy/id6756943388',
  happ: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215',
  clashmi: 'https://apps.apple.com/us/app/clash-mi/id6744321968',
};

const PLAY: Record<string, string> = {
  incy: 'https://play.google.com/store/apps/details?id=llc.itdev.incy',
  happ: 'https://play.google.com/store/apps/details?id=com.happproxy',
};

export const APPS: Record<string, AppDef> = {
  incy: {
    id: 'incy',
    name: 'INCY',
    note: 'Современный клиент',
    importLink: (link) => `incy://import/${link}`,
    downloads: {
      ios: [{ label: 'App Store', url: APPLE.incy! }],
      android: [
        { label: 'Google Play', url: PLAY.incy! },
        { label: 'Android APK', url: `${RELEASES.incy}/download/Incy.apk` },
      ],
      windows: [
        { label: 'Windows x64 — установщик', url: `${RELEASES.incy}/download/incy-windows-setup.exe` },
        { label: 'Windows x64 — portable', url: `${RELEASES.incy}/download/incy-windows-portable.zip` },
      ],
      macos: [
        { label: 'App Store', url: APPLE.incy! },
        { label: 'macOS Apple Silicon', url: `${RELEASES.incy}/download/incy-macos-arm64.dmg` },
        { label: 'macOS Intel', url: `${RELEASES.incy}/download/incy-macos-intel.dmg` },
      ],
      linux: [
        { label: 'Linux x64 · DEB', url: `${RELEASES.incy}/download/incy-linux-x64.deb` },
        { label: 'Linux ARM64 · DEB', url: `${RELEASES.incy}/download/incy-linux-arm64.deb` },
        { label: 'Linux x64 · portable', url: `${RELEASES.incy}/download/incy-linux-x64-portable.zip` },
        { label: 'Все Linux-сборки', url: RELEASES.incy },
      ],
      appletv: [{ label: 'App Store', url: APPLE.incy! }],
      androidtv: [
        { label: 'Google Play', url: PLAY.incy! },
        { label: 'Android APK', url: `${RELEASES.incy}/download/Incy.apk` },
      ],
    },
  },
  happ: {
    id: 'happ',
    name: 'Happ',
    note: 'Простой клиент',
    importLink: (link) => `happ://add/${link}`,
    downloads: {
      ios: [
        { label: 'App Store (RU)', url: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973' },
        { label: 'App Store (Global)', url: APPLE.happ! },
      ],
      android: [
        { label: 'Google Play', url: PLAY.happ! },
        { label: 'Android — релизы', url: 'https://github.com/Happ-proxy/happ-android/releases/latest' },
      ],
      windows: [
        { label: 'Windows x64 — установщик', url: 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe' },
      ],
      macos: [
        { label: 'App Store', url: APPLE.happ! },
        { label: 'macOS — релизы', url: RELEASES.happ },
      ],
      linux: [{ label: 'Linux — релизы', url: RELEASES.happ }],
      appletv: [{ label: 'App Store', url: APPLE.happ! }],
      androidtv: [
        { label: 'Google Play', url: PLAY.happ! },
        { label: 'Android — релизы', url: 'https://github.com/Happ-proxy/happ-android/releases/latest' },
      ],
    },
  },
  clashmi: {
    id: 'clashmi',
    name: 'Clash Mi',
    note: 'Mihomo-клиент',
    importLink: (link) => `clash://install-config?overwrite=no&name=3set&url=${link}`,
    downloads: {
      ios: [{ label: 'App Store', url: APPLE.clashmi! }],
      android: [{ label: 'Android — релизы', url: RELEASES.clashmi }],
      windows: [{ label: 'Windows — релизы', url: RELEASES.clashmi }],
      macos: [{ label: 'macOS — релизы', url: RELEASES.clashmi }],
      linux: [{ label: 'Linux — релизы', url: RELEASES.clashmi }],
    },
  },
  flclashx: {
    id: 'flclashx',
    name: 'FlClashX',
    note: 'TUN и правила',
    importLink: (link) => `flclashx://install-config?url=${link}`,
    downloads: {
      android: [{ label: 'Android — релизы', url: RELEASES.flclashx }],
      windows: [{ label: 'Windows — релизы', url: RELEASES.flclashx }],
      macos: [{ label: 'macOS — релизы', url: RELEASES.flclashx }],
      linux: [{ label: 'Linux — релизы', url: RELEASES.flclashx }],
      androidtv: [{ label: 'Android TV — релизы', url: RELEASES.flclashx }],
    },
  },
};

export const PLATFORMS: Record<string, PlatformDef> = {
  ios: { name: 'iPhone / iPad', apps: ['incy', 'happ', 'clashmi'] },
  android: { name: 'Android', apps: ['incy', 'happ', 'clashmi', 'flclashx'] },
  windows: { name: 'Windows', apps: ['incy', 'happ', 'clashmi', 'flclashx'] },
  macos: { name: 'macOS', apps: ['incy', 'happ', 'clashmi', 'flclashx'] },
  linux: { name: 'Linux', apps: ['incy', 'happ', 'clashmi', 'flclashx'] },
  appletv: { name: 'Apple TV', apps: ['incy', 'happ'] },
  androidtv: { name: 'Android TV', apps: ['incy', 'happ', 'flclashx'] },
};

export const PLATFORM_ORDER = ['ios', 'android', 'windows', 'macos', 'linux', 'appletv', 'androidtv'] as const;

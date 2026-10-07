import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Manrope, Unbounded } from 'next/font/google';
import { t } from '@/lib/i18n';
import './globals.css';

// 3set brand type stack (matches 3set.online): Manrope body, Unbounded display,
// JetBrains Mono for code/ids. Self-hosted at build via next/font.
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

const unbounded = Unbounded({
  variable: '--font-unbounded',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0e1512',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: t('app.name'),
  description: t('app.tagline'),
  applicationName: t('app.name'),
  appleWebApp: {
    capable: true,
    title: '3set VPN',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${unbounded.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

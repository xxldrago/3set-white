import AuthPage from '@/components/AuthPage';
import { t } from '@/lib/i18n';

export const metadata = {
  title: `${t('login.title')} — ${t('app.name')}`,
};

// D-91 / AUTH-06: one centered max-w-md column, email form on top, Telegram
// widget below the divider — both siblings in normal document flow. The
// widget iframe is contained by TelegramWidgetSlot (no absolute/fixed
// positioning anywhere), which fixes the desktop bottom-left escape.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; ref?: string }>;
}) {
  const { mode, ref } = await searchParams;
  const initialMode = mode === 'register' ? 'register' : 'login';

  return <AuthPage initialMode={initialMode} referral={ref ?? null} />;
}

import AuthPage from '@/components/AuthPage';
import { t } from '@/lib/i18n';

export const metadata = {
  title: `${t('login.title')} — ${t('app.name')}`,
};

// External-traffic entry: byte-identical to /login except the register
// segment opens first. Login stays one tap away — same component, same
// routes, only the initial mode differs.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return <AuthPage initialMode="register" referral={ref ?? null} />;
}

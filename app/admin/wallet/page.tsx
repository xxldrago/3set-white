// /admin/wallet — ARTEMIDA API balance + top-up (administrator-only).
//
// Enforcement lives HERE (layouts are not a boundary): signed-out → /login,
// no/wrong role → 404. The balance is read server-side; a provider failure
// renders the panel with an "unavailable" value instead of an error page, so the
// top-up form stays usable when the provider is briefly down.
import { notFound, redirect } from 'next/navigation';
import { artemida, ArtemidaError } from '@/lib/artemida';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { logger } from '@/lib/logger';
import { t } from '@/lib/i18n';
import WalletClient from './WalletClient';

export const dynamic = 'force-dynamic';

export default async function AdminWalletPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  let balance: { balance: number; currency: string; unlimited: boolean } | null = null;
  try {
    balance = await artemida.getBalance();
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: 'admin-wallet-page', code: err.code, requestId: err.requestId });
    } else {
      logger.error({ route: 'admin-wallet-page', outcome: 'balance_failed' });
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">{t('admin.walletPageTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.walletPageSubtitle')}</p>
      </header>
      <WalletClient initialBalance={balance} />
    </section>
  );
}

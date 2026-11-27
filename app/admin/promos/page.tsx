// /admin/promos — promo registry (administrator-only).
//
// Enforcement lives HERE, not only in the layout (layouts are not a security
// boundary — T-05-01): signed-out → /login, no/wrong role → 404, never 403
// (D-51). Only `administrator` holds the `promos` section.
//
// The page resolves the first registry page server-side (so the table is in the
// HTML and works without JS), then hands it to the client island which
// refetches `/api/admin/promos/directory` for search, derived-status filter,
// sort and pagination. Nothing is rendered from fixtures: every counter, row
// and chart bucket is a real query over `promo_codes` + `orders` + `users` +
// `referral_clicks`.
//
// The schema has no `active`, `minSum` or note column and no PATCH endpoint, so
// the template's disable toggle, minimum-order threshold, comments and bulk
// enable/disable are rendered as explicitly disabled controls with a reason —
// never simulated.
import { notFound, redirect } from 'next/navigation';
import PromosApp from './PromosApp';
import './promos.css';
import { requireRole } from '@/lib/admin-auth';
import { PROMO_DEFAULT_PAGE_SIZE, adminPromosDirectory } from '@/lib/admin-promos-directory';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('admin.navPromos')} — ${t('app.name')}`,
};

export default async function AdminPromosPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const initial = await adminPromosDirectory({ pageSize: PROMO_DEFAULT_PAGE_SIZE });

  return <PromosApp initial={initial} />;
}

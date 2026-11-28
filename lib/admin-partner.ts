// Shared server guard for the partner-only admin surfaces. The role matrix
// gives `partner` exactly three sections (dashboard / referrals / payouts);
// every one of those pages re-checks the role here and resolves the caller's
// own `users` row server-side — never from client input.
import { notFound, redirect } from 'next/navigation';
import { requireRole } from './admin-auth';
import { prisma } from './prisma';
import { AdminError, SessionError } from './session';

/**
 * Same resolution for route handlers: instead of redirect/404 it reports why,
 * so the API can answer 401 (no session) or 404 (not a partner) explicitly.
 */
export type PartnerApiUser =
  | { ok: true; userId: number }
  | { ok: false; error: "unauthorized" | "not_found" };

export async function resolvePartnerApiUserId(): Promise<PartnerApiUser> {
  let telegramId: number;
  try {
    ({ telegramId } = await requireRole("partner"));
  } catch (err) {
    if (err instanceof SessionError) return { ok: false, error: "unauthorized" };
    if (err instanceof AdminError) return { ok: false, error: "not_found" };
    throw err;
  }
  const row = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, userId: row.id };
}

/** Resolve the signed-in partner's userId, or bounce/404 exactly like pages. */
export async function requirePartnerUserId(): Promise<number> {
  let telegramId: number;
  try {
    ({ telegramId } = await requireRole('partner'));
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }
  const row = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true },
  });
  if (!row) notFound();
  return row.id;
}

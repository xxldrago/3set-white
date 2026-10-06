import { type Balance } from './artemida';
import { env } from './env';
import { prisma } from './prisma';
import { t } from './i18n';
import { type NotifyDispatchResult, type TelegramSender } from './bot-payments';

export type BalanceStatus = 'ok' | 'low' | 'critical' | 'unknown';

export function classifyBalance(balance: Balance | null, threshold: number = env.ARTEMIDA_LOW_BALANCE_RUB): BalanceStatus {
  if (!balance) return 'unknown';
  if (balance.unlimited || balance.balance > threshold) return 'ok';
  if (balance.balance <= 0) return 'critical';
  return 'low';
}

export function parseAdminTelegramIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((part) => Number(part.trim())).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

export function balanceAlertText(status: Exclude<BalanceStatus, 'ok' | 'unknown'>): string {
  if (status === 'critical') return `${t('admin.balanceCriticalDm')} ${t('admin.balanceCriticalBody')}`;
  return `${t('admin.balanceLowDm')} ${t('admin.balanceLowBody')}`;
}

/** Dispatches a queued admin alert. The target is encoded in its dedupe key. */
export async function dispatchBalanceAlert(notificationId: string, send: TelegramSender): Promise<NotifyDispatchResult> {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId }, select: { dedupeKey: true } });
  if (!notification) return { outcome: 'skipped' };
  const [, , band, telegramId] = notification.dedupeKey.split(':');
  if (!telegramId || (band !== 'low' && band !== 'critical')) return { outcome: 'skipped' };
  try {
    await send.sendMessage(telegramId, balanceAlertText(band));
    return { outcome: 'pushed' };
  } catch {
    return { outcome: 'retryable_error' };
  }
}

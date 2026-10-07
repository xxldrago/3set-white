import { t } from '@/lib/i18n';

type BroadcastStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'unknown';
const TINT: Record<BroadcastStatus, string> = {
  queued: 'bg-background0/10 text-dim',
  sending: 'bg-amber-600/10 text-amber-600',
  sent: 'bg-green-600/10 text-green-600',
  failed: 'bg-red-600/10 text-red-600',
  unknown: 'bg-background0/10 text-dim',
};

function normalize(status: string): BroadcastStatus {
  return status === 'queued' || status === 'sending' || status === 'sent' || status === 'failed' ? status : 'unknown';
}
function label(status: BroadcastStatus): string {
  switch (status) {
    case 'queued': return t('admin.broadcastQueued');
    case 'sending': return t('admin.broadcastSending');
    case 'sent': return t('admin.broadcastSent');
    case 'failed': return t('admin.broadcastFailed');
    default: return t('admin.broadcastUnknown');
  }
}
export default function BroadcastStatusChip({ status }: { status: string }) {
  const kind = normalize(status);
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${TINT[kind]}`}>{label(kind)}</span>;
}

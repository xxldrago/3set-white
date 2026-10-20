// Shared, client-safe compensation vocabulary. The server service and the
// admin panel must agree on the caps and the reason labels; keeping this module
// free of Prisma imports lets the client render the same picker without
// pulling the database layer into the bundle.
import { t } from './i18n';

export const COMPENSATION_MAX_DAYS = 30;
export const COMPENSATION_MAX_PER_TICKET = 90;

export const COMPENSATION_REASONS = [
  'outage',
  'slow_response',
  'key_issue',
  'goodwill',
  'other',
] as const;

export type CompensationReason = (typeof COMPENSATION_REASONS)[number];

export function isCompensationReason(value: unknown): value is CompensationReason {
  return (
    typeof value === 'string' &&
    (COMPENSATION_REASONS as readonly string[]).includes(value)
  );
}

/** Literal RU label for the admin picker and the user-visible message. */
export function compensationReasonLabel(reason: CompensationReason): string {
  switch (reason) {
    case 'outage':
      return t('admin.compensationReasonOutage');
    case 'slow_response':
      return t('admin.compensationReasonSlowResponse');
    case 'key_issue':
      return t('admin.compensationReasonKeyIssue');
    case 'goodwill':
      return t('admin.compensationReasonGoodwill');
    case 'other':
      return t('admin.compensationReasonOther');
  }
}

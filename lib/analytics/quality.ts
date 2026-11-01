// lib/analytics/quality.ts
// Degraded response classifier and event summarizer for Phase 12.
// D-06: degraded = ARTEMIDA call failure only (timeout, 5xx after retries, 429 exhausted, 401, 402)
// Suspiciously empty response is NOT degraded.
// D-10: any in-window event → badge, no threshold.

export interface DataQualityEvent {
  id: string;
  source: string;
  reason: 'timeout' | '5xx' | '429' | '401' | '402' | 'network' | string;
  detail?: string | null;
  msk_day: string;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface QualitySummary {
  excluded: number;
  events: Array<{
    day: string;
    source: string;
    reason: string;
    detail?: string | null;
  }>;
}

export function classifyDegraded(err: any): boolean {
  if (!err) return false;
  
  // Check for ArtemidaError-like objects
  const code = err.code || err.status || err.type;
  const message = err.message || '';
  
  // Timeout
  if (code === 'timeout' || message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return true;
  }
  
  // Network errors (non-ArtemidaError)
  if (code === 'network' || message.includes('network') || message.includes('ECONNREFUSED')) {
    return true;
  }
  
  // HTTP status codes
  const status = err.status || err.statusCode;
  if (typeof status === 'number') {
    if (status === 401 || status === 402) return true;
    if (status === 429) return true; // exhausted retries
    if (status >= 500 && status < 600) return true; // 5xx after retries exhausted
  }
  
  // Check ArtemidaError codes
  if (err.code === 'unauthorized' || err.code === 'payment_required') return true;
  if (err.code === 'rate_limited') return true;
  if (err.code === 'server_error') return true;
  if (err.code === 'network_error') return true;
  if (err.code === 'timeout') return true;
  
  // 404, 409, empty responses are not degraded per D-06
  if (status === 404 || status === 409) return false;
  if (err.code === 'not_found' || err.code === 'conflict') return false;
  
  // Suspiciously empty response is not degraded
  if (err.code === 'empty_response' || message.includes('empty')) return false;
  
  return false;
}

export function summarizeOpen(events: DataQualityEvent[], fromDay: string, toDay: string): QualitySummary {
  const inWindow = events.filter(e => {
    if (!e.msk_day) return false;
    // Events where resolvedAt is null are open; also include unresolved events
    if (e.resolvedAt) return false; // closed, don't count
    // Check if in window (msk_day is the day of the event)
    return e.msk_day >= fromDay && e.msk_day < toDay;
  });
  
  return {
    excluded: inWindow.length,
    events: inWindow.map(e => ({
      day: e.msk_day,
      source: e.source,
      reason: e.reason,
      detail: e.detail,
    })),
  };
}

export function isIncomparableFromQuality(summary: QualitySummary, hasBaseData: boolean): boolean {
  if (!hasBaseData) return true;
  if (summary.excluded > 0) return true;
  return false;
}

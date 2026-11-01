// tests/unit/anomaly-detect.test.ts
// Unit tests for Phase 13 anomaly detection pure functions (lib/analytics/detect.ts).
// Tests cover all 4 detector types with edge cases.

import { describe, it, expect } from 'vitest';
import {
  detectPaymentDrop,
  detectFailedSpike,
  detectTicketSpike,
  detectRunwayLow,
  type AlertPayload,
} from '../../lib/analytics/detect';

describe('detectPaymentDrop', () => {
  const windowLabel = '2026-10-31';
  const threshold = 30; // 30%

  it('returns firing alert when WoW delta < -threshold', () => {
    // Base: 100 payments, Current: 50 payments = -50% drop
    const result = detectPaymentDrop(50, 100, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.type).toBe('payment_drop');
    expect(result?.severity).toBe('warning'); // -50% > -60% (2x threshold)
    expect(result?.windowLabel).toBe(windowLabel);
  });

  it('returns critical when drop > 2x threshold', () => {
    // Base: 100, Current: 30 = -70% drop (<-60%, critical)
    const result = detectPaymentDrop(30, 100, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('critical');
  });

  it('returns warning when drop exceeds threshold but not 2x', () => {
    // Base: 100, Current: 65 = -35% drop (warning, not critical)
    const result = detectPaymentDrop(65, 100, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('warning');
  });

  it('returns null when within threshold', () => {
    // Base: 100, Current: 80 = -20% drop (within 30% threshold)
    const result = detectPaymentDrop(80, 100, threshold, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when payments increased', () => {
    // Base: 100, Current: 120 = +20% growth
    const result = detectPaymentDrop(120, 100, threshold, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when both values are zero', () => {
    const result = detectPaymentDrop(0, 0, threshold, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when negative values', () => {
    const result = detectPaymentDrop(-10, 100, threshold, windowLabel);
    
    expect(result).toBeNull();
  });
});

describe('detectFailedSpike', () => {
  const windowLabel = '2026-10-31';
  const threshold = 15; // 15%

  it('returns firing alert when failed ratio > threshold', () => {
    // 20 failed out of 100 total = 20% failed rate
    const result = detectFailedSpike(20, 100, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.type).toBe('failed_spike');
    expect(result?.severity).toBe('warning'); // 20% < 30% (2x threshold)
    expect(result?.actualValue).toBeCloseTo(20, 1);
  });

  it('returns critical when ratio > 2x threshold', () => {
    // 40 failed out of 100 total = 40% failed rate (>30%)
    const result = detectFailedSpike(40, 100, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('critical');
  });

  it('returns null when ratio within threshold', () => {
    // 10 failed out of 100 total = 10% failed rate (<15%)
    const result = detectFailedSpike(10, 100, threshold, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when totalCount is zero', () => {
    const result = detectFailedSpike(0, 0, threshold, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when failedCount is negative', () => {
    const result = detectFailedSpike(-5, 100, threshold, windowLabel);
    
    expect(result).toBeNull();
  });
});

describe('detectTicketSpike', () => {
  const windowLabel = '2026-10-31';
  const threshold = 50; // 50%

  it('returns firing alert when WoW delta > threshold', () => {
    // Base: 10 tickets, Current: 20 tickets = +100% spike
    const result = detectTicketSpike(20, 10, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.type).toBe('ticket_spike');
    expect(result?.severity).toBe('warning'); // +100% == 2x threshold, not >
    expect(result?.windowLabel).toBe(windowLabel);
  });

  it('returns critical when spike > 2x threshold', () => {
    // Base: 10, Current: 25 = +150% spike (>100%, critical)
    const result = detectTicketSpike(25, 10, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('critical');
  });

  it('returns warning when spike exceeds threshold but not 2x', () => {
    // Base: 10, Current: 16 = +60% spike (warning)
    const result = detectTicketSpike(16, 10, threshold, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('warning');
  });

  it('returns null when within threshold', () => {
    // Base: 10, Current: 14 = +40% spike (<50%)
    const result = detectTicketSpike(14, 10, threshold, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when tickets decreased', () => {
    // Base: 10, Current: 5 = -50% drop
    const result = detectTicketSpike(5, 10, threshold, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when both values are zero', () => {
    const result = detectTicketSpike(0, 0, threshold, windowLabel);
    
    expect(result).toBeNull();
  });
});

describe('detectRunwayLow', () => {
  const windowLabel = '2026-10-31';
  const thresholdDays = 3; // 3 days

  it('returns firing alert when runway < thresholdDays', () => {
    // avgBalance: 3000, dailyBurn: 1500 = 2 days runway (<3)
    const result = detectRunwayLow(3000, 1500, thresholdDays, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.type).toBe('runway_low');
    expect(result?.severity).toBe('warning'); // 2 days > 1.5 (threshold/2)
    expect(result?.actualValue).toBeCloseTo(2, 1);
  });

  it('returns critical when runway < threshold/2', () => {
    // avgBalance: 1500, dailyBurn: 1500 = 1 day runway (<1.5)
    const result = detectRunwayLow(1500, 1500, thresholdDays, windowLabel);
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('critical');
  });

  it('returns null when runway >= thresholdDays', () => {
    // avgBalance: 15000, dailyBurn: 1500 = 10 days runway (>3)
    const result = detectRunwayLow(15000, 1500, thresholdDays, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when dailyBurn is zero', () => {
    const result = detectRunwayLow(3000, 0, thresholdDays, windowLabel);
    
    expect(result).toBeNull();
  });

  it('returns null when avgBalance is negative', () => {
    const result = detectRunwayLow(-1000, 1500, thresholdDays, windowLabel);
    
    expect(result).toBeNull();
  });
});

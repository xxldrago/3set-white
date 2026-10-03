// 04-07 Task 2 — bot support intake gate + content hardening (TDD RED).
//
// The flag/TTL gate and the subject/body bounds are pure logic, so they live
// in `lib/support-intake.ts` (no Telegraf import) and are unit-tested without a
// Telegram context. An unarmed/stale user must fall through (no ticket), and
// untrusted Telegram text is capped to the service bounds (subject ≤120,
// body ≤4000) with a keyed fallback subject for a caption-less photo.
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_BODY_MAX,
  SUPPORT_SUBJECT_MAX,
  buildSupportTicketContent,
  isSupportIntakeArmed,
} from '../../lib/support-intake';

const NOW = new Date('2026-10-03T12:00:00Z');
const fresh = new Date(NOW.getTime() - 5 * 60_000); // 5 min ago
const stale = new Date(NOW.getTime() - 31 * 60_000); // 31 min ago (past TTL)
const boundary = new Date(NOW.getTime() - 30 * 60_000); // exactly at TTL

describe('isSupportIntakeArmed', () => {
  it('is false for a missing user row', () => {
    expect(isSupportIntakeArmed(null, NOW)).toBe(false);
  });

  it('is false when the flag is not armed', () => {
    expect(
      isSupportIntakeArmed({ awaitingSupport: false, supportPromptAt: fresh }, NOW),
    ).toBe(false);
  });

  it('is false when armed but no prompt timestamp exists', () => {
    expect(
      isSupportIntakeArmed({ awaitingSupport: true, supportPromptAt: null }, NOW),
    ).toBe(false);
  });

  it('is true when armed and the prompt is fresh', () => {
    expect(
      isSupportIntakeArmed({ awaitingSupport: true, supportPromptAt: fresh }, NOW),
    ).toBe(true);
  });

  it('is false when armed but the prompt is stale (>30 min)', () => {
    expect(
      isSupportIntakeArmed({ awaitingSupport: true, supportPromptAt: stale }, NOW),
    ).toBe(false);
  });

  it('is false at the exact 30-minute TTL boundary', () => {
    expect(
      isSupportIntakeArmed({ awaitingSupport: true, supportPromptAt: boundary }, NOW),
    ).toBe(false);
  });
});

describe('buildSupportTicketContent', () => {
  it('uses the message text as subject and body', () => {
    expect(buildSupportTicketContent({ text: 'Не работает ключ' }, 'Поддержка')).toEqual({
      subject: 'Не работает ключ',
      body: 'Не работает ключ',
    });
  });

  it('uses a photo caption when there is no text', () => {
    expect(buildSupportTicketContent({ caption: 'Скриншот ошибки' }, 'Поддержка')).toEqual({
      subject: 'Скриншот ошибки',
      body: 'Скриншот ошибки',
    });
  });

  it('falls back to the keyed subject when a photo has no caption', () => {
    expect(buildSupportTicketContent({}, 'Поддержка')).toEqual({
      subject: 'Поддержка',
      body: '',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(buildSupportTicketContent({ text: '  помощь  ' }, 'Поддержка').subject).toBe('помощь');
  });

  it('caps the subject at SUPPORT_SUBJECT_MAX and the body at SUPPORT_BODY_MAX', () => {
    const long = 'я'.repeat(SUPPORT_BODY_MAX + 500);
    const { subject, body } = buildSupportTicketContent({ text: long }, 'Поддержка');
    expect(subject).toHaveLength(SUPPORT_SUBJECT_MAX);
    expect(body).toHaveLength(SUPPORT_BODY_MAX);
  });
});

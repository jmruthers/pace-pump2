/** PUMP-02 QA S-05, S-06, S-09 — comms log format helpers */
import { describe, expect, it } from 'vitest';
import {
  deliveryEventFailureReason,
  effectiveMessageTimestamp,
  formatShortDate,
  formatShortDateTime,
  formatTime24h,
  isValidUuid,
  localDayBoundsIso,
  subjectLine,
  truncateBodyPreview,
} from './commsLogFormat.js';

describe('commsLogFormat', () => {
  describe('isValidUuid (QA S-09)', () => {
    it('accepts a valid UUID', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects malformed ids', () => {
      expect(isValidUuid('abc')).toBe(false);
      expect(isValidUuid('')).toBe(false);
    });
  });

  describe('effectiveMessageTimestamp', () => {
    it('prefers sent_at, then scheduled_at, then created_at', () => {
      expect(
        effectiveMessageTimestamp({
          sent_at: '2026-05-01T10:00:00Z',
          scheduled_at: '2026-04-30T09:00:00Z',
          created_at: '2026-04-29T08:00:00Z',
        })
      ).toBe('2026-05-01T10:00:00Z');
      expect(
        effectiveMessageTimestamp({
          sent_at: null,
          scheduled_at: '2026-04-30T09:00:00Z',
          created_at: '2026-04-29T08:00:00Z',
        })
      ).toBe('2026-04-30T09:00:00Z');
    });
  });

  describe('subjectLine', () => {
    it('returns SMS label for sms channel', () => {
      expect(subjectLine('sms', 'Hello')).toBe('SMS message');
    });

    it('returns subject or em dash for email', () => {
      expect(subjectLine('email', '  Weekly update  ')).toBe('  Weekly update  ');
      expect(subjectLine('email', null)).toBe('—');
      expect(subjectLine('email', '   ')).toBe('—');
    });
  });

  describe('truncateBodyPreview', () => {
    it('returns empty for null or empty body', () => {
      expect(truncateBodyPreview(null)).toBe('');
      expect(truncateBodyPreview('')).toBe('');
    });

    it('returns short bodies unchanged', () => {
      expect(truncateBodyPreview('hello')).toBe('hello');
    });

    it('truncates long bodies with ellipsis', () => {
      const long = 'a'.repeat(100);
      expect(truncateBodyPreview(long, 80)).toBe(`${'a'.repeat(80)}…`);
    });
  });

  describe('localDayBoundsIso (QA S-05, S-06)', () => {
    it('returns inclusive local-day start and end as ISO strings', () => {
      const { start, end } = localDayBoundsIso('2026-04-15');
      const startDate = new Date(start);
      const endDate = new Date(end);
      expect(startDate.getFullYear()).toBe(2026);
      expect(startDate.getMonth()).toBe(3);
      expect(startDate.getDate()).toBe(15);
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(endDate.getFullYear()).toBe(2026);
      expect(endDate.getMonth()).toBe(3);
      expect(endDate.getDate()).toBe(15);
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });
  });

  describe('formatShortDate formatTime24h formatShortDateTime', () => {
    const iso = '2026-06-15T14:30:00.000Z';

    it('formatShortDate returns a non-empty date string', () => {
      expect(formatShortDate(iso).length).toBeGreaterThan(0);
    });

    it('formatTime24h returns an HH:MM pattern', () => {
      expect(formatTime24h(iso)).toMatch(/^\d{1,2}:\d{2}$/);
    });

    it('formatShortDateTime joins date and time parts', () => {
      expect(formatShortDateTime(iso)).toBe(`${formatShortDate(iso)} ${formatTime24h(iso)}`);
    });
  });

  describe('deliveryEventFailureReason', () => {
    it('returns reason string from payload', () => {
      expect(deliveryEventFailureReason({ reason: 'Bounced' })).toBe('Bounced');
    });

    it('returns null when payload is missing or reason is invalid', () => {
      expect(deliveryEventFailureReason(null)).toBeNull();
      expect(deliveryEventFailureReason({})).toBeNull();
      expect(deliveryEventFailureReason({ reason: '' })).toBeNull();
      expect(deliveryEventFailureReason({ reason: 42 })).toBeNull();
    });
  });
});

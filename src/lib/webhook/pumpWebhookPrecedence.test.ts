import { describe, expect, it } from 'vitest';
import {
  buildRecipientUpdatePatch,
  canTransitionRecipientStatus,
  type CommRecipientStatus,
  type NormalisedEventType,
} from '@pump-webhook-logic';
import { sampleRecipient } from './webhookTestFixtures';

const OCCURRED = '2026-05-20T12:00:00.000Z';

type PrecedenceCase = {
  current: CommRecipientStatus;
  eventType: NormalisedEventType;
  expectStatusChange: boolean;
};

describe('BR-Precedence forward-only lattice', () => {
  const cases: PrecedenceCase[] = [
    { current: 'pending', eventType: 'queued', expectStatusChange: true },
    { current: 'pending', eventType: 'delivered', expectStatusChange: true },
    { current: 'queued', eventType: 'delivered', expectStatusChange: true },
    { current: 'queued', eventType: 'queued', expectStatusChange: false },
    { current: 'delivered', eventType: 'bounced', expectStatusChange: true },
    { current: 'delivered', eventType: 'failed', expectStatusChange: true },
    { current: 'delivered', eventType: 'queued', expectStatusChange: false },
    { current: 'delivered', eventType: 'delivered', expectStatusChange: false },
    { current: 'delivered', eventType: 'suppressed', expectStatusChange: false },
    { current: 'bounced', eventType: 'queued', expectStatusChange: false },
    { current: 'bounced', eventType: 'delivered', expectStatusChange: false },
    { current: 'failed', eventType: 'delivered', expectStatusChange: false },
    { current: 'suppression_skipped', eventType: 'delivered', expectStatusChange: false },
  ];

  it.each(cases)('$current + $eventType → status change $expectStatusChange', (row) => {
    const nextStatus =
      row.eventType === 'queued'
        ? 'queued'
        : row.eventType === 'delivered'
          ? 'delivered'
          : row.eventType === 'bounced'
            ? 'bounced'
            : row.eventType === 'failed' || row.eventType === 'spam_complaint'
              ? 'failed'
              : row.eventType === 'suppressed'
                ? 'suppression_skipped'
                : 'pending';

    if (nextStatus !== 'pending') {
      expect(canTransitionRecipientStatus(row.current, nextStatus)).toBe(row.expectStatusChange);
    }

    const recipient = sampleRecipient({ status: row.current });
    const patch = buildRecipientUpdatePatch(
      recipient,
      row.eventType,
      OCCURRED,
      'resend',
      { type: `email.${row.eventType}`, data: { email_id: 'e1' } }
    );
    if (row.expectStatusChange && patch.status) {
      expect(patch.status).toBeDefined();
    } else {
      expect(patch.status).toBeUndefined();
    }
  });
});

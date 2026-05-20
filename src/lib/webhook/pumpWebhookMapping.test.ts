import { describe, expect, it } from 'vitest';
import {
  buildRecipientUpdatePatch,
  buildSuppressionUpserts,
  mapResendProviderType,
  mapTwilioMessageStatus,
  type NormalisedEventType,
} from '@pump-webhook-logic';
import { sampleRecipient } from './webhookTestFixtures';

const OCCURRED = '2026-05-20T12:00:00.000Z';

describe('BR-N1 provider mapping conformance', () => {
  const resendRows: Array<{
    provider: string;
    eventType: string;
    statusBefore: 'pending' | 'queued' | 'delivered';
    expectStatus?: string;
    expectSuppression?: 'hard_bounce' | 'spam_complaint' | 'manual' | null;
    bounceType?: string;
  }> = [
    { provider: 'email.sent', eventType: 'queued', statusBefore: 'pending', expectStatus: 'queued' },
    { provider: 'email.delivered', eventType: 'delivered', statusBefore: 'queued', expectStatus: 'delivered' },
    { provider: 'email.delivery_delayed', eventType: 'delivery_delayed', statusBefore: 'queued' },
    { provider: 'email.opened', eventType: 'opened', statusBefore: 'delivered' },
    { provider: 'email.clicked', eventType: 'clicked', statusBefore: 'delivered' },
    {
      provider: 'email.bounced',
      eventType: 'bounced',
      statusBefore: 'queued',
      expectStatus: 'bounced',
      bounceType: 'Permanent',
      expectSuppression: 'hard_bounce',
    },
    {
      provider: 'email.bounced',
      eventType: 'bounced',
      statusBefore: 'queued',
      expectStatus: 'bounced',
      bounceType: 'Transient',
      expectSuppression: null,
    },
    {
      provider: 'email.complained',
      eventType: 'spam_complaint',
      statusBefore: 'queued',
      expectStatus: 'failed',
      expectSuppression: 'spam_complaint',
    },
    { provider: 'email.failed', eventType: 'failed', statusBefore: 'queued', expectStatus: 'failed' },
    {
      provider: 'email.suppressed',
      eventType: 'suppressed',
      statusBefore: 'queued',
      expectStatus: 'suppression_skipped',
      expectSuppression: 'manual',
    },
  ];

  it.each(resendRows)('Resend $provider → $eventType', (row) => {
    expect(mapResendProviderType(row.provider)).toBe(row.eventType);
    const rawPayload: Record<string, unknown> = {
      type: row.provider,
      data: {
        email_id: 'email-1',
        bounce: row.bounceType ? { type: row.bounceType, message: 'bounce msg' } : undefined,
      },
      created_at: OCCURRED,
    };
    const recipient = sampleRecipient({ status: row.statusBefore });
    const patch = buildRecipientUpdatePatch(
      recipient,
      row.eventType as 'queued',
      OCCURRED,
      'resend',
      rawPayload
    );
    const suppressions = buildSuppressionUpserts(
      recipient,
      row.eventType as NormalisedEventType,
      'resend',
      rawPayload
    );

    if (row.expectStatus) {
      expect(patch.status).toBe(row.expectStatus);
    } else if (row.eventType === 'delivery_delayed') {
      expect(Object.keys(patch)).toHaveLength(0);
    } else if (row.eventType === 'opened') {
      expect(patch.opened_at).toBe(OCCURRED);
    } else if (row.eventType === 'clicked') {
      expect(patch.clicked_at).toBe(OCCURRED);
    }

    if (row.expectSuppression) {
      expect(suppressions).toHaveLength(1);
      expect(suppressions[0]?.reason).toBe(row.expectSuppression);
      expect(suppressions[0]?.channel).toBe('email');
    } else if (row.provider === 'email.bounced' && row.bounceType === 'Transient') {
      expect(suppressions).toHaveLength(0);
    }
  });

  const twilioRows: Array<{
    status: string;
    eventType: string;
    errorCode?: string;
    expectSuppression?: 'recipient_request' | null;
  }> = [
    { status: 'queued', eventType: 'queued' },
    { status: 'sent', eventType: 'queued' },
    { status: 'sending', eventType: 'queued' },
    { status: 'delivered', eventType: 'delivered' },
    { status: 'undelivered', eventType: 'bounced', errorCode: '21610', expectSuppression: 'recipient_request' },
    { status: 'failed', eventType: 'failed', errorCode: '21610', expectSuppression: 'recipient_request' },
    { status: 'failed', eventType: 'failed', expectSuppression: null },
  ];

  it.each(twilioRows)('Twilio $status → $eventType', (row) => {
    expect(mapTwilioMessageStatus(row.status)).toBe(row.eventType);
    const rawPayload: Record<string, unknown> = {
      MessageSid: 'SM123',
      MessageStatus: row.status,
      ...(row.errorCode ? { ErrorCode: row.errorCode } : {}),
    };
    const recipient = sampleRecipient({
      status: row.eventType === 'queued' ? 'pending' : 'queued',
      address: '+15551234567',
    });
    const patch = buildRecipientUpdatePatch(
      recipient,
      row.eventType as 'queued',
      OCCURRED,
      'twilio',
      rawPayload
    );
    const suppressions = buildSuppressionUpserts(
      recipient,
      row.eventType as NormalisedEventType,
      'twilio',
      rawPayload
    );

    if (row.eventType === 'queued') {
      expect(patch.status).toBe('queued');
    }
    if (row.eventType === 'delivered') {
      expect(patch.status).toBe('delivered');
    }
    if (row.expectSuppression) {
      expect(
        suppressions.some(
          (s: { reason: string }) => s.reason === row.expectSuppression
        )
      ).toBe(true);
      expect(suppressions[0]?.channel).toBe('sms');
    }
  });
});

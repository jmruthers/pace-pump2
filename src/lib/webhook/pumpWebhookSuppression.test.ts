import { describe, expect, it } from 'vitest';
import {
  buildSuppressionUpserts,
  channelFromGateway,
  isResendHardBounce,
} from '@pump-webhook-logic';
import { sampleRecipient } from './webhookTestFixtures';

describe('suppression channel derivation', () => {
  it('maps resend gateway to email channel', () => {
    expect(channelFromGateway('resend')).toBe('email');
    expect(channelFromGateway('twilio')).toBe('sms');
  });

  it('upserts hard_bounce on Resend Permanent bounce only', () => {
    const raw = {
      type: 'email.bounced',
      data: { email_id: 'e1', bounce: { type: 'Permanent', message: 'hard' } },
    };
    expect(isResendHardBounce(raw)).toBe(true);
    const rows = buildSuppressionUpserts(
      sampleRecipient(),
      'bounced',
      'resend',
      raw
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe('email');
    expect(rows[0]?.reason).toBe('hard_bounce');
  });

  it('does not upsert on soft bounce', () => {
    const raw = {
      type: 'email.bounced',
      data: { email_id: 'e1', bounce: { type: 'Transient' } },
    };
    expect(isResendHardBounce(raw)).toBe(false);
    const rows = buildSuppressionUpserts(sampleRecipient(), 'bounced', 'resend', raw);
    expect(rows).toHaveLength(0);
  });

  it('upserts recipient_request on Twilio 21610', () => {
    const raw = { MessageSid: 'SM1', MessageStatus: 'undelivered', ErrorCode: '21610' };
    const rows = buildSuppressionUpserts(
      sampleRecipient({ address: '+15551234567' }),
      'bounced',
      'twilio',
      raw
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe('sms');
    expect(rows[0]?.reason).toBe('recipient_request');
    expect(rows[0]?.source_message_id).toBe(
      '11111111-1111-1111-1111-111111111103'
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  deriveResendDedupeKey,
  deriveTwilioDedupeKey,
  processWebhookIngressApply,
  resolveOccurredAt,
  validateResendPayload,
  type WebhookDeps,
} from '@pump-webhook-logic';
import { sampleRecipient } from './webhookTestFixtures';

describe('ingress orchestration', () => {
  it('returns recipient_not_found without DB writes', async () => {
    let inserted = false;
    let updated = false;
    let upserted = false;

    const deps: WebhookDeps = {
      log: vi.fn(),
      findRecipientByGatewayMessageId: async () => null,
      insertDeliveryEvent: async () => {
        inserted = true;
        return 'inserted';
      },
      updateRecipient: async () => {
        updated = true;
      },
      upsertSuppression: async () => {
        upserted = true;
      },
    };

    const result = await processWebhookIngressApply(deps, {
      gateway: 'resend',
      eventType: 'delivered',
      gatewayMessageId: 'missing-email-id',
      dedupeKey: 'svix-unknown',
      providerEventId: 'svix-unknown',
      occurredAt: '2026-05-20T12:00:00.000Z',
      rawPayload: { type: 'email.delivered', data: { email_id: 'missing-email-id' } },
    });

    expect(result).toEqual({ applied: false, reason: 'recipient_not_found' });
    expect(inserted).toBe(false);
    expect(updated).toBe(false);
    expect(upserted).toBe(false);
  });

  it('logs structured forensics on no-match', async () => {
    const log = vi.fn();
    await processWebhookIngressApply(
      {
        log,
        findRecipientByGatewayMessageId: async () => null,
        insertDeliveryEvent: async () => 'inserted',
        updateRecipient: async () => {},
        upsertSuppression: async () => {},
      },
      {
        gateway: 'twilio',
        eventType: 'delivered',
        gatewayMessageId: 'SM-missing',
        dedupeKey: 'SM-missing:delivered',
        providerEventId: null,
        occurredAt: '2026-05-20T12:00:00.000Z',
        rawPayload: { MessageSid: 'SM-missing', MessageStatus: 'delivered' },
      }
    );

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pump_webhook_recipient_not_found',
        gateway: 'twilio',
        gateway_message_id: 'SM-missing',
        event_type: 'delivered',
      })
    );
  });

  it('validates Resend required fields', () => {
    expect(validateResendPayload({ type: 'email.sent' })).toBe(false);
    expect(
      validateResendPayload({
        type: 'email.sent',
        data: { email_id: 'e1' },
      })
    ).toBe(true);
  });

  it('derives Twilio dedupe key with optional suffixes', () => {
    expect(
      deriveTwilioDedupeKey({ messageSid: 'SM1', messageStatus: 'delivered' })
    ).toBe('SM1:delivered');
    expect(
      deriveTwilioDedupeKey({
        messageSid: 'SM1',
        messageStatus: 'undelivered',
        errorCode: '21610',
        rawDlrDoneDate: '2605201200',
      })
    ).toBe('SM1:undelivered:21610:2605201200');
  });

  it('uses request-start time for Twilio when RawDlrDoneDate absent', () => {
    const started = '2026-05-20T10:00:00.000Z';
    expect(
      resolveOccurredAt({ gateway: 'twilio', requestStartedAt: started })
    ).toBe(started);
  });

  it('uses svix-id as Resend dedupe key', () => {
    expect(deriveResendDedupeKey('msg_abc')).toBe('msg_abc');
  });

  it('skips apply on duplicate insert', async () => {
    let updated = false;
    const deps: WebhookDeps = {
      log: () => {},
      findRecipientByGatewayMessageId: async () => sampleRecipient(),
      insertDeliveryEvent: async () => 'duplicate',
      updateRecipient: async () => {
        updated = true;
      },
      upsertSuppression: async () => {},
    };

    const result = await processWebhookIngressApply(deps, {
      gateway: 'resend',
      eventType: 'delivered',
      gatewayMessageId: 'e1',
      dedupeKey: 'dup-key',
      providerEventId: 'dup-key',
      occurredAt: '2026-05-20T12:00:00.000Z',
      rawPayload: { type: 'email.delivered', data: { email_id: 'e1' } },
    });

    expect(result).toEqual({ applied: false, reason: 'duplicate' });
    expect(updated).toBe(false);
  });
});

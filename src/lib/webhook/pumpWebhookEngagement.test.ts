import { describe, expect, it } from 'vitest';
import { buildRecipientUpdatePatch, processWebhookIngressApply } from '@pump-webhook-logic';
import { sampleRecipient } from './webhookTestFixtures';

const OCCURRED = '2026-05-20T12:00:00.000Z';
const LATER = '2026-05-20T13:00:00.000Z';

describe('first-only engagement timestamps', () => {
  it('sets opened_at only when null', () => {
    const recipient = sampleRecipient({ status: 'delivered', opened_at: null });
    const patch = buildRecipientUpdatePatch(recipient, 'opened', OCCURRED, 'resend', {
      type: 'email.opened',
      data: { email_id: 'e1' },
    });
    expect(patch.opened_at).toBe(OCCURRED);
    expect(patch.status).toBeUndefined();
  });

  it('does not overwrite opened_at when already set', () => {
    const recipient = sampleRecipient({ status: 'delivered', opened_at: OCCURRED });
    const patch = buildRecipientUpdatePatch(recipient, 'opened', LATER, 'resend', {
      type: 'email.opened',
      data: { email_id: 'e1' },
    });
    expect(patch.opened_at).toBeUndefined();
  });

  it('sets clicked_at only when null', () => {
    const recipient = sampleRecipient({ status: 'delivered', clicked_at: null });
    const patch = buildRecipientUpdatePatch(recipient, 'clicked', OCCURRED, 'resend', {
      type: 'email.clicked',
      data: { email_id: 'e1' },
    });
    expect(patch.clicked_at).toBe(OCCURRED);
  });

  it('does not overwrite clicked_at when already set', () => {
    const recipient = sampleRecipient({ status: 'delivered', clicked_at: OCCURRED });
    const patch = buildRecipientUpdatePatch(recipient, 'clicked', LATER, 'resend', {
      type: 'email.clicked',
      data: { email_id: 'e1' },
    });
    expect(patch.clicked_at).toBeUndefined();
  });

  it('second opened event inserts two delivery rows but updates recipient once (G5)', async () => {
    let insertCount = 0;
    let updateCount = 0;
    let recipient = sampleRecipient({ status: 'delivered', opened_at: null });

    const deps = {
      log: () => {},
      findRecipientByGatewayMessageId: async () => recipient,
      insertDeliveryEvent: async () => {
        insertCount += 1;
        return 'inserted' as const;
      },
      updateRecipient: async (_id: string, patch: Record<string, unknown>) => {
        updateCount += 1;
        if (patch.opened_at) {
          recipient = { ...recipient, opened_at: String(patch.opened_at) };
        }
      },
      upsertSuppression: async () => {},
    };

    const base = {
      gateway: 'resend' as const,
      eventType: 'opened' as const,
      gatewayMessageId: 'email-open-1',
      occurredAt: OCCURRED,
      rawPayload: { type: 'email.opened', data: { email_id: 'email-open-1' } },
    };

    await processWebhookIngressApply(deps, {
      ...base,
      dedupeKey: 'svix-open-1',
      providerEventId: 'svix-open-1',
    });
    await processWebhookIngressApply(deps, {
      ...base,
      dedupeKey: 'svix-open-2',
      providerEventId: 'svix-open-2',
    });

    expect(insertCount).toBe(2);
    expect(updateCount).toBe(1);
    expect(recipient.opened_at).toBe(OCCURRED);
  });

  it('allows engagement timestamps when recipient is terminal bounced', () => {
    const recipient = sampleRecipient({ status: 'bounced', opened_at: null });
    const patch = buildRecipientUpdatePatch(recipient, 'opened', OCCURRED, 'resend', {
      type: 'email.opened',
      data: { email_id: 'e1' },
    });
    expect(patch.opened_at).toBe(OCCURRED);
    expect(patch.status).toBeUndefined();
  });
});

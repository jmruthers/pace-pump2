import { describe, expect, it } from 'vitest';
import {
  deriveTwilioDedupeKey,
  processWebhookIngressApply,
  type WebhookDeps,
  type WebhookIngressInput,
} from '@pump-webhook-logic';
import { sampleRecipient } from './webhookTestFixtures';

const BASE_INPUT: WebhookIngressInput = {
  gateway: 'resend',
  eventType: 'delivered',
  gatewayMessageId: 'email-correlate-1',
  dedupeKey: 'svix-dedupe-1',
  providerEventId: 'svix-dedupe-1',
  occurredAt: '2026-05-20T12:00:00.000Z',
  rawPayload: { type: 'email.delivered', data: { email_id: 'email-correlate-1' } },
};

function createMockDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps & {
  insertCount: number;
  updateCount: number;
  upsertCount: number;
} {
  let insertCount = 0;
  let updateCount = 0;
  let upsertCount = 0;
  const insertedKeys = new Set<string>();

  const deps: WebhookDeps & { insertCount: number; updateCount: number; upsertCount: number } = {
    insertCount: 0,
    updateCount: 0,
    upsertCount: 0,
    log: () => {},
    findRecipientByGatewayMessageId: async () => sampleRecipient({ status: 'queued' }),
    insertDeliveryEvent: async (row: { gateway: string; dedupe_key: string }) => {
      insertCount += 1;
      deps.insertCount = insertCount;
      const key = `${row.gateway}:${row.dedupe_key}`;
      if (insertedKeys.has(key)) return 'duplicate';
      insertedKeys.add(key);
      return 'inserted';
    },
    updateRecipient: async () => {
      updateCount += 1;
      deps.updateCount = updateCount;
    },
    upsertSuppression: async () => {
      upsertCount += 1;
      deps.upsertCount = upsertCount;
    },
    ...overrides,
  };
  return deps;
}

describe('idempotency under provider replay', () => {
  it('applies once and returns duplicate on second and third replay', async () => {
    const deps = createMockDeps();
    const first = await processWebhookIngressApply(deps, BASE_INPUT);
    const second = await processWebhookIngressApply(deps, BASE_INPUT);
    const third = await processWebhookIngressApply(deps, BASE_INPUT);

    expect(first).toEqual({ applied: true });
    expect(second).toEqual({ applied: false, reason: 'duplicate' });
    expect(third).toEqual({ applied: false, reason: 'duplicate' });
    expect(deps.insertCount).toBe(3);
    expect(deps.updateCount).toBe(1);
    expect(deps.upsertCount).toBe(0);
  });

  it('resolves concurrent replay race to one applied true', async () => {
    const insertedKeys = new Set<string>();
    let applyCount = 0;

    const sharedDeps: WebhookDeps = {
      log: () => {},
      findRecipientByGatewayMessageId: async () => sampleRecipient({ status: 'queued' }),
      insertDeliveryEvent: async (row: { gateway: string; dedupe_key: string }) => {
        const key = `${row.gateway}:${row.dedupe_key}`;
        if (insertedKeys.has(key)) return 'duplicate';
        insertedKeys.add(key);
        return 'inserted';
      },
      updateRecipient: async () => {
        applyCount += 1;
      },
      upsertSuppression: async () => {},
    };

    const dedupeKey = deriveTwilioDedupeKey({
      messageSid: 'SM-concurrent',
      messageStatus: 'delivered',
      rawDlrDoneDate: '2605201200',
    });
    const input: WebhookIngressInput = {
      gateway: 'twilio',
      eventType: 'delivered',
      gatewayMessageId: 'SM-concurrent',
      dedupeKey,
      providerEventId: null,
      occurredAt: '2026-05-20T12:00:00.000Z',
      rawPayload: {
        MessageSid: 'SM-concurrent',
        MessageStatus: 'delivered',
        RawDlrDoneDate: '2605201200',
      },
    };

    const results = await Promise.all([
      processWebhookIngressApply(sharedDeps, input),
      processWebhookIngressApply(sharedDeps, input),
    ]);

    const appliedTrue = results.filter((r: { applied: boolean }) => r.applied === true);
    const duplicates = results.filter(
      (r: { applied: boolean; reason?: string }) =>
        !r.applied && 'reason' in r && r.reason === 'duplicate'
    );
    expect(appliedTrue).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(applyCount).toBe(1);
  });
});

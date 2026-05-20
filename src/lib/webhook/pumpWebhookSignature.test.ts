import { describe, expect, it } from 'vitest';
import {
  buildResendSvixSignatureHeader,
  processWebhookIngressApply,
  verifyResendWebhookSignature,
  type WebhookDeps,
} from '@pump-webhook-logic';
import { sampleRecipient } from './webhookTestFixtures';

const TEST_SECRET = 'whsec_test_secret_key_for_pump06';
const WEBHOOK_URL = 'https://example.test/functions/v1/pump-webhook/resend';

describe('signature verification (§13.8)', () => {
  it('accepts a valid Svix signature', async () => {
    const rawBody = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-05-20T12:00:00.000Z',
      data: { email_id: 'email-1' },
    });
    const svixId = 'msg_valid_sig';
    const svixTimestamp = '1716206400';
    const svixSignature = await buildResendSvixSignatureHeader(
      TEST_SECRET,
      svixId,
      svixTimestamp,
      rawBody
    );
    const request = new Request(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
        'content-type': 'application/json',
      },
      body: rawBody,
    });
    const ok = await verifyResendWebhookSignature(request, {
      webhook_secret: TEST_SECRET,
    });
    expect(ok).toBe(true);
  });

  it('rejects a tampered Svix signature', async () => {
    const rawBody = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'email-1' },
    });
    const request = new Request(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'svix-id': 'msg_bad_sig',
        'svix-timestamp': '1716206400',
        'svix-signature': 'v1,deadbeef',
        'content-type': 'application/json',
      },
      body: rawBody,
    });
    const ok = await verifyResendWebhookSignature(request, {
      webhook_secret: TEST_SECRET,
    });
    expect(ok).toBe(false);
  });

  it('does not call DB helpers when signature fails before ingress (simulated)', async () => {
    let insertCalled = false;
    const deps: WebhookDeps = {
      log: () => {},
      findRecipientByGatewayMessageId: async () => {
        insertCalled = true;
        return sampleRecipient();
      },
      insertDeliveryEvent: async () => 'inserted',
      updateRecipient: async () => {},
      upsertSuppression: async () => {},
    };
    const verified = await verifyResendWebhookSignature(
      new Request(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'svix-id': 'x',
          'svix-timestamp': '1',
          'svix-signature': 'v1,bad',
        },
        body: '{}',
      }),
      { webhook_secret: TEST_SECRET }
    );
    expect(verified).toBe(false);
    if (!verified) {
      expect(insertCalled).toBe(false);
      return;
    }
    await processWebhookIngressApply(deps, {
      gateway: 'resend',
      eventType: 'delivered',
      gatewayMessageId: 'email-1',
      dedupeKey: 'x',
      providerEventId: 'x',
      occurredAt: '2026-05-20T12:00:00.000Z',
      rawPayload: {},
    });
    expect(insertCalled).toBe(true);
  });
});

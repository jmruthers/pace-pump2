import type { WebhookRecipientRow } from '@pump-webhook-logic';

export function sampleRecipient(
  overrides: Partial<WebhookRecipientRow> = {}
): WebhookRecipientRow {
  return {
    id: '11111111-1111-1111-1111-111111111101',
    organisation_id: '11111111-1111-1111-1111-111111111111',
    member_id: '11111111-1111-1111-1111-111111111102',
    message_id: '11111111-1111-1111-1111-111111111103',
    address: 'alex@example.test',
    status: 'pending',
    opened_at: null,
    clicked_at: null,
    ...overrides,
  };
}

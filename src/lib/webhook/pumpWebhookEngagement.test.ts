import { describe, expect, it } from 'vitest';
import { buildRecipientUpdatePatch } from '@pump-webhook-logic';
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

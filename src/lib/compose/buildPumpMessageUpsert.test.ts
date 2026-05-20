import { describe, expect, it } from 'vitest';
import { buildPumpMessageUpsertRow } from './buildPumpMessageUpsert';

describe('buildPumpMessageUpsertRow', () => {
  it('maps draft fields and invariants for pump_message upsert', () => {
    const row = buildPumpMessageUpsertRow({
      id: 'draft-1',
      organisationId: 'org-1',
      createdBy: 'user-1',
      sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
      recipientPool: { type: 'org_members', organisation_id: 'org-1' },
      draft: {
        channel: 'email',
        subject: 'Welcome',
        body_html: '<p>Hi</p>',
        body_text: 'Hi',
        sender_name: 'Org Comms',
        sender_email: 'comms@example.org',
        reply_to: 'reply@example.org',
      },
    });

    expect(row).toMatchObject({
      id: 'draft-1',
      organisation_id: 'org-1',
      source_app: 'pump',
      status: 'draft',
      bypass_suppression: false,
      created_by: 'user-1',
      reply_to_email: 'reply@example.org',
    });
    expect(row.source_context_type).toBeNull();
    expect(row.source_context_id).toBeNull();
  });
});

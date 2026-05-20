import type { CommDraft } from '@solvera/pace-core/comms';
import type { RecipientPoolDescriptor } from '@solvera/pace-core/comms';
import type { DerivedSourceContext } from './types';

export type PumpMessageDraftUpsertInput = {
  id: string;
  organisationId: string;
  draft: CommDraft;
  recipientPool: RecipientPoolDescriptor | null;
  sourceContext: DerivedSourceContext;
  createdBy: string | null;
};

/** BR-DraftAdapterOverride — maps composer draft to `pump_message` upsert row. */
export function buildPumpMessageUpsertRow(input: PumpMessageDraftUpsertInput) {
  const { draft, recipientPool, sourceContext, createdBy, id, organisationId } = input;

  return {
    id,
    organisation_id: organisationId,
    channel: draft.channel,
    subject: draft.subject ?? null,
    body_html: draft.body_html ?? null,
    body_text: draft.body_text ?? '',
    sender_name: draft.sender_name ?? '',
    sender_email: draft.channel === 'email' ? (draft.sender_email ?? null) : null,
    sender_phone: draft.channel === 'sms' ? (draft.sender_phone ?? null) : null,
    reply_to_email: draft.channel === 'email' ? (draft.reply_to ?? null) : null,
    template_id: draft.template_id ?? null,
    recipient_pool_descriptor: recipientPool as unknown as Record<string, unknown> | null,
    source_app: 'pump',
    source_context_type: sourceContext.sourceContextType ?? null,
    source_context_id: sourceContext.sourceContextId ?? null,
    extra_merge_context: draft.extra_merge_context ?? {},
    bypass_suppression: false,
    status: 'draft' as const,
    created_by: createdBy,
  };
}

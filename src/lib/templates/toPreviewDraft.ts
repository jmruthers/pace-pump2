import type { CommDraft } from '@solvera/pace-core/comms';
import type { OrganisationTemplateRow } from './types';

/** BR-Preview — construct CommDraft for MessagePreview. */
export function toPreviewDraft(template: OrganisationTemplateRow): CommDraft {
  return {
    channel: template.channel,
    subject: template.subject ?? undefined,
    body_html: template.body_html ?? undefined,
    body_text: template.body_text,
    sender_name: 'Preview',
    template_id: template.id,
    extra_merge_context: undefined,
  };
}

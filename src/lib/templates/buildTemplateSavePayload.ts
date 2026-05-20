import { extractMergeTokens } from '@solvera/pace-core/comms';
import { deriveBodyTextFromHtml } from './deriveBodyTextFromHtml';
import type { TemplateFormValues, TemplateSavePayload } from './types';

export interface BuildTemplateSavePayloadInput {
  form: TemplateFormValues;
  organisationId: string;
  userId: string;
  mode: 'create' | 'update';
}

/** Maps editor values to INSERT/UPDATE columns per PU04 §7 write contract. */
export function buildTemplateSavePayload({
  form,
  organisationId,
  userId,
  mode,
}: BuildTemplateSavePayloadInput): TemplateSavePayload {
  const trimmedName = form.name.trim();
  const trimmedDescription = form.description.trim();
  const channel = form.channel;

  const subject =
    channel === 'email' ? form.subject.trim() : null;
  const body_html = channel === 'email' ? form.body.trim() : null;
  const body_text =
    channel === 'email' ? deriveBodyTextFromHtml(form.body.trim()) : form.body.trim();

  const mergeContent = `${subject ?? ''}\n${body_html ?? ''}\n${body_text}`;
  const merge_fields_used = extractMergeTokens(mergeContent);

  const payload: TemplateSavePayload = {
    organisation_id: organisationId,
    name: trimmedName,
    description: trimmedDescription.length > 0 ? trimmedDescription : null,
    channel,
    subject,
    body_html,
    body_text,
    merge_fields_used,
    require_merge_field_validation: form.require_merge_field_validation,
  };

  if (mode === 'create') {
    payload.created_by = userId;
  }

  return payload;
}

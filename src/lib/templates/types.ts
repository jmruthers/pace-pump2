import type { CommChannel, CommTemplate } from '@solvera/pace-core/comms';

/** Row shape from `pump_organisation_templates` (PU04 read contract). */
export type OrganisationTemplateRow = CommTemplate & {
  created_by: string;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;

export const TEMPLATE_LIST_SELECT =
  'id, organisation_id, name, description, channel, subject, body_html, body_text, merge_fields_used, is_active, require_merge_field_validation, created_by, created_at, updated_at' as const;

export type TemplateChannel = CommChannel;

export interface TemplateFormValues {
  name: string;
  description: string;
  channel: TemplateChannel;
  subject: string;
  body: string;
  require_merge_field_validation: boolean;
}

export interface TemplateSavePayload {
  organisation_id: string;
  name: string;
  description: string | null;
  channel: TemplateChannel;
  subject: string | null;
  body_html: string | null;
  body_text: string;
  merge_fields_used: string[];
  require_merge_field_validation: boolean;
  created_by?: string;
}

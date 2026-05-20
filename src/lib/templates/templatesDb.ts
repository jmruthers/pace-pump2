import type { RBACSupabaseClient } from '@solvera/pace-core/rbac';
import { TEMPLATE_LIST_SELECT, type OrganisationTemplateRow, type TemplateSavePayload } from './types';

type DbResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type DbMutationResult = Promise<{ error: { message: string } | null }>;

interface PumpOrganisationTemplatesTable {
  select(columns: typeof TEMPLATE_LIST_SELECT): {
    eq(column: 'organisation_id', value: string): {
      order(
        column: 'created_at',
        options: { ascending: boolean }
      ): DbResult<OrganisationTemplateRow[]>;
    };
  };
  insert(values: TemplateSavePayload): DbMutationResult;
  update(
    values:
      | Omit<TemplateSavePayload, 'organisation_id' | 'created_by'>
      | { is_active: boolean }
  ): {
    eq(column: 'id', value: string): DbMutationResult;
  };
}

export function pumpOrganisationTemplates(client: RBACSupabaseClient): PumpOrganisationTemplatesTable {
  return client.from('pump_organisation_templates') as PumpOrganisationTemplatesTable;
}

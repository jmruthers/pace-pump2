import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@solvera/pace-core/components';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import type { ApiResult } from '@solvera/pace-core/types';
import { createErrorResult, createSuccessResult } from '@solvera/pace-core/types';
import { pumpOrganisationTemplates } from '@/lib/templates/templatesDb';
import type { OrganisationTemplateRow } from '@/lib/templates/types';
import { organisationTemplatesQueryKey } from './queryKeys';

async function fetchOrganisationTemplates(
  client: NonNullable<ReturnType<typeof useSecureSupabase>>,
  organisationId: string
): Promise<ApiResult<OrganisationTemplateRow[]>> {
  const { data, error } = await pumpOrganisationTemplates(client)
    .select('id, organisation_id, name, description, channel, subject, body_html, body_text, merge_fields_used, is_active, require_merge_field_validation, created_by, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });

  if (error != null) {
    return createErrorResult('PUMP_TEMPLATES_FETCH_FAILED', error.message);
  }

  return createSuccessResult((data ?? []) as OrganisationTemplateRow[]);
}

export function useOrganisationTemplates(organisationId: string | null | undefined) {
  const client = useSecureSupabase();
  const lastErrorRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: organisationTemplatesQueryKey(organisationId ?? ''),
    queryFn: async () => {
      const result = await fetchOrganisationTemplates(client!, organisationId!);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: organisationId != null && organisationId.length > 0 && client != null,
  });

  useEffect(() => {
    if (query.error == null) {
      lastErrorRef.current = null;
      return;
    }
    const message =
      query.error instanceof Error ? query.error.message : 'Failed to load templates';
    if (lastErrorRef.current === message) {
      return;
    }
    lastErrorRef.current = message;
    toast({
      variant: 'destructive',
      title: message,
    });
  }, [query.error]);

  return {
    ...query,
    retry: () => {
      void query.refetch();
    },
  };
}

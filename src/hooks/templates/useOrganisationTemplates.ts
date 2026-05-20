import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@solvera/pace-core/components';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { pumpOrganisationTemplates } from '@/lib/templates/templatesDb';
import type { OrganisationTemplateRow } from '@/lib/templates/types';
import { organisationTemplatesQueryKey } from './queryKeys';

async function fetchOrganisationTemplates(
  client: NonNullable<ReturnType<typeof useSecureSupabase>>,
  organisationId: string
): Promise<OrganisationTemplateRow[]> {
  const { data, error } = await pumpOrganisationTemplates(client)
    .select('id, organisation_id, name, description, channel, subject, body_html, body_text, merge_fields_used, is_active, require_merge_field_validation, created_by, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });

  if (error != null) {
    throw new Error(error.message);
  }

  return (data ?? []) as OrganisationTemplateRow[];
}

export function useOrganisationTemplates(organisationId: string | null | undefined) {
  const client = useSecureSupabase();
  const lastErrorRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: organisationTemplatesQueryKey(organisationId ?? ''),
    queryFn: () => fetchOrganisationTemplates(client!, organisationId!),
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

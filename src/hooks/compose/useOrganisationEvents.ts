import { useQuery } from '@tanstack/react-query';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { composeQueryKeys } from './queryKeys';

export type OrganisationEventRow = {
  event_id: string;
  event_name: string;
  event_date: string | null;
};

type EventsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        order: (
          column: string,
          options: { ascending: boolean }
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export function useOrganisationEvents(organisationId: string) {
  const client = useSecureSupabase() as EventsClient | null;

  return useQuery({
    queryKey: composeQueryKeys.events(organisationId),
    enabled: organisationId.length > 0 && client != null,
    queryFn: async (): Promise<OrganisationEventRow[]> => {
      if (client == null) {
        return [];
      }
      const { data, error } = await client
        .from('core_events')
        .select('event_id, event_name, event_date')
        .eq('organisation_id', organisationId)
        .order('event_date', { ascending: false });

      if (error != null) {
        throw new Error(error instanceof Error ? error.message : 'Failed to load events');
      }
      return (data ?? []) as OrganisationEventRow[];
    },
  });
}

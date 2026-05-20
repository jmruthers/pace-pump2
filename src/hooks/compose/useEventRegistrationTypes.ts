import { useQuery } from '@tanstack/react-query';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { composeQueryKeys } from './queryKeys';

export type RegistrationTypeRow = {
  id: string;
  name: string;
};

type RegistrationTypesClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string | boolean
      ) => {
        eq: (
          column: string,
          value: boolean
        ) => {
          order: (
            column: string,
            options: { ascending: boolean }
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
};

export function useEventRegistrationTypes(eventId: string | null) {
  const client = useSecureSupabase() as RegistrationTypesClient | null;

  return useQuery({
    queryKey: composeQueryKeys.registrationTypes(eventId ?? ''),
    enabled: eventId != null && eventId.length > 0 && client != null,
    queryFn: async (): Promise<RegistrationTypeRow[]> => {
      if (client == null || eventId == null) {
        return [];
      }
      const { data, error } = await client
        .from('base_registration_type')
        .select('id, name')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error != null) {
        throw new Error(
          error instanceof Error ? error.message : 'Failed to load registration types'
        );
      }
      return (data ?? []) as RegistrationTypeRow[];
    },
  });
}

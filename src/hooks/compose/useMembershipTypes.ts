import { useQuery } from '@tanstack/react-query';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { composeQueryKeys } from './queryKeys';

export type MembershipTypeRow = {
  id: number;
  name: string;
};

type MembershipTypesClient = {
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

export function useMembershipTypes(organisationId: string) {
  const client = useSecureSupabase() as MembershipTypesClient | null;

  return useQuery({
    queryKey: composeQueryKeys.membershipTypes(organisationId),
    enabled: organisationId.length > 0 && client != null,
    queryFn: async (): Promise<MembershipTypeRow[]> => {
      if (client == null) {
        return [];
      }
      const { data, error } = await client
        .from('core_membership_type')
        .select('id, name')
        .eq('organisation_id', organisationId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error != null) {
        throw new Error(error instanceof Error ? error.message : 'Failed to load membership types');
      }
      return (data ?? []) as MembershipTypeRow[];
    },
  });
}

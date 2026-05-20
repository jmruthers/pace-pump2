import { useQuery } from '@tanstack/react-query';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { formatMemberDisplayName, type MemberPersonRow } from '@/lib/compose/memberDisplayName';
import { composeQueryKeys } from './queryKeys';

export type ManualMemberOption = {
  id: string;
  label: string;
};

type MemberSearchClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        is: (column: string, value: null) => {
          or: (filter: string) => {
            limit: (count: number) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
};

type MemberSearchRow = {
  id: string;
  core_person: MemberPersonRow | MemberPersonRow[] | null;
};

function normalisePerson(row: MemberSearchRow): MemberPersonRow | null {
  const person = row.core_person;
  if (person == null) {
    return null;
  }
  if (Array.isArray(person)) {
    return person[0] ?? null;
  }
  return person;
}

export function useManualMemberSearch(organisationId: string, debouncedQuery: string) {
  const client = useSecureSupabase() as MemberSearchClient | null;
  const trimmed = debouncedQuery.trim();

  return useQuery({
    queryKey: composeQueryKeys.memberSearch(organisationId, trimmed),
    enabled: organisationId.length > 0 && trimmed.length >= 1 && client != null,
    queryFn: async (): Promise<ManualMemberOption[]> => {
      if (client == null || trimmed.length === 0) {
        return [];
      }

      const pattern = `%${trimmed.replace(/%/g, '\\%')}%`;
      const { data, error } = await client
        .from('core_member')
        .select('id, core_person!inner(preferred_name, first_name, last_name)')
        .eq('organisation_id', organisationId)
        .is('deleted_at', null)
        .or(
          `core_person.preferred_name.ilike.${pattern},core_person.first_name.ilike.${pattern},core_person.last_name.ilike.${pattern}`
        )
        .limit(50);

      if (error != null) {
        throw new Error(error instanceof Error ? error.message : 'Failed to search members');
      }

      const rows = (data ?? []) as MemberSearchRow[];
      return rows
        .map((row) => {
          const person = normalisePerson(row);
          if (person == null) {
            return null;
          }
          return { id: row.id, label: formatMemberDisplayName(person) };
        })
        .filter((row): row is ManualMemberOption => row != null);
    },
  });
}

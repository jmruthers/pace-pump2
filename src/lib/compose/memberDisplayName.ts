export type MemberPersonRow = {
  preferred_name: string | null;
  first_name: string;
  last_name: string;
};

export function formatMemberDisplayName(person: MemberPersonRow): string {
  const given = person.preferred_name?.trim() || person.first_name.trim();
  return `${given} ${person.last_name.trim()}`.trim();
}

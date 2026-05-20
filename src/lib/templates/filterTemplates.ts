import type { OrganisationTemplateRow } from './types';

export interface FilterTemplatesOptions {
  query: string;
  showRetired: boolean;
}

/** BR-ListSearchScope + BR-ListFilterDefault — client-side list filtering. */
export function filterTemplates(
  rows: OrganisationTemplateRow[],
  { query, showRetired }: FilterTemplatesOptions
): OrganisationTemplateRow[] {
  const normalizedQuery = query.trim().toLowerCase();

  return rows.filter((row) => {
    if (!showRetired && !row.is_active) {
      return false;
    }
    if (normalizedQuery.length === 0) {
      return true;
    }
    const name = (row.name ?? '').toLowerCase();
    const description = (row.description ?? '').toLowerCase();
    return name.includes(normalizedQuery) || description.includes(normalizedQuery);
  });
}

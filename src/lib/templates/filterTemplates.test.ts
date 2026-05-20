import { describe, expect, it } from 'vitest';
import { filterTemplates } from './filterTemplates';
import type { OrganisationTemplateRow } from './types';

function row(partial: Partial<OrganisationTemplateRow> & Pick<OrganisationTemplateRow, 'id' | 'name'>): OrganisationTemplateRow {
  return {
    organisation_id: 'org-1',
    channel: 'email',
    body_text: 'body',
    is_active: true,
    require_merge_field_validation: false,
    created_by: 'user-1',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...partial,
  };
}

describe('filterTemplates', () => {
  const rows = [
    row({ id: '1', name: 'Welcome', description: 'First contact', is_active: true }),
    row({ id: '2', name: 'Reminder', description: 'Reminder welcome wagon', is_active: true }),
    row({ id: '3', name: 'Old', description: 'Retired', is_active: false }),
  ];

  it('hides retired rows when showRetired is false (AC-15)', () => {
    expect(filterTemplates(rows, { query: '', showRetired: false }).map((r) => r.id)).toEqual(['1', '2']);
  });

  it('shows retired rows when showRetired is true (AC-15)', () => {
    expect(filterTemplates(rows, { query: '', showRetired: true }).map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('matches name and description case-insensitively (AC-16)', () => {
    expect(filterTemplates(rows, { query: 'welcome', showRetired: true }).map((r) => r.id)).toEqual(['1', '2']);
  });
});

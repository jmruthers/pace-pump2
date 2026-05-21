// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TemplatesPage } from './TemplatesPage';
import type { OrganisationTemplateRow } from '@/lib/templates/types';

const sampleRow: OrganisationTemplateRow = {
  id: 'tpl-1',
  organisation_id: 'org-1',
  name: 'Welcome',
  description: 'First contact',
  channel: 'email',
  subject: 'Hi',
  body_html: '<p>Hello</p>',
  body_text: 'Hello',
  merge_fields_used: [],
  is_active: true,
  require_merge_field_validation: false,
  created_by: 'user-1',
  created_at: '2026-05-07T10:00:00Z',
  updated_at: '2026-05-07T10:00:00Z',
};

let canRead = true;
let canCreate = true;
let canUpdate = true;
let templates: OrganisationTemplateRow[] = [sampleRow];
let isLoading = false;
let isError = false;

const retry = vi.fn();
const createMutateAsync = vi.fn(async () => undefined);
const retireMutateAsync = vi.fn(async () => undefined);
const activateMutateAsync = vi.fn(async () => undefined);

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({
    selectedOrganisation: { id: 'org-1', display_name: 'Demo', name: 'Demo' },
    user: { id: 'user-1' },
  }),
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  PagePermissionGuard: ({
    children,
    operation,
  }: {
    children: ReactNode;
    operation: string;
  }) => {
    if (operation === 'read' && !canRead) {
      return <p role="alert">Access denied</p>;
    }
    return <>{children}</>;
  },
  useCan: (permission: string) => {
    if (permission === 'create:page.CommsTemplates') {
      return { can: canCreate, isLoading: false };
    }
    if (permission === 'update:page.CommsTemplates') {
      return { can: canUpdate, isLoading: false };
    }
    return { can: false, isLoading: false };
  },
}));

vi.mock('@/hooks/templates/useOrganisationTemplates', () => ({
  useOrganisationTemplates: () => ({
    data: templates,
    isLoading,
    isError,
    retry,
  }),
}));

vi.mock('@/hooks/templates/useTemplateMutations', () => ({
  useTemplateMutations: () => ({
    createMutation: { mutateAsync: createMutateAsync, isPending: false },
    updateMutation: { mutateAsync: vi.fn(), isPending: false },
    retireMutation: { mutateAsync: retireMutateAsync, isPending: false },
    activateMutation: { mutateAsync: activateMutateAsync, isPending: false },
    rowToFormValues: (row: OrganisationTemplateRow) => ({
      name: row.name,
      description: row.description ?? '',
      channel: row.channel,
      subject: row.subject ?? '',
      body: row.body_html ?? row.body_text,
      require_merge_field_validation: row.require_merge_field_validation,
    }),
  }),
}));

vi.mock('@solvera/pace-core/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solvera/pace-core/components')>();
  return {
    ...actual,
    toast: vi.fn(),
    DataTable: ({
      data,
      columns,
      isLoading: loading,
      onRowActivate,
    }: {
      data: OrganisationTemplateRow[];
      columns: Array<{
        id: string;
        accessorKey?: keyof OrganisationTemplateRow;
        cell?: (ctx: { row: OrganisationTemplateRow }) => ReactNode;
      }>;
      isLoading?: boolean;
      onRowActivate?: (row: OrganisationTemplateRow) => void;
    }) =>
      loading ? (
        <p>Loading table</p>
      ) : (
        <table>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.id}>
                    {column.cell != null ? (
                      column.cell({ row })
                    ) : (
                      <actual.Button type="button" onClick={() => onRowActivate?.(row)}>
                        {String(row[column.accessorKey ?? 'name'] ?? '')}
                      </actual.Button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ),
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <aside>{children}</aside> : null,
    DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  };
});

vi.mock('@solvera/pace-core/comms', () => ({
  MessagePreview: () => <article>Message preview</article>,
}));

describe('TemplatesPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    canRead = true;
    canCreate = true;
    canUpdate = true;
    templates = [sampleRow];
    isLoading = false;
    isError = false;
  });

  it('renders list with template name (AC-1)', () => {
    render(<TemplatesPage />);
    expect(screen.getByText('Templates')).toBeTruthy();
    expect(screen.getByText('Welcome')).toBeTruthy();
  });

  it('shows empty state when no templates (AC-2)', () => {
    templates = [];
    render(<TemplatesPage />);
    expect(screen.getByText('No templates yet — create one to get started.')).toBeTruthy();
  });

  it('omits create CTA without create permission (AC-3)', () => {
    templates = [];
    canCreate = false;
    render(<TemplatesPage />);
    expect(screen.queryByRole('button', { name: 'Create template' })).toBeNull();
  });

  it('shows access denied without read permission (AC-4)', () => {
    canRead = false;
    render(<TemplatesPage />);
    expect(screen.getByRole('alert', { name: '' }).textContent).toBe('Access denied');
    expect(screen.queryByText('Templates')).toBeNull();
  });

  it('shows Create but hides Edit for read+create profile (AC-read-create)', () => {
    canCreate = true;
    canUpdate = false;
    render(<TemplatesPage />);
    expect(screen.getByRole('button', { name: 'Create template' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Edit Welcome/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Preview Welcome/ })).toBeTruthy();
  });

  it('shows Edit and Retire but hides Create for read+update profile (AC-read-update)', () => {
    canCreate = false;
    canUpdate = true;
    render(<TemplatesPage />);
    expect(screen.queryByRole('button', { name: 'Create template' })).toBeNull();
    expect(screen.getByRole('button', { name: /Edit Welcome/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retire Welcome/ })).toBeTruthy();
  });

  it('hides mutate row actions for read-only operators (AC-11)', () => {
    canCreate = false;
    canUpdate = false;
    render(<TemplatesPage />);
    expect(screen.queryByRole('button', { name: /Edit Welcome/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Retire Welcome/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Preview Welcome/ })).toBeTruthy();
  });

  it('opens retire confirmation when Retire is clicked (AC-9)', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);
    await user.click(screen.getByRole('button', { name: /Retire Welcome/ }));
    expect(screen.getByText('Retire template?')).toBeTruthy();
    expect(screen.getByText(/Retire 'Welcome'/)).toBeTruthy();
  });

  it('activates retired template without confirmation dialog (AC-10)', async () => {
    const user = userEvent.setup();
    templates = [{ ...sampleRow, is_active: false, name: 'Retired tpl' }];
    render(<TemplatesPage />);
    await user.click(screen.getByLabelText('Show retired templates'));
    await user.click(screen.getByRole('button', { name: /Activate Retired tpl/ }));
    expect(activateMutateAsync).toHaveBeenCalledWith('tpl-1');
  });

  it('shows error panel and retry when list fails (AC-13)', () => {
    isError = true;
    render(<TemplatesPage />);
    expect(screen.getByText("Couldn't load templates.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('shows retired rows and Inactive badge when toggle is on (AC-15)', async () => {
    const user = userEvent.setup();
    templates = [{ ...sampleRow, is_active: false, name: 'Retired tpl' }];
    render(<TemplatesPage />);
    expect(screen.queryByText('Retired tpl')).toBeNull();
    await user.click(screen.getByLabelText('Show retired templates'));
    expect(screen.getByText('Retired tpl')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('filters rows by search query (AC-16)', async () => {
    const user = userEvent.setup();
    templates = [
      sampleRow,
      {
        ...sampleRow,
        id: 'tpl-2',
        name: 'Reminder',
        description: 'Reminder welcome wagon',
      },
    ];
    render(<TemplatesPage />);
    await user.type(screen.getByPlaceholderText('Search templates'), 'welcome');
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('Reminder')).toBeTruthy();
  });
});

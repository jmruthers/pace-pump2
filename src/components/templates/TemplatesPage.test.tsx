/* eslint-disable pace-core-compliance/prefer-pace-core-components, pace-core-compliance/prefer-pace-core-form */
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

let canCreate = true;
let canUpdate = true;
let templates: OrganisationTemplateRow[] = [sampleRow];
let isLoading = false;
let isError = false;

const mutateAsync = vi.fn(async () => undefined);

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({
    selectedOrganisation: { id: 'org-1', display_name: 'Demo', name: 'Demo' },
    user: { id: 'user-1' },
  }),
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  PagePermissionGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
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
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/templates/useTemplateMutations', () => ({
  useTemplateMutations: () => ({
    createMutation: { mutateAsync, isPending: false },
    updateMutation: { mutateAsync, isPending: false },
    retireMutation: { mutateAsync, isPending: false },
    activateMutation: { mutateAsync, isPending: false },
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

vi.mock('@solvera/pace-core/components', () => ({
  toast: vi.fn(),
  Button: ({
    children,
    onClick,
    type = 'button',
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
    'aria-label'?: string;
  }) => (
    <button type={type} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  Switch: ({
    checked,
    onChange,
  }: {
    checked?: boolean;
    onChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange?.(event.target.checked)}
    />
  ),
  Label: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  DataTable: ({
    data,
    isLoading: loading,
    onRowActivate,
  }: {
    data: OrganisationTemplateRow[];
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
              <td>
                <button type="button" onClick={() => onRowActivate?.(row)}>
                  {row.name}
                </button>
              </td>
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
  Form: ({
    children,
    onSubmit,
  }: {
    children: (methods: { watch: () => string }) => ReactNode;
    onSubmit: (values: unknown) => void;
  }) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: 'New',
          description: '',
          channel: 'email',
          subject: 'Subj',
          body: 'Body',
          require_merge_field_validation: false,
        });
      }}
    >
      {typeof children === 'function' ? children({ watch: () => 'email' }) : children}
    </form>
  ),
  FormField: ({ label }: { label?: string }) => <label>{label}</label>,
  LoadingSpinner: () => <span>spinner</span>,
  Select: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  Textarea: () => <textarea />,
}));

vi.mock('@solvera/pace-core/comms', () => ({
  MessagePreview: () => <article>Message preview</article>,
}));

describe('TemplatesPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
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

  it('hides mutate row actions for read-only operators (AC-11)', () => {
    canCreate = false;
    canUpdate = false;
    render(<TemplatesPage />);
    expect(screen.queryByRole('button', { name: /Edit Welcome/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Retire Welcome/ })).toBeNull();
  });

  it('shows error panel and retry when list fails (AC-13)', () => {
    isError = true;
    render(<TemplatesPage />);
    expect(screen.getByText("Couldn't load templates.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
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

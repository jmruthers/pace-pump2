// @vitest-environment happy-dom
/** PUMP-02 QA S-07, S-11–S-16 — CommsLogHome orchestration */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@test-utils';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { PumpMessageRow } from '@/lib/comms/commsLogTypes.js';
import { CommsLogHome } from './CommsLogHome.js';

const MESSAGE_UUID = '550e8400-e29b-41d4-a716-446655440000';

const { cancelMutate, deleteMutate, rbacState } = vi.hoisted(() => ({
  cancelMutate: vi.fn(),
  deleteMutate: vi.fn(),
  rbacState: { canCompose: false },
}));

const sampleRow = {
  id: MESSAGE_UUID,
  organisation_id: 'org-42',
  channel: 'email' as const,
  subject: 'Weekly update',
  body_text: 'Body',
  status: 'scheduled' as const,
  scheduled_at: '2026-06-01T10:00:00.000Z',
  sent_at: null,
  source_app: 'PUMP',
  total_recipients: 1,
  created_by: 'user-1',
  created_at: '2026-05-01T09:00:00.000Z',
} satisfies PumpMessageRow;

const draftRow = {
  ...sampleRow,
  id: '660e8400-e29b-41d4-a716-446655440001',
  status: 'draft' as const,
  scheduled_at: null,
  subject: 'Draft subject',
} satisfies PumpMessageRow;

vi.mock('@/hooks/comms/usePumpSupabase.js', () => ({
  usePumpSupabase: () => ({
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  }),
}));

vi.mock('@/hooks/comms/useCancelPumpMessage.js', () => ({
  useCancelPumpMessage: () => ({
    mutate: cancelMutate,
    isPending: false,
  }),
}));

vi.mock('@/hooks/comms/useDeletePumpDraft.js', () => ({
  useDeletePumpDraft: () => ({
    mutate: deleteMutate,
    isPending: false,
  }),
}));

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({
    selectedOrganisation: { id: 'org-42' },
    user: { id: 'user-1' },
  }),
}));

vi.mock('@solvera/pace-core/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solvera/pace-core/components')>();
  return {
    ...actual,
    toast: vi.fn(),
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <aside>{children}</aside> : null,
    DialogBody: ({ children }: { children: ReactNode }) => <section>{children}</section>,
    DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
    DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    LoadingSpinner: () => <output aria-busy="true">Loading</output>,
  };
});

vi.mock('@solvera/pace-core/rbac', () => ({
  useCan: () => ({ can: false, isLoading: false }),
}));

vi.mock('@/components/comms/CommRbacContextProvider', () => ({
  useCommRbacContext: () => ({
    canCompose: rbacState.canCompose,
    canSend: false,
    canSchedule: false,
    scopeType: 'organisation',
    scopeId: 'org-42',
  }),
}));

vi.mock('./CommsLogTable.js', async () => {
  const { Button } = await vi.importActual<typeof import('@solvera/pace-core/components')>(
    '@solvera/pace-core/components'
  );
  return {
    CommsLogTable: ({
      listRefreshKey,
      onRowActivate,
      onFetchSuccess,
      onFetchError,
      onCancelRow,
      onDeleteRow,
    }: {
      listRefreshKey: number;
      onRowActivate: (row: PumpMessageRow) => void;
      onFetchSuccess: (rows: PumpMessageRow[], total: number) => void;
      onFetchError: (error: Error) => void;
      onCancelRow: (row: PumpMessageRow) => void;
      onDeleteRow: (row: PumpMessageRow) => void;
    }) => (
      <div>
        <span data-testid="list-refresh-key">{listRefreshKey}</span>
        <Button type="button" onClick={() => onRowActivate(sampleRow)}>
          Open row
        </Button>
        <Button type="button" onClick={() => onFetchSuccess([], 0)}>
          Empty list
        </Button>
        <Button type="button" onClick={() => onFetchError(new Error('boom'))}>
          Fail list
        </Button>
        <Button type="button" onClick={() => onCancelRow(sampleRow)}>
          Cancel row
        </Button>
        <Button type="button" onClick={() => onDeleteRow(draftRow)}>
          Delete row
        </Button>
      </div>
    ),
  };
});

vi.mock('./CommsLogDrillDownDialog.js', () => ({
  CommsLogDrillDownDialog: ({
    messageId,
    open,
  }: {
    messageId: string | null;
    open: boolean;
  }) =>
    open ? <p data-testid="drill-down-open">{messageId}</p> : null,
}));

vi.mock('./CommsLogFilters.js', async () => {
  const { Button } = await vi.importActual<typeof import('@solvera/pace-core/components')>(
    '@solvera/pace-core/components'
  );
  return {
    CommsLogFilters: ({ onRefresh }: { onRefresh: () => void }) => (
      <Button type="button" onClick={onRefresh}>
        Refresh list
      </Button>
    ),
  };
});

function renderHome(initial = '/') {
  const client = new QueryClient();
  const router = createMemoryRouter(
    [
      { path: '/', element: <CommsLogHome /> },
      { path: '/comms/create', element: <p>Compose page</p> },
    ],
    { initialEntries: [initial] }
  );
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { router, ...view };
}

describe('CommsLogHome', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    rbacState.canCompose = false;
  });

  it('bumps listRefreshKey when refresh is clicked', async () => {
    const user = setupUser();
    renderHome();

    expect(screen.getByTestId('list-refresh-key').textContent).toBe('0');

    await user.click(screen.getByRole('button', { name: 'Refresh list' }));
    expect(screen.getByTestId('list-refresh-key').textContent).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Refresh list' }));
    expect(screen.getByTestId('list-refresh-key').textContent).toBe('2');
  });

  it('shows empty panel and compose CTA when the list has zero rows', async () => {
    rbacState.canCompose = true;
    const user = setupUser();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Empty list' }));

    expect(
      screen.getByText('No messages yet — start one to see it here.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New message' })).toBeTruthy();
    expect(screen.queryByTestId('list-refresh-key')).toBeNull();
  });

  it('shows list error panel and clears error on retry', async () => {
    const user = setupUser();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Fail list' }));
    expect(screen.getByText("Couldn't load communications.")).toBeTruthy();
    expect(screen.queryByTestId('list-refresh-key')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText("Couldn't load communications.")).toBeNull();
    expect(screen.getByTestId('list-refresh-key')).toBeTruthy();
  });

  it('opens drill-down and sets message URL param when a row is activated (S-07)', async () => {
    const user = setupUser();
    const { router } = renderHome();

    await user.click(screen.getByRole('button', { name: 'Open row' }));

    await waitFor(() => {
      expect(screen.getByTestId('drill-down-open').textContent).toBe(MESSAGE_UUID);
    });
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('message')).toBe(MESSAGE_UUID);
  });

  it('opens cancel dialog and calls cancel mutation on confirm (S-11, S-13)', async () => {
    const user = setupUser();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Cancel row' }));
    expect(screen.getByText('Cancel scheduled message?')).toBeTruthy();
    expect(screen.getByText('Weekly update')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel message' }));

    expect(cancelMutate).toHaveBeenCalledWith(
      { messageId: MESSAGE_UUID, organisationId: 'org-42' },
      expect.objectContaining({ onSettled: expect.any(Function) })
    );
  });

  it('opens delete dialog and calls delete mutation on confirm (S-14)', async () => {
    const user = setupUser();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    expect(screen.getByText('Delete draft?')).toBeTruthy();
    expect(screen.getByText('Draft subject')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete draft' }));

    expect(deleteMutate).toHaveBeenCalledWith(
      { messageId: draftRow.id },
      expect.objectContaining({ onSettled: expect.any(Function) })
    );
  });

  it('navigates to compose when New message is clicked', async () => {
    rbacState.canCompose = true;
    const user = setupUser();
    const { router } = renderHome();

    await user.click(screen.getByRole('button', { name: 'New message' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/comms/create');
    });
    expect(screen.getByText('Compose page')).toBeTruthy();
  });
});

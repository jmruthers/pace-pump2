/* eslint-disable pace-core-compliance/prefer-pace-core-components -- test doubles */
// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/comms/usePumpSupabase.js', () => ({
  usePumpSupabase: () => ({
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  }),
}));
import { CommsLogPage } from './CommsLogPage.js';

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({
    selectedOrganisation: { id: 'org-42' },
    user: { id: 'user-1' },
  }),
}));

vi.mock('@solvera/pace-core/components', async () => {
  const actual = await vi.importActual<typeof import('@solvera/pace-core/components')>(
    '@solvera/pace-core/components'
  );
  return {
    ...actual,
    toast: vi.fn(),
  };
});

vi.mock('@solvera/pace-core/rbac', () => ({
  useSecureSupabase: () => ({
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  }),
  useCan: () => ({ can: false, isLoading: false }),
}));

vi.mock('@/components/comms/CommRbacContextProvider', () => ({
  useCommRbacContext: () => ({
    canCompose: true,
    canSend: false,
    canSchedule: false,
    scopeType: 'organisation',
    scopeId: 'org-42',
  }),
}));

vi.mock('./CommsLogTable.js', () => ({
  CommsLogTable: ({
    onRowActivate,
    onFetchSuccess,
    onFetchError,
  }: {
    onRowActivate: (row: { id: string }) => void;
    onFetchSuccess: (rows: unknown[], total: number) => void;
    onFetchError: (error: Error) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onRowActivate({ id: 'msg-abc' })}>
        Open row
      </button>
      <button type="button" onClick={() => onFetchSuccess([], 0)}>
        Empty list
      </button>
      <button type="button" onClick={() => onFetchError(new Error('boom'))}>
        Fail list
      </button>
    </div>
  ),
}));

vi.mock('./CommsLogDrillDownDialog.js', () => ({
  CommsLogDrillDownDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onOpenChange(false)}>
        Close drill-down
      </button>
    ) : null,
}));

vi.mock('./CommsLogFilters.js', () => ({
  CommsLogFilters: () => <div>filters</div>,
}));

vi.mock('./CommsLogCancelDialog.js', () => ({
  CommsLogCancelDialog: () => null,
}));

vi.mock('./CommsLogDeleteDialog.js', () => ({
  CommsLogDeleteDialog: () => null,
}));

function renderPage(initial = '/') {
  const client = new QueryClient();
  const router = createMemoryRouter(
    [{ path: '/', element: <CommsLogPage /> }],
    { initialEntries: [initial] }
  );
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { router, ...view };
}

describe('CommsLogPage', () => {
  it('shows compose CTA when canCompose is true', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'New message' })).toBeTruthy();
  });

  it('sets message query param when a row is activated', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Open row' })[0]!);
    expect(screen.getByRole('button', { name: 'Close drill-down' })).toBeTruthy();
  });

  it('renders empty state when the list has zero rows', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole('button', { name: 'Empty list' })[0]!);
    expect(
      screen.getByText('No messages yet — start one to see it here.')
    ).toBeTruthy();
  });

  it('renders list error panel on fetch failure', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole('button', { name: 'Fail list' })[0]!);
    expect(screen.getByText("Couldn't load communications.")).toBeTruthy();
  });
});

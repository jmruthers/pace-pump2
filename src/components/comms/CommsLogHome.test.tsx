// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@test-utils';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CommsLogHome } from './CommsLogHome.js';

vi.mock('@/hooks/comms/usePumpSupabase.js', () => ({
  usePumpSupabase: () => ({
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  }),
}));

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
  useCan: () => ({ can: false, isLoading: false }),
}));

vi.mock('@/components/comms/CommRbacContextProvider', () => ({
  useCommRbacContext: () => ({
    canCompose: false,
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
    }: {
      listRefreshKey: number;
      onRowActivate: (row: { id: string }) => void;
    }) => (
      <div>
        <span data-testid="list-refresh-key">{listRefreshKey}</span>
        <Button
          type="button"
          onClick={() => onRowActivate({ id: '550e8400-e29b-41d4-a716-446655440000' })}
        >
          Open row
        </Button>
      </div>
    ),
  };
});

vi.mock('./CommsLogDrillDownDialog.js', () => ({
  CommsLogDrillDownDialog: () => null,
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

vi.mock('./CommsLogCancelDialog.js', () => ({
  CommsLogCancelDialog: () => null,
}));

vi.mock('./CommsLogDeleteDialog.js', () => ({
  CommsLogDeleteDialog: () => null,
}));

function renderHome(initial = '/') {
  const client = new QueryClient();
  const router = createMemoryRouter(
    [{ path: '/', element: <CommsLogHome /> }],
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
  it('bumps listRefreshKey when refresh is clicked', async () => {
    const user = setupUser();
    renderHome();

    expect(screen.getByTestId('list-refresh-key').textContent).toBe('0');

    await user.click(screen.getByRole('button', { name: 'Refresh list' }));
    expect(screen.getByTestId('list-refresh-key').textContent).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Refresh list' }));
    expect(screen.getByTestId('list-refresh-key').textContent).toBe('2');
  });

});

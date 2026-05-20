/* eslint-disable pace-core-compliance/prefer-pace-core-components -- test doubles */
// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/comms/usePumpSupabase.js', () => ({
  usePumpSupabase: () => ({
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  }),
}));
import type { PumpMessageRow } from '@/lib/comms/commsLogTypes.js';
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
    listRefreshKey,
    onRowActivate,
    onFetchSuccess,
    onFetchError,
  }: {
    listRefreshKey: number;
    onRowActivate: (row: PumpMessageRow) => void;
    onFetchSuccess: (rows: unknown[], total: number) => void;
    onFetchError: (error: Error) => void;
  }) => (
    <div data-refresh-key={listRefreshKey}>
      <button
        type="button"
        onClick={() =>
          onRowActivate({
            id: '550e8400-e29b-41d4-a716-446655440000',
            organisation_id: 'org-42',
            channel: 'email',
            subject: 'Hello',
            body_text: 'Body',
            status: 'sent',
            scheduled_at: null,
            sent_at: '2026-05-01T10:00:00.000Z',
            source_app: 'PUMP',
            total_recipients: 1,
            created_by: 'user-1',
            created_at: '2026-05-01T09:00:00.000Z',
          } as PumpMessageRow)
        }
      >
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
    messageId,
    open,
  }: {
    messageId: string | null;
    open: boolean;
  }) => {
    if (!open) {
      return null;
    }
    const malformed =
      messageId != null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        messageId
      );
    if (malformed) {
      return <p>Message not found or not visible.</p>;
    }
    return <p data-testid="drill-down-open">Drill-down open</p>;
  },
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

  it('opens drill-down when a row is activated', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Open row' })[0]!);
    await waitFor(() => {
      expect(screen.getByTestId('drill-down-open')).toBeTruthy();
    });
  });

  it('renders malformed drill-down error for invalid message id', () => {
    renderPage('/?message=not-a-uuid');
    expect(
      screen.getByText('Message not found or not visible.')
    ).toBeTruthy();
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

// @vitest-environment happy-dom
/** PUMP-02 — CommsLogTable fetchData wiring */
import { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerSideParams } from '@solvera/pace-core/components';
import { CommsLogTable } from './CommsLogTable.js';
import type { CommsLogSearchState, PumpMessageRow } from '@/lib/comms/commsLogTypes.js';

const defaultSearch: CommsLogSearchState = {
  channel: null,
  statuses: [],
  from: null,
  to: null,
  messageId: null,
  pageIndex: 0,
  pageSize: 25,
  sortDir: 'desc',
};

const defaultParams: ServerSideParams = {
  pageIndex: 0,
  pageSize: 25,
  sorting: [{ id: 'date', desc: true }],
  columnFilters: [],
  globalFilter: '',
  grouping: [],
};

const sampleRows: PumpMessageRow[] = [
  {
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
  },
];

const {
  fetchPumpMessageListMock,
  onFetchSuccess,
  onFetchError,
  onTableParamsChange,
  supabaseRef,
} = vi.hoisted(() => ({
  fetchPumpMessageListMock: vi.fn(),
  onFetchSuccess: vi.fn(),
  onFetchError: vi.fn(),
  onTableParamsChange: vi.fn(),
  supabaseRef: { current: { from: vi.fn() } as { from: ReturnType<typeof vi.fn> } | null },
}));

vi.mock('@/hooks/comms/usePumpSupabase.js', () => ({
  usePumpSupabase: () => supabaseRef.current,
}));

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  useCan: () => ({ can: true, isLoading: false }),
}));

vi.mock('@/lib/comms/pumpMessageQuery.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/comms/pumpMessageQuery.js')>();
  return {
    ...actual,
    fetchPumpMessageList: (...args: unknown[]) => fetchPumpMessageListMock(...args),
  };
});

vi.mock('./commsLogBadges.js', () => ({
  ChannelBadge: () => <span>channel</span>,
  MessageStatusBadge: () => <span>status</span>,
}));

vi.mock('@solvera/pace-core/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solvera/pace-core/components')>();
  return {
    ...actual,
    DataTable: ({
      serverSide,
    }: {
      serverSide?: { fetchData: (params: ServerSideParams) => Promise<unknown> };
    }) => {
      useEffect(() => {
        void serverSide?.fetchData(defaultParams).catch(() => undefined);
      }, [serverSide]);
      return <div data-testid="data-table" />;
    },
  };
});

function renderTable() {
  return render(
    <CommsLogTable
      organisationId="org-42"
      listRefreshKey={0}
      searchState={defaultSearch}
      onTableParamsChange={onTableParamsChange}
      onFetchSuccess={onFetchSuccess}
      onFetchError={onFetchError}
      onRowActivate={vi.fn()}
      onCancelRow={vi.fn()}
      onDeleteRow={vi.fn()}
    />
  );
}

describe('CommsLogTable', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    supabaseRef.current = { from: vi.fn() };
  });

  it('calls onFetchSuccess when list fetch succeeds', async () => {
    fetchPumpMessageListMock.mockResolvedValue({
      ok: true,
      data: {
        data: sampleRows,
        totalCount: 1,
        pageIndex: 0,
        pageSize: 25,
        pageCount: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    renderTable();

    await waitFor(() => {
      expect(onFetchSuccess).toHaveBeenCalledWith(sampleRows, 1);
    });
    expect(onTableParamsChange).toHaveBeenCalledWith({
      pageIndex: 0,
      pageSize: 25,
      sortDir: 'desc',
    });
    expect(screen.getByTestId('data-table')).toBeTruthy();
  });

  it('calls onFetchError when list fetch fails', async () => {
    fetchPumpMessageListMock.mockResolvedValue({
      ok: false,
      error: { code: 'PUMP_MESSAGE_LIST_FAILED', message: 'list failed' },
    });

    renderTable();

    await waitFor(() => {
      expect(onFetchError).toHaveBeenCalledWith(expect.objectContaining({ message: 'list failed' }));
    });
  });

  it('renders nothing when Supabase client is unavailable', () => {
    supabaseRef.current = null;
    const { container } = renderTable();
    expect(container.firstChild).toBeNull();
  });
});

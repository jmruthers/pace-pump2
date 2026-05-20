import { useCallback, useMemo } from 'react';
import {
  DataTable,
  type DataTableAction,
  type DataTableColumn,
  type ServerSideParams,
} from '@solvera/pace-core/components';
import { useCan } from '@solvera/pace-core/rbac';
import { useUnifiedAuth } from '@solvera/pace-core/hooks';
import { usePumpSupabase } from '@/hooks/comms/usePumpSupabase.js';
import {
  fetchPumpMessageList,
  normalizePageSize,
  sortDirFromTableParams,
} from '@/lib/comms/pumpMessageQuery.js';
import {
  effectiveMessageTimestamp,
  formatShortDate,
  formatTime24h,
  subjectLine,
  truncateBodyPreview,
} from '@/lib/comms/commsLogFormat.js';
import type { CommsLogSearchState, PumpMessageRow } from '@/lib/comms/commsLogTypes.js';
import { ChannelBadge, MessageStatusBadge } from './commsLogBadges.js';

export function CommsLogTable({
  organisationId,
  listRefreshKey,
  searchState,
  onTableParamsChange,
  onFetchSuccess,
  onFetchError,
  onRowActivate,
  onCancelRow,
  onDeleteRow,
}: {
  organisationId: string;
  listRefreshKey: number;
  searchState: CommsLogSearchState;
  onTableParamsChange: (
    patch: Partial<Pick<CommsLogSearchState, 'pageIndex' | 'pageSize' | 'sortDir'>>
  ) => void;
  onFetchSuccess: (rows: PumpMessageRow[], totalCount: number) => void;
  onFetchError: (error: Error) => void;
  onRowActivate: (row: PumpMessageRow) => void;
  onCancelRow: (row: PumpMessageRow) => void;
  onDeleteRow: (row: PumpMessageRow) => void;
}) {
  const supabase = usePumpSupabase();
  const { user } = useUnifiedAuth();
  const { can: canUpdate } = useCan('update:page.CommsLog');
  const { can: canDelete } = useCan('delete:page.CommsLog');

  const initialSorting = useMemo(
    () => [{ id: 'date', desc: searchState.sortDir === 'desc' }],
    [searchState.sortDir]
  );

  const columns = useMemo((): DataTableColumn<PumpMessageRow>[] => {
    return [
      {
        id: 'channel',
        header: 'Channel',
        cell: ({ row }) => <ChannelBadge channel={row.channel} />,
      },
      {
        id: 'subject',
        header: 'Subject',
        cell: ({ row }) => (
          <>
            <p>{subjectLine(row.channel, row.subject)}</p>
            <p className="hidden sm:block truncate max-w-prose">
              {truncateBodyPreview(row.body_text)}
            </p>
          </>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <MessageStatusBadge status={row.status} />,
      },
      {
        id: 'date',
        accessorKey: 'created_at',
        header: 'Date',
        sortable: true,
        cell: ({ row }) => {
          const iso = effectiveMessageTimestamp(row);
          return (
          <>
            <p>{formatShortDate(iso)}</p>
            <p>{formatTime24h(iso)}</p>
          </>
          );
        },
      },
      {
        id: 'recipients',
        header: 'Recipients',
        cell: ({ row }) =>
          row.total_recipients == null ? (
            <span aria-label="Pool not yet resolved">—</span>
          ) : (
            <p className="text-right tabular-nums">{row.total_recipients}</p>
          ),
      },
    ];
  }, []);

  const actions = useMemo((): DataTableAction<PumpMessageRow>[] => {
    const userId = user?.id;
    const list: DataTableAction<PumpMessageRow>[] = [];

    list.push({
      label: 'Cancel',
      variant: 'destructive',
      hidden: (row) => {
        if (row.status !== 'scheduled') {
          return true;
        }
        if (userId == null) {
          return true;
        }
        return !(userId === row.created_by || canUpdate);
      },
      onClick: onCancelRow,
    });

    list.push({
      label: 'Delete',
      variant: 'destructive',
      hidden: (row) => {
        if (row.status !== 'draft') {
          return true;
        }
        if (userId == null || !canDelete) {
          return true;
        }
        return userId !== row.created_by;
      },
      onClick: onDeleteRow,
    });

    return list;
  }, [canDelete, canUpdate, onCancelRow, onDeleteRow, user?.id]);

  const fetchData = useCallback(
    async (params: ServerSideParams) => {
      const sortDir = sortDirFromTableParams(params.sorting);
      const pageSize = normalizePageSize(params.pageSize);
      onTableParamsChange({
        pageIndex: params.pageIndex,
        pageSize,
        sortDir,
      });
      try {
        const result = await fetchPumpMessageList(
          supabase,
          organisationId,
          searchState,
          params
        );
        if (!result.ok) {
          const normalized = new Error(result.error.message);
          onFetchError(normalized);
          throw normalized;
        }
        const response = result.data;
        onFetchSuccess(response.data, response.totalCount);
        return response;
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error("Couldn't load communications.");
        onFetchError(normalized);
        throw normalized;
      }
    },
    [onFetchError, onFetchSuccess, onTableParamsChange, organisationId, searchState, supabase]
  );

  return (
    <DataTable<PumpMessageRow>
      key={`${organisationId}-${listRefreshKey}-${searchState.pageIndex}-${searchState.pageSize}-${searchState.sortDir}-${searchState.channel ?? ''}-${searchState.statuses.join(',')}-${searchState.from ?? ''}-${searchState.to ?? ''}`}
      data={[]}
      columns={columns}
      rbac={{ pageName: 'CommsLog' }}
      initialPageSize={searchState.pageSize}
      initialSorting={initialSorting}
      getRowId={(row) => row.id}
      onRowActivate={onRowActivate}
      actions={actions}
      serverSide={{ fetchData, enableServerSorting: true }}
      features={{
        search: false,
        filtering: false,
        creation: false,
        export: false,
        import: false,
        editing: false,
        deletion: false,
        deleteSelected: false,
        grouping: false,
        columnVisibility: false,
        columnReordering: false,
        pagination: true,
        sorting: true,
      }}
    />
  );
}

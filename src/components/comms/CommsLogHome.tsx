import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, LoadingSpinner, toast } from '@solvera/pace-core/components';
import { Plus } from '@solvera/pace-core/icons';
import { useUnifiedAuth } from '@solvera/pace-core/hooks';
import { useCommsLogSearchParams } from '@/hooks/comms/useCommsLogSearchParams.js';
import { useCancelPumpMessage } from '@/hooks/comms/useCancelPumpMessage.js';
import { useDeletePumpDraft } from '@/hooks/comms/useDeletePumpDraft.js';
import {
  pumpDeliveryEventsQueryKey,
  pumpRecipientsQueryKey,
} from '@/hooks/comms/usePumpMessageDrillDown.js';
import type { PumpMessageRow } from '@/lib/comms/commsLogTypes.js';
import { useCommRbacContext } from '@/components/comms/CommRbacContextProvider.js';
import { usePumpSupabase } from '@/hooks/comms/usePumpSupabase.js';
import { CommsLogCancelDialog } from './CommsLogCancelDialog.js';
import { CommsLogDeleteDialog } from './CommsLogDeleteDialog.js';
import { CommsLogDrillDownDialog } from './CommsLogDrillDownDialog.js';
import { CommsLogFilters } from './CommsLogFilters.js';
import { CommsLogStatePanel } from './CommsLogStatePanel.js';
import { CommsLogTable } from './CommsLogTable.js';

/** Route content for `/`. Page guard is mounted in App.tsx (PUMP-01). */
export function CommsLogHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedOrganisation } = useUnifiedAuth();
  const { canCompose } = useCommRbacContext();
  const supabase = usePumpSupabase();
  const { state, setMessageId, patchFilters, syncFromTable } = useCommsLogSearchParams();

  const organisationId = selectedOrganisation?.id ?? '';
  const [listError, setListError] = useState<Error | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rowCache, setRowCache] = useState<Map<string, PumpMessageRow>>(
    () => new Map()
  );
  const listErrorToastShown = useRef(false);

  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [cancelRow, setCancelRow] = useState<PumpMessageRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<PumpMessageRow | null>(null);

  const bumpListRefresh = useCallback(() => {
    setListRefreshKey((previous) => previous + 1);
  }, []);

  const cancelMutation = useCancelPumpMessage(bumpListRefresh);
  const deleteMutation = useDeletePumpDraft(bumpListRefresh);

  const cachedRow =
    state.messageId != null ? rowCache.get(state.messageId) ?? null : null;

  const handleFetchSuccess = useCallback((rows: PumpMessageRow[], count: number) => {
    setListError(null);
    setTotalCount(count);
    setRowCache((previous) => {
      const next = new Map(previous);
      for (const row of rows) {
        next.set(row.id, row);
      }
      return next;
    });
  }, []);

  const handleFetchError = useCallback((error: Error) => {
    setListError(error);
    setTotalCount(null);
    if (!listErrorToastShown.current) {
      listErrorToastShown.current = true;
      toast({ variant: 'destructive', title: error.message });
    }
  }, []);

  useEffect(() => {
    if (listError == null) {
      listErrorToastShown.current = false;
    }
  }, [listError]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    bumpListRefresh();
    if (state.messageId != null) {
      await queryClient.invalidateQueries({
        queryKey: pumpRecipientsQueryKey(state.messageId),
      });
      await queryClient.invalidateQueries({
        queryKey: pumpDeliveryEventsQueryKey(state.messageId),
      });
    }
    setIsRefreshing(false);
  }, [bumpListRefresh, queryClient, state.messageId]);

  const handleCompose = useCallback(() => {
    navigate('/comms/create');
  }, [navigate]);

  const handleRowActivate = useCallback(
    (row: PumpMessageRow) => {
      setRowCache((previous) => {
        const next = new Map(previous);
        next.set(row.id, row);
        return next;
      });
      setMessageId(row.id);
    },
    [setMessageId]
  );

  const showError = listError != null;
  const showEmpty = !showError && totalCount === 0;
  const showTable = !showError && !showEmpty;

  if (organisationId.length === 0) {
    return null;
  }

  if (supabase == null) {
    return (
      <main className="grid min-h-[40vh] place-items-center">
        <LoadingSpinner />
      </main>
    );
  }

  return (
    <main className="grid gap-6">
      <header className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <h1>Communications</h1>
          <p>View and manage your sent and scheduled messages.</p>
        </div>
        {canCompose ? (
          <Button
            type="button"
            variant="default"
            aria-label="New message"
            onClick={handleCompose}
          >
            <Plus aria-hidden size={16} />
            New message
          </Button>
        ) : null}
      </header>

      <CommsLogFilters
        state={state}
        onChannelChange={(channel) => patchFilters({ channel })}
        onStatusesChange={(statuses) => patchFilters({ statuses })}
        onFromChange={(from) => patchFilters({ from })}
        onToChange={(to) => patchFilters({ to })}
        onRefresh={() => void handleRefresh()}
        isRefreshing={isRefreshing}
      />

      {showError ? (
        <CommsLogStatePanel
          message="Couldn't load communications."
          actionLabel="Retry"
          onAction={() => {
            setListError(null);
            setTotalCount(null);
          }}
        />
      ) : null}

      {showEmpty ? (
        <CommsLogStatePanel
          message="No messages yet — start one to see it here."
          showCompose={canCompose}
          onCompose={handleCompose}
        />
      ) : null}

      {showTable ? (
        <CommsLogTable
          organisationId={organisationId}
          listRefreshKey={listRefreshKey}
          searchState={state}
          onTableParamsChange={syncFromTable}
          onFetchSuccess={handleFetchSuccess}
          onFetchError={handleFetchError}
          onRowActivate={handleRowActivate}
          onCancelRow={setCancelRow}
          onDeleteRow={setDeleteRow}
        />
      ) : null}

      <CommsLogDrillDownDialog
        messageId={state.messageId}
        cachedRow={cachedRow}
        open={state.messageId != null}
        onOpenChange={(open) => {
          if (!open) {
            setMessageId(null);
          }
        }}
      />

      <CommsLogCancelDialog
        row={cancelRow}
        open={cancelRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelRow(null);
          }
        }}
        isPending={cancelMutation.isPending}
        onConfirm={() => {
          if (cancelRow == null) {
            return;
          }
          cancelMutation.mutate(
            {
              messageId: cancelRow.id,
              organisationId: cancelRow.organisation_id,
            },
            { onSettled: () => setCancelRow(null) }
          );
        }}
      />

      <CommsLogDeleteDialog
        row={deleteRow}
        open={deleteRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRow(null);
          }
        }}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteRow == null) {
            return;
          }
          deleteMutation.mutate(
            { messageId: deleteRow.id },
            { onSettled: () => setDeleteRow(null) }
          );
        }}
      />
    </main>
  );
}

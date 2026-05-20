import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  buildCommsLogSearch,
  parseCommsLogSearchParams,
  withFiltersResetPage,
} from '@/lib/comms/commsLogSearchParams.js';
import type { CommsLogSearchState } from '@/lib/comms/commsLogTypes.js';

export function useCommsLogSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(
    () => parseCommsLogSearchParams(searchParams),
    [searchParams]
  );

  const replaceSearch = useCallback(
    (next: CommsLogSearchState) => {
      const built = buildCommsLogSearch(next);
      const params = new URLSearchParams(built.startsWith('?') ? built.slice(1) : built);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const readState = useCallback(
    () => parseCommsLogSearchParams(searchParams),
    [searchParams]
  );

  const setMessageId = useCallback(
    (messageId: string | null) => {
      replaceSearch({ ...readState(), messageId });
    },
    [readState, replaceSearch]
  );

  const patchFilters = useCallback(
    (patch: Partial<Pick<CommsLogSearchState, 'channel' | 'statuses' | 'from' | 'to'>>) => {
      replaceSearch(withFiltersResetPage(readState(), patch));
    },
    [readState, replaceSearch]
  );

  const syncFromTable = useCallback(
    (patch: Partial<Pick<CommsLogSearchState, 'pageIndex' | 'pageSize' | 'sortDir'>>) => {
      const current = readState();
      const next = { ...current, ...patch };
      if (buildCommsLogSearch(next) !== buildCommsLogSearch(current)) {
        replaceSearch(next);
      }
    },
    [readState, replaceSearch]
  );

  return {
    state,
    replaceSearch,
    setMessageId,
    patchFilters,
    syncFromTable,
  };
}

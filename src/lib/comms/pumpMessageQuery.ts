import type { RBACSupabaseClient } from '@solvera/pace-core/rbac';
import type { ServerSideParams, ServerSideResponse } from '@solvera/pace-core/components';
import type { ApiResult } from '@solvera/pace-core/types';
import { createErrorResult, createSuccessResult } from '@solvera/pace-core/types';
import { localDayBoundsIso } from './commsLogFormat.js';
import type { CommsLogSearchState, PumpMessageRow } from './commsLogTypes.js';
import { PUMP_MESSAGE_LIST_COLUMNS } from './commsLogTypes.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageQuery = any;

export function buildDateRangeOrFilter(fromYmd: string, toYmd: string): string {
  const from = localDayBoundsIso(fromYmd).start;
  const to = localDayBoundsIso(toYmd).end;
  return [
    `and(sent_at.gte.${from},sent_at.lte.${to})`,
    `and(sent_at.is.null,scheduled_at.gte.${from},scheduled_at.lte.${to})`,
    `and(sent_at.is.null,scheduled_at.is.null,created_at.gte.${from},created_at.lte.${to})`,
  ].join(',');
}

export function applyListFilters(
  query: MessageQuery,
  filters: Pick<CommsLogSearchState, 'channel' | 'statuses' | 'from' | 'to'>
): MessageQuery {
  let next = query;
  if (filters.channel != null) {
    next = next.eq('channel', filters.channel);
  }
  if (filters.statuses.length > 0) {
    next = next.in('status', filters.statuses);
  }
  if (filters.from != null && filters.to != null) {
    next = next.or(buildDateRangeOrFilter(filters.from, filters.to));
  } else if (filters.from != null) {
    const from = localDayBoundsIso(filters.from).start;
    next = next.or(
      [
        `sent_at.gte.${from}`,
        `and(sent_at.is.null,scheduled_at.gte.${from})`,
        `and(sent_at.is.null,scheduled_at.is.null,created_at.gte.${from})`,
      ].join(',')
    );
  } else if (filters.to != null) {
    const to = localDayBoundsIso(filters.to).end;
    next = next.or(
      [
        `sent_at.lte.${to}`,
        `and(sent_at.is.null,scheduled_at.lte.${to})`,
        `and(sent_at.is.null,scheduled_at.is.null,created_at.lte.${to})`,
      ].join(',')
    );
  }
  return next;
}

export function applyListSort(
  query: MessageQuery,
  sortDir: 'asc' | 'desc'
): MessageQuery {
  const ascending = sortDir === 'asc';
  return query
    .order('sent_at', { ascending, nullsFirst: false })
    .order('created_at', { ascending })
    .order('id', { ascending });
}

export function sortDirFromTableParams(sorting: ServerSideParams['sorting']): 'asc' | 'desc' {
  const dateSort = sorting.find((item) => item.id === 'date');
  if (dateSort == null) {
    return 'desc';
  }
  return dateSort.desc ? 'desc' : 'asc';
}

export function normalizePageSize(size: number): 25 | 50 {
  return size === 50 ? 50 : 25;
}

export async function fetchPumpMessageList(
  supabase: RBACSupabaseClient,
  organisationId: string,
  search: CommsLogSearchState,
  params: ServerSideParams
): Promise<ApiResult<ServerSideResponse<PumpMessageRow>>> {
  const pageSize = normalizePageSize(params.pageSize);
  const sortDir = sortDirFromTableParams(params.sorting);
  const pageIndex = Math.max(0, params.pageIndex);
  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;

  let listQuery = (supabase.from('pump_message') as MessageQuery)
    .select(PUMP_MESSAGE_LIST_COLUMNS)
    .eq('organisation_id', organisationId);

  listQuery = applyListFilters(listQuery, search);
  listQuery = applyListSort(listQuery, sortDir);

  let countQuery = (supabase.from('pump_message') as MessageQuery)
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId);

  countQuery = applyListFilters(countQuery, search);

  const [listResult, countResult] = await Promise.all([
    listQuery.range(from, to),
    countQuery,
  ]);

  if (listResult.error != null) {
    return createErrorResult('PUMP_MESSAGE_LIST_FAILED', listResult.error.message);
  }
  if (countResult.error != null) {
    return createErrorResult('PUMP_MESSAGE_LIST_COUNT_FAILED', countResult.error.message);
  }

  const totalCount = countResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return createSuccessResult({
    data: (listResult.data ?? []) as PumpMessageRow[],
    totalCount,
    pageIndex,
    pageSize,
    pageCount,
    hasNextPage: pageIndex < pageCount - 1,
    hasPreviousPage: pageIndex > 0,
  });
}

/** PUMP-02 QA S-05, S-06 — list query filters and fetch */
import { describe, expect, it, vi } from 'vitest';
import type { ServerSideParams } from '@solvera/pace-core/components';
import type { CommsLogSearchState } from './commsLogTypes.js';
import type { PumpPostgrestQueryBuilder } from './pumpSupabaseQueryBuilder.js';
import {
  applyListFilters,
  applyListSort,
  buildDateRangeOrFilter,
  fetchPumpMessageList,
  normalizePageSize,
  sortDirFromTableParams,
} from './pumpMessageQuery.js';

type RecordedCall = { method: string; args: unknown[] };

function createMockBuilder(resolveValue: {
  data?: unknown[] | null;
  error?: { message: string } | null;
  count?: number | null;
}): PumpPostgrestQueryBuilder & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const builder: PumpPostgrestQueryBuilder & { calls: RecordedCall[] } = {
    calls,
    select(columns: string, options?: { count: 'exact'; head: true }) {
      calls.push({ method: 'select', args: [columns, options] });
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] });
      return builder;
    },
    in(column: string, values: unknown[]) {
      calls.push({ method: 'in', args: [column, values] });
      return builder;
    },
    or(filter: string) {
      calls.push({ method: 'or', args: [filter] });
      return builder;
    },
    order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
      calls.push({ method: 'order', args: [column, options] });
      return builder;
    },
    range(from: number, to: number) {
      calls.push({ method: 'range', args: [from, to] });
      return Promise.resolve({
        data: resolveValue.data ?? null,
        error: resolveValue.error ?? null,
        count: resolveValue.count ?? null,
      });
    },
    maybeSingle() {
      return Promise.resolve({
        data: resolveValue.data ?? null,
        error: resolveValue.error ?? null,
      });
    },
    then(onfulfilled) {
      return Promise.resolve({
        data: resolveValue.data ?? null,
        error: resolveValue.error ?? null,
        count: resolveValue.count ?? null,
      }).then(onfulfilled);
    },
  };
  return builder;
}

function defaultServerSideParams(
  overrides: Partial<ServerSideParams> = {}
): ServerSideParams {
  return {
    pageIndex: 0,
    pageSize: 25,
    sorting: [],
    columnFilters: [],
    globalFilter: '',
    grouping: [],
    ...overrides,
  };
}

describe('pumpMessageQuery', () => {
  it('builds coalesce date-range or filter', () => {
    const filter = buildDateRangeOrFilter('2026-04-01', '2026-04-30');
    expect(filter).toContain('sent_at.gte.');
    expect(filter).toContain('scheduled_at.gte.');
    expect(filter).toContain('created_at.gte.');
    expect(filter).toContain('sent_at.is.null');
  });

  it('maps table sorting to sortDir', () => {
    expect(sortDirFromTableParams([{ id: 'date', desc: true }])).toBe('desc');
    expect(sortDirFromTableParams([{ id: 'date', desc: false }])).toBe('asc');
    expect(sortDirFromTableParams([])).toBe('desc');
  });

  describe('normalizePageSize', () => {
    it('returns 50 only for page size 50', () => {
      expect(normalizePageSize(50)).toBe(50);
      expect(normalizePageSize(25)).toBe(25);
      expect(normalizePageSize(100)).toBe(25);
    });
  });

  describe('applyListFilters', () => {
    it('applies channel, status, and date range filters', () => {
      const builder = createMockBuilder({});
      applyListFilters(builder, {
        channel: 'email',
        statuses: ['scheduled', 'failed'],
        from: '2026-04-01',
        to: '2026-04-30',
      });

      expect(builder.calls).toContainEqual({
        method: 'eq',
        args: ['channel', 'email'],
      });
      expect(builder.calls).toContainEqual({
        method: 'in',
        args: ['status', ['scheduled', 'failed']],
      });
      const orCall = builder.calls.find((call) => call.method === 'or');
      expect(orCall?.args[0]).toContain('sent_at.gte.');
    });

    it('applies from-only date filter', () => {
      const builder = createMockBuilder({});
      applyListFilters(builder, {
        channel: null,
        statuses: [],
        from: '2026-04-01',
        to: null,
      });

      const orCall = builder.calls.find((call) => call.method === 'or');
      expect(orCall?.args[0]).toContain('sent_at.gte.');
      expect(orCall?.args[0]).toContain('scheduled_at.gte.');
    });

    it('applies to-only date filter', () => {
      const builder = createMockBuilder({});
      applyListFilters(builder, {
        channel: null,
        statuses: [],
        from: null,
        to: '2026-04-30',
      });

      const orCall = builder.calls.find((call) => call.method === 'or');
      expect(orCall?.args[0]).toContain('sent_at.lte.');
      expect(orCall?.args[0]).toContain('scheduled_at.lte.');
    });
  });

  describe('applyListSort', () => {
    it('orders by sent_at, created_at, and id', () => {
      const builder = createMockBuilder({});
      applyListSort(builder, 'desc');

      expect(builder.calls).toEqual([
        { method: 'order', args: ['sent_at', { ascending: false, nullsFirst: false }] },
        { method: 'order', args: ['created_at', { ascending: false }] },
        { method: 'order', args: ['id', { ascending: false }] },
      ]);
    });

    it('uses ascending order when sortDir is asc', () => {
      const builder = createMockBuilder({});
      applyListSort(builder, 'asc');

      expect(builder.calls[0]).toEqual({
        method: 'order',
        args: ['sent_at', { ascending: true, nullsFirst: false }],
      });
    });
  });

  describe('fetchPumpMessageList', () => {
    const search: CommsLogSearchState = {
      channel: null,
      statuses: [],
      from: null,
      to: null,
      messageId: null,
      pageIndex: 0,
      pageSize: 25,
      sortDir: 'desc',
    };

    it('returns success payload with pagination metadata', async () => {
      const listBuilder = createMockBuilder({
        data: [{ id: 'msg-1' }],
      });
      const countBuilder = createMockBuilder({ count: 30 });

      let callIndex = 0;
      const supabase = {
        from: vi.fn(() => {
          callIndex += 1;
          return callIndex === 1 ? listBuilder : countBuilder;
        }),
      };

      const result = await fetchPumpMessageList(
        supabase as never,
        'org-1',
        search,
        defaultServerSideParams({ pageIndex: 1 })
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.data).toEqual([{ id: 'msg-1' }]);
        expect(result.data.totalCount).toBe(30);
        expect(result.data.pageIndex).toBe(1);
        expect(result.data.pageSize).toBe(25);
        expect(result.data.pageCount).toBe(2);
        expect(result.data.hasNextPage).toBe(false);
        expect(result.data.hasPreviousPage).toBe(true);
      }
      expect(listBuilder.calls.some((call) => call.method === 'range' && call.args[0] === 25)).toBe(
        true
      );
    });

    it('returns PUMP_MESSAGE_LIST_FAILED when list query errors', async () => {
      const listBuilder = createMockBuilder({
        error: { message: 'list failed' },
      });
      const countBuilder = createMockBuilder({ count: 0 });

      let callIndex = 0;
      const supabase = {
        from: vi.fn(() => {
          callIndex += 1;
          return callIndex === 1 ? listBuilder : countBuilder;
        }),
      };

      const result = await fetchPumpMessageList(
        supabase as never,
        'org-1',
        search,
        defaultServerSideParams()
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PUMP_MESSAGE_LIST_FAILED');
        expect(result.error.message).toBe('list failed');
      }
    });

    it('returns PUMP_MESSAGE_LIST_COUNT_FAILED when count query errors', async () => {
      const listBuilder = createMockBuilder({ data: [] });
      const countBuilder = createMockBuilder({
        error: { message: 'count failed' },
      });

      let callIndex = 0;
      const supabase = {
        from: vi.fn(() => {
          callIndex += 1;
          return callIndex === 1 ? listBuilder : countBuilder;
        }),
      };

      const result = await fetchPumpMessageList(
        supabase as never,
        'org-1',
        search,
        defaultServerSideParams()
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PUMP_MESSAGE_LIST_COUNT_FAILED');
        expect(result.error.message).toBe('count failed');
      }
    });
  });
});


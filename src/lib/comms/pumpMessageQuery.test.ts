import { describe, expect, it } from 'vitest';
import { effectiveMessageTimestamp } from './commsLogFormat.js';
import {
  buildDateRangeOrFilter,
  sortDirFromTableParams,
} from './pumpMessageQuery.js';

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

  it('derives effective timestamp from coalesce chain', () => {
    expect(
      effectiveMessageTimestamp({
        sent_at: '2026-05-01T10:00:00Z',
        scheduled_at: '2026-04-30T09:00:00Z',
        created_at: '2026-04-29T08:00:00Z',
      })
    ).toBe('2026-05-01T10:00:00Z');
    expect(
      effectiveMessageTimestamp({
        sent_at: null,
        scheduled_at: '2026-04-30T09:00:00Z',
        created_at: '2026-04-29T08:00:00Z',
      })
    ).toBe('2026-04-30T09:00:00Z');
  });
});

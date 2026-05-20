import { describe, expect, it } from 'vitest';
import {
  buildCommsLogSearch,
  parseCommsLogSearchParams,
  withFiltersResetPage,
} from './commsLogSearchParams.js';

describe('commsLogSearchParams', () => {
  it('round-trips filter and pagination params', () => {
    const initial = new URLSearchParams(
      'channel=email&status=scheduled,failed&from=2026-04-01&to=2026-05-01&pageIndex=2&pageSize=50&sortDir=asc&message=00000000-0000-4000-8000-000000000001'
    );
    const parsed = parseCommsLogSearchParams(initial);
    expect(parsed.channel).toBe('email');
    expect(parsed.statuses).toEqual(['scheduled', 'failed']);
    expect(parsed.from).toBe('2026-04-01');
    expect(parsed.to).toBe('2026-05-01');
    expect(parsed.pageIndex).toBe(2);
    expect(parsed.pageSize).toBe(50);
    expect(parsed.sortDir).toBe('asc');
    expect(parsed.messageId).toBe('00000000-0000-4000-8000-000000000001');

    const built = buildCommsLogSearch(parsed);
    expect(built).toBe(`?${initial.toString()}`);
  });

  it('omits default params from serialized search', () => {
    const parsed = parseCommsLogSearchParams(new URLSearchParams());
    expect(buildCommsLogSearch(parsed)).toBe('');
  });

  it('resets pageIndex when filters change', () => {
    const state = parseCommsLogSearchParams(new URLSearchParams('pageIndex=3&channel=email'));
    const next = withFiltersResetPage(state, { channel: 'sms' });
    expect(next.pageIndex).toBe(0);
    expect(next.channel).toBe('sms');
  });
});

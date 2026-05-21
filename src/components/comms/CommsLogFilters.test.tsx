// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CommsLogSearchState } from '@/lib/comms/commsLogTypes.js';
import { CommsLogFilters } from './CommsLogFilters.js';

let fromOnChange: ((date: Date | null) => void) | undefined;

vi.mock('@solvera/pace-core/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solvera/pace-core/components')>();
  return {
    ...actual,
    DatePickerWithTimezone: ({
      placeholder,
      onChange,
    }: {
      placeholder?: string;
      onChange?: (date: Date | null) => void;
    }) => {
      if (placeholder === 'From') {
        fromOnChange = onChange;
      }
      return (
        <actual.Button type="button" onClick={() => onChange?.(null)}>
          {placeholder}
        </actual.Button>
      );
    },
    MultiSelect: () => <div>statuses</div>,
    Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: () => null,
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
  };
});

vi.mock('@solvera/pace-core/icons', () => ({
  RefreshCcw: () => <span aria-hidden>refresh</span>,
}));

const defaultState = {
  channel: null,
  statuses: [] as CommsLogSearchState['statuses'],
  from: '2026-04-01',
  to: '2026-05-01',
  pageIndex: 0,
  pageSize: 25 as const,
  sortDir: 'desc' as const,
  messageId: null,
} satisfies CommsLogSearchState;

describe('CommsLogFilters', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    fromOnChange = undefined;
  });

  it('clears from date without throwing', async () => {
    const onFromChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CommsLogFilters
        state={defaultState}
        onChannelChange={vi.fn()}
        onStatusesChange={vi.fn()}
        onFromChange={onFromChange}
        onToChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'From' }));
    expect(onFromChange).toHaveBeenCalledWith(null);
  });

  it('clears to date without throwing', async () => {
    const onToChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CommsLogFilters
        state={defaultState}
        onChannelChange={vi.fn()}
        onStatusesChange={vi.fn()}
        onFromChange={vi.fn()}
        onToChange={onToChange}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'To' }));
    expect(onToChange).toHaveBeenCalledWith(null);
  });

  it('formats selected dates as YYYY-MM-DD', () => {
    const onFromChange = vi.fn();
    render(
      <CommsLogFilters
        state={{ ...defaultState, from: null, to: null }}
        onChannelChange={vi.fn()}
        onStatusesChange={vi.fn()}
        onFromChange={onFromChange}
        onToChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    fromOnChange?.(new Date('2026-03-15T12:00:00'));
    expect(onFromChange).toHaveBeenCalledWith('2026-03-15');
  });
});

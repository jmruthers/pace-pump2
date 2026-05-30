// @vitest-environment happy-dom
/** PUMP-02 QA S-06 — filter panel wiring */
import { cleanup, render, screen } from '@testing-library/react';
import { setupUser } from '@test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CommsLogSearchState } from '@/lib/comms/commsLogTypes.js';
import { CommsLogFilters } from './CommsLogFilters.js';

let fromOnChange: ((date: Date | null) => void) | undefined;
let toOnChange: ((date: Date | null) => void) | undefined;
let selectOnValueChange: ((value: string) => void) | undefined;
let multiSelectOnValueChange: ((values: string[]) => void) | undefined;

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
      if (placeholder === 'To') {
        toOnChange = onChange;
      }
      return (
        <actual.Button type="button" onClick={() => onChange?.(null)}>
          {placeholder}
        </actual.Button>
      );
    },
    MultiSelect: ({
      onValueChange,
    }: {
      onValueChange?: (values: string[]) => void;
    }) => {
      multiSelectOnValueChange = onValueChange;
      return (
        <actual.Button
          type="button"
          onClick={() => onValueChange?.(['scheduled', 'failed'])}
        >
          Select statuses
        </actual.Button>
      );
    },
    Select: ({
      children,
      onValueChange,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
    }) => {
      selectOnValueChange = onValueChange;
      return (
        <div>
          {children}
          <actual.Button type="button" onClick={() => onValueChange?.('email')}>
            Select email channel
          </actual.Button>
          <actual.Button type="button" onClick={() => onValueChange?.('all')}>
            Select all channels
          </actual.Button>
        </div>
      );
    },
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
    toOnChange = undefined;
    selectOnValueChange = undefined;
    multiSelectOnValueChange = undefined;
  });

  it('clears from date without throwing', async () => {
    const onFromChange = vi.fn();
    const user = setupUser();

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
    const user = setupUser();

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

  it('calls onChannelChange with email or null for all channels (S-06)', async () => {
    const onChannelChange = vi.fn();
    const user = setupUser();

    render(
      <CommsLogFilters
        state={defaultState}
        onChannelChange={onChannelChange}
        onStatusesChange={vi.fn()}
        onFromChange={vi.fn()}
        onToChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Select email channel' }));
    expect(onChannelChange).toHaveBeenCalledWith('email');
    expect(selectOnValueChange).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Select all channels' }));
    expect(onChannelChange).toHaveBeenCalledWith(null);
  });

  it('calls onStatusesChange when multi-select changes (S-06)', async () => {
    const onStatusesChange = vi.fn();
    const user = setupUser();

    render(
      <CommsLogFilters
        state={defaultState}
        onChannelChange={vi.fn()}
        onStatusesChange={onStatusesChange}
        onFromChange={vi.fn()}
        onToChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Select statuses' }));
    expect(onStatusesChange).toHaveBeenCalledWith(['scheduled', 'failed']);
    expect(multiSelectOnValueChange).toBeDefined();
  });

  it('calls onRefresh and disables while refreshing (S-06)', async () => {
    const onRefresh = vi.fn();
    const user = setupUser();

    const { rerender } = render(
      <CommsLogFilters
        state={defaultState}
        onChannelChange={vi.fn()}
        onStatusesChange={vi.fn()}
        onFromChange={vi.fn()}
        onToChange={vi.fn()}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(
      <CommsLogFilters
        state={defaultState}
        onChannelChange={vi.fn()}
        onStatusesChange={vi.fn()}
        onFromChange={vi.fn()}
        onToChange={vi.fn()}
        onRefresh={onRefresh}
        isRefreshing
      />
    );

    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveProperty('disabled', true);
  });

  it('formats to date via date picker onChange', () => {
    const onToChange = vi.fn();
    render(
      <CommsLogFilters
        state={{ ...defaultState, from: null, to: null }}
        onChannelChange={vi.fn()}
        onStatusesChange={vi.fn()}
        onFromChange={vi.fn()}
        onToChange={onToChange}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    toOnChange?.(new Date('2026-05-20T12:00:00'));
    expect(onToChange).toHaveBeenCalledWith('2026-05-20');
  });
});

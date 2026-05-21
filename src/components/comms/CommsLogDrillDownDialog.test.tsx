// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CommsLogDrillDownDialog } from './CommsLogDrillDownDialog.js';

const messageId = '550e8400-e29b-41d4-a716-446655440000';

const idleQuery = {
  isLoading: false,
  isError: false,
  error: null,
  data: [] as unknown[],
};

let drillDownState = {
  row: null as unknown,
  notFound: false,
  messageLoadError: false,
  recipientsQuery: idleQuery,
  eventsQuery: idleQuery,
  retryMessage: vi.fn(),
  retryRecipients: vi.fn(),
  retryEvents: vi.fn(),
};

vi.mock('@/hooks/comms/useCommsLogDrillDown.js', () => ({
  useCommsLogDrillDown: () => drillDownState,
}));

vi.mock('@solvera/pace-core/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solvera/pace-core/components')>();
  return {
    ...actual,
    Card: ({ children }: { children: ReactNode }) => <article>{children}</article>,
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <aside>{children}</aside> : null,
    DialogBody: ({ children }: { children: ReactNode }) => <section>{children}</section>,
    DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogDescription: () => null,
    DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    LoadingSpinner: () => <output aria-busy="true">Loading</output>,
  };
});

describe('CommsLogDrillDownDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    drillDownState = {
      row: null,
      notFound: false,
      messageLoadError: false,
      recipientsQuery: idleQuery,
      eventsQuery: idleQuery,
      retryMessage: vi.fn(),
      retryRecipients: vi.fn(),
      retryEvents: vi.fn(),
    };
  });

  it('shows retry state when message fetch fails without cache', () => {
    drillDownState = {
      ...drillDownState,
      messageLoadError: true,
      retryMessage: vi.fn(),
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={null}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText("Couldn't load message details.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('Message not found or not visible.')).toBeNull();
  });

  it('shows not found when message fetch succeeds with no row', () => {
    drillDownState = {
      ...drillDownState,
      notFound: true,
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={null}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Message not found or not visible.')).toBeTruthy();
    expect(screen.queryByText("Couldn't load message details.")).toBeNull();
  });
});

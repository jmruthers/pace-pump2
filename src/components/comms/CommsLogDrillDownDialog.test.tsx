// @vitest-environment happy-dom
/** PUMP-02 QA S-07, S-08 — drill-down dialog presentation */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { setupUser } from '@test-utils';
import { CommsLogDrillDownDialog } from './CommsLogDrillDownDialog.js';

const messageId = '550e8400-e29b-41d4-a716-446655440000';

const idleQuery = {
  isLoading: false,
  isError: false,
  error: null as Error | null,
  data: [] as unknown[],
};

const sampleRow = {
  id: messageId,
  organisation_id: 'org-1',
  channel: 'email' as const,
  subject: 'Weekly update',
  body_text: 'Hello',
  status: 'sent' as const,
  scheduled_at: null,
  sent_at: '2026-05-01T10:00:00Z',
  source_app: 'pump',
  total_recipients: 2,
  created_by: 'user-1',
  created_at: '2026-04-29T08:00:00Z',
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

  it('renders recipient rows when message is loaded (S-07)', () => {
    drillDownState = {
      ...drillDownState,
      row: sampleRow,
      recipientsQuery: {
        ...idleQuery,
        data: [
          {
            id: 'rec-1',
            message_id: messageId,
            member_id: 'm-1',
            address: 'alex@example.test',
            status: 'delivered',
            delivered_at: '2026-05-01T10:05:00Z',
            opened_at: null,
            clicked_at: null,
            failed_at: null,
            failure_reason: null,
            core_member: { full_name: 'Alex Smith' },
          },
          {
            id: 'rec-2',
            message_id: messageId,
            member_id: 'm-2',
            address: 'bob@example.test',
            status: 'delivered',
            delivered_at: '2026-05-01T10:06:00Z',
            opened_at: null,
            clicked_at: null,
            failed_at: null,
            failure_reason: null,
            core_member: { full_name: 'Bob Jones' },
          },
        ],
      },
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={sampleRow}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Weekly update')).toBeTruthy();
    expect(screen.getByText('alex@example.test')).toBeTruthy();
    expect(screen.getByText('bob@example.test')).toBeTruthy();
    expect(screen.getByText('Alex Smith')).toBeTruthy();
  });

  it('shows empty recipients message when list is empty', () => {
    drillDownState = {
      ...drillDownState,
      row: sampleRow,
      recipientsQuery: { ...idleQuery, data: [] },
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={sampleRow}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('No recipients on this message yet.')).toBeTruthy();
  });

  it('shows recipient retry panel and calls retryRecipients (S-07)', async () => {
    const user = setupUser();
    const retryRecipients = vi.fn();
    drillDownState = {
      ...drillDownState,
      row: sampleRow,
      recipientsQuery: { ...idleQuery, isError: true, error: new Error('failed') },
      retryRecipients,
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={sampleRow}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText("Couldn't load recipient details.")).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0]!);
    expect(retryRecipients).toHaveBeenCalledTimes(1);
  });

  it('shows events retry panel and calls retryEvents (S-07)', async () => {
    const user = setupUser();
    const retryEvents = vi.fn();
    drillDownState = {
      ...drillDownState,
      row: sampleRow,
      recipientsQuery: { ...idleQuery, data: [] },
      eventsQuery: { ...idleQuery, isError: true, error: new Error('failed') },
      retryEvents,
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={sampleRow}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText("Couldn't load delivery events.")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryEvents).toHaveBeenCalledTimes(1);
  });

  it('shows engagement times without Opened/Clicked status badges (S-08)', () => {
    drillDownState = {
      ...drillDownState,
      row: sampleRow,
      recipientsQuery: {
        ...idleQuery,
        data: [
          {
            id: 'rec-1',
            message_id: messageId,
            member_id: 'm-1',
            address: 'alex@example.test',
            status: 'delivered',
            delivered_at: '2026-05-01T10:05:00Z',
            opened_at: '2026-05-01T11:00:00Z',
            clicked_at: '2026-05-01T12:00:00Z',
            failed_at: null,
            failure_reason: null,
            core_member: { full_name: 'Alex Smith' },
          },
        ],
      },
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={sampleRow}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText(/^Opened /)).toBeTruthy();
    expect(screen.getByText(/^Clicked /)).toBeTruthy();
    expect(screen.getByText('Delivered')).toBeTruthy();
    expect(screen.queryByText('Opened', { exact: true })).toBeNull();
    expect(screen.queryByText('Clicked', { exact: true })).toBeNull();
  });

  it('surfaces delivery event failure reason from payload', () => {
    drillDownState = {
      ...drillDownState,
      row: sampleRow,
      recipientsQuery: { ...idleQuery, data: [] },
      eventsQuery: {
        ...idleQuery,
        data: [
          {
            id: 'evt-1',
            recipient_id: 'rec-1',
            event_type: 'bounce',
            gateway: 'resend',
            occurred_at: '2026-05-01T10:05:00Z',
            raw_payload: { reason: 'Mailbox full' },
            pump_message_recipient: { address: 'alex@example.test' },
          },
        ],
      },
    };

    render(
      <CommsLogDrillDownDialog
        messageId={messageId}
        cachedRow={sampleRow}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Mailbox full/)).toBeTruthy();
    expect(screen.getByText(/bounce/)).toBeTruthy();
  });
});

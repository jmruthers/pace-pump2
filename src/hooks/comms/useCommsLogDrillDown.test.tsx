// @vitest-environment happy-dom
/** PUMP-02 QA S-09 — drill-down orchestration and error toasts */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommsLogDrillDown } from './useCommsLogDrillDown.js';

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

const validMessageId = '550e8400-e29b-41d4-a716-446655440000';

const createQueryState = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  isError: false,
  error: null as Error | null,
  data: null as unknown,
  refetch: vi.fn(),
  ...overrides,
});

let messageQuery = createQueryState();
let recipientsQuery = createQueryState({ data: [] });
let eventsQuery = createQueryState({ data: [] });

vi.mock('@solvera/pace-core/components', () => ({
  toast: toastMock,
}));

vi.mock('@/hooks/comms/usePumpMessageDrillDown.js', () => ({
  usePumpMessageById: () => messageQuery,
  usePumpMessageRecipients: () => recipientsQuery,
  usePumpDeliveryEvents: () => eventsQuery,
}));

describe('useCommsLogDrillDown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageQuery = createQueryState();
    recipientsQuery = createQueryState({ data: [] });
    eventsQuery = createQueryState({ data: [] });
  });

  it('sets notFound for malformed message id (QA S-09)', () => {
    const { result } = renderHook(() =>
      useCommsLogDrillDown({
        messageId: 'abc',
        cachedRow: null,
        open: true,
      })
    );

    expect(result.current.notFound).toBe(true);
    expect(result.current.messageLoadError).toBe(false);
  });

  it('sets notFound when message load succeeds with no row', () => {
    messageQuery = createQueryState({ data: null });

    const { result } = renderHook(() =>
      useCommsLogDrillDown({
        messageId: validMessageId,
        cachedRow: null,
        open: true,
      })
    );

    expect(result.current.notFound).toBe(true);
  });

  it('sets messageLoadError when fetch fails without cache', () => {
    messageQuery = createQueryState({
      isError: true,
      error: new Error('load failed'),
    });

    const { result } = renderHook(() =>
      useCommsLogDrillDown({
        messageId: validMessageId,
        cachedRow: null,
        open: true,
      })
    );

    expect(result.current.messageLoadError).toBe(true);
    expect(result.current.notFound).toBe(false);
  });

  it('uses cached row without requiring message fetch', () => {
    const cachedRow = {
      id: validMessageId,
      channel: 'email' as const,
      subject: 'Cached',
    };

    const { result } = renderHook(() =>
      useCommsLogDrillDown({
        messageId: validMessageId,
        cachedRow: cachedRow as never,
        open: true,
      })
    );

    expect(result.current.row).toEqual(cachedRow);
    expect(result.current.notFound).toBe(false);
    expect(result.current.messageLoadError).toBe(false);
  });

  it('shows message error toast once until error clears', async () => {
    messageQuery = createQueryState({
      isError: true,
      error: new Error('message details failed'),
    });

    const { rerender } = renderHook(() =>
      useCommsLogDrillDown({
        messageId: validMessageId,
        cachedRow: null,
        open: true,
      })
    );

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledTimes(1);
      expect(toastMock).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'message details failed',
      });
    });

    rerender();
    expect(toastMock).toHaveBeenCalledTimes(1);

    messageQuery = createQueryState({ data: { id: validMessageId } });
    rerender();
    expect(toastMock).toHaveBeenCalledTimes(1);

    messageQuery = createQueryState({
      isError: true,
      error: new Error('message details failed again'),
    });
    rerender();
    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(2));
  });

  it('shows recipient and delivery event error toasts once each', async () => {
    recipientsQuery = createQueryState({
      isError: true,
      error: new Error('recipients failed'),
    });
    eventsQuery = createQueryState({
      isError: true,
      error: new Error('events failed'),
    });

    renderHook(() =>
      useCommsLogDrillDown({
        messageId: validMessageId,
        cachedRow: { id: validMessageId } as never,
        open: true,
      })
    );

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'recipients failed',
      });
      expect(toastMock).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'events failed',
      });
    });
    expect(toastMock).toHaveBeenCalledTimes(2);
  });
});

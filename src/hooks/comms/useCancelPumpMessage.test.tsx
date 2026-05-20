// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCancelPumpMessage } from './useCancelPumpMessage.js';

const invoke = vi.fn();

vi.mock('@/hooks/comms/usePumpSupabase.js', () => ({
  usePumpSupabase: () => ({
    functions: { invoke },
  }),
}));

vi.mock('@solvera/pace-core/components', () => ({
  toast: vi.fn(),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCancelPumpMessage', () => {
  it('refreshes the list when cancel returns invalid status', async () => {
    const onListRefresh = vi.fn();
    invoke.mockResolvedValueOnce({
      data: {
        ok: false,
        error: {
          code: 'PUMP_CANCEL_INVALID_STATUS',
          message: 'Only scheduled messages can be cancelled.',
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useCancelPumpMessage(onListRefresh), { wrapper });
    result.current.mutate({
      messageId: 'msg-1',
      organisationId: 'org-1',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(onListRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('does not refresh the list when RBAC is denied', async () => {
    const onListRefresh = vi.fn();
    invoke.mockResolvedValueOnce({
      data: {
        ok: false,
        error: { code: 'PUMP_RBAC_DENIED', message: 'Not permitted to cancel this message.' },
      },
      error: null,
    });

    const { result } = renderHook(() => useCancelPumpMessage(onListRefresh), { wrapper });
    result.current.mutate({
      messageId: 'msg-2',
      organisationId: 'org-1',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onListRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh the list on owner mismatch', async () => {
    const onListRefresh = vi.fn();
    invoke.mockResolvedValueOnce({
      data: {
        ok: false,
        error: {
          code: 'PUMP_CANCEL_OWNER_MISMATCH',
          message: 'Only the creator can cancel this message.',
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useCancelPumpMessage(onListRefresh), { wrapper });
    result.current.mutate({
      messageId: 'msg-4',
      organisationId: 'org-1',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onListRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh the list on generic cancel failure', async () => {
    const onListRefresh = vi.fn();
    invoke.mockResolvedValueOnce({
      data: {
        ok: false,
        error: { code: 'PUMP_CANCEL_FAILED', message: 'Cancel failed.' },
      },
      error: null,
    });

    const { result } = renderHook(() => useCancelPumpMessage(onListRefresh), { wrapper });
    result.current.mutate({
      messageId: 'msg-5',
      organisationId: 'org-1',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onListRefresh).not.toHaveBeenCalled();
  });

  it('refreshes the list on cancel success', async () => {
    const onListRefresh = vi.fn();
    invoke.mockResolvedValueOnce({
      data: { ok: true, data: { message_id: 'msg-6' } },
      error: null,
    });

    const { result } = renderHook(() => useCancelPumpMessage(onListRefresh), { wrapper });
    result.current.mutate({
      messageId: 'msg-6',
      organisationId: 'org-1',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onListRefresh).toHaveBeenCalledTimes(1);
  });

  it('surfaces network failures', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('network') });

    const { result } = renderHook(() => useCancelPumpMessage(), { wrapper });
    result.current.mutate({
      messageId: 'msg-3',
      organisationId: 'org-1',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Couldn't reach the cancel service.");
  });
});

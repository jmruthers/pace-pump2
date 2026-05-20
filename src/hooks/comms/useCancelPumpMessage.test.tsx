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
  it('refetches the list when cancel returns invalid status', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
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

    const { result } = renderHook(() => useCancelPumpMessage(), { wrapper });
    result.current.mutate({
      messageId: 'msg-1',
      organisationId: 'org-1',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pumpMessages'] });
    });
  });

  it('does not refetch when RBAC is denied', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    invoke.mockResolvedValueOnce({
      data: {
        ok: false,
        error: { code: 'PUMP_RBAC_DENIED', message: 'Not permitted to cancel this message.' },
      },
      error: null,
    });
    invalidateSpy.mockClear();

    const { result } = renderHook(() => useCancelPumpMessage(), { wrapper });
    result.current.mutate({
      messageId: 'msg-2',
      organisationId: 'org-1',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
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

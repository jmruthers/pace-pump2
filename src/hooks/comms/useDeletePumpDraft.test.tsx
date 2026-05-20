// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDeletePumpDraft } from './useDeletePumpDraft.js';

const deleteEq = vi.fn();

vi.mock('@/hooks/comms/usePumpSupabase.js', () => ({
  usePumpSupabase: () => ({
    from: () => ({
      delete: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              select: deleteEq,
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@solvera/pace-core/components', () => ({
  toast: vi.fn(),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useDeletePumpDraft', () => {
  it('uses a neutral toast when delete returns zero rows', async () => {
    const { toast } = await import('@solvera/pace-core/components');
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    deleteEq.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useDeletePumpDraft(), { wrapper });
    result.current.mutate({ messageId: 'draft-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast).toHaveBeenCalledWith({
      variant: 'default',
      title: 'Draft already removed.',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pumpMessages'] });
  });

  it('does not refetch on delete failure', async () => {
    const { toast } = await import('@solvera/pace-core/components');
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    deleteEq.mockResolvedValueOnce({
      data: null,
      error: { message: 'RLS denied' },
    });
    invalidateSpy.mockClear();

    const { result } = renderHook(() => useDeletePumpDraft(), { wrapper });
    result.current.mutate({ messageId: 'draft-2' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'RLS denied',
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

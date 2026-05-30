// @vitest-environment happy-dom
/** PU04 — template create/update/retire/activate mutations */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { buildTemplateSavePayload } from '@/lib/templates/buildTemplateSavePayload';
import { organisationTemplatesQueryKey } from './queryKeys';
import { useTemplateMutations } from './useTemplateMutations';

const mocks = vi.hoisted(() => ({
  toastMock: vi.fn(),
  client: {} as object | null,
  insert: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
  updateEq: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
}));

const update = vi.fn(() => ({
  eq: mocks.updateEq,
}));

vi.mock('@solvera/pace-core/components', () => ({
  toast: mocks.toastMock,
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  useSecureSupabase: () => mocks.client,
}));

vi.mock('@/lib/templates/templatesDb', () => ({
  pumpOrganisationTemplates: () => ({
    insert: mocks.insert,
    update,
  }),
}));

vi.mock('@/lib/templates/buildTemplateSavePayload', () => ({
  buildTemplateSavePayload: vi.fn(() => ({
    organisation_id: 'org-1',
    name: 'Welcome',
    created_by: 'user-1',
  })),
}));

const form = {
  name: 'Welcome',
  description: '',
  channel: 'email' as const,
  subject: 'Hi',
  body: '<p>Hello</p>',
  require_merge_field_validation: false,
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useTemplateMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client = {};
    mocks.insert.mockResolvedValue({ error: null });
    mocks.updateEq.mockResolvedValue({ error: null });
  });

  it('inserts payload from buildTemplateSavePayload on create (AC-5)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useTemplateMutations('org-1', 'user-1'), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.createMutation.mutateAsync(form);

    expect(buildTemplateSavePayload).toHaveBeenCalledWith({
      form,
      organisationId: 'org-1',
      userId: 'user-1',
      mode: 'create',
    });
    expect(mocks.insert).toHaveBeenCalled();
    await waitFor(() => {
      expect(mocks.toastMock).toHaveBeenCalledWith({
        variant: 'success',
        title: 'Template created.',
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: organisationTemplatesQueryKey('org-1'),
    });
  });

  it('shows destructive toast when create runs without authenticated client', async () => {
    mocks.client = null;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTemplateMutations('org-1', 'user-1'), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.createMutation.mutateAsync(form)).rejects.toThrow(
      'Not authenticated'
    );
    expect(mocks.toastMock).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Not authenticated',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('shows destructive toast when update fails', async () => {
    mocks.updateEq.mockResolvedValueOnce({ error: new Error('Update failed') });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useTemplateMutations('org-1', 'user-1'), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.updateMutation.mutateAsync({ id: 'tpl-1', form })
    ).rejects.toThrow('Update failed');

    expect(mocks.toastMock).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Update failed',
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('retires template and invalidates list on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useTemplateMutations('org-1', 'user-1'), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.retireMutation.mutateAsync('tpl-1');

    expect(update).toHaveBeenCalledWith({ is_active: false });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'tpl-1');
    await waitFor(() => {
      expect(mocks.toastMock).toHaveBeenCalledWith({
        variant: 'success',
        title: 'Template retired.',
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: organisationTemplatesQueryKey('org-1'),
    });
  });

  it('activates template and invalidates list on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useTemplateMutations('org-1', 'user-1'), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.activateMutation.mutateAsync('tpl-2');

    expect(update).toHaveBeenCalledWith({ is_active: true });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'tpl-2');
    await waitFor(() => {
      expect(mocks.toastMock).toHaveBeenCalledWith({
        variant: 'success',
        title: 'Template activated.',
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: organisationTemplatesQueryKey('org-1'),
    });
  });
});

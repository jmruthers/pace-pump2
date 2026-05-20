// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { buildTemplateSavePayload } from '@/lib/templates/buildTemplateSavePayload';
import { useTemplateMutations } from './useTemplateMutations';

const insert = vi.fn(async () => ({ error: null }));
const update = vi.fn(() => ({
  eq: vi.fn(async () => ({ error: null })),
}));

vi.mock('@solvera/pace-core/components', () => ({
  toast: vi.fn(),
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  useSecureSupabase: () => ({}),
}));

vi.mock('@/lib/templates/templatesDb', () => ({
  pumpOrganisationTemplates: () => ({
    insert,
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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTemplateMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts payload from buildTemplateSavePayload on create (AC-5)', async () => {
    const form = {
      name: 'Welcome',
      description: '',
      channel: 'email' as const,
      subject: 'Hi',
      body: '<p>Hello</p>',
      require_merge_field_validation: false,
    };
    const { result } = renderHook(() => useTemplateMutations('org-1', 'user-1'), { wrapper });
    await result.current.createMutation.mutateAsync(form);
    expect(buildTemplateSavePayload).toHaveBeenCalledWith({
      form,
      organisationId: 'org-1',
      userId: 'user-1',
      mode: 'create',
    });
    expect(insert).toHaveBeenCalled();
  });
});

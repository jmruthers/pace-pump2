// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffectivePumpSenderIdentity } from './useEffectivePumpSenderIdentity';
import type { EffectivePumpSenderIdentity } from '@/lib/comms/senderIdentityContract';

const rpcMock = vi.fn();
const orgId = '11111111-1111-1111-1111-111111111111';

const sampleIdentity: EffectivePumpSenderIdentity = {
  organisationId: orgId,
  sourceContextType: undefined,
  sourceContextId: undefined,
  senderName: 'PUMP',
  fromAddress: 'pump@example.com',
  replyToAddress: null,
  senderPhone: null,
  resolvedFrom: 'organisation',
  resolvedOrganisationId: orgId,
  canSendEmail: true,
  canSendSms: false,
};

vi.mock('@solvera/pace-core/rbac', () => ({
  useSecureSupabase: () => ({
    rpc: rpcMock,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEffectivePumpSenderIdentity', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('does not fetch when organisationId is null', () => {
    renderHook(
      () =>
        useEffectivePumpSenderIdentity({
          organisationId: null,
        }),
      { wrapper }
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls RPC with canonical argument names', async () => {
    rpcMock.mockResolvedValue({ data: [sampleIdentity], error: null });

    const { result } = renderHook(
      () =>
        useEffectivePumpSenderIdentity({
          organisationId: orgId,
          sourceContextType: 'event',
          sourceContextId: '22222222-2222-2222-2222-222222222222',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith('pump_get_effective_sender_identity', {
      organisation_id: orgId,
      source_context_type: 'event',
      source_context_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.current.data).toEqual(sampleIdentity);
  });

  it('surfaces RPC errors', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'RPC failed', code: '500' },
    });

    const { result } = renderHook(
      () =>
        useEffectivePumpSenderIdentity({
          organisationId: orgId,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('RPC failed');
  });
});

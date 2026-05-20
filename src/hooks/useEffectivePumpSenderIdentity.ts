import { useQuery } from '@tanstack/react-query';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { HandleSupabaseError } from '@solvera/pace-core/utils';
import { PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC } from '@/lib/comms/senderIdentityContractConstants';
import {
  buildSenderIdentityRpcArgs,
  coerceEffectivePumpSenderIdentityRow,
  type EffectivePumpSenderIdentity,
} from '@/lib/comms/senderIdentityContract';

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
};

export type UseEffectivePumpSenderIdentityInput = {
  organisationId: string | null;
  sourceContextType?: 'event' | 'organisation' | null;
  sourceContextId?: string | null;
};

/** PU03 — platform-managed sender identity via `pump_get_effective_sender_identity`. */
export function useEffectivePumpSenderIdentity(input: UseEffectivePumpSenderIdentityInput) {
  const secureSupabase = useSecureSupabase() as RpcClient | null;
  const { organisationId, sourceContextType = null, sourceContextId = null } = input;

  return useQuery({
    queryKey: [
      'pump-effective-sender-identity',
      organisationId,
      sourceContextType,
      sourceContextId,
    ],
    enabled: organisationId != null && secureSupabase != null,
    queryFn: async (): Promise<EffectivePumpSenderIdentity | null> => {
      if (organisationId == null || secureSupabase == null) {
        return null;
      }

      const { data, error } = await secureSupabase.rpc(PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC, {
        ...buildSenderIdentityRpcArgs({
          organisationId,
          sourceContextType,
          sourceContextId,
        }),
      });

      if (error != null) {
        throw new Error(HandleSupabaseError(error, 'sender identity').message);
      }

      return coerceEffectivePumpSenderIdentityRow(data);
    },
  });
}

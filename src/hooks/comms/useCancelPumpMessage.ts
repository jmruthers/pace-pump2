import { useMutation } from '@tanstack/react-query';
import { toast } from '@solvera/pace-core/components';
import type { FunctionsInvoke } from '@solvera/pace-core/rbac';
import { usePumpSupabase } from '@/hooks/comms/usePumpSupabase.js';

type PumpSupabaseClient = ReturnType<typeof usePumpSupabase> & {
  functions: FunctionsInvoke;
};
import type { PumpMessageRow } from '@/lib/comms/commsLogTypes.js';

interface CancelInput {
  messageId: string;
  organisationId: string;
}

type CancelApiResult =
  | { ok: true; data: { message_id: string } }
  | { ok: false; error: { code: string; message: string } };

function shouldRefetchListOnCancelError(code: string): boolean {
  return code === 'PUMP_CANCEL_INVALID_STATUS';
}

export function useCancelPumpMessage(onListRefresh?: () => void) {
  const supabase = usePumpSupabase() as PumpSupabaseClient | null;

  return useMutation({
    mutationFn: async ({ messageId, organisationId }: CancelInput) => {
      if (supabase == null) {
        throw new Error('Supabase client is not available.');
      }
      if (supabase.functions == null) {
        throw new Error("Couldn't reach the cancel service.");
      }
      const response = (await supabase.functions.invoke('pump-cancel', {
        body: { messageId, organisationId },
      })) as { data: CancelApiResult | null; error: Error | null } | undefined;
      if (response == null) {
        throw new Error("Couldn't reach the cancel service.");
      }
      const { data, error } = response;
      if (error != null) {
        throw new Error("Couldn't reach the cancel service.");
      }
      const result = data as CancelApiResult | null;
      if (result == null) {
        throw new Error("Couldn't reach the cancel service.");
      }
      if (!result.ok) {
        const cancelError = new Error(result.error.message);
        (cancelError as Error & { code: string }).code = result.error.code;
        throw cancelError;
      }
      return result.data;
    },
    onSuccess: () => {
      toast({ variant: 'success', title: 'Message cancelled.' });
      onListRefresh?.();
    },
    onError: (error: Error & { code?: string }) => {
      const code = error.code ?? 'PUMP_CANCEL_FAILED';
      toast({
        variant: 'destructive',
        title: error.message || 'Cancel failed.',
      });
      if (shouldRefetchListOnCancelError(code)) {
        onListRefresh?.();
      }
    },
  });
}

export type CancelTargetRow = Pick<
  PumpMessageRow,
  'id' | 'channel' | 'subject' | 'organisation_id'
>;

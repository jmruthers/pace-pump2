import { useMemo } from 'react';
import {
  useCommSendAdapter,
  validateCommDraft,
  type CommDraft,
  type CommSendAdapter,
  type RecipientPoolDescriptor,
} from '@solvera/pace-core/comms';
import { createErrorResult, createSuccessResult } from '@solvera/pace-core/types';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { HandleSupabaseError } from '@solvera/pace-core/utils';
import { buildPumpMessageUpsertRow } from '@/lib/compose/buildPumpMessageUpsert';
import { buildSendTestSuccessToast } from '@/lib/compose/sendToastMessages';
import type { DerivedSourceContext } from '@/lib/compose/types';
import { toast } from '@solvera/pace-core/components';

type MessageUpsertClient = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      options?: { onConflict?: string }
    ) => Promise<{ error: unknown }>;
  };
};

export type UsePumpCommSendAdapterInput = {
  organisationId: string;
  sourceContext: DerivedSourceContext;
  draftMessageId: string;
  recipientPool: RecipientPoolDescriptor;
  createdBy: string | null;
  onSaveDraftSuccess?: (draft: CommDraft) => void;
};

export function usePumpCommSendAdapter(input: UsePumpCommSendAdapterInput): CommSendAdapter {
  const baseAdapter = useCommSendAdapter({
    organisationId: input.organisationId,
    sourceApp: 'pump',
    sourceContextType: input.sourceContext.sourceContextType,
    sourceContextId: input.sourceContext.sourceContextId,
  });
  const secureSupabase = useSecureSupabase() as MessageUpsertClient | null;

  return useMemo<CommSendAdapter>(() => {
    const saveDraft: CommSendAdapter['saveDraft'] = async (draft: CommDraft) => {
      const validation = validateCommDraft(draft);
      if (!validation.valid) {
        return createErrorResult(
          'COMMS_DRAFT_INVALID',
          validation.issues.map((issue) => issue.message).join(' ')
        );
      }
      if (secureSupabase == null) {
        return createErrorResult(
          'COMMS_ADAPTER_NO_CLIENT',
          'Cannot save draft: secure Supabase client is unavailable.'
        );
      }

      const row = buildPumpMessageUpsertRow({
        id: input.draftMessageId,
        organisationId: input.organisationId,
        draft,
        recipientPool: input.recipientPool,
        sourceContext: input.sourceContext,
        createdBy: input.createdBy,
      });

      const { error } = await secureSupabase.from('pump_message').upsert(row, {
        onConflict: 'id',
      });

      if (error != null) {
        const handled = HandleSupabaseError(error, 'save draft');
        return createErrorResult('PUMP_SAVE_DRAFT_FAILED', handled.message);
      }

      input.onSaveDraftSuccess?.(draft);
      return createSuccessResult(draft);
    };

    const sendTest: CommSendAdapter['sendTest'] = async (request) => {
      const result = await baseAdapter.sendTest(request);
      if (result.ok) {
        const { title, description } = buildSendTestSuccessToast(request.channel);
        toast({ variant: 'success', title, description });
      }
      return result;
    };

    return {
      ...baseAdapter,
      saveDraft,
      sendTest,
    };
  }, [
    baseAdapter,
    input,
    secureSupabase,
  ]);
}

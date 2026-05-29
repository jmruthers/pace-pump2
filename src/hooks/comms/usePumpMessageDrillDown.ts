import { useQuery } from '@tanstack/react-query';
import { usePumpSupabase } from '@/hooks/comms/usePumpSupabase.js';
import type {
  PumpDeliveryEventRow,
  PumpMessageRecipientRow,
  PumpMessageRow,
} from '@/lib/comms/commsLogTypes.js';
import { isValidUuid } from '@/lib/comms/commsLogFormat.js';
import { pumpFrom } from '@/lib/comms/pumpSupabaseQueryBuilder.js';

export const pumpRecipientsQueryKey = (messageId: string) =>
  ['pumpMessageRecipients', messageId] as const;

export const pumpDeliveryEventsQueryKey = (messageId: string) =>
  ['pumpDeliveryEvents', messageId] as const;

export function usePumpMessageById(messageId: string | null, enabled: boolean) {
  const supabase = usePumpSupabase();

  return useQuery({
    queryKey: ['pumpMessage', messageId],
    enabled: enabled && supabase != null && messageId != null && isValidUuid(messageId),
    queryFn: async (): Promise<PumpMessageRow | null> => {
      const { data, error } = await pumpFrom(supabase!, 'pump_message')
        .select('*')
        .eq('id', messageId!)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return (data as PumpMessageRow | null) ?? null;
    },
  });
}

export function usePumpMessageRecipients(messageId: string | null, enabled: boolean) {
  const supabase = usePumpSupabase();

  return useQuery({
    queryKey: pumpRecipientsQueryKey(messageId ?? ''),
    enabled: enabled && supabase != null && messageId != null && isValidUuid(messageId),
    queryFn: async (): Promise<PumpMessageRecipientRow[]> => {
      const { data, error } = await pumpFrom(supabase!, 'pump_message_recipient')
        .select(
          'id, message_id, member_id, address, status, delivered_at, opened_at, clicked_at, failed_at, failure_reason, core_member(full_name)'
        )
        .eq('message_id', messageId!)
        .order('address', { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []) as unknown as PumpMessageRecipientRow[];
    },
  });
}

export function usePumpDeliveryEvents(messageId: string | null, enabled: boolean) {
  const supabase = usePumpSupabase();

  return useQuery({
    queryKey: pumpDeliveryEventsQueryKey(messageId ?? ''),
    enabled: enabled && supabase != null && messageId != null && isValidUuid(messageId),
    queryFn: async (): Promise<PumpDeliveryEventRow[]> => {
      const { data: recipients, error: recipientError } = await pumpFrom(
        supabase!,
        'pump_message_recipient'
      )
        .select('id')
        .eq('message_id', messageId!);
      if (recipientError) {
        throw recipientError;
      }
      const recipientIds = ((recipients ?? []) as Array<{ id: string }>).map((row) => row.id);
      if (recipientIds.length === 0) {
        return [];
      }

      const { data, error } = await pumpFrom(supabase!, 'pump_delivery_event')
        .select(
          'id, recipient_id, event_type, gateway, occurred_at, raw_payload, pump_message_recipient(address)'
        )
        .in('recipient_id', recipientIds)
        .order('occurred_at', { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []) as unknown as PumpDeliveryEventRow[];
    },
  });
}

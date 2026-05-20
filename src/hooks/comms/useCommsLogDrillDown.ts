import { useCallback, useEffect, useRef } from 'react';
import { toast } from '@solvera/pace-core/components';
import { isValidUuid } from '@/lib/comms/commsLogFormat.js';
import type { PumpMessageRow } from '@/lib/comms/commsLogTypes.js';
import {
  usePumpDeliveryEvents,
  usePumpMessageById,
  usePumpMessageRecipients,
} from '@/hooks/comms/usePumpMessageDrillDown.js';

export function useCommsLogDrillDown({
  messageId,
  cachedRow,
  open,
}: {
  messageId: string | null;
  cachedRow: PumpMessageRow | null;
  open: boolean;
}) {
  const messageErrorShown = useRef(false);
  const recipientsErrorShown = useRef(false);
  const eventsErrorShown = useRef(false);

  const malformed = messageId != null && !isValidUuid(messageId);
  const canLoad = open && messageId != null && isValidUuid(messageId);
  const messageLoadNeeded = canLoad && cachedRow == null;

  const messageQuery = usePumpMessageById(messageId, messageLoadNeeded);
  const recipientsQuery = usePumpMessageRecipients(messageId, canLoad);
  const eventsQuery = usePumpDeliveryEvents(messageId, canLoad);

  const row = cachedRow ?? messageQuery.data ?? null;
  const messageLoadError = messageLoadNeeded && messageQuery.isError;
  const notFound =
    malformed ||
    (messageLoadNeeded &&
      !messageQuery.isLoading &&
      !messageQuery.isError &&
      messageQuery.data == null);

  const retryMessage = useCallback(() => {
    void messageQuery.refetch();
  }, [messageQuery]);

  const retryRecipients = useCallback(() => {
    void recipientsQuery.refetch();
  }, [recipientsQuery]);

  const retryEvents = useCallback(() => {
    void eventsQuery.refetch();
  }, [eventsQuery]);

  useEffect(() => {
    if (messageQuery.isError && !messageErrorShown.current) {
      messageErrorShown.current = true;
      toast({
        variant: 'destructive',
        title: messageQuery.error?.message ?? "Couldn't load message details.",
      });
    }
    if (!messageQuery.isError) {
      messageErrorShown.current = false;
    }
  }, [messageQuery.isError, messageQuery.error]);

  useEffect(() => {
    if (recipientsQuery.isError && !recipientsErrorShown.current) {
      recipientsErrorShown.current = true;
      toast({
        variant: 'destructive',
        title: recipientsQuery.error?.message ?? "Couldn't load recipient details.",
      });
    }
    if (!recipientsQuery.isError) {
      recipientsErrorShown.current = false;
    }
  }, [recipientsQuery.isError, recipientsQuery.error]);

  useEffect(() => {
    if (eventsQuery.isError && !eventsErrorShown.current) {
      eventsErrorShown.current = true;
      toast({
        variant: 'destructive',
        title: eventsQuery.error?.message ?? "Couldn't load delivery events.",
      });
    }
    if (!eventsQuery.isError) {
      eventsErrorShown.current = false;
    }
  }, [eventsQuery.isError, eventsQuery.error]);

  return {
    row,
    notFound,
    messageLoadError,
    recipientsQuery,
    eventsQuery,
    retryMessage,
    retryRecipients,
    retryEvents,
  };
}

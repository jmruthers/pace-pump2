import type { ComposeRecipientMode, DerivedSourceContext } from './types';

/** BR-SourceContextDerivation — pool drives adapter source context. */
export function deriveSourceContext(
  mode: ComposeRecipientMode,
  selectedEventId: string | null
): DerivedSourceContext {
  if (mode === 'event_participants' && selectedEventId != null && selectedEventId.length > 0) {
    return { sourceContextType: 'event', sourceContextId: selectedEventId };
  }
  return { sourceContextType: undefined, sourceContextId: undefined };
}

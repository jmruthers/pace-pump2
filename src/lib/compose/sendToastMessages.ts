import type { CommSendResult } from '@solvera/pace-core/comms';
import type { CommChannel } from '@solvera/pace-core/comms';

export type SendActionLabel = 'Send' | 'Schedule' | 'Send test' | 'Save draft';

const FAILURE_TITLE_BY_ACTION: Record<
  'send' | 'schedule' | 'sendTest' | 'saveDraft',
  SendActionLabel
> = {
  send: 'Send',
  schedule: 'Schedule',
  sendTest: 'Send test',
  saveDraft: 'Save draft',
};

export function sendFailureToastTitle(
  action: SendActionLabel | 'send' | 'schedule' | 'sendTest' | 'saveDraft'
): string {
  const label =
    action in FAILURE_TITLE_BY_ACTION
      ? FAILURE_TITLE_BY_ACTION[action as keyof typeof FAILURE_TITLE_BY_ACTION]
      : action;
  return `${label} failed`;
}

export function buildSendSuccessToast(result: CommSendResult): {
  title: string;
  description: string;
} {
  let description = `${result.total_recipients} recipients`;
  if (result.suppression_skipped > 0) {
    description += ` — ${result.suppression_skipped} skipped`;
  }
  if (result.warnings.length > 0) {
    description +=
      ' Some recipients had unresolved tokens or partial gateway failures; check delivery in the comms log.';
  }
  return { title: 'Message sent', description };
}

export function buildScheduleSuccessToast(scheduledAtIso: string): {
  title: string;
  description: string;
} {
  const formatted = formatScheduledAt(scheduledAtIso);
  return {
    title: 'Message scheduled',
    description: `Message scheduled for ${formatted}`,
  };
}

export function buildSendTestSuccessToast(channel: CommChannel): {
  title: string;
  description: string;
} {
  return {
    title: 'Test sent',
    description: channel === 'email' ? 'Test sent to your email' : 'Test sent to your phone',
  };
}

function formatScheduledAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

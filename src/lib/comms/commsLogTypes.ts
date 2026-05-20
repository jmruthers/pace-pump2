import type {
  CommChannel,
  CommMessageStatus,
  CommRecipientStatus,
} from '@solvera/pace-core/comms';

export type { CommChannel, CommMessageStatus, CommRecipientStatus };

export interface PumpMessageRow extends Record<string, unknown> {
  id: string;
  organisation_id: string;
  channel: CommChannel;
  subject: string | null;
  body_text: string | null;
  status: CommMessageStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  source_app: string | null;
  total_recipients: number | null;
  created_by: string;
  created_at: string;
}

export interface PumpMessageRecipientRow {
  id: string;
  message_id: string;
  member_id: string | null;
  address: string;
  status: CommRecipientStatus;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  core_member: { full_name: string | null } | null;
}

export interface PumpDeliveryEventRow {
  id: string;
  recipient_id: string;
  event_type: string;
  gateway: string;
  occurred_at: string;
  raw_payload: Record<string, unknown> | null;
  pump_message_recipient: { address: string } | null;
}

export interface CommsLogFiltersState {
  channel: CommChannel | null;
  statuses: CommMessageStatus[];
  from: string | null;
  to: string | null;
}

export interface CommsLogSearchState extends CommsLogFiltersState {
  pageIndex: number;
  pageSize: 25 | 50;
  sortDir: 'asc' | 'desc';
  messageId: string | null;
}

export const MESSAGE_STATUS_OPTIONS: Array<{ value: CommMessageStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sending', label: 'Sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
];

export const PUMP_MESSAGE_LIST_COLUMNS =
  'id, organisation_id, channel, subject, body_text, status, scheduled_at, sent_at, source_app, total_recipients, created_by, created_at';

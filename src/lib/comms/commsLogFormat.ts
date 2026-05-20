import type { CommChannel } from '@solvera/pace-core/comms';
import type { PumpMessageRow } from './commsLogTypes.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function effectiveMessageTimestamp(row: Pick<
  PumpMessageRow,
  'sent_at' | 'scheduled_at' | 'created_at'
>): string {
  return row.sent_at ?? row.scheduled_at ?? row.created_at;
}

export function subjectLine(channel: CommChannel, subject: string | null): string {
  if (channel === 'sms') {
    return 'SMS message';
  }
  return subject?.trim().length ? subject : '—';
}

export function truncateBodyPreview(body: string | null, maxLength = 80): string {
  if (body == null || body.length === 0) {
    return '';
  }
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}…`;
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatTime24h(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatShortDateTime(iso: string): string {
  return `${formatShortDate(iso)} ${formatTime24h(iso)}`;
}

/** Inclusive local-day bounds as UTC ISO strings for PostgREST filters. */
export function localDayBoundsIso(dateYmd: string): { start: string; end: string } {
  const [year, month, day] = dateYmd.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function deliveryEventFailureReason(
  rawPayload: Record<string, unknown> | null
): string | null {
  if (rawPayload == null) {
    return null;
  }
  const reason = rawPayload.reason;
  if (typeof reason === 'string' && reason.length > 0) {
    return reason;
  }
  return null;
}

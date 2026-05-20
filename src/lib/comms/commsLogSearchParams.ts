import type { CommChannel, CommMessageStatus } from '@solvera/pace-core/comms';
import type { CommsLogSearchState } from './commsLogTypes.js';

const MESSAGE_STATUSES: CommMessageStatus[] = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
  'failed',
];

const CHANNELS: CommChannel[] = ['email', 'sms'];

function parseChannel(value: string | null): CommChannel | null {
  if (value == null) {
    return null;
  }
  return CHANNELS.includes(value as CommChannel) ? (value as CommChannel) : null;
}

function parseStatuses(value: string | null): CommMessageStatus[] {
  if (value == null || value.trim().length === 0) {
    return [];
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is CommMessageStatus =>
      MESSAGE_STATUSES.includes(part as CommMessageStatus)
    );
}

function parsePageSize(value: string | null): 25 | 50 {
  if (value === '50') {
    return 50;
  }
  return 25;
}

function parseSortDir(value: string | null): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function parseDateYmd(value: string | null): string | null {
  if (value == null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

export function parseCommsLogSearchParams(
  searchParams: URLSearchParams
): CommsLogSearchState {
  const pageIndexRaw = Number.parseInt(searchParams.get('pageIndex') ?? '0', 10);
  const pageIndex = Number.isFinite(pageIndexRaw) && pageIndexRaw >= 0 ? pageIndexRaw : 0;

  return {
    channel: parseChannel(searchParams.get('channel')),
    statuses: parseStatuses(searchParams.get('status')),
    from: parseDateYmd(searchParams.get('from')),
    to: parseDateYmd(searchParams.get('to')),
    pageIndex,
    pageSize: parsePageSize(searchParams.get('pageSize')),
    sortDir: parseSortDir(searchParams.get('sortDir')),
    messageId: searchParams.get('message'),
  };
}

export function buildCommsLogSearch(
  state: CommsLogSearchState,
  overrides: Partial<CommsLogSearchState> = {}
): string {
  const next: CommsLogSearchState = { ...state, ...overrides };
  const params = new URLSearchParams();

  if (next.channel != null) {
    params.set('channel', next.channel);
  }
  if (next.statuses.length > 0) {
    params.set('status', next.statuses.join(','));
  }
  if (next.from != null) {
    params.set('from', next.from);
  }
  if (next.to != null) {
    params.set('to', next.to);
  }
  if (next.pageIndex > 0) {
    params.set('pageIndex', String(next.pageIndex));
  }
  if (next.pageSize !== 25) {
    params.set('pageSize', String(next.pageSize));
  }
  if (next.sortDir !== 'desc') {
    params.set('sortDir', next.sortDir);
  }
  if (next.messageId != null && next.messageId.length > 0) {
    params.set('message', next.messageId);
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

export function withFiltersResetPage(
  state: CommsLogSearchState,
  filterPatch: Partial<Pick<CommsLogSearchState, 'channel' | 'statuses' | 'from' | 'to'>>
): CommsLogSearchState {
  return { ...state, ...filterPatch, pageIndex: 0 };
}

export function dateYmdFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

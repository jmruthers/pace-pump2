import type { EffectivePumpSenderIdentity } from '@solvera/pace-core/comms';
import {
  EFFECTIVE_PUMP_SENDER_IDENTITY_FIELDS,
  RESOLVED_FROM_VALUES,
  type ResolvedFrom,
} from './senderIdentityContractConstants';

export type { EffectivePumpSenderIdentity } from '@solvera/pace-core/comms';

export type ChannelReadinessInput = Pick<
  EffectivePumpSenderIdentity,
  'senderName' | 'fromAddress' | 'senderPhone'
>;

/** BR-CanSendEmail / BR-CanSendSms — mirrors RPC derivation for tests. */
export function deriveChannelReadiness(input: ChannelReadinessInput): {
  canSendEmail: boolean;
  canSendSms: boolean;
} {
  return {
    canSendEmail: input.senderName != null && input.fromAddress != null,
    canSendSms: input.senderPhone != null,
  };
}

export function coerceEffectivePumpSenderIdentityRow(
  data: unknown
): EffectivePumpSenderIdentity | null {
  if (data == null) {
    return null;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return null;
    }
    const [first] = data;
    if (first == null || typeof first !== 'object') {
      return null;
    }
    return first as EffectivePumpSenderIdentity;
  }
  if (typeof data === 'object') {
    return data as EffectivePumpSenderIdentity;
  }
  return null;
}

/** §4 item 2 — RPC returns exactly one row on success. */
export function expectSingleSenderIdentityRow(data: unknown): EffectivePumpSenderIdentity {
  if (!Array.isArray(data)) {
    throw new Error('Expected RPC to return an array with one row');
  }
  if (data.length !== 1) {
    throw new Error(`Expected exactly one sender identity row, got ${data.length}`);
  }
  const row = coerceEffectivePumpSenderIdentityRow(data);
  if (row == null) {
    throw new Error('Expected a valid sender identity row');
  }
  return row;
}

export function assertEffectivePumpSenderIdentityShape(
  row: EffectivePumpSenderIdentity
): void {
  for (const field of EFFECTIVE_PUMP_SENDER_IDENTITY_FIELDS) {
    if (!(field in row)) {
      throw new Error(`Missing sender identity field: ${field}`);
    }
  }

  if (typeof row.organisationId !== 'string') {
    throw new Error('organisationId must be a string');
  }
  if (row.sourceContextType != null && typeof row.sourceContextType !== 'string') {
    throw new Error('sourceContextType must be string or null');
  }
  if (row.sourceContextId != null && typeof row.sourceContextId !== 'string') {
    throw new Error('sourceContextId must be string or null');
  }
  if (!RESOLVED_FROM_VALUES.includes(row.resolvedFrom as ResolvedFrom)) {
    throw new Error(`Invalid resolvedFrom: ${row.resolvedFrom}`);
  }
  if (typeof row.canSendEmail !== 'boolean' || typeof row.canSendSms !== 'boolean') {
    throw new Error('canSendEmail and canSendSms must be booleans');
  }
  if (row.resolvedFrom === 'unresolved' && row.resolvedOrganisationId != null) {
    throw new Error('resolvedOrganisationId must be null when resolvedFrom is unresolved');
  }
  if (row.resolvedFrom !== 'unresolved' && row.resolvedOrganisationId == null) {
    throw new Error('resolvedOrganisationId must be set when resolvedFrom is not unresolved');
  }

  const derived = deriveChannelReadiness(row);
  if (row.canSendEmail !== derived.canSendEmail || row.canSendSms !== derived.canSendSms) {
    throw new Error('Channel readiness flags do not match BR-CanSendEmail / BR-CanSendSms derivation');
  }
}

export function buildSenderIdentityRpcArgs(input: {
  organisationId: string;
  sourceContextType?: 'event' | 'organisation' | null;
  sourceContextId?: string | null;
}): {
  organisation_id: string;
  source_context_type: string | null;
  source_context_id: string | null;
} {
  return {
    organisation_id: input.organisationId,
    source_context_type: input.sourceContextType ?? null,
    source_context_id: input.sourceContextId ?? null,
  };
}

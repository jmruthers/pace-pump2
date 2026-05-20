import type { EffectivePumpSenderIdentity } from '@solvera/pace-core/comms';

/** PU03 — single RPC entry point for sender identity resolution. */
export const PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC = 'pump_get_effective_sender_identity';

/** BR-FieldShape — stable column order for contract tests. */
export const EFFECTIVE_PUMP_SENDER_IDENTITY_FIELDS = [
  'organisationId',
  'sourceContextType',
  'sourceContextId',
  'senderName',
  'fromAddress',
  'replyToAddress',
  'senderPhone',
  'resolvedFrom',
  'resolvedOrganisationId',
  'canSendEmail',
  'canSendSms',
] as const satisfies readonly (keyof EffectivePumpSenderIdentity)[];

export const RESOLVED_FROM_VALUES = [
  'source_context',
  'organisation',
  'ancestor',
  'platform_default',
] as const;

export type ResolvedFrom = (typeof RESOLVED_FROM_VALUES)[number];

/** Canonical migration markers for offline signature verification (PU03 §13 test 1). */
export const EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS = [
  'CREATE OR REPLACE FUNCTION public.pump_get_effective_sender_identity(',
  'organisation_id uuid',
  'source_context_type text DEFAULT NULL',
  'source_context_id uuid DEFAULT NULL',
  'STABLE',
  'SECURITY DEFINER',
  'SET search_path TO public',
  '"organisationId" uuid',
  '"sourceContextType" text',
  '"sourceContextId" uuid',
  '"senderName" text',
  '"fromAddress" text',
  '"replyToAddress" text',
  '"senderPhone" text',
  '"resolvedFrom" text',
  '"resolvedOrganisationId" uuid',
  '"canSendEmail" boolean',
  '"canSendSms" boolean',
] as const;

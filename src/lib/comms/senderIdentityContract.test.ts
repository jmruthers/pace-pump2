import { describe, expect, it, vi } from 'vitest';
import {
  assertEffectivePumpSenderIdentityShape,
  coerceEffectivePumpSenderIdentityRow,
  deriveChannelReadiness,
  buildSenderIdentityRpcArgs,
  expectSingleSenderIdentityRow,
  type EffectivePumpSenderIdentity,
} from './senderIdentityContract';
import {
  EFFECTIVE_PUMP_SENDER_IDENTITY_FIELDS,
  EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS,
} from './senderIdentityContractConstants';
import { hasLiveSupabaseContractEnv } from './senderIdentityContractEnv';

function sampleRow(
  overrides: Partial<EffectivePumpSenderIdentity> = {}
): EffectivePumpSenderIdentity {
  return {
    organisationId: '11111111-1111-1111-1111-111111111111',
    sourceContextType: undefined,
    sourceContextId: undefined,
    senderName: 'PUMP Team',
    fromAddress: 'team@example.com',
    replyToAddress: null,
    senderPhone: '+15551234567',
    resolvedFrom: 'organisation',
    resolvedOrganisationId: '11111111-1111-1111-1111-111111111111',
    canSendEmail: true,
    canSendSms: true,
    ...overrides,
  };
}

describe('senderIdentityContract', () => {
  it('defines eleven BR-FieldShape fields in order', () => {
    expect(EFFECTIVE_PUMP_SENDER_IDENTITY_FIELDS).toHaveLength(11);
    expect(EFFECTIVE_PUMP_SENDER_IDENTITY_FIELDS[0]).toBe('organisationId');
    expect(EFFECTIVE_PUMP_SENDER_IDENTITY_FIELDS[10]).toBe('canSendSms');
  });

  it('coerces a single RPC row from an array', () => {
    const row = sampleRow();
    expect(coerceEffectivePumpSenderIdentityRow([row])).toEqual(row);
  });

  it('coerces a single RPC row from a bare object', () => {
    const row = sampleRow();
    expect(coerceEffectivePumpSenderIdentityRow(row)).toEqual(row);
  });

  it('returns null for empty or invalid RPC payloads', () => {
    expect(coerceEffectivePumpSenderIdentityRow(null)).toBeNull();
    expect(coerceEffectivePumpSenderIdentityRow([])).toBeNull();
    expect(coerceEffectivePumpSenderIdentityRow('bad')).toBeNull();
  });

  it('coerces null or non-object first array elements to null (PU03)', () => {
    expect(coerceEffectivePumpSenderIdentityRow([null])).toBeNull();
    expect(coerceEffectivePumpSenderIdentityRow(['not-a-row'])).toBeNull();
  });

  it('expectSingleSenderIdentityRow requires exactly one row', () => {
    const row = sampleRow();
    expect(expectSingleSenderIdentityRow([row])).toEqual(row);
    expect(() => expectSingleSenderIdentityRow([])).toThrow(/exactly one/);
    expect(() => expectSingleSenderIdentityRow([row, row])).toThrow(/exactly one/);
  });

  it('expectSingleSenderIdentityRow rejects non-array payloads (PU03)', () => {
    expect(() => expectSingleSenderIdentityRow(sampleRow())).toThrow(
      /Expected RPC to return an array/
    );
  });

  it('expectSingleSenderIdentityRow rejects arrays with invalid rows (PU03)', () => {
    expect(() => expectSingleSenderIdentityRow([null])).toThrow(
      /Expected a valid sender identity row/
    );
  });

  it('assertEffectivePumpSenderIdentityShape rejects missing fields (PU03)', () => {
    const row = sampleRow();
    const incomplete = { ...row };
    delete (incomplete as Partial<EffectivePumpSenderIdentity>).canSendSms;
    expect(() =>
      assertEffectivePumpSenderIdentityShape(incomplete as EffectivePumpSenderIdentity)
    ).toThrow(/Missing sender identity field/);
  });

  it('requires resolvedOrganisationId when resolvedFrom is not unresolved (PU03)', () => {
    const row = sampleRow({
      resolvedFrom: 'organisation',
      resolvedOrganisationId: null,
    });
    expect(() => assertEffectivePumpSenderIdentityShape(row)).toThrow(
      /resolvedOrganisationId must be set/
    );
  });

  it('assertEffectivePumpSenderIdentityShape accepts a valid row', () => {
    expect(() => assertEffectivePumpSenderIdentityShape(sampleRow())).not.toThrow();
  });

  it('rejects rows whose readiness flags disagree with derivation', () => {
    const row = sampleRow({ senderName: 'Only Name', fromAddress: null, canSendEmail: true });
    expect(() => assertEffectivePumpSenderIdentityShape(row)).toThrow(/Channel readiness/);
  });

  it('requires resolvedOrganisationId null for unresolved', () => {
    const row = sampleRow({
      resolvedFrom: 'unresolved',
      resolvedOrganisationId: '11111111-1111-1111-1111-111111111111',
    });
    expect(() => assertEffectivePumpSenderIdentityShape(row)).toThrow(/unresolved/);
  });

  describe('deriveChannelReadiness', () => {
    const matrix: Array<{
      senderName: string | null;
      fromAddress: string | null;
      senderPhone: string | null;
      canSendEmail: boolean;
      canSendSms: boolean;
    }> = [
      { senderName: 'A', fromAddress: 'a@b.c', senderPhone: '+1', canSendEmail: true, canSendSms: true },
      { senderName: 'A', fromAddress: null, senderPhone: '+1', canSendEmail: false, canSendSms: true },
      { senderName: null, fromAddress: 'a@b.c', senderPhone: null, canSendEmail: false, canSendSms: false },
      { senderName: null, fromAddress: null, senderPhone: null, canSendEmail: false, canSendSms: false },
    ];

    it.each(matrix)(
      'senderName=$senderName fromAddress=$fromAddress senderPhone=$senderPhone',
      ({ senderName, fromAddress, senderPhone, canSendEmail, canSendSms }) => {
        expect(deriveChannelReadiness({ senderName, fromAddress, senderPhone })).toEqual({
          canSendEmail,
          canSendSms,
        });
      }
    );
  });

  it('buildSenderIdentityRpcArgs uses canonical argument names', () => {
    expect(
      buildSenderIdentityRpcArgs({
        organisationId: 'org-id',
        sourceContextType: 'event',
        sourceContextId: 'evt-id',
      })
    ).toEqual({
      organisation_id: 'org-id',
      source_context_type: 'event',
      source_context_id: 'evt-id',
    });
  });

  it('EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS cover PU03 read contract', () => {
    for (const marker of EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS) {
      expect(marker.length).toBeGreaterThan(0);
    }
    expect(EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS).toContain('STABLE');
    expect(EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS).toContain('SECURITY DEFINER');
  });

  it('hasLiveSupabaseContractEnv is false for CI placeholder env', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'ci-placeholder-publishable-key');
    expect(hasLiveSupabaseContractEnv()).toBe(false);
    vi.unstubAllEnvs();
  });
});

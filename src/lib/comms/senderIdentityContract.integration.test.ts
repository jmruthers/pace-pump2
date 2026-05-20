import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  assertEffectivePumpSenderIdentityShape,
  coerceEffectivePumpSenderIdentityRow,
  deriveChannelReadiness,
} from './senderIdentityContract';
import { PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC, EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS } from './senderIdentityContractConstants';
import { hasLiveSupabaseContractEnv, readContractTestEnv } from './senderIdentityContractEnv';

const liveEnv = hasLiveSupabaseContractEnv();

type ContractFixtures = {
  directOrgId: string | null;
  ancestorChildOrgId: string | null;
  ancestorSupplierOrgId: string | null;
  eventId: string | null;
  eventOwningOrgId: string | null;
  callerOrgId: string | null;
  partialEmailOrgId: string | null;
};

let publishableClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;
let fixtures: ContractFixtures = {
  directOrgId: null,
  ancestorChildOrgId: null,
  ancestorSupplierOrgId: null,
  eventId: null,
  eventOwningOrgId: null,
  callerOrgId: null,
  partialEmailOrgId: null,
};

async function invokeSenderIdentity(
  client: SupabaseClient,
  organisationId: string,
  sourceContextType: string | null = null,
  sourceContextId: string | null = null
) {
  const { data, error } = await client.rpc(PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC, {
    organisation_id: organisationId,
    source_context_type: sourceContextType,
    source_context_id: sourceContextId,
  });
  return { data, error };
}

async function discoverFixtures(admin: SupabaseClient): Promise<ContractFixtures> {
  const result: ContractFixtures = {
    directOrgId: null,
    ancestorChildOrgId: null,
    ancestorSupplierOrgId: null,
    eventId: null,
    eventOwningOrgId: null,
    callerOrgId: null,
    partialEmailOrgId: null,
  };

  const { data: directRows } = await admin
    .from('pump_org_settings')
    .select('organisation_id, default_sender_name, default_from_address, sms_from_number')
    .not('default_sender_name', 'is', null)
    .not('default_from_address', 'is', null)
    .limit(1);

  if (directRows?.[0]?.organisation_id) {
    result.directOrgId = directRows[0].organisation_id as string;
    result.callerOrgId = result.directOrgId;
  }

  const { data: partialRows } = await admin
    .from('pump_org_settings')
    .select('organisation_id, default_sender_name, default_from_address')
    .not('default_sender_name', 'is', null)
    .is('default_from_address', null)
    .limit(1);

  if (partialRows?.[0]?.organisation_id) {
    result.partialEmailOrgId = partialRows[0].organisation_id as string;
  }

  const { data: ancestorRows } = await admin
    .from('org_ancestors')
    .select('descendant_id, ancestor_id, depth')
    .gt('depth', 0)
    .limit(50);

  if (ancestorRows?.length) {
    const { data: settingsRows } = await admin
      .from('pump_org_settings')
      .select('organisation_id');

    const settingsSet = new Set(
      (settingsRows ?? []).map((row) => row.organisation_id as string)
    );

    for (const row of ancestorRows) {
      const childId = row.descendant_id as string;
      const ancestorId = row.ancestor_id as string;
      if (!settingsSet.has(childId) && settingsSet.has(ancestorId)) {
        result.ancestorChildOrgId = childId;
        result.ancestorSupplierOrgId = ancestorId;
        if (result.callerOrgId == null) {
          result.callerOrgId = childId;
        }
        break;
      }
    }
  }

  const { data: eventRows } = await admin
    .from('core_events')
    .select('event_id, organisation_id')
    .not('event_id', 'is', null)
    .limit(20);

  if (eventRows?.length && result.callerOrgId) {
    for (const event of eventRows) {
      const owningOrg = event.organisation_id as string;
      const { data: owningSettings } = await admin
        .from('pump_org_settings')
        .select('organisation_id')
        .eq('organisation_id', owningOrg)
        .limit(1);

      if (owningSettings?.length) {
        result.eventId = event.event_id as string;
        result.eventOwningOrgId = owningOrg;
        break;
      }
    }
  }

  return result;
}

describe.skipIf(!liveEnv)('pump_get_effective_sender_identity contract (live dev-db)', () => {
  beforeAll(async () => {
    const env = readContractTestEnv();
    publishableClient = createClient(env.supabaseUrl, env.publishableKey);
    if (env.serviceRoleKey) {
      serviceClient = createClient(env.supabaseUrl, env.serviceRoleKey);
      fixtures = await discoverFixtures(serviceClient);
    } else {
      fixtures = {
        directOrgId: null,
        ancestorChildOrgId: null,
        ancestorSupplierOrgId: null,
        eventId: null,
        eventOwningOrgId: null,
        callerOrgId: null,
        partialEmailOrgId: null,
      };
    }
  });

  it('(1) signature markers and live RPC smoke', async () => {
    for (const marker of EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS) {
      expect(marker).toBeTruthy();
    }

    const orgId = fixtures.directOrgId ?? fixtures.callerOrgId;
    if (orgId == null || publishableClient == null) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(publishableClient, orgId);
    expect(error).toBeNull();
    const row = coerceEffectivePumpSenderIdentityRow(data);
    expect(row).not.toBeNull();
    assertEffectivePumpSenderIdentityShape(row!);
  });

  it('(2a) direct organisation resolution', async () => {
    if (fixtures.directOrgId == null || publishableClient == null) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(publishableClient, fixtures.directOrgId);
    expect(error).toBeNull();
    const row = coerceEffectivePumpSenderIdentityRow(data);
    expect(row).not.toBeNull();
    assertEffectivePumpSenderIdentityShape(row!);
    expect(row!.resolvedFrom).toBe('organisation');
    expect(row!.resolvedOrganisationId).toBe(fixtures.directOrgId);
    expect(row!.organisationId).toBe(fixtures.directOrgId);
    expect(row!.sourceContextType).toBeNull();
    expect(row!.sourceContextId).toBeNull();
  });

  it('(2b) ancestor resolution when child has no settings', async () => {
    if (
      fixtures.ancestorChildOrgId == null ||
      fixtures.ancestorSupplierOrgId == null ||
      publishableClient == null
    ) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(
      publishableClient,
      fixtures.ancestorChildOrgId
    );
    expect(error).toBeNull();
    const row = coerceEffectivePumpSenderIdentityRow(data);
    expect(row).not.toBeNull();
    assertEffectivePumpSenderIdentityShape(row!);
    expect(row!.resolvedFrom).toBe('ancestor');
    expect(row!.resolvedOrganisationId).toBe(fixtures.ancestorSupplierOrgId);
  });

  it('(2c) source_context event override', async () => {
    if (
      fixtures.callerOrgId == null ||
      fixtures.eventId == null ||
      fixtures.eventOwningOrgId == null ||
      publishableClient == null
    ) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(
      publishableClient,
      fixtures.callerOrgId,
      'event',
      fixtures.eventId
    );
    expect(error).toBeNull();
    const row = coerceEffectivePumpSenderIdentityRow(data);
    expect(row).not.toBeNull();
    assertEffectivePumpSenderIdentityShape(row!);
    expect(row!.resolvedFrom).toBe('source_context');
    expect(row!.resolvedOrganisationId).toBe(fixtures.eventOwningOrgId);
    expect(row!.sourceContextType).toBe('event');
    expect(row!.sourceContextId).toBe(fixtures.eventId);
  });

  it('(3) lenient source-context input matrix', async () => {
    const orgId = fixtures.directOrgId ?? fixtures.callerOrgId;
    if (orgId == null || publishableClient == null) {
      return;
    }

    const someUuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const cases: Array<{
      type: string | null;
      id: string | null;
      expectedType: string | null;
      expectedId: string | null;
    }> = [
      { type: null, id: null, expectedType: null, expectedId: null },
      { type: 'organisation', id: null, expectedType: 'organisation', expectedId: null },
      { type: null, id: someUuid, expectedType: null, expectedId: someUuid },
      { type: 'unknown_type', id: null, expectedType: 'unknown_type', expectedId: null },
    ];

    for (const testCase of cases) {
      const { data, error } = await invokeSenderIdentity(
        publishableClient,
        orgId,
        testCase.type,
        testCase.id
      );
      expect(error).toBeNull();
      const row = coerceEffectivePumpSenderIdentityRow(data);
      expect(row).not.toBeNull();
      assertEffectivePumpSenderIdentityShape(row!);
      expect(row!.resolvedFrom).not.toBe('source_context');
      expect(row!.sourceContextType).toBe(testCase.expectedType);
      expect(row!.sourceContextId).toBe(testCase.expectedId);
    }
  });

  it('(4) authenticated caller without PUMP grants still receives a row', async () => {
    const env = readContractTestEnv();
    if (
      env.noGrantEmail == null ||
      env.noGrantPassword == null ||
      fixtures.callerOrgId == null
    ) {
      return;
    }

    const sessionClient = createClient(env.supabaseUrl, env.publishableKey);
    const { error: signInError } = await sessionClient.auth.signInWithPassword({
      email: env.noGrantEmail,
      password: env.noGrantPassword,
    });
    expect(signInError).toBeNull();

    const { data, error } = await invokeSenderIdentity(
      sessionClient,
      fixtures.callerOrgId
    );
    expect(error).toBeNull();
    const row = coerceEffectivePumpSenderIdentityRow(data);
    expect(row).not.toBeNull();
    assertEffectivePumpSenderIdentityShape(row!);

    await sessionClient.auth.signOut();
  });

  it('(5) channel readiness derivation matches RPC flags', async () => {
    if (fixtures.partialEmailOrgId == null || publishableClient == null) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(
      publishableClient,
      fixtures.partialEmailOrgId
    );
    expect(error).toBeNull();
    const row = coerceEffectivePumpSenderIdentityRow(data);
    expect(row).not.toBeNull();
    assertEffectivePumpSenderIdentityShape(row!);
    expect(row!.canSendEmail).toBe(false);
    expect(row!.senderName).not.toBeNull();

    const derived = deriveChannelReadiness(row!);
    expect(row!.canSendEmail).toBe(derived.canSendEmail);
    expect(row!.canSendSms).toBe(derived.canSendSms);
  });
});

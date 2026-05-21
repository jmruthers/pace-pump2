import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createContractPublishableClient,
  createContractServiceRoleClient,
} from './supabase/contractTestClient.js';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  assertEffectivePumpSenderIdentityShape,
  coerceEffectivePumpSenderIdentityRow,
  deriveChannelReadiness,
  expectSingleSenderIdentityRow,
} from './senderIdentityContract';
import {
  PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC,
  EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS,
} from './senderIdentityContractConstants';
import { hasLiveSupabaseContractEnv, readContractTestEnv } from './senderIdentityContractEnv';

const liveEnv = hasLiveSupabaseContractEnv();

type DirectOrgSettings = {
  organisationId: string;
  defaultSenderName: string;
  defaultFromAddress: string;
  smsFromNumber: string | null;
};

type ContractFixtures = {
  directOrg: DirectOrgSettings | null;
  ancestorChildOrgId: string | null;
  ancestorSupplierOrgId: string | null;
  platformDefaultOrgId: string | null;
  noSenderNameOrgId: string | null;
  eventId: string | null;
  eventOwningOrgId: string | null;
  callerOrgId: string | null;
  partialEmailOrgId: string | null;
};

let publishableClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;
let fixtures: ContractFixtures = {
  directOrg: null,
  ancestorChildOrgId: null,
  ancestorSupplierOrgId: null,
  platformDefaultOrgId: null,
  noSenderNameOrgId: null,
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

function orgHasAncestorWithSettings(
  orgId: string,
  settingsSet: Set<string>,
  ancestorRows: Array<{ descendant_id: string; ancestor_id: string }>
): boolean {
  return ancestorRows.some(
    (row) => row.descendant_id === orgId && settingsSet.has(row.ancestor_id as string)
  );
}

async function discoverFixtures(admin: SupabaseClient): Promise<ContractFixtures> {
  const result: ContractFixtures = {
    directOrg: null,
    ancestorChildOrgId: null,
    ancestorSupplierOrgId: null,
    platformDefaultOrgId: null,
    noSenderNameOrgId: null,
    eventId: null,
    eventOwningOrgId: null,
    callerOrgId: null,
    partialEmailOrgId: null,
  };

  const { data: allSettings } = await admin
    .from('pump_org_settings')
    .select(
      'organisation_id, default_sender_name, default_from_address, sms_from_number'
    );

  const settingsRows = allSettings ?? [];
  const settingsSet = new Set(
    settingsRows.map((row) => row.organisation_id as string)
  );

  const fullDirect = settingsRows.find(
    (row) =>
      row.default_sender_name != null &&
      row.default_from_address != null &&
      row.sms_from_number != null
  );
  if (fullDirect?.organisation_id) {
    result.directOrg = {
      organisationId: fullDirect.organisation_id as string,
      defaultSenderName: fullDirect.default_sender_name as string,
      defaultFromAddress: fullDirect.default_from_address as string,
      smsFromNumber: fullDirect.sms_from_number as string,
    };
    result.callerOrgId = result.directOrg.organisationId;
  } else {
    const partialDirect = settingsRows.find(
      (row) => row.default_sender_name != null && row.default_from_address != null
    );
    if (partialDirect?.organisation_id) {
      result.directOrg = {
        organisationId: partialDirect.organisation_id as string,
        defaultSenderName: partialDirect.default_sender_name as string,
        defaultFromAddress: partialDirect.default_from_address as string,
        smsFromNumber: (partialDirect.sms_from_number as string | null) ?? null,
      };
      result.callerOrgId = result.directOrg.organisationId;
    }
  }

  const partialEmail = settingsRows.find(
    (row) => row.default_sender_name != null && row.default_from_address == null
  );
  if (partialEmail?.organisation_id) {
    result.partialEmailOrgId = partialEmail.organisation_id as string;
  }

  for (const row of settingsRows) {
    if (row.default_sender_name != null) {
      continue;
    }
    const orgId = row.organisation_id as string;
    const { data, error } = await admin.rpc(PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC, {
      organisation_id: orgId,
      source_context_type: null,
      source_context_id: null,
    });
    if (error == null) {
      const resolved = coerceEffectivePumpSenderIdentityRow(data);
      if (resolved?.senderName == null) {
        result.noSenderNameOrgId = orgId;
        break;
      }
    }
  }

  const { data: ancestorRows } = await admin
    .from('org_ancestors')
    .select('descendant_id, ancestor_id, depth')
    .gt('depth', 0)
    .limit(100);

  const ancestors = ancestorRows ?? [];

  for (const row of ancestors) {
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

  const { data: orgRows } = await admin.from('core_organisations').select('id').limit(200);

  for (const org of orgRows ?? []) {
    const orgId = org.id as string;
    if (
      settingsSet.has(orgId) ||
      orgHasAncestorWithSettings(orgId, settingsSet, ancestors)
    ) {
      continue;
    }
    const { data, error } = await admin.rpc(PUMP_GET_EFFECTIVE_SENDER_IDENTITY_RPC, {
      organisation_id: orgId,
      source_context_type: null,
      source_context_id: null,
    });
    if (error == null) {
      const resolved = coerceEffectivePumpSenderIdentityRow(data);
      if (resolved?.resolvedFrom === 'platform_default') {
        result.platformDefaultOrgId = orgId;
        if (result.callerOrgId == null) {
          result.callerOrgId = orgId;
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
      if (settingsSet.has(owningOrg)) {
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
    publishableClient = createContractPublishableClient(env.supabaseUrl, env.publishableKey);
    if (env.serviceRoleKey) {
      serviceClient = createContractServiceRoleClient(env.supabaseUrl, env.serviceRoleKey);
      fixtures = await discoverFixtures(serviceClient);
    }
  });

  it('(1) signature markers and live RPC smoke', async () => {
    for (const marker of EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS) {
      expect(marker).toBeTruthy();
    }

    const orgId = fixtures.directOrg?.organisationId ?? fixtures.callerOrgId;
    if (orgId == null || publishableClient == null) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(publishableClient, orgId);
    expect(error).toBeNull();
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);
  });

  it('(2a) direct organisation resolution (AC-2)', async () => {
    if (fixtures.directOrg == null || publishableClient == null) {
      return;
    }

    const { organisationId, defaultSenderName, defaultFromAddress, smsFromNumber } =
      fixtures.directOrg;

    const { data, error } = await invokeSenderIdentity(publishableClient, organisationId);
    expect(error).toBeNull();
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);
    expect(row.resolvedFrom).toBe('organisation');
    expect(row.resolvedOrganisationId).toBe(organisationId);
    expect(row.organisationId).toBe(organisationId);
    expect(row.sourceContextType).toBeNull();
    expect(row.sourceContextId).toBeNull();
    expect(row.senderName).toBe(defaultSenderName);
    expect(row.fromAddress).toBe(defaultFromAddress);
    expect(row.senderPhone).toBe(smsFromNumber);
    expect(row.canSendEmail).toBe(true);
    if (smsFromNumber != null) {
      expect(row.canSendSms).toBe(true);
    }
  });

  it('(2b) ancestor resolution when child has no settings', async () => {
    if (
      fixtures.ancestorChildOrgId == null ||
      fixtures.ancestorSupplierOrgId == null ||
      publishableClient == null ||
      serviceClient == null
    ) {
      return;
    }

    const { data: ancestorSettings } = await serviceClient
      .from('pump_org_settings')
      .select('default_sender_name, default_from_address, sms_from_number')
      .eq('organisation_id', fixtures.ancestorSupplierOrgId)
      .single();

    const { data, error } = await invokeSenderIdentity(
      publishableClient,
      fixtures.ancestorChildOrgId
    );
    expect(error).toBeNull();
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);
    expect(row.resolvedFrom).toBe('ancestor');
    expect(row.resolvedOrganisationId).toBe(fixtures.ancestorSupplierOrgId);
    if (ancestorSettings) {
      expect(row.senderName).toBe(ancestorSettings.default_sender_name);
      expect(row.fromAddress).toBe(ancestorSettings.default_from_address);
      expect(row.senderPhone).toBe(ancestorSettings.sms_from_number);
    }
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
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);
    expect(row.resolvedFrom).toBe('source_context');
    expect(row.resolvedOrganisationId).toBe(fixtures.eventOwningOrgId);
    expect(row.sourceContextType).toBe('event');
    expect(row.sourceContextId).toBe(fixtures.eventId);
  });

  it('(2d) platform_default fallback', async () => {
    if (fixtures.platformDefaultOrgId == null || publishableClient == null) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(
      publishableClient,
      fixtures.platformDefaultOrgId
    );
    expect(error).toBeNull();
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);
    expect(row.resolvedFrom).toBe('platform_default');
    expect(row.resolvedOrganisationId).toBeNull();
  });

  it('(3) lenient source-context input matrix', async () => {
    const orgId = fixtures.directOrg?.organisationId ?? fixtures.callerOrgId;
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
      const row = expectSingleSenderIdentityRow(data);
      assertEffectivePumpSenderIdentityShape(row);
      expect(row.resolvedFrom).not.toBe('source_context');
      expect(row.sourceContextType).toBe(testCase.expectedType);
      expect(row.sourceContextId).toBe(testCase.expectedId);
    }
  });

  it('(4) authenticated caller without PUMP grants still receives a row (AC-7)', async () => {
    const env = readContractTestEnv();
    const hasCredentials =
      env.noGrantEmail != null &&
      env.noGrantPassword != null &&
      env.noGrantEmail.length > 0 &&
      env.noGrantPassword.length > 0;
    const orgId = fixtures.callerOrgId;

    if (!hasCredentials) {
      console.warn(
        'PUMP-03 AC-7 deferred: set PUMP_CONTRACT_TEST_EMAIL and PUMP_CONTRACT_TEST_PASSWORD (see docs/delivery/PUMP-03-contract-test-user.md)'
      );
      return;
    }
    if (orgId == null) {
      return;
    }

    const sessionClient = createContractPublishableClient(env.supabaseUrl, env.publishableKey);
    const { error: signInError } = await sessionClient.auth.signInWithPassword({
      email: env.noGrantEmail!,
      password: env.noGrantPassword!,
    });
    expect(signInError).toBeNull();

    const { data, error } = await invokeSenderIdentity(sessionClient, orgId);
    expect(error).toBeNull();
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);

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
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);
    expect(row.canSendEmail).toBe(false);
    expect(row.senderName).not.toBeNull();

    const derived = deriveChannelReadiness(row);
    expect(row.canSendEmail).toBe(derived.canSendEmail);
    expect(row.canSendSms).toBe(derived.canSendSms);
  });

  it('(9) no default_sender_name yields null sender and canSendEmail false (AC-9)', async () => {
    if (fixtures.noSenderNameOrgId == null || publishableClient == null) {
      return;
    }

    const { data, error } = await invokeSenderIdentity(
      publishableClient,
      fixtures.noSenderNameOrgId
    );
    expect(error).toBeNull();
    const row = expectSingleSenderIdentityRow(data);
    assertEffectivePumpSenderIdentityShape(row);
    expect(row.senderName).toBeNull();
    expect(row.canSendEmail).toBe(false);
  });
});

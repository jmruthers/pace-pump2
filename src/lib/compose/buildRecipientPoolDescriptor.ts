import type {
  EventParticipantsPool,
  ManualPool,
  OrgMembersPool,
  RecipientPoolDescriptor,
} from '@solvera/pace-core/comms';
import type { ComposeRecipientStateInput } from './types';

function buildOrgMembersFilters(
  filters: ComposeRecipientStateInput['orgFilters']
): OrgMembersPool['filters'] | undefined {
  const result: NonNullable<OrgMembersPool['filters']> = {};
  if (filters.memberTypeIds.length > 0) {
    result.member_type_ids = filters.memberTypeIds.map(String);
  }
  if (filters.unitIds.length > 0) {
    result.unit_ids = [...filters.unitIds];
  }
  if (filters.includeInactive) {
    result.include_inactive = true;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function buildEventFilters(
  filters: ComposeRecipientStateInput['eventFilters']
): EventParticipantsPool['filters'] | undefined {
  const result: NonNullable<EventParticipantsPool['filters']> = {};
  if (filters.registrationTypeIds.length > 0) {
    result.registration_type_ids = [...filters.registrationTypeIds];
  }
  if (filters.statuses.length > 0) {
    result.status = [...filters.statuses];
  }
  if (filters.unitIds.length > 0) {
    result.unit_ids = [...filters.unitIds];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** BR-RecipientModeToggle — rebuild descriptor from slice recipient state. */
export function buildRecipientPoolDescriptor(
  input: ComposeRecipientStateInput
): RecipientPoolDescriptor {
  const { mode, organisationId, selectedEventId, orgFilters, eventFilters, manualMemberIds } =
    input;

  if (mode === 'event_participants' && selectedEventId != null) {
    const pool: EventParticipantsPool = {
      type: 'event_participants',
      event_id: selectedEventId,
      filters: buildEventFilters(eventFilters) ?? {},
    };
    return pool;
  }

  if (mode === 'manual') {
    return { type: 'manual', member_ids: [...manualMemberIds] } satisfies ManualPool;
  }

  const pool: OrgMembersPool = {
    type: 'org_members',
    organisation_id: organisationId,
    filters: buildOrgMembersFilters(orgFilters) ?? {},
  };
  return pool;
}

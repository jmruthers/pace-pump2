import { describe, expect, it } from 'vitest';
import { buildRecipientPoolDescriptor } from './buildRecipientPoolDescriptor';

const orgId = 'org-1';

describe('buildRecipientPoolDescriptor', () => {
  it('builds default org_members pool without filters', () => {
    expect(
      buildRecipientPoolDescriptor({
        mode: 'org_members',
        organisationId: orgId,
        selectedEventId: null,
        orgFilters: { memberTypeIds: [], unitIds: [], includeInactive: false },
        eventFilters: { registrationTypeIds: [], statuses: [], unitIds: [] },
        manualMemberIds: [],
      })
    ).toEqual({ type: 'org_members', organisation_id: orgId, filters: {} });
  });

  it('adds include_inactive when switch is on', () => {
    expect(
      buildRecipientPoolDescriptor({
        mode: 'org_members',
        organisationId: orgId,
        selectedEventId: null,
        orgFilters: { memberTypeIds: [], unitIds: [], includeInactive: true },
        eventFilters: { registrationTypeIds: [], statuses: [], unitIds: [] },
        manualMemberIds: [],
      })
    ).toEqual({
      type: 'org_members',
      organisation_id: orgId,
      filters: { include_inactive: true },
    });
  });

  it('casts membership type ids to strings', () => {
    expect(
      buildRecipientPoolDescriptor({
        mode: 'org_members',
        organisationId: orgId,
        selectedEventId: null,
        orgFilters: { memberTypeIds: [1, 2], unitIds: [], includeInactive: false },
        eventFilters: { registrationTypeIds: [], statuses: [], unitIds: [] },
        manualMemberIds: [],
      })
    ).toEqual({
      type: 'org_members',
      organisation_id: orgId,
      filters: { member_type_ids: ['1', '2'] },
    });
  });

  it('builds event_participants pool with event id', () => {
    expect(
      buildRecipientPoolDescriptor({
        mode: 'event_participants',
        organisationId: orgId,
        selectedEventId: 'evt-1',
        orgFilters: { memberTypeIds: [], unitIds: [], includeInactive: false },
        eventFilters: { registrationTypeIds: [], statuses: [], unitIds: [] },
        manualMemberIds: [],
      })
    ).toEqual({ type: 'event_participants', event_id: 'evt-1', filters: {} });
  });

  it('builds manual pool with member ids', () => {
    expect(
      buildRecipientPoolDescriptor({
        mode: 'manual',
        organisationId: orgId,
        selectedEventId: null,
        orgFilters: { memberTypeIds: [], unitIds: [], includeInactive: false },
        eventFilters: { registrationTypeIds: [], statuses: [], unitIds: [] },
        manualMemberIds: ['m-1', 'm-2'],
      })
    ).toEqual({ type: 'manual', member_ids: ['m-1', 'm-2'] });
  });
});

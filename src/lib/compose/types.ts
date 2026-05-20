import type { RecipientPoolDescriptor } from '@solvera/pace-core/comms';

export type ComposeRecipientMode = 'org_members' | 'event_participants' | 'manual';

export type OrgMembersFilterState = {
  memberTypeIds: number[];
  unitIds: string[];
  includeInactive: boolean;
};

export type EventParticipantsFilterState = {
  registrationTypeIds: string[];
  statuses: Array<'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn'>;
  unitIds: string[];
};

export const REGISTRATION_STATUS_OPTIONS: Array<{
  value: EventParticipantsFilterState['statuses'][number];
  label: string;
}> = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export type ComposeRecipientStateInput = {
  mode: ComposeRecipientMode;
  organisationId: string;
  selectedEventId: string | null;
  orgFilters: OrgMembersFilterState;
  eventFilters: EventParticipantsFilterState;
  manualMemberIds: string[];
};

export type DerivedSourceContext = {
  sourceContextType: string | undefined;
  sourceContextId: string | undefined;
};

export type { RecipientPoolDescriptor };

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@solvera/pace-core/components';
import type { ComposeRecipientStateReturn } from '@/hooks/compose/useComposeRecipientState';
import type { MembershipTypeRow } from '@/hooks/compose/useMembershipTypes';
import type { OrganisationEventRow } from '@/hooks/compose/useOrganisationEvents';
import type { OrganisationUnitRow } from '@/hooks/compose/useOrganisationUnits';
import type { RegistrationTypeRow } from '@/hooks/compose/useEventRegistrationTypes';
import type { ComposeRecipientMode, EventParticipantsFilterState } from '@/lib/compose/types';
import { REGISTRATION_STATUS_OPTIONS } from '@/lib/compose/types';
import { ManualMemberPicker, type ManualMemberChip } from './ManualMemberPicker';

export interface RecipientModeCardProps {
  organisationId: string;
  events: OrganisationEventRow[];
  membershipTypes: MembershipTypeRow[];
  units: OrganisationUnitRow[];
  registrationTypes: RegistrationTypeRow[];
  manualMembers: ManualMemberChip[];
  onAddManualMember: (member: ManualMemberChip) => void;
  onRemoveManualMember: (memberId: string) => void;
  recipient: ComposeRecipientStateReturn;
}

function FilterChipGroup({
  title,
  options,
  selectedIds,
  onToggle,
  idPrefix,
}: {
  title: string;
  options: Array<{ id: string | number; name: string }>;
  selectedIds: Array<string | number>;
  onToggle: (id: string | number) => void;
  idPrefix: string;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-2">
      <h3>{title}</h3>
      <menu className="grid auto-cols-max grid-flow-col gap-2 p-0">
        {options.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <li key={`${idPrefix}-${option.id}`}>
              <Button
                type="button"
                size="small"
                variant={selected ? 'default' : 'outline'}
                onClick={() => onToggle(option.id)}
              >
                {option.name}
              </Button>
            </li>
          );
        })}
      </menu>
    </section>
  );
}

export function RecipientModeCard({
  organisationId,
  events,
  membershipTypes,
  units,
  registrationTypes,
  manualMembers,
  onAddManualMember,
  onRemoveManualMember,
  recipient,
}: RecipientModeCardProps) {
  const hasEvents = events.length > 0;
  const {
    mode,
    setMode,
    selectedEventId,
    setSelectedEventId,
    orgFilters,
    eventFilters,
    toggleMemberTypeId,
    toggleOrgUnitId,
    setIncludeInactive,
    toggleRegistrationTypeId,
    toggleRegistrationStatus,
    toggleEventUnitId,
  } = recipient;

  const modeOptions: Array<{
    id: ComposeRecipientMode;
    label: string;
    helper: string;
    disabled?: boolean;
  }> = [
    { id: 'org_members', label: 'Org members', helper: 'Send to filtered organisation members' },
    {
      id: 'event_participants',
      label: 'Event participants',
      helper: hasEvents
        ? 'Send to participants of an event'
        : 'No events available for this organisation.',
      disabled: !hasEvents,
    },
    { id: 'manual', label: 'Manual', helper: 'Pick specific members' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipients</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-4">
          <legend>Recipient mode</legend>
          {modeOptions.map((option) => (
            <section key={option.id} className="grid gap-1">
              <Button
                type="button"
                variant={mode === option.id ? 'default' : 'outline'}
                disabled={option.disabled}
                onClick={() => setMode(option.id)}
              >
                {option.label}
              </Button>
              <p>{option.helper}</p>
            </section>
          ))}
        </fieldset>

        {mode === 'org_members' ? (
          <section className="grid gap-4">
            <FilterChipGroup
              title="Membership types"
              options={membershipTypes}
              selectedIds={orgFilters.memberTypeIds}
              onToggle={(id) => toggleMemberTypeId(Number(id))}
              idPrefix="membership-type"
            />
            <FilterChipGroup
              title="Units"
              options={units}
              selectedIds={orgFilters.unitIds}
              onToggle={(id) => toggleOrgUnitId(String(id))}
              idPrefix="org-unit"
            />
            <Label htmlFor="include-inactive-members">
              Include inactive members
              <Switch
                id="include-inactive-members"
                checked={orgFilters.includeInactive}
                onChange={setIncludeInactive}
              />
            </Label>
          </section>
        ) : null}

        {mode === 'event_participants' ? (
          <section className="grid gap-4">
            <Label htmlFor="compose-event-select">
              Event
              <Select
                value={selectedEventId ?? ''}
                onValueChange={(value) =>
                  setSelectedEventId(value != null && value.length > 0 ? value : null)
                }
              >
                <SelectTrigger aria-label="Choose an event">
                  <SelectValue placeholder="Choose an event" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.event_id} value={event.event_id}>
                      {event.event_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            {selectedEventId != null ? (
              <>
                <FilterChipGroup
                  title="Registration types"
                  options={registrationTypes}
                  selectedIds={eventFilters.registrationTypeIds}
                  onToggle={(id) => toggleRegistrationTypeId(String(id))}
                  idPrefix="registration-type"
                />
                <section className="grid gap-2">
                  <h3>Registration status</h3>
                  <menu className="grid auto-cols-max grid-flow-col gap-2 p-0">
                    {REGISTRATION_STATUS_OPTIONS.map((option) => {
                      const selected = eventFilters.statuses.includes(option.value);
                      return (
                        <li key={option.value}>
                          <Button
                            type="button"
                            size="small"
                            variant={selected ? 'default' : 'outline'}
                            onClick={() =>
                              toggleRegistrationStatus(
                                option.value as EventParticipantsFilterState['statuses'][number]
                              )
                            }
                          >
                            {option.label}
                          </Button>
                        </li>
                      );
                    })}
                  </menu>
                </section>
                <FilterChipGroup
                  title="Units"
                  options={units}
                  selectedIds={eventFilters.unitIds}
                  onToggle={(id) => toggleEventUnitId(String(id))}
                  idPrefix="event-unit"
                />
              </>
            ) : null}
          </section>
        ) : null}

        {mode === 'manual' ? (
          <ManualMemberPicker
            organisationId={organisationId}
            selectedMembers={manualMembers}
            onAddMember={onAddManualMember}
            onRemoveMember={onRemoveManualMember}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

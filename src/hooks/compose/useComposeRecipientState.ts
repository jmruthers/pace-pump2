import { useCallback, useMemo, useState } from 'react';
import { buildRecipientPoolDescriptor } from '@/lib/compose/buildRecipientPoolDescriptor';
import { deriveSourceContext } from '@/lib/compose/deriveSourceContext';
import type {
  ComposeRecipientMode,
  EventParticipantsFilterState,
  OrgMembersFilterState,
} from '@/lib/compose/types';

const DEFAULT_ORG_FILTERS: OrgMembersFilterState = {
  memberTypeIds: [],
  unitIds: [],
  includeInactive: false,
};

const DEFAULT_EVENT_FILTERS: EventParticipantsFilterState = {
  registrationTypeIds: [],
  statuses: [],
  unitIds: [],
};

export type ComposeRecipientStateReturn = ReturnType<typeof useComposeRecipientState>;

export function useComposeRecipientState(organisationId: string) {
  const [mode, setMode] = useState<ComposeRecipientMode>('org_members');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [orgFilters, setOrgFilters] = useState<OrgMembersFilterState>(DEFAULT_ORG_FILTERS);
  const [eventFilters, setEventFilters] =
    useState<EventParticipantsFilterState>(DEFAULT_EVENT_FILTERS);
  const [manualMemberIds, setManualMemberIds] = useState<string[]>([]);

  const recipientPool = useMemo(
    () =>
      buildRecipientPoolDescriptor({
        mode,
        organisationId,
        selectedEventId,
        orgFilters,
        eventFilters,
        manualMemberIds,
      }),
    [mode, organisationId, selectedEventId, orgFilters, eventFilters, manualMemberIds]
  );

  const sourceContext = useMemo(
    () => deriveSourceContext(mode, selectedEventId),
    [mode, selectedEventId]
  );

  const resetToOrgMembersDefault = useCallback(() => {
    setMode('org_members');
    setSelectedEventId(null);
    setOrgFilters(DEFAULT_ORG_FILTERS);
    setEventFilters(DEFAULT_EVENT_FILTERS);
    setManualMemberIds([]);
  }, []);

  const toggleMemberTypeId = useCallback((id: number) => {
    setOrgFilters((current) => {
      const exists = current.memberTypeIds.includes(id);
      return {
        ...current,
        memberTypeIds: exists
          ? current.memberTypeIds.filter((value) => value !== id)
          : [...current.memberTypeIds, id],
      };
    });
  }, []);

  const toggleOrgUnitId = useCallback((id: string) => {
    setOrgFilters((current) => {
      const exists = current.unitIds.includes(id);
      return {
        ...current,
        unitIds: exists ? current.unitIds.filter((value) => value !== id) : [...current.unitIds, id],
      };
    });
  }, []);

  const setIncludeInactive = useCallback((includeInactive: boolean) => {
    setOrgFilters((current) => ({ ...current, includeInactive }));
  }, []);

  const toggleRegistrationTypeId = useCallback((id: string) => {
    setEventFilters((current) => {
      const exists = current.registrationTypeIds.includes(id);
      return {
        ...current,
        registrationTypeIds: exists
          ? current.registrationTypeIds.filter((value) => value !== id)
          : [...current.registrationTypeIds, id],
      };
    });
  }, []);

  const toggleRegistrationStatus = useCallback(
    (status: EventParticipantsFilterState['statuses'][number]) => {
      setEventFilters((current) => {
        const exists = current.statuses.includes(status);
        return {
          ...current,
          statuses: exists
            ? current.statuses.filter((value) => value !== status)
            : [...current.statuses, status],
        };
      });
    },
    []
  );

  const toggleEventUnitId = useCallback((id: string) => {
    setEventFilters((current) => {
      const exists = current.unitIds.includes(id);
      return {
        ...current,
        unitIds: exists ? current.unitIds.filter((value) => value !== id) : [...current.unitIds, id],
      };
    });
  }, []);

  const addManualMemberId = useCallback((id: string) => {
    setManualMemberIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const removeManualMemberId = useCallback((id: string) => {
    setManualMemberIds((current) => current.filter((value) => value !== id));
  }, []);

  return {
    mode,
    setMode,
    selectedEventId,
    setSelectedEventId,
    orgFilters,
    eventFilters,
    manualMemberIds,
    recipientPool,
    sourceContext,
    resetToOrgMembersDefault,
    toggleMemberTypeId,
    toggleOrgUnitId,
    setIncludeInactive,
    toggleRegistrationTypeId,
    toggleRegistrationStatus,
    toggleEventUnitId,
    addManualMemberId,
    removeManualMemberId,
  };
}

export const composeQueryKeys = {
  events: (organisationId: string) => ['compose-events', organisationId] as const,
  membershipTypes: (organisationId: string) => ['compose-membership-types', organisationId] as const,
  units: (organisationId: string) => ['compose-units', organisationId] as const,
  registrationTypes: (eventId: string) => ['compose-registration-types', eventId] as const,
  memberSearch: (organisationId: string, query: string) =>
    ['compose-member-search', organisationId, query] as const,
};

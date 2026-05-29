/** Canonical PUMP RBAC page slugs (must match rbac_app_pages.page_name). */
export const PUMP_PAGE = {
  commsLog: 'comms-log',
  commsTemplates: 'comms-templates',
} as const;

export type PumpPageName = (typeof PUMP_PAGE)[keyof typeof PUMP_PAGE];

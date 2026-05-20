import type { NavigationItem } from '@solvera/pace-core/components';

/** PUMP-01 shell navigation (permission-filtered in AuthenticatedShell). */
export const PUMP_NAV_ITEMS: NavigationItem[] = [
  { id: 'comms-log', label: 'Comms log', href: '/', icon: 'Mail' },
  { id: 'compose', label: 'Compose', href: '/comms/create', icon: 'MessageSquare' },
  { id: 'templates', label: 'Templates', href: '/comms/templates', icon: 'FileText' },
];

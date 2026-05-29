import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CommRbacContext } from '@solvera/pace-core/comms';
import { useUnifiedAuth } from '@solvera/pace-core/hooks';
import { useCan } from '@solvera/pace-core/rbac';
import { PUMP_PAGE } from '@/config/pumpPageNames';

const CommRbacContextValue = createContext<CommRbacContext | null>(null);

export function CommRbacContextProvider({ children }: { children: ReactNode }) {
  const { selectedOrganisation } = useUnifiedAuth();
  const organisationId = selectedOrganisation?.id ?? '';

  const { can: canComposeRaw, isLoading: composeLoading } = useCan(
    `create:page.${PUMP_PAGE.commsLog}`
  );
  const { can: canSendRaw, isLoading: sendLoading } = useCan(
    `update:page.${PUMP_PAGE.commsLog}`
  );

  const value = useMemo((): CommRbacContext => {
    const scopeReady = organisationId.length > 0;
    const permissionsReady = !composeLoading && !sendLoading;

    if (!scopeReady || !permissionsReady) {
      return {
        canCompose: false,
        canSend: false,
        canSchedule: false,
        scopeType: 'organisation',
        scopeId: organisationId,
      };
    }

    return {
      canCompose: canComposeRaw,
      canSend: canSendRaw,
      canSchedule: canSendRaw,
      scopeType: 'organisation',
      scopeId: organisationId,
    };
  }, [organisationId, canComposeRaw, canSendRaw, composeLoading, sendLoading]);

  return (
    <CommRbacContextValue.Provider value={value}>{children}</CommRbacContextValue.Provider>
  );
}

export function useCommRbacContext(): CommRbacContext {
  const context = useContext(CommRbacContextValue);
  if (context == null) {
    throw new Error('useCommRbacContext must be used within CommRbacContextProvider');
  }
  return context;
}

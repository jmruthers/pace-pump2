// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommRbacContextProvider, useCommRbacContext } from './CommRbacContextProvider';

let canCompose = false;
let canSend = false;
let composeLoading = false;
let sendLoading = false;

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({
    selectedOrganisation: { id: 'org-42' },
  }),
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  useCan: (permission: string) => {
    if (permission === 'create:page.CommsLog') {
      return { can: canCompose, isLoading: composeLoading };
    }
    if (permission === 'update:page.CommsLog') {
      return { can: canSend, isLoading: sendLoading };
    }
    return { can: false, isLoading: false };
  },
}));

function RbacConsumer() {
  const rbac = useCommRbacContext();
  return (
    <output>
      {`${rbac.canCompose},${rbac.canSend},${rbac.canSchedule},${rbac.scopeType},${rbac.scopeId}`}
    </output>
  );
}

describe('CommRbacContextProvider', () => {
  it('exposes granted compose and send booleans for descendants (AC-22)', () => {
    canCompose = true;
    canSend = true;
    composeLoading = false;
    sendLoading = false;

    render(
      <CommRbacContextProvider>
        <RbacConsumer />
      </CommRbacContextProvider>
    );

    expect(screen.getByText('true,true,true,organisation,org-42')).toBeTruthy();
  });

  it('denies when page grants are missing (AC-23)', () => {
    canCompose = false;
    canSend = false;
    composeLoading = false;
    sendLoading = false;

    render(
      <CommRbacContextProvider>
        <RbacConsumer />
      </CommRbacContextProvider>
    );

    expect(screen.getByText('false,false,false,organisation,org-42')).toBeTruthy();
  });
});

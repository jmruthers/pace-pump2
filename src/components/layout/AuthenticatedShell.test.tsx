// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthenticatedShell } from './AuthenticatedShell';

type OrgSelection = { id: string; display_name: string; name: string };

type AuthFixture = {
  isLoading: boolean;
  user: { email: string; user_metadata: Record<string, unknown> };
  selectedOrganisation: OrgSelection | null;
  signOut: ReturnType<typeof vi.fn>;
  updatePassword: ReturnType<typeof vi.fn>;
};

let authFixture: AuthFixture = {
  isLoading: false,
  user: { email: 'staff@example.com', user_metadata: {} },
  selectedOrganisation: { id: 'org-1', display_name: 'Demo Org', name: 'Demo Org' },
  signOut: vi.fn(async () => undefined),
  updatePassword: vi.fn(async () => ({})),
};

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => authFixture,
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  useCan: () => ({ can: true, isLoading: false }),
}));

vi.mock('@/components/comms/CommRbacContextProvider', () => ({
  CommRbacContextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@solvera/pace-core/components', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  LoadingSpinner: () => <p>Loading shell</p>,
  PaceAppLayout: ({
    children,
    appName,
    userEmail,
    userFullName,
  }: {
    children?: ReactNode;
    appName: string;
    userEmail: string;
    userFullName: string;
  }) => (
    <div
      data-testid="pace-app-shell"
      data-app={appName}
      data-email={userEmail}
      data-fullname={userFullName}
    >
      {children}
    </div>
  ),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <aside>{children}</aside> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  DialogBody: ({ children }: { children: ReactNode }) => <>{children}</>,
  PasswordChangeForm: () => <span>pwd-form</span>,
}));

function OutletChild() {
  return <article>Outlet child fixture</article>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AuthenticatedShell />}>
          <Route index element={<OutletChild />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthenticatedShell', () => {
  beforeEach(() => {
    authFixture = {
      isLoading: false,
      user: { email: 'staff@example.com', user_metadata: {} },
      selectedOrganisation: { id: 'org-1', display_name: 'Demo Org', name: 'Demo Org' },
      signOut: vi.fn(async () => undefined),
      updatePassword: vi.fn(async () => ({})),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows loading spinner while auth resolves', () => {
    authFixture = { ...authFixture, isLoading: true };

    renderShell();

    expect(screen.getByText('Loading shell')).toBeTruthy();
  });

  it('shows no-organisation messaging when organisation is unavailable', () => {
    authFixture = { ...authFixture, selectedOrganisation: null };

    renderShell();

    expect(screen.getByText(/No organisation assigned/u)).toBeTruthy();
    expect(screen.queryByText('Outlet child fixture')).toBeNull();
  });

  it('renders outlet when authenticated with organisation context', () => {
    renderShell();

    const shellNode = screen.getByTestId('pace-app-shell');
    expect(shellNode.getAttribute('data-app')).toBe('PUMP');
    expect(screen.getByText('Outlet child fixture')).toBeTruthy();
  });
});

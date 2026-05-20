import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UnifiedAuthProvider } from '@solvera/pace-core';
import {
  ErrorBoundaryProvider,
  InactivityWarningModal,
} from '@solvera/pace-core/components';
import {
  OrganisationServiceProvider,
  useUnifiedAuthContext,
} from '@solvera/pace-core/providers';
import { createGetAppIdResolver, setupRBAC } from '@solvera/pace-core/rbac';
import App, { APP_NAME } from '@/App';
import { supabaseClient } from '@/lib/supabase';
import './app.css';

const resolvePumpAppId = createGetAppIdResolver(supabaseClient);

setupRBAC(supabaseClient, {
  appName: APP_NAME,
  getAppId: resolvePumpAppId,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppProviders() {
  const { user, session } = useUnifiedAuthContext();

  return (
    <OrganisationServiceProvider
      supabaseClient={supabaseClient}
      user={user}
      session={session}
    >
      <App />
    </OrganisationServiceProvider>
  );
}

const rootElement = document.getElementById('root');

if (rootElement == null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundaryProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <UnifiedAuthProvider
            supabaseClient={supabaseClient}
            appName={APP_NAME}
            idleTimeoutMs={30 * 60 * 1000}
            warnBeforeMs={2 * 60 * 1000}
            onIdleLogout={() => {
              void supabaseClient.auth.signOut();
            }}
            renderInactivityWarning={({
              timeRemaining,
              onStaySignedIn,
              onSignOutNow,
            }) => (
              <InactivityWarningModal
                isOpen
                timeRemaining={timeRemaining}
                onStaySignedIn={onStaySignedIn}
                onSignOutNow={onSignOutNow}
              />
            )}
          >
            <AppProviders />
          </UnifiedAuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundaryProvider>
  </StrictMode>
);

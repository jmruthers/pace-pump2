import { lazy, Suspense } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import {
  LoadingSpinner,
  PaceLoginPage,
  ProtectedRoute,
  SessionRestorationLoader,
} from '@solvera/pace-core/components';
import { PagePermissionGuard } from '@solvera/pace-core/rbac';
import { AuthenticatedShell } from '@/components/layout/AuthenticatedShell';
import { NotFoundPage } from '@/components/shell/NotFoundPage';

export { APP_NAME } from '@/appName';

function SessionRestorationLayout() {
  return (
    <SessionRestorationLoader message="Restoring session…">
      <Outlet />
    </SessionRestorationLoader>
  );
}

const CommsLogPage = lazy(() =>
  import('@/components/comms/CommsLogPage').then((module) => ({
    default: module.CommsLogPage,
  }))
);

import { ComposeRoute } from '@/components/compose/ComposeRoute';
import { TemplatesRoute } from '@/components/templates/TemplatesRoute';

function LazyRouteFallback() {
  return (
    <main className="grid min-h-[60vh] place-items-center">
      <LoadingSpinner />
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<PaceLoginPage appName="PUMP" />} />

      <Route element={<ProtectedRoute loginPath="/login" requireEvent={false} />}>
        <Route element={<SessionRestorationLayout />}>
          <Route element={<AuthenticatedShell />}>
          <Route
            index
            element={
              <PagePermissionGuard pageName="comms-log" operation="read">
                <Suspense fallback={<LazyRouteFallback />}>
                  <CommsLogPage />
                </Suspense>
              </PagePermissionGuard>
            }
          />
          <Route
            path="comms/create"
            element={
              <PagePermissionGuard pageName="comms-log" operation="create">
                <ComposeRoute />
              </PagePermissionGuard>
            }
          />
          <Route path="comms/templates" element={<TemplatesRoute />} />
          <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;

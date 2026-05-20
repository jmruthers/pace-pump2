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

const ComposePlaceholder = lazy(() =>
  import('@/components/shell/ComposePlaceholder').then((module) => ({
    default: module.ComposePlaceholder,
  }))
);

const TemplatesPlaceholder = lazy(() =>
  import('@/components/shell/TemplatesPlaceholder').then((module) => ({
    default: module.TemplatesPlaceholder,
  }))
);

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
              <PagePermissionGuard pageName="CommsLog" operation="read">
                <Suspense fallback={<LazyRouteFallback />}>
                  <CommsLogPage />
                </Suspense>
              </PagePermissionGuard>
            }
          />
          <Route
            path="comms/create"
            element={
              <PagePermissionGuard pageName="CommsLog" operation="create">
                <Suspense fallback={<LazyRouteFallback />}>
                  <ComposePlaceholder />
                </Suspense>
              </PagePermissionGuard>
            }
          />
          <Route
            path="comms/templates"
            element={
              <PagePermissionGuard pageName="CommsTemplates" operation="read">
                <Suspense fallback={<LazyRouteFallback />}>
                  <TemplatesPlaceholder />
                </Suspense>
              </PagePermissionGuard>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;

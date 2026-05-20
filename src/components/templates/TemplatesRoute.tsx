import { lazy, Suspense } from 'react';
import { LoadingSpinner } from '@solvera/pace-core/components';

const TemplatesPage = lazy(() =>
  import('@/components/templates/TemplatesPage').then((module) => ({
    default: module.TemplatesPage,
  }))
);

function TemplatesRouteFallback() {
  return (
    <main className="grid min-h-[60vh] place-items-center">
      <LoadingSpinner />
    </main>
  );
}

export function TemplatesRoute() {
  return (
    <Suspense fallback={<TemplatesRouteFallback />}>
      <TemplatesPage />
    </Suspense>
  );
}

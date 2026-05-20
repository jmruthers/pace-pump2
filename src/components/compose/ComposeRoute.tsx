import { lazy, Suspense } from 'react';
import { LoadingSpinner } from '@solvera/pace-core/components';

const ComposePage = lazy(() =>
  import('@/components/compose/ComposePage').then((module) => ({
    default: module.ComposePage,
  }))
);

function ComposeRouteFallback() {
  return (
    <main className="grid min-h-[60vh] place-items-center">
      <LoadingSpinner />
    </main>
  );
}

export function ComposeRoute() {
  return (
    <Suspense fallback={<ComposeRouteFallback />}>
      <ComposePage />
    </Suspense>
  );
}

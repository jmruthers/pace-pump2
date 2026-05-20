import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logUnmatchedRoute } from '@/lib/logUnmatchedRoute';

export function NotFoundPage() {
  const location = useLocation();

  useEffect(() => {
    logUnmatchedRoute(location.pathname);
  }, [location.pathname]);

  return (
    <main className="grid min-h-[60vh] place-items-center">
      <section className="grid justify-items-center gap-3">
        <h1>404</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link to="/">Go to home</Link>
      </section>
    </main>
  );
}

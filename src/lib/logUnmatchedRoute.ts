/** Logs unmatched routes per PUMP-01 BR-R (console.error contract). */
export function logUnmatchedRoute(route: string): void {
  console.error('[PUMP] Unmatched route: ' + route);
}

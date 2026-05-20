import { useSecureSupabase } from '@solvera/pace-core/rbac';
import type { RBACSupabaseClient } from '@solvera/pace-core/rbac';

/** Returns the RBAC-scoped Supabase client for pump data access. */
export function usePumpSupabase(): RBACSupabaseClient {
  const secure = useSecureSupabase();
  if (secure == null) {
    throw new Error('Supabase client is not available.');
  }
  return secure;
}

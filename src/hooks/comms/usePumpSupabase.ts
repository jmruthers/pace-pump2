import { useSecureSupabase } from '@solvera/pace-core/rbac';
import type { RBACSupabaseClient } from '@solvera/pace-core/rbac';

/** Returns the RBAC-scoped Supabase client for pump data access, or null while scope is loading. */
export function usePumpSupabase(): RBACSupabaseClient | null {
  return useSecureSupabase();
}

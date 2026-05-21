import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Contract-test Supabase clients (live dev-db only; not for app runtime). */
export function createContractPublishableClient(
  supabaseUrl: string,
  publishableKey: string
): SupabaseClient {
  return createClient(supabaseUrl, publishableKey);
}

export function createContractServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey);
}

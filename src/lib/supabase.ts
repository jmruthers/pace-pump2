/**
 * Base Supabase client for UnifiedAuthProvider only.
 * Components must use useSecureSupabase() from pace-core for queries.
 * When VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set, a no-op placeholder
 * is exported so the app still runs (auth and org features will be inactive).
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const hasConfig = Boolean(supabaseUrl && supabasePublishableKey);

export const supabaseClient: SupabaseClient = hasConfig
  ? createClient(supabaseUrl, supabasePublishableKey)
  : ({} as SupabaseClient);

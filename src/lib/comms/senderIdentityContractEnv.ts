const CI_PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co';

export function hasLiveSupabaseContractEnv(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  return (
    url.length > 0 &&
    key.length > 0 &&
    url !== CI_PLACEHOLDER_SUPABASE_URL &&
    !key.includes('ci-placeholder')
  );
}

export function readContractTestEnv(): {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string | null;
  noGrantEmail: string | null;
  noGrantPassword: string | null;
} {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    serviceRoleKey: import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
    noGrantEmail: import.meta.env.PUMP_CONTRACT_TEST_EMAIL ?? null,
    noGrantPassword: import.meta.env.PUMP_CONTRACT_TEST_PASSWORD ?? null,
  };
}

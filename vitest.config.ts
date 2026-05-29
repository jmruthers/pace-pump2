import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import {
  coverageConfig,
  domInclude,
  resolveAlias,
  sharedTestOptions,
  unitInclude,
} from './vitest.shared.js';

const env = loadEnv('test', process.cwd(), '');

const domEnvironmentGlobs = domInclude.map(
  (pattern) => [pattern, 'happy-dom'] as [string, string]
);

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      ...resolveAlias,
      '@pump-webhook-logic': path.resolve(
        process.cwd(),
        '../pace-core2/packages/core/supabase/functions/_shared/pump-webhook-logic.ts'
      ),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  test: {
    env: {
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      PUMP_CONTRACT_TEST_EMAIL: env.PUMP_CONTRACT_TEST_EMAIL ?? '',
      PUMP_CONTRACT_TEST_PASSWORD: env.PUMP_CONTRACT_TEST_PASSWORD ?? '',
    },
    ...sharedTestOptions,
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    environment: 'node',
    environmentMatchGlobs: domEnvironmentGlobs,
    include: [...unitInclude, ...domInclude],
    coverage: {
      provider: 'istanbul',
      reporter: ['text'],
      include: coverageConfig.include,
      exclude: coverageConfig.exclude,
    },
  },
});

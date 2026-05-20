import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const env = loadEnv('test', process.cwd(), '');

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
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
    environment: 'happy-dom',
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    coverage: {
      provider: 'istanbul',
      reporter: ['text'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/index.ts',
      ],
    },
  },
});

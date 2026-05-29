import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolveAlias, sharedTestOptions, unitExclude, unitInclude } from './vitest.shared.js';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: resolveAlias,
  },
  test: {
    ...sharedTestOptions,
    environment: 'node',
    setupFiles: ['./src/test-setup-unit.ts'],
    include: unitInclude,
    exclude: unitExclude,
  },
});

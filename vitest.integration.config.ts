import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { domInclude, resolveAlias, sharedTestOptions } from './vitest.shared.js';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: resolveAlias,
  },
  test: {
    ...sharedTestOptions,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: domInclude,
  },
});

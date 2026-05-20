import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  optimizeDeps: {
    exclude: ['@solvera/pace-core', 'react-router-dom'],
    // react-router (excluded above) imports these as ESM named exports; pre-bundle CJS deps.
    include: ['cookie', 'set-cookie-parser'],
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
});

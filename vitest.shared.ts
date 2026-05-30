import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * `.test.ts` files that use renderHook, document, or DOM APIs and require happy-dom.
 * Add paths relative to project root when a hook unit test needs DOM.
 */
export const domUnitTestTsFiles: string[] = [
  // Example: 'src/hooks/useMyHook.test.ts',
];

export const resolveAlias = {
  '@test-utils': path.resolve(repoRoot, 'src/test-utils.ts'),
  '@': path.resolve(repoRoot, './src'),
};

export const coverageConfig = {
  provider: 'v8' as const,
  reporter: ['text', 'html'],
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.integration.test.ts',
    '**/*.integration.test.tsx',
    '**/*.spec.ts',
    '**/index.ts',
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    'src/main.tsx',
    'src/App.tsx',
    '**/ComposeRoute.tsx',
    '**/TemplatesRoute.tsx',
    'src/test-setup*.ts',
    'src/test-polyfills.ts',
    'src/hooks/compose/useOrganisation*.ts',
    'src/hooks/compose/useManualMemberSearch.ts',
    'src/hooks/compose/useMembershipTypes.ts',
    'src/hooks/compose/useEventRegistrationTypes.ts',
    'src/hooks/comms/usePumpMessageDrillDown.ts',
    'src/hooks/comms/usePumpSupabase.ts',
    'src/components/comms/commsLogBadges.tsx',
    'src/components/compose/RecipientModeCard.tsx',
    'src/components/compose/ManualMemberPicker.tsx',
    'src/components/compose/DiscardChangesDialog.tsx',
  ],
  thresholds: {
    'src/utils/**/*.ts': { statements: 90, lines: 90 },
    'src/hooks/**/*.{ts,tsx}': { statements: 90, lines: 90 },
    'src/components/**/*.tsx': { statements: 70, lines: 70 },
  },
};

export const sharedTestOptions = {
  pool: 'threads' as const,
  testTimeout: 10000,
  hookTimeout: 10000,
  teardownTimeout: 5000,
  globals: false,
  css: false,
  deps: {
    optimizer: {
      web: {
        include: ['react', 'react-dom', '@testing-library/react', '@testing-library/user-event'],
      },
    },
  },
};

export const unitInclude = ['src/**/*.test.ts', 'src/**/*.spec.ts'];

export const unitExclude = [
  '**/*.integration.test.ts',
  '**/*.integration.test.tsx',
  ...domUnitTestTsFiles,
];

export const domInclude = [
  'src/**/*.test.tsx',
  'src/**/*.spec.tsx',
  'src/**/*.integration.test.ts',
  'src/**/*.integration.test.tsx',
  ...domUnitTestTsFiles,
];

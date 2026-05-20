# pace-core Audit Report

**Generated:** 2026-05-20T10:25:53.359Z
**App Path:** /Users/jess/Documents/Solvera/pace-pump2

---

## Summary

**Total Issues:** 21

**Severity Breakdown:** error=11, warning=6, info=2

| Standard | Issues |
|----------|--------|
| ❌ Dependency Audit | 2 |
| ❌ Project Structure | 2 |
| ✅ Architecture | 0 |
| ✅ Security & RBAC | 0 |
| ❌ API & Tech Stack | 2 |
| ❌ pace-core Compliance | 2 |
| ❌ Code Quality | 2 |
| ❌ Visual | 6 |
| ❌ Testing & Documentation | 1 |
| ❌ Operations | 4 |

---

## Detailed Results


### ❌ Dependency Audit

**Reference:** [Dependencies Guide](https://github.com/solvera/pace-core/blob/main/packages/core/docs/getting-started/dependencies.md)

**Issues Found:** 2

#### ℹ️ Missing Optional Dependencies - 1 package

These packages are optional and only needed if you use specific features:

- **@typescript-eslint/parser** (required: ^8.0.0)
  - Install only if you use this feature
  - Fix: `npm install @typescript-eslint/parser@^8.0.0`

#### ❌ Missing Required Dev Dependencies - 1 issue

These dev dependencies are required for a compatible development environment:

- **happy-dom** (required: ^20.0.0)
  - Fix: `npm install -D happy-dom@^20.0.0`

#### ⚠️ Dev Dependency Version Issues - 1 issue

These dev dependencies have incorrect version ranges:

- **typescript** (in devDependencies)
  - Installed: ~6.0.2
  - Required: ^5.0.0
  - Fix: `npm install -D typescript@^5.0.0`


### ❌ Standard 01-project-structure: Project Structure

**Reference:** [Project Structure](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/1-project-structure-standards.md)

**Issues Found:** 2


#### configFiles (1 issue)

#### ❌ configFiles

**File:** `.env`

**Message:** Required configuration file missing: .env (Local environment variables)

**Fix:** Create .env file

**See standard:** Configuration Files


#### importPaths (1 issue)

#### ℹ️ importPaths

**File:** `tsconfig.json`

**Line:** 1

**Message:** tsconfig.json missing paths configuration. Consider adding path aliases for cleaner imports.

**Fix:** Add paths configuration: { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }

**See standard:** Import Path Configuration


### ✅ Standard 02-architecture: Architecture

No issues found.

### ✅ Standard 03-security-rbac: Security & RBAC

No issues found.

### ❌ Standard 04-api-tech-stack: API & Tech Stack

**Reference:** [API & Tech Stack](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/4-api-tech-stack-standards.md)

**Issues Found:** 2


#### viteConfig (2 issues)

#### ⚠️ viteConfig

**File:** `vite.config.ts`

**Line:** 1

**Message:** vite.config.ts missing optimizeDeps.exclude. Should exclude @solvera/pace-core and react-router-dom to prevent React context mismatches.

**Fix:** Add: optimizeDeps: { exclude: ['@solvera/pace-core', 'react-router-dom'] }

**See standard:** Tech Stack Configuration (Vite Configuration)


#### ⚠️ viteConfig

**File:** `vite.config.ts`

**Line:** 1

**Message:** vite.config.ts missing resolve.dedupe. Should dedupe React dependencies to prevent context mismatches.

**Fix:** Add: resolve: { dedupe: ['react', 'react-dom', 'react-router-dom'] }

**See standard:** Tech Stack Configuration (Vite Configuration)


### ❌ Standard 05-pace-core-compliance: pace-core Compliance

**Reference:** [pace-core Compliance](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/5-pace-core-compliance-standards.md)

**Issues Found:** 2


#### providerNesting (1 issue)

#### ❌ providerNesting

**File:** `src/main.tsx`

**Line:** 1

**Message:** Missing required providers: QueryClientProvider, BrowserRouter, UnifiedAuthProvider

**Fix:** Import and use all required providers in the correct order: QueryClientProvider → BrowserRouter → UnifiedAuthProvider

**See standard:** MUST: Provider Nesting Order


#### rbacSetup (1 issue)

#### ❌ rbacSetup

**File:** `src/main.tsx`

**Line:** 1

**Message:** setupRBAC() call not found. Must be called in main.tsx before app rendering.

**Fix:** Add: import { setupRBAC } from '@solvera/pace-core/rbac'; setupRBAC(supabase);

**See standard:** MUST: Setup RBAC Before Use


### ❌ Standard 06-code-quality: Code Quality

**Reference:** [Code Quality](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/6-code-quality-standards.md)

**Issues Found:** 2


#### typescriptConfig (2 issues)

#### ❌ typescriptConfig

**File:** `tsconfig.json`

**Line:** 1

**Message:** TypeScript strict mode not enabled. Must set "strict": true in compilerOptions.

**Fix:** Set "strict": true in tsconfig.json compilerOptions.

**See standard:** TypeScript Rules (tsconfig strict mode)


#### ❌ typescriptConfig

**File:** `tsconfig.json`

**Line:** 1

**Message:** noImplicitAny not enabled. Should set "noImplicitAny": true in compilerOptions (or enable strict mode).

**Fix:** Set "noImplicitAny": true in tsconfig.json compilerOptions (or enable strict mode).

**See standard:** TypeScript Rules (Avoid Implicit any)


### ❌ Standard 07-visual: Visual

**Reference:** [Visual](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/7-visual-standards.md)

**Issues Found:** 6


#### appCss (5 issues)

#### ❌ appCss

**File:** `src/app.css`

**Line:** 1

**Message:** Missing required import: @import "tailwindcss"

**Fix:** Add @import "tailwindcss"; to app.css

**See standard:** 7-visual-standards.md — Part A (#part-a-styling-platform)


#### ❌ appCss

**File:** `src/app.css`

**Line:** 1

**Message:** Missing required import: @import "@solvera/pace-core/styles/core.css"

**Fix:** Add @import "@solvera/pace-core/styles/core.css"; to app.css

**See standard:** 7-visual-standards.md — Part A (#part-a-styling-platform)


#### ❌ appCss

**File:** `src/app.css`

**Line:** 1

**Message:** Missing @source directives for Tailwind v4 content scanning

**Fix:** Add @source directives: @source "./**/*.{js,ts,jsx,tsx}"; @source "../node_modules/@solvera/pace-core/src/**/*.{js,ts,jsx,tsx}";

**See standard:** 7-visual-standards.md — Part A (#part-a-styling-platform)


#### ❌ appCss

**File:** `src/app.css`

**Line:** 1

**Message:** Missing @theme block for color palettes. Required for pace-core styling.

**Fix:** Add @theme static { /* color palettes here */ } block to app.css

**See standard:** 7-visual-standards.md — Part A (#part-a-styling-platform)


#### ❌ appCss

**File:** `src/main.tsx`

**Line:** 1

**Message:** Main entry does not import app.css. pace-core styling must flow through app.css.

**Fix:** Add `import "./app.css";` in the JS/TS entry file used for rendering the app.

**See standard:** 7-visual-standards.md — Part A (#part-a-styling-platform)


#### tailwindConfig (1 issue)

#### ❌ tailwindConfig

**File:** `vite.config.ts`

**Line:** 1

**Message:** Tailwind v4 plugin not found in vite.config.ts. Required for Tailwind v4.

**Fix:** Add: import tailwindcss from "@tailwindcss/vite"; and add tailwindcss() to plugins array

**See standard:** 7-visual-standards.md — Part A (#part-a-styling-platform) — Vite + Tailwind v4


### ❌ Standard 08-testing-documentation: Testing & Documentation

**Reference:** [Testing & Documentation](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/8-testing-documentation-standards.md)

**Issues Found:** 1


#### documentationArtifacts (1 issue)

#### ⚠️ documentationArtifacts

**File:** `docs/requirements/ (not found)`

**Line:** 1

**Message:** Missing docs/requirements directory. Standard 8 expects feature behavior to be captured in requirements docs.

**Fix:** Create docs/requirements and add or update requirement documents for implemented features.

**See standard:** Documentation


### ❌ Standard 09-operations: Operations

**Reference:** [Operations](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/9-operations-standards.md)

**Issues Found:** 4


#### requiredScripts (3 issues)

#### ⚠️ requiredScripts

**File:** `package.json`

**Line:** 1

**Message:** Missing required script: type-check.

**Fix:** Add `type-check` to package.json scripts.

**See standard:** Package.json Scripts


#### ⚠️ requiredScripts

**File:** `package.json`

**Line:** 1

**Message:** Missing required script: test.

**Fix:** Add `test` to package.json scripts.

**See standard:** Package.json Scripts


#### ⚠️ requiredScripts

**File:** `package.json`

**Line:** 1

**Message:** Missing required script: test:coverage.

**Fix:** Add `test:coverage` to package.json scripts.

**See standard:** Package.json Scripts


#### cicd (1 issue)

#### ℹ️ cicd

**File:** `.github/workflows/ (not found)`

**Message:** CI/CD workflows directory not found. Consider setting up GitHub Actions for automated testing and deployment.

**Fix:** Create .github/workflows/ directory and add CI/CD workflow files

**See standard:** CI/CD Integration (Required CI Checks)


---

## Next Steps

Please review the issues above and address them according to the referenced standards.

For more information, see the [pace-core Standards Documentation](https://github.com/solvera/pace-core/blob/main/packages/core/docs/standards/README.md).


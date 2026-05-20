# Authority Wiring Report

**Generated:** 2026-05-20T10:25:50.611Z
**Step:** Authority Wiring
**Status:** FAILED
**Duration:** 0.04s
**Exit Code:** 1

## Output

```text
Validating authoritative pace-core wiring...

✗ Drift detected (11 issue(s)).
  - Cursor rule symlink drift: .cursor/rules/00-standards-overview.mdc
  - Cursor rule symlink drift: .cursor/rules/01-project-structure.mdc
  - Cursor rule symlink drift: .cursor/rules/02-architecture.mdc
  - Cursor rule symlink drift: .cursor/rules/03-security-rbac.mdc
  - Cursor rule symlink drift: .cursor/rules/04-api-tech-stack.mdc
  - Cursor rule symlink drift: .cursor/rules/05-pace-core-compliance.mdc
  - Cursor rule symlink drift: .cursor/rules/06-code-quality.mdc
  - Cursor rule symlink drift: .cursor/rules/07-styling.mdc
  - Cursor rule symlink drift: .cursor/rules/08-testing-documentation.mdc
  - Cursor rule symlink drift: .cursor/rules/09-operations.mdc
  - Missing setupRBAC(...) call in src bootstrap files.

Fix: run npm run setup -- --force and commit the managed wiring.

```

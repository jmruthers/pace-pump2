# PUMP-04 remediation plan (completed)

Remediation applied after initial delivery (`046614c`) to close compliance gaps from the requirements review.

## Gaps addressed

1. **AC-6 / AC-8** — Editor now applies `validateTemplateForm` errors via `setError` so `FormField` shows inline copy.
2. **§15 test traceability** — Added/extended tests for AC-4, 5, 9, 10, 12, 14, 15 and role-matrix profiles.
3. **QA pack** — Corrected AC-6/AC-8 traceability; added Status column.

## Verification

- `npm run validate` — PASS (2026-05-20, 35 tests)

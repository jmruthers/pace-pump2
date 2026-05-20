# PUMP-04 acceptance status

Authority: [PU04-template-library-requirements.md](../requirements/PU04-template-library-requirements.md)

Delivery: commit `046614c` on branch `cursor/c43ae609`

## §11 Acceptance criteria

- [x] **AC-1** — Seven-column list, `created_at` descending
- [x] **AC-2** — Empty state copy
- [x] **AC-3** — Empty state without Create CTA when no create grant
- [x] **AC-4** — `PagePermissionGuard` → `AccessDenied` without read grant
- [x] **AC-5** — Create email template save (payload, toast, list refresh)
- [x] **AC-6** — Name required: inline field error + destructive toast
- [x] **AC-7** — Well-formed merge tokens persist
- [x] **AC-8** — Malformed token: inline Body error + destructive toast
- [x] **AC-9** — Retire with confirmation
- [x] **AC-10** — Activate without confirmation
- [x] **AC-11** — Read-only: Preview only; mutate actions hidden
- [x] **AC-12** — Preview dialog uses `MessagePreview`
- [x] **AC-13** — List error panel, Retry, destructive toast
- [x] **AC-14** — Save failure keeps editor open
- [x] **AC-15** — Show retired toggle; muted name; Inactive badge
- [x] **AC-16** — Search name + description
- [x] **AC-17** — Email → SMS clears subject and body_html

## §15 Done criteria

- [x] `deriveBodyTextFromHtml` unit test
- [x] Each AC has ≥1 passing automated test (see [PUMP-04-qa-pack.md](../test-packs/PUMP-04-qa-pack.md))
- [x] Role × action matrix exercised in tests (read-only, read+create, read+update, access denied)
- [x] `merge_fields_used` on save paths tested

## §12 Manual verification

Pending QA sign-off on dev-db `yihzsfcceciimdoiibif` (see QA pack §12).

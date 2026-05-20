# PUMP-04 QA pack — Template library

Authority: [PU04-template-library-requirements.md](../requirements/PU04-template-library-requirements.md)

## Automated traceability

| AC | Description | Automated test |
| --- | --- | --- |
| 1 | List renders templates | `TemplatesPage.test.tsx` — renders list with template name (AC-1) |
| 2 | Empty state copy | `TemplatesPage.test.tsx` — shows empty state when no templates (AC-2) |
| 3 | Empty state without create CTA | `TemplatesPage.test.tsx` — omits create CTA without create permission (AC-3) |
| 4 | Access denied without read | Route: `TemplatesRoute` + `PagePermissionGuard` (shell integration; manual) |
| 5 | Create email template save | `buildTemplateSavePayload.test.ts` — derives body_text and merge_fields_used |
| 6 | Name required validation | `templateFormValidation.test.ts`, `TemplateEditorDialog.test.tsx` (AC-6) |
| 7 | Well-formed tokens persist | `templateFormValidation.test.ts` — accepts well-formed merge tokens (AC-7) |
| 8 | Malformed token blocked | `templateFormValidation.test.ts` — rejects shape-malformed merge tokens (AC-8) |
| 9 | Retire flow | `useTemplateMutations` + UI (manual); mutation issues UPDATE `is_active = false` only |
| 10 | Activate without confirm | Manual — Activate row action; `useTemplateMutations` |
| 11 | Read-only row actions | `TemplatesPage.test.tsx` — hides mutate row actions (AC-11) |
| 12 | Preview MessagePreview | Manual / comms component contract; preview dialog mounts `MessagePreview` |
| 13 | List fetch error + retry | `TemplatesPage.test.tsx` — shows error panel and retry (AC-13) |
| 14 | Save failure keeps editor | `TemplatesPage` handleSave catch; mutation onError toast (manual) |
| 15 | Show retired toggle | `filterTemplates.test.ts`, `TemplatesPage` (manual UI toggle) |
| 16 | Search name + description | `filterTemplates.test.ts`, `TemplatesPage.test.tsx` (AC-16) |
| 17 | Channel switch email → SMS | `buildTemplateSavePayload.test.ts` — clears subject/body_html (AC-17) |

## Unit tests (business rules)

| Rule / verification | Test |
| --- | --- |
| BR-BodyTextDerivation | `deriveBodyTextFromHtml.test.ts` |
| merge_fields_used deduplication (§12 #3) | `buildTemplateSavePayload.test.ts` |
| BR-ListFilterDefault / BR-ListSearchScope | `filterTemplates.test.ts` |
| BR-FormValidation / BR-TokenValidation | `templateFormValidation.test.ts` |

## Role matrix (§10)

| Profile | Automated |
| --- | --- |
| read only | `TemplatesPage.test.tsx` — hides Create / Edit / Retire / Activate (AC-11) |
| read + create | Manual — Create visible; strict-mode disabled in editor |
| read + update | Manual — Edit / Retire / Activate visible |
| no grants | Manual — `PagePermissionGuard` → AccessDenied (AC-4) |

## Manual verification (§12)

| # | Step | Expected |
| --- | --- | --- |
| 1 | Query `pump_organisation_templates` as operator without PUMP grants | Zero rows (RLS) |
| 2 | Save email HTML body; inspect row in dev-db | `body_text` matches BR-BodyTextDerivation |
| 3 | Save duplicate tokens in body | `merge_fields_used` deduplicated |
| 4 | read-only: open list | Edit hidden; Preview allowed |
| 5 | Retire template; inspect dev-db | Row present, `is_active = false`; no DELETE |
| 6 | Activate retired row | `is_active = true`; Inactive badge clears |
| 7 | Search "welcome" on two templates | Both name and description matches |
| 8 | Save body `Hello {{first_name` | Blocked; no INSERT |
| 9 | Preview template with tokens | Unresolved tokens Alert lists all tokens |

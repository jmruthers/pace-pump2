# PUMP-04 QA pack — Template library

Authority: [PU04-template-library-requirements.md](../requirements/PU04-template-library-requirements.md)

## Automated traceability

| AC | Status | Description | Automated test |
| --- | --- | --- | --- |
| 1 | Complete | List renders templates | `TemplatesPage.test.tsx` — renders list with template name (AC-1) |
| 2 | Complete | Empty state copy | `TemplatesPage.test.tsx` — shows empty state when no templates (AC-2) |
| 3 | Complete | Empty state without create CTA | `TemplatesPage.test.tsx` — omits create CTA without create permission (AC-3) |
| 4 | Complete | Access denied without read | `TemplatesPage.test.tsx` — AccessDenied when guard denies (AC-4) |
| 5 | Complete | Create email template save | `buildTemplateSavePayload.test.ts`; `useTemplateMutations.test.ts` (AC-5) |
| 6 | Complete | Name required validation | `templateFormValidation.test.ts`; `TemplateEditorDialog.test.tsx` (AC-6) |
| 7 | Complete | Well-formed tokens persist | `templateFormValidation.test.ts` — accepts well-formed merge tokens (AC-7) |
| 8 | Complete | Malformed token blocked | `templateFormValidation.test.ts`; `TemplateEditorDialog.test.tsx` (AC-8) |
| 9 | Complete | Retire flow | `TemplatesPage.test.tsx` — retire opens confirm dialog (AC-9) |
| 10 | Complete | Activate without confirm | `TemplatesPage.test.tsx` — activate calls mutation (AC-10) |
| 11 | Complete | Read-only row actions | `TemplatesPage.test.tsx` — hides mutate row actions (AC-11) |
| 12 | Complete | Preview MessagePreview | `TemplatePreviewDialog.test.tsx` (AC-12) |
| 13 | Complete | List fetch error + retry | `TemplatesPage.test.tsx` — error panel and retry (AC-13) |
| 14 | Complete | Save failure keeps editor | `TemplateEditorDialog.test.tsx` — editor stays open on save error (AC-14) |
| 15 | Complete | Show retired toggle | `filterTemplates.test.ts`; `TemplatesPage.test.tsx` (AC-15) |
| 16 | Complete | Search name + description | `filterTemplates.test.ts`; `TemplatesPage.test.tsx` (AC-16) |
| 17 | Complete | Channel switch email → SMS | `buildTemplateSavePayload.test.ts` — clears subject/body_html (AC-17) |

## Unit tests (business rules)

| Rule / verification | Test |
| --- | --- |
| BR-BodyTextDerivation | `deriveBodyTextFromHtml.test.ts` |
| merge_fields_used deduplication (§12 #3) | `buildTemplateSavePayload.test.ts` |
| BR-ListFilterDefault / BR-ListSearchScope | `filterTemplates.test.ts` |
| BR-FormValidation / BR-TokenValidation | `templateFormValidation.test.ts` |

## Role matrix (§10)

| Profile | Status | Automated |
| --- | --- | --- |
| read only | Complete | `TemplatesPage.test.tsx` — hides Create / Edit / Retire / Activate (AC-11) |
| read + create | Complete | `TemplatesPage.test.tsx` — Create visible, Edit hidden (AC-read-create) |
| read + update | Complete | `TemplatesPage.test.tsx` — Edit/Retire visible, Create hidden (AC-read-update) |
| no grants | Complete | `TemplatesPage.test.tsx` — AccessDenied (AC-4) |

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

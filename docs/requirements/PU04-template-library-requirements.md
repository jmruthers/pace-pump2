# PUMP-04 — Template library

## 1. Slice metadata

- Slice ID: PUMP-04
- Name: Template library
- Status: Draft
- Depends on: PUMP-01
- Backend impact: Read contract only (writes happen against the live post-p4 `pump_organisation_templates` schema; no schema migration owned by this slice)
- Frontend impact: UI
- Routes owned: `/comms/templates`
- QA pack: `docs/test-packs/PUMP-04-qa-pack.md`

---

## 2. Overview

PUMP-04 owns the organisation-authored template library at `/comms/templates`. Operators create, edit, retire, activate, and preview templates that PUMP-05's compose surface and any future suite consumer will read against the `pump_organisation_templates` row shape. The slice is a CRUD surface backed by direct table access under RBAC-checked RLS — no Edge function, no recipient-pool resolution, no compose logic. Strict-mode (`require_merge_field_validation`) is authored here; the actual strict-mode check runs at send time inside PUMP-05. System templates (platform-owned copy) are addressed by source apps via `sendSystemNotification` and are explicitly out of scope.

---

## 3. What this slice delivers

### Purpose

Give an operator a focused surface to manage the templates their organisation sends from. The page answers "what templates exist for this org, what do they look like before sending, and how do I add / change / retire one?" without exposing send mechanics, recipient pools, or platform-managed system copy.

### Surfaces

- **Route:** `/comms/templates` (mounted by PUMP-01's app shell).
- **List view** at `/comms/templates`: table of organisation-authored templates with search, "Show retired" toggle, and a Create primary action.
- **Editor `Dialog`** (modal): single dialog used for both create and edit. Open from the Create primary action or from a row's Edit action. Closes on successful save or cancel.
- **Preview `Dialog`** (modal): opened from a row's Preview action; renders the template's stored content via `MessagePreview`.
- **Retire confirmation `Dialog`** (modal): pace-core2 `Dialog` shown when a row's Retire action is invoked.
- **Access-denied surface:** when the page-level guard denies read, the route renders pace-core2 `AccessDenied`.

### Boundaries

This slice does **not** own:

- Compose / send. PUMP-05 owns `/comms/create`. PUMP-04 stores rows; PUMP-05 reads them.
- Comms log. PUMP-02 owns `/`.
- Sender identity. PUMP-03 (contract) and `pump_org_settings` (table) cover this; no PUMP UI in v1.
- Pool-specific merge-field availability checks. PUMP-05 runs the compose-time strict-mode check (gated by `require_merge_field_validation`).
- The merge-field catalogue read. PUMP-04 v1 surfaces no catalogue, no toolbar, and no token-insert UI.
- `pump_system_templates` CRUD. The table is service-role only; source apps invoke `sendSystemNotification` from `@solvera/pace-core/comms`.
- Hard delete. v1 retirement is `is_active = false` only.
- Gateway configuration. Platform-managed; lives on `pump_gateway_config`.

### Architectural posture

- **Read pattern:** direct `SELECT` from `pump_organisation_templates` filtered by the active `organisation_id`, executed through `useSecureSupabase()` with TanStack Query. The slice does NOT call the adapter-backed `useCommTemplates` hook (that hook invokes a `pump-load-templates` Edge function and requires an adapter context PUMP-04 has no access to).
- **Mutation pattern:** direct INSERT / UPDATE on `pump_organisation_templates` through `useSecureSupabase()`. Live RLS policies on the table (per platform-snapshot-2026-05-07 lines 264–270) accept authenticated writes when the caller holds the corresponding `{operation}:page.comms-templates` grant via `check_rbac_permission_with_context` + `get_app_id('PUMP')`. No Option-A migration is needed.
- **Write contract for retirement:** UPDATE setting `is_active = false`. No DELETE statement is issued by PUMP-04 v1 against this table.
- **Page guard:** `<PagePermissionGuard pageName="comms-templates" operation="read">` wraps the route. Default fallback `<AccessDenied />`. `useCan('create:page.comms-templates' | 'update:page.comms-templates' | 'delete:page.comms-templates', scope)` gates buttons / row actions per the PDLC RBAC API usage contract.
- **Toaster:** `toast` is imported module-level from `@solvera/pace-core/components`. PUMP-01 mounts the `<ToastProvider>` (per cross-app-decisions.md 2026-05-04 toaster mount convention) so PUMP-04 can fire `'default' | 'destructive' | 'success'` toasts without a local provider mount.
- **Merge-token handling:** PUMP-04 stores the raw `{{token}}` string an author types. On save, the slice computes `extractMergeTokens(subject + body_html + body_text)` (deduplicated) and persists the result to `merge_fields_used`. There is no catalogue-vs-token check in this slice.

### Page-level guards and evaluation ordering

The route has both a page-level guard (`PagePermissionGuard pageName="comms-templates" operation="read"`) and a no-rows empty state. They are not in conflict — the empty state is data-state, not context-state. Evaluation order:

1. **Auth provider** (PUMP-01's `<AuthenticatedShell>`) resolves the active user and `selectedOrganisation`. If no organisation is selected, PUMP-01's shell already shows its no-org empty state and the route never mounts. PUMP-04 does not render its own no-org state.
2. **`PagePermissionGuard`** evaluates `read:page.comms-templates` against the active scope (organisation-scoped: `{ organisationId: selectedOrganisation.id }`). While the guard's permission check is in flight (the `useCan` hook's `isLoading = true`), the guard renders `null` (its loading default; PUMP-04 does not pass a `loading` prop). On denied → `<AccessDenied />`. On allowed → the route content.
3. **Inside the route**, PUMP-04 mounts the templates list query. Its loading / error / empty states render only after the guard has admitted the user.

**Scope passed to the guard:** `{ organisationId: selectedOrganisation.id }`. The guard is invoked only after PUMP-01's shell guarantees `selectedOrganisation.id` is non-null, so the guard never sees an undefined `organisationId`. If a subclass of state were to pass undefined `organisationId`, the underlying permission-check RPC would treat the scope as missing and return `false`, and the guard would render `<AccessDenied />` — but this code path is unreachable in PUMP because of the upstream shell gate.

---

## 4. Functional specification

### Page entry

1. The route `/comms/templates` is reachable from the PUMP shell's secondary nav entry "Templates".
2. On entry, the page renders the list view scoped to the operator's currently-selected organisation. The list is the only primary content; no separate empty dashboard surface exists.
3. The page-level guard `PagePermissionGuard pageName="comms-templates" operation="read"` admits the user before the list query runs. Operators without `read:page.comms-templates` see the access-denied state instead of the list.

### Loading state

4. While the initial templates list query is in flight, the table area shows a skeleton row treatment supplied by pace-core2 `DataTable`'s `isLoading` state (rows-shaped placeholder, no toast).
5. While the page-level guard's permission check is in flight, the route renders nothing (the guard's loading default returns `null`); the user sees the surrounding shell layout but no templates content yet.

### Empty state

6. When the list query succeeds and returns zero rows for the operator's organisation, the table area is replaced with an inline empty-state panel. Copy: "No templates yet — create one to get started."
7. When the operator has `create:page.comms-templates`, the empty-state panel includes a "Create template" CTA button that opens the editor `Dialog`. When the operator does not, the CTA is omitted; the copy alone is shown.

### Error state

8. When the list query fails (network, RLS rejection, RPC error), the table area renders an error panel. Copy: "Couldn't load templates." A "Retry" button re-runs the list query. A `'destructive'` toast surfaces the underlying error message in addition to the panel (per BR-FetchError).

### Primary content (list view)

9. The list view is a single dense pace-core2 `DataTable` placed under a header row.
10. Header row contains: page title "Templates", a search input, a "Show retired" toggle, and a "Create template" primary button (visible only when `useCan('create:page.comms-templates')` resolves true).
11. The table has seven columns in this order: **Name**, **Channel**, **Subject preview**, **Strict-mode**, **Status**, **Created**, **Actions**.
12. **Name** column shows the template's `name` field as plain text. A retired row's Name is rendered with muted text styling.
13. **Channel** column shows a `Badge` with copy `Email` (channel = `email`) or `SMS` (channel = `sms`).
14. **Subject preview** column shows the template's `subject` field for email channels (truncated with ellipsis at column width). For SMS channels the cell is empty.
15. **Strict-mode** column shows a small `Badge` reading "Strict" when `require_merge_field_validation = true`; otherwise the cell is empty.
16. **Status** column shows a small `Badge` reading "Inactive" when `is_active = false`; for active rows the cell is empty.
17. **Created** column shows the template's `created_at` formatted as a short date (operator's locale).
18. **Actions** column shows row actions per BR-RowActionVisibility: Preview, Edit, Retire (active rows), Activate (retired rows).
19. The list does not render `description` text or `body_text` / `body_html` content directly. Description appears in the editor and as a row-level field; body content appears only inside the preview `Dialog`.

### Search

20. The search input filters the list across `name` and `description` substring (case-insensitive). The filter runs client-side against the rows already loaded for the active organisation. Empty search shows all rows that match the active "Show retired" toggle state.
21. The search field is a pace-core2 `Input` with placeholder "Search templates" and a clear-on-empty behaviour (typing then clearing returns to the unfiltered set).

### "Show retired" toggle

22. The "Show retired" toggle defaults to off. With it off, only `is_active = true` rows are listed. With it on, all rows for the operator's organisation list (active + retired).
23. The toggle state is local component state — not persisted to URL, localStorage, or sessionStorage in v1.

### Editor `Dialog` (Create / Edit)

24. The editor opens as a modal `Dialog` triggered by the Create button (header), the empty-state CTA, or a row's Edit action.
25. In Create mode, all fields are empty (channel default = `email`, strict-mode toggle off, `is_active` implicit true on insert).
26. In Edit mode, fields are pre-populated from the row being edited. Channel, subject (when email), body, strict-mode, name, and description all reflect the row's stored values.
27. Editor fields appear in this order: **Name** (required), **Description** (optional), **Channel** (required, segmented), **Subject** (required, email only — hidden when channel = sms), **Body** (required, channel-specific authoring), **Strict-mode toggle** (`require_merge_field_validation`).
28. The body field is a single textarea. For `channel = 'email'`, the textarea is bound to `body_html`; the operator types HTML markup or plain text directly. For `channel = 'sms'`, the textarea is bound to `body_text`; `body_html` is written as `null` on save.
29. On channel switch from `email` to `sms`, the subject input is hidden and any subject value is cleared from the form state (it will be written as `null` on save). On channel switch from `sms` to `email`, the subject input becomes visible and is required to save.
30. The strict-mode toggle is visible to all operators viewing the editor; it is editable only when `useCan('update:page.comms-templates', scope)` resolves true. When read-only, the toggle is disabled with its current value visible.
31. The editor footer carries a primary `Save template` button and a secondary `Cancel` button. `Save template` is disabled while a save is in flight.

### Save outcomes

32. On a valid Create save: a row is inserted into `pump_organisation_templates` with `organisation_id = selectedOrganisation.id`, `created_by = auth.uid()`, `is_active` defaulted to `true`, the user-supplied fields, and `merge_fields_used` set to `extractMergeTokens(subject + body_html + body_text)` (deduplicated). The editor closes. The list refreshes. A `'success'` toast announces "Template created."
33. On a valid Edit save: the row is updated with the user-supplied field changes plus a recomputed `merge_fields_used`. `created_by` and `created_at` are not modified. `updated_at` is set by the database default. The editor closes. The list refreshes. A `'success'` toast announces "Template updated."
34. On Cancel, the editor closes without saving. No toast.

### Save validation failures

35. When required fields are missing (per BR-FormValidation), the editor displays inline per-field error copy and does not call save. A summary `'destructive'` toast reads "Fix the highlighted fields before saving." The editor remains open.
36. When the body or subject contains a shape-malformed merge token (per BR-TokenValidation), the editor displays inline error copy on the offending field reading "Merge tokens must be in the form `{{token_name}}`." Save is blocked. A summary `'destructive'` toast reads "Fix the highlighted fields before saving."
37. When the save call itself fails (network, RLS rejection, Postgres error), the editor remains open with the user's input intact, and a `'destructive'` toast surfaces the failure cause. No partial state is persisted.

### Row actions

38. **Preview** opens a preview `Dialog`. The dialog shows pace-core2 `MessagePreview` rendering the template's stored fields as a `CommDraft` (channel + subject + body_html + body_text + a synthetic `sender_name` for `MessagePreview`'s shape — see §6 BR-Preview). `mergeFields = []` (no catalogue is loaded). `sampleValues = {}`. A close affordance dismisses the dialog. Preview is read-only.
39. **Edit** opens the editor `Dialog` in edit mode (per items 26–34).
40. **Retire** is shown only on rows where `is_active = true`. It opens the retire confirmation `Dialog` (per items 41–43). It is hidden when `useCan('update:page.comms-templates')` resolves false (retirement is an UPDATE — `is_active = false`).
41. The retire confirmation `Dialog` shows copy "Retire 'X'? You can re-activate it later." (where X is the template's name). It carries a primary destructive `Retire` button and a secondary `Cancel` button.
42. On Retire confirmed, the row's `is_active` is updated to `false`. The dialog closes. The list refreshes. A `'success'` toast announces "Template retired."
43. On Retire cancelled, the dialog closes with no mutation.
44. **Activate** is shown only on rows where `is_active = false` and only when `useCan('update:page.comms-templates')` resolves true. On click, the row's `is_active` is updated to `true` directly (no confirmation dialog — activation is non-destructive). The list refreshes. A `'success'` toast announces "Template activated."
45. Save / retire / activate failures all surface a `'destructive'` toast with the failure cause and leave the row state unchanged.

### Permission-conditional rendering

46. With `read:page.comms-templates` only: list, search, "Show retired" toggle, Preview row action are all visible. Create button, Edit row action, Retire row action, Activate row action are all hidden.
47. With `read:page.comms-templates` + `create:page.comms-templates`: Create button (header) and empty-state CTA are also visible.
48. With `read:page.comms-templates` + `update:page.comms-templates`: Edit, Retire, and Activate row actions are visible. Strict-mode toggle in editor is enabled.
49. Without `read:page.comms-templates`: the `PagePermissionGuard` shows `<AccessDenied />` instead of the route content.

### Navigation

50. The page links from PUMP-01's shell sidebar entry "Templates" → `/comms/templates`. PUMP-04 itself does not link out to other PUMP routes; the surface is self-contained.

### Edge cases and constraints

51. **Organisation isolation:** the list query passes `organisation_id = selectedOrganisation.id` as a `.eq()` filter; RLS rejects any row not in the operator's accessible organisation set regardless. Inserts and updates carry the same `organisation_id`. Operators who change their selected organisation from the shell see the list refetch for the new org.
52. **Channel coupling:** changing channel in the editor clears the channel-conflicting fields per item 29. The editor never persists `subject` to a `sms` row or leaves a stale `body_html` on a `sms` row.
53. **Body derivation:** on email save, `body_text` is computed deterministically from `body_html` per BR-BodyTextDerivation. The operator does not see this derivation — they only edit the `body_html` field.
54. **Merge-fields-used persistence:** `merge_fields_used` is recomputed on every save (insert and update). An operator cannot manually edit the array.
55. **Retire is reversible:** retired templates remain in the database. With "Show retired" on, the operator sees them and can Activate them.
56. **Direct table access only:** PUMP-04 does not invoke `pump_list_merge_fields`, the adapter-backed `useCommTemplates`, the adapter-backed `useCommMergeFields`, or any Edge function. All reads / writes are direct against `pump_organisation_templates` via `useSecureSupabase()`.

---

## 5. Visual specification

### Layout

The route renders a single content column inside PUMP-01's `<PaceAppLayout>` shell. From top to bottom on desktop:

1. **Page header row** — full content width, vertical padding `pace-core2` standard 04 (4-unit block). Left side: page title `Templates` (heading-1 typography). Right side, in horizontal flex with gap `space-2`: a pace-core2 `Input` search field (placeholder "Search templates"), a pace-core2 `Switch` labelled "Show retired" with the label to the left of the control, and a pace-core2 `Button` reading "Create template" (variant `default`).
2. **List card** — full content width below the header. Holds the `DataTable` and its bordered card chrome.

Mobile collapse: the header row stacks vertically. Title on its own row; search input on its own row (full width); "Show retired" switch + "Create template" button on the third row, button right-aligned. The `DataTable` itself becomes horizontally scrollable rather than collapsing column count.

The editor, preview, and retire-confirm surfaces are pace-core2 `Dialog` modals layered above the list. Modals are centred at desktop widths and full-height-sheet on mobile per pace-core2's `Dialog` defaults.

### Components

**Header row controls:**

- pace-core2 `Input` (search). Width on desktop: `w-64` (16rem). Placeholder copy `Search templates`. No leading icon (pace-core2 Tooltip is not exported by `@solvera/pace-core/components` and PUMP-04 must not introduce app-local tooltip primitives; the placeholder copy carries the affordance hint).
- pace-core2 `Switch` (Show retired). Label text `Show retired` placed before the control. Default off (unchecked).
- pace-core2 `Button` (Create template) with `variant="default"`. Hidden when `useCan('create:page.comms-templates')` returns false. `aria-label="Create template"`.

**List `DataTable`:**

- Mounted with `rbac={{ pageName: 'comms-templates' }}` so DataTable-level RBAC plumbing is consistent with the route guard.
- Columns (header copy, width hint, behaviour):

| Column | Header | Width hint | Cell content |
|---|---|---|---|
| Name | "Name" | flexible (fr 2) | `template.name` plain text. Retired rows render in muted text colour (text style same as pace-core2 `text-muted-foreground`). |
| Channel | "Channel" | fixed `~6rem` | pace-core2 `Badge` with copy `Email` (`variant="default"`) or `SMS` (`variant="secondary"`). |
| Subject preview | "Subject" | flexible (fr 3) | For email rows: `template.subject` plain text, single line, truncate-with-ellipsis. For SMS rows: empty cell. |
| Strict-mode | "Strict" | fixed `~5rem` | When `require_merge_field_validation = true`: pace-core2 `Badge` reading `Strict` (`variant="secondary"`). Otherwise empty cell. |
| Status | "Status" | fixed `~5rem` | When `is_active = false`: pace-core2 `Badge` reading `Inactive` (`variant="secondary"`). Otherwise empty cell. |
| Created | "Created" | fixed `~7rem` | Formatted short date from `template.created_at` (operator locale, e.g. `7 May 2026`). |
| Actions | "" (visually hidden) | fixed `~10rem` | Row-action button group right-aligned; see "Row actions" below. |

- Row-level visual: rows are clickable for preview (entire row is the Preview affordance). Retired rows render with muted text in the Name and Subject columns (same `text-muted-foreground` colour) but the row remains fully clickable.
- Sorting: rows are sorted by `created_at` descending by default. v1 does not surface user-controlled sort UI; the column header is plain text.
- Pagination: v1 lists all rows for the operator's organisation; no pagination control.

**Row action button group** (Actions column, right-aligned):

- pace-core2 `Button` `variant="ghost"` `size="small"` with copy `Preview`. Always shown.
- pace-core2 `Button` `variant="ghost"` `size="small"` with copy `Edit`. Hidden when `useCan('update:page.comms-templates')` returns false.
- pace-core2 `Button` `variant="ghost"` `size="small"` with copy `Retire`. Hidden when `is_active = false` or when `useCan('update:page.comms-templates')` returns false.
- pace-core2 `Button` `variant="ghost"` `size="small"` with copy `Activate`. Hidden when `is_active = true` or when `useCan('update:page.comms-templates')` returns false.
- All action buttons carry an explicit `aria-label` matching the visible copy plus the row's template name (e.g. `aria-label="Preview Welcome email"`).

**Editor `Dialog` (Create / Edit):**

- pace-core2 `Dialog` with `DialogContent` set to `max-w-2xl`. Header: `DialogTitle` reads `Create template` (Create mode) or `Edit template` (Edit mode).
- Form fields rendered inside a `<form>` driven by pace-core2 `useZodForm`. Fields appear vertically with `space-4` between blocks.
- **Name** field — pace-core2 `Input` with `Label` "Name". Required. Placeholder `Welcome email`. Inline error copy below the field on validation failure: `Name is required.`
- **Description** field — pace-core2 `Textarea` (2 visible rows) with `Label` "Description (optional)". Placeholder `Short summary of when this template is used.` No inline error (optional field).
- **Channel** field — pace-core2 `Select` with `Label` "Channel". Two `SelectItem`s: `Email` (value `email`) and `SMS` (value `sms`). Required. Default `email` in Create mode.
- **Subject** field — pace-core2 `Input` with `Label` "Subject". Visible only when channel = `email`. Required when visible. Placeholder `Welcome to {organisation}`. Inline error copy: `Subject is required for email templates.` Hidden entirely when channel = `sms`.
- **Body** field — pace-core2 `Textarea` with `Label` "Body". Required. Visible row count: 8. Placeholder for email: `Hi {first_name}, welcome to our community.` Placeholder for SMS: `Reminder: your appointment is tomorrow at 10am.` Inline error copies: `Body is required.` (empty), `Merge tokens must be in the form {{token_name}}.` (shape-malformed token).
- **Strict-mode** field — pace-core2 `Switch` with `Label` "Require merge-field validation at send time" and helper copy below the label: `When on, send is blocked if any merge token cannot be resolved for a recipient.` Switch is disabled when `useCan('update:page.comms-templates')` returns false; in that case the stored toggle value is visible but the operator cannot toggle it.
- **Footer** — pace-core2 `DialogFooter` with two buttons right-aligned: secondary `Button` `variant="outline"` reading `Cancel`; primary `Button` `variant="default"` reading `Save template`. Primary is disabled while save is in flight; on submit it shows pace-core2's standard pending-state treatment (text + leading spinner).

**Preview `Dialog`:**

- pace-core2 `Dialog` with `DialogContent` set to `max-w-2xl`. Header: `DialogTitle` reads `Preview: <template name>`.
- Body renders pace-core2 `MessagePreview` with a `CommDraft` constructed from the row's `channel`, `subject`, `body_html`, `body_text`, plus a placeholder `sender_name` field set to `'Preview'` (the type requires a value; PUMP-04 does not display sender identity here). `mergeFields` prop is passed as `[]`. `sampleValues` prop is passed as `{}`.
- `MessagePreview` itself renders, inside a Card: a `CardHeader` showing "Preview" + a description ("Email preview uses sanitised HTML." for email; "SMS preview uses plain text." for SMS); a Subject section (when present); a sanitised-HTML preview article (email channel) or a plain-text article (SMS channel); and an Alert listing every unresolved merge token wrapped in `<mark>`.
- Footer: a single secondary `Button` `variant="outline"` reading `Close` that dismisses the dialog.

**Retire confirmation `Dialog`:**

- pace-core2 `Dialog` with `DialogContent` set to `max-w-md`. Header: `DialogTitle` reads `Retire template?`.
- Body: a single paragraph reading `Retire '<template name>'? You can re-activate it later.`
- Footer: secondary `Button` `variant="outline"` reading `Cancel`; primary `Button` `variant="destructive"` reading `Retire`. Primary is disabled while the retire mutation is in flight.

### States

- **Loading (list query):** the `DataTable` body renders a 5-row skeleton placeholder using `DataTable`'s `isLoading` prop. The header row remains fully interactive.
- **Loading (guard):** the route renders nothing under the shell; the operator sees PUMP-01's shell layout but no PUMP-04 content. (This is the `PagePermissionGuard`'s default loading behaviour with no `loading` prop passed.)
- **Empty:** the table area is replaced by an inline empty-state panel with icon-free centred copy `No templates yet — create one to get started.` and (when `useCan('create:page.comms-templates')` is true) a primary `Button` reading `Create template` directly under the copy.
- **Error:** the table area is replaced by an inline error panel with copy `Couldn't load templates.` plus a `Button` `variant="outline"` reading `Retry`. A `'destructive'` toast appears at the same time carrying the underlying error message.
- **Access denied:** when the page guard denies, the route content is replaced entirely by pace-core2 `<AccessDenied />` (the component renders a friendly access-denied panel inside the shell; PUMP-04 passes no custom fallback).
- **Save success:** the editor closes and a `'success'` toast appears with copy `Template created.` (Create) or `Template updated.` (Edit). The list rows refresh in place.
- **Save failure:** the editor remains open with form values intact; a `'destructive'` toast appears with the underlying error message.
- **Retire success:** the retire dialog closes; a `'success'` toast appears with copy `Template retired.`; the list rows refresh in place (the retired row remains visible only when "Show retired" is on).
- **Activate success:** the activated row's status badge clears; a `'success'` toast appears with copy `Template activated.`; the list rows refresh in place.

### Interactions

- **Search input:** typing filters the list as you type. Clearing the input restores the unfiltered list (subject to "Show retired" toggle state).
- **"Show retired" toggle:** flipping the switch toggles between active-only and active-plus-retired views. The toggle state persists only for the lifetime of the page mount.
- **Row click (anywhere outside an action button):** opens the Preview `Dialog` for that row.
- **Row Action button click:** stops propagation so a click on Edit / Retire / Activate / Preview button does not also open Preview.
- **Editor `Dialog` close behaviour:** clicking the `Cancel` button, the close (X) icon in the header, or pressing Escape dismisses the dialog without saving. Clicking outside the dialog (overlay click) is consumed by pace-core2 `Dialog` defaults — it dismisses the dialog. PUMP-04 does not add an unsaved-changes prompt in v1.
- **Retire confirmation `Dialog` close behaviour:** Cancel, X, Escape, and overlay click all dismiss without retiring. Only the destructive `Retire` button retires.
- **Focus management:** opening the editor `Dialog` moves focus to the Name input. Opening the preview `Dialog` moves focus to the Close button. Opening the retire confirmation `Dialog` moves focus to the Cancel button (so accidental Enter does not destructively retire). On dismissal of any dialog, focus returns to the trigger (Create button, row action, or row).
- **Scroll lock:** all three dialogs use pace-core2 `Dialog`'s default scroll lock on the underlying body.

### Permission-conditional rendering

| Permission state | Surface | Treatment |
|---|---|---|
| No `read:page.comms-templates` | Entire route | `<AccessDenied />` replaces the route content. |
| `read:page.comms-templates` only | List, search, "Show retired" toggle | Visible. |
| `read:page.comms-templates` only | Create button (header), empty-state CTA | Hidden. |
| `read:page.comms-templates` only | Edit / Retire / Activate row actions | Hidden. |
| `read:page.comms-templates` only | Preview row action | Visible. |
| `read:page.comms-templates` only | Editor `Dialog` (if reached via deep link or programmatic) | Not reachable in v1 — there is no deep link; create / edit only opens via gated buttons. |
| `read` + `create:page.comms-templates` | Create button (header), empty-state CTA | Visible. |
| `read` + `create:page.comms-templates` | Editor `Dialog` strict-mode toggle | Disabled (read-only display of current value). |
| `read` + `update:page.comms-templates` | Edit row action | Visible. |
| `read` + `update:page.comms-templates` | Retire row action (active rows) | Visible. |
| `read` + `update:page.comms-templates` | Activate row action (retired rows) | Visible. |
| `read` + `update:page.comms-templates` | Editor `Dialog` strict-mode toggle | Enabled (operator can change). |

(The slice does not use `delete:page.comms-templates` for retire — retirement is an UPDATE, not a DELETE, in v1. The DELETE policy on the table exists but PUMP-04 issues no DELETE statement against `pump_organisation_templates`.)

---

## 6. Business rules

### BR-OrgIsolation — organisation isolation

All list reads filter by `organisation_id = selectedOrganisation.id` as an explicit `.eq()` clause. All inserts include `organisation_id` from the active selection. RLS policies on `pump_organisation_templates` (per platform-snapshot-2026-05-07 lines 264–270) double-check the read / insert / update via `check_rbac_permission_with_context(<operation>, 'comms-templates', organisation_id, NULL::text, get_app_id('PUMP'))`.

### BR-NameRequired — template name is required

`name` is required and non-empty after trim. Empty / whitespace-only input fails validation with inline copy `Name is required.`

### BR-ChannelRequired — channel is required

`channel` is required and one of the literal values `'email'` or `'sms'` (matching dev-db's `comm_channel` enum). Anything else fails validation.

### BR-SubjectChannelRule — subject is channel-dependent

When `channel = 'email'`, `subject` is required (non-empty after trim). When `channel = 'sms'`, the form's subject value (if any) is discarded and the persisted column is written as `null`.

### BR-BodyHtmlAuthoring — single-textarea HTML body authoring

For `channel = 'email'`, the editor shows a single textarea bound to `body_html`. The author types HTML markup or plain text directly. There is no HTML/Plain-text tab split, no rich-text editor, and no separate plain-text override input. For `channel = 'sms'`, the textarea is bound to `body_text`; `body_html` is `null` on save.

### BR-BodyTextDerivation — `body_text` derivation for email

When `channel = 'email'` on save, `body_text` is computed deterministically from `body_html` by stripping HTML tags. The transform is exactly:

```
body_text = body_html
  .replace(/<[^>]+>/g, ' ')   // strip tag markup, leaving content
  .replace(/\s+/g, ' ')        // collapse whitespace
  .trim()                      // remove leading / trailing whitespace
```

Authors do not edit `body_text` directly when `channel = 'email'`. When `channel = 'sms'`, `body_text` is the user-typed input (no transform); `body_html` is written as `null`.

### BR-BodyChannelRule — body required per channel

`body_text` is always persisted as a non-null string (dev-db NOT NULL on the column). For `channel = 'email'`, validation passes when `body_html` is non-empty after trim (the derived `body_text` is then non-empty by construction). For `channel = 'sms'`, validation passes when `body_text` is non-empty after trim. Empty input on the channel-bound field fails with inline copy `Body is required.`

### BR-StrictModeDefault — strict-mode default

`require_merge_field_validation` defaults to `false` on insert (matching dev-db default). The editor's strict-mode toggle in Create mode reflects this default.

### BR-StrictModeAuth — strict-mode toggle gating

The strict-mode toggle is visible in the editor to all readers but is editable only by users with `update:page.comms-templates`. There is no finer-grained gate than the rest of the form's update permission.

### BR-CreatedBy — created_by on insert

`created_by` is set to `auth.uid()` on insert. It is never modified on update (the UPDATE statement does not include `created_by`).

### BR-IsActiveDefault — is_active default

`is_active` defaults to `true` on insert (matching dev-db default). The editor does not surface an `is_active` field; operators control activation through the Retire and Activate row actions.

### BR-RetireTemplate — retire is soft

The Retire action issues an UPDATE setting `is_active = false`. It does not issue a DELETE. The row remains in the database and is visible when "Show retired" is on.

### BR-ActivateTemplate — activate restores

The Activate action is visible only on retired rows (`is_active = false`) and only when the operator has `update:page.comms-templates`. It issues an UPDATE setting `is_active = true`. No confirmation dialog (activation is non-destructive).

### BR-MergeFieldsUsedDerived — merge_fields_used derivation

On every save (insert and update), `merge_fields_used` is computed via:

```
merge_fields_used = extractMergeTokens(
  (subject ?? '') + '\n' + (body_html ?? '') + '\n' + (body_text ?? '')
)
```

`extractMergeTokens` (from `@solvera/pace-core/comms`) returns a deduplicated array of `{{token}}` strings. The operator does not edit `merge_fields_used` directly. The column is persisted as `text[]` on dev-db.

### BR-TokenValidation — shape-only token validation

Token validation in PUMP-04 is shape-only. Save blocks only on shape-malformed tokens — for example `{{` without `}}`, empty `{{ }}`, or nested `{{nested {{token}} }}`. Unknown-but-well-formed tokens (e.g. `{{not_a_real_field}}`) persist without warning. Availability against the actual recipient pool is checked at send time by PUMP-05's compose-time strict-mode check (gated by `require_merge_field_validation`).

Implementation: a slice-local Zod refinement scans each text field's content for the regex `/\{\{(?!\s*[a-zA-Z0-9_.-]+\s*\}\})[^}]*?\}\}|\{\{[^}]*$/` (or equivalent). A match fails validation with inline copy `Merge tokens must be in the form {{token_name}}.`

### BR-FormValidation — channel-aware editor validation

The editor enforces these checks before issuing a save call:

| Check | Channel | Condition | Inline copy |
|---|---|---|---|
| Name | both | non-empty after trim | "Name is required." |
| Channel | both | one of `email`, `sms` | (Select prevents invalid input) |
| Subject | email | non-empty after trim | "Subject is required for email templates." |
| Body (`body_html`) | email | non-empty after trim | "Body is required." |
| Body (`body_text`) | sms | non-empty after trim | "Body is required." |
| Token shape | both | every `{{…}}` matches `\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}` | "Merge tokens must be in the form `{{token_name}}`." |

Failure displays the inline copy on the offending field, fires a destructive toast `'Fix the highlighted fields before saving.'`, and does not call save.

### BR-ListSearchScope — list search scope

The list search input filters across `name` and `description` substring (case-insensitive). The filter runs client-side over the rows already loaded for the active organisation. Match logic: a row matches when `(name ?? '').toLowerCase().includes(query)` or `(description ?? '').toLowerCase().includes(query)`. Empty query matches all rows.

### BR-ListFilterDefault — list filter default

The list defaults to active-only (`is_active = true` rows). The "Show retired" toggle reveals all rows. Toggle state is local component state in v1 — not URL-persisted, not localStorage-persisted, not sessionStorage-persisted. Reloading the page resets the toggle to off.

### BR-Preview — preview rendering

Preview reuses pace-core2 `MessagePreview` from `@solvera/pace-core/comms`. PUMP-04 constructs a `CommDraft` for the previewed row:

```
const draft: CommDraft = {
  channel: template.channel,
  subject: template.subject ?? undefined,
  body_html: template.body_html ?? undefined,
  body_text: template.body_text,
  sender_name: 'Preview',          // placeholder; preview does not show sender identity
  template_id: template.id,
  extra_merge_context: undefined,
};
```

`MessagePreview` is rendered with `mergeFields = []` and `sampleValues = {}`. Internally `MessagePreview` calls `getUnresolvedTokens`, `resolveMergeTokens`, and `sanitiseCommHtml` to produce the rendered output. PUMP-04 itself does not call those utilities directly.

### BR-PreviewSampleValues — preview uses empty sample values

Preview is invoked with `sampleValues = {}`. Every `{{token}}` in the previewed content is unresolved by definition; tokens highlight via `<mark>` (rendered by `MessagePreview` internally) and list in `MessagePreview`'s "Unresolved merge tokens" Alert. There is no operator-supplied sample-values mode in v1.

### BR-PreviewSanitisationCaption — sanitisation indicator

The default `MessagePreview` caption ("Email preview uses sanitised HTML." for email; "SMS preview uses plain text." for SMS) is the v1 sanitisation indicator. PUMP-04 adds no diff-style "we removed N elements" indicator. `sanitiseCommHtml` does not return diff metadata.

### BR-FetchError — list-query failure

When the list query fails, the table area renders an error panel with copy `Couldn't load templates.` and a `Retry` button that re-runs the query. A `'destructive'` toast surfaces the underlying error message at the same time.

### BR-SaveFailure — save-call failure

When the save call fails (network, RLS rejection, Postgres error), the editor remains open with the user's input intact. A `'destructive'` toast surfaces the failure cause. No partial state is persisted to the database.

### BR-RetireConfirmation — retire confirmation gate

Retirement is gated by a pace-core2 `Dialog`-based confirmation step. The dialog's body copy is `Retire '<template name>'? You can re-activate it later.` Primary `Retire` button is `variant="destructive"`; secondary `Cancel` button is `variant="outline"`. Only the primary button issues the UPDATE.

### BR-RowActionVisibility — row action visibility matrix

| Action | Show when |
|---|---|
| Preview | Always (every row, every reader). |
| Edit | `is_active = true` rows AND `useCan('update:page.comms-templates')`. (Retired rows do not show Edit in v1; activate first.) |
| Retire | `is_active = true` rows AND `useCan('update:page.comms-templates')`. |
| Activate | `is_active = false` rows AND `useCan('update:page.comms-templates')`. |

---

## 7. API / Contract

### Public exports

PUMP-04 publishes one cross-slice contract: the row shape of `pump_organisation_templates`, consumed by PUMP-05's compose surface (template picker / template-applied compose state) via the `CommSendAdapter.loadTemplates` path. PUMP-04 itself does not export a TypeScript wrapper hook; PUMP-05's adapter reads the table directly per the architecture's adapter contract.

### Read contract

- **List query.** Direct `SELECT` from `pump_organisation_templates` filtered by `organisation_id = selectedOrganisation.id`. Returned columns: `id`, `organisation_id`, `name`, `description`, `channel`, `subject`, `body_html`, `body_text`, `merge_fields_used`, `is_active`, `require_merge_field_validation`, `created_by`, `created_at`, `updated_at`. Ordered by `created_at` DESC. RLS check: `read:page.comms-templates` via `check_rbac_permission_with_context`.
- **Single-row fetch (for editor / preview).** Inline from the loaded list query result; no separate row-fetch RPC.
- The slice does NOT call `pump_list_merge_fields(...)`. The slice does NOT call any Edge function. The slice does NOT call `useCommTemplates` or `useCommMergeFields` (both adapter-backed, unsuitable for direct CRUD).

### Write contract

- **Create.** `INSERT INTO pump_organisation_templates (organisation_id, name, description, channel, subject, body_html, body_text, merge_fields_used, require_merge_field_validation, created_by) VALUES (...) RETURNING *`. RLS check: `create:page.comms-templates`.
  - `organisation_id` = active org id.
  - `name`, `description`, `channel`, `subject`, `body_html`, `body_text` per editor input + BR-BodyTextDerivation + BR-SubjectChannelRule.
  - `merge_fields_used` per BR-MergeFieldsUsedDerived.
  - `require_merge_field_validation` per editor toggle (default `false`).
  - `created_by = auth.uid()`.
  - `is_active` is omitted (defaults to `true` per dev-db).
  - Success outcome: row inserted; client refreshes the list query; success toast `Template created.`.
  - Failure outcomes: validation error (handled before call), RLS rejection (destructive toast), Postgres / network error (destructive toast).
- **Update.** `UPDATE pump_organisation_templates SET name = $1, description = $2, channel = $3, subject = $4, body_html = $5, body_text = $6, merge_fields_used = $7, require_merge_field_validation = $8 WHERE id = $9 RETURNING *`. RLS check: `update:page.comms-templates`. Same column derivations as Create. Success toast `Template updated.`.
- **Retire.** `UPDATE pump_organisation_templates SET is_active = false WHERE id = $1 RETURNING *`. RLS check: `update:page.comms-templates`. Success toast `Template retired.`.
- **Activate.** `UPDATE pump_organisation_templates SET is_active = true WHERE id = $1 RETURNING *`. RLS check: `update:page.comms-templates`. Success toast `Template activated.`.
- **No DELETE.** PUMP-04 does not issue DELETE statements against this table in v1.

### RLS / permission contracts

| Action | RLS policy | Required RBAC |
|---|---|---|
| SELECT | `rbac_select_pump_organisation_templates` | `read:page.comms-templates` |
| INSERT | `rbac_insert_pump_organisation_templates` | `create:page.comms-templates` |
| UPDATE | `rbac_update_pump_organisation_templates` | `update:page.comms-templates` |
| DELETE | `rbac_delete_pump_organisation_templates` | `delete:page.comms-templates` (not used by PUMP-04 v1) |

All policies resolve via `check_rbac_permission_with_context(<operation>, 'comms-templates', organisation_id, NULL::text, get_app_id('PUMP'))`.

### Cross-slice handoffs

| Hand to | What PUMP-04 delivers | How consumed |
|---|---|---|
| **PUMP-05** (compose surface) | Rows from `pump_organisation_templates` filtered by org and channel, consumed by the template picker and applied-template compose state | PUMP-05's `CommSendAdapter.loadTemplates` reads the table directly (or via a future adapter-backed Edge route per CR23). PUMP-05 honours `require_merge_field_validation` at compose time — when true and any merge token is unresolved against the resolved recipient pool, send is blocked. Tokens stored by PUMP-04 are raw `{{token}}` strings (no catalogue resolution at template authoring). |

### ID contracts

`pump_organisation_templates.id` is `uuid` (server-generated `gen_random_uuid()`); PUMP-04 does not synthesise template IDs. `organisation_id` is `uuid` from the active organisation selection. `created_by` is `uuid` from `auth.uid()`.

---

## 8. Data and schema references

### Tables

- **`pump_organisation_templates`** (per-org templates, FORCE RLS). The full v1 contract for this slice. Column shape per platform-snapshot-2026-05-07 lines 112–131.

### RPCs

- None directly invoked by PUMP-04. (The RBAC predicate `check_rbac_permission_with_context` is invoked by RLS policies, not by application code.)

### Edge functions

- None. All reads / writes are direct against the table.

### Verifications against dev-db

Verify against project `rkytnffgmwnnmewevqgp` (per global operating rules → Dev-db reference):

1. `pump_organisation_templates` exists with the column shape in §3 and platform-snapshot-2026-05-07 lines 112–131.
2. The five RLS policies (`service_role_can_manage_all_pump_organisation_templates`, `rbac_insert_*`, `rbac_select_*`, `rbac_update_*`, `rbac_delete_*`) are present and resolve via `check_rbac_permission_with_context`.
3. The `comms-templates` page is registered in `rbac_app_pages` for the PUMP app (app id resolved via `get_app_id('PUMP')`).
4. The `comm_channel` enum has values `email` and `sms`.

### Domain / decision references

- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — comms-platform contract; defines the row shape PUMP-05 / `CommSendAdapter.loadTemplates` consumes.
- [`pump-architecture.md`](./pump-architecture.md) § "RBAC model (PUMP management app)" — page-key registry; PUMP-04 uses `comms-templates` exclusively.

---

## 9. pace-core2 imports

### 9.1 Imports table

| Symbol | Import path | One-line why |
|---|---|---|
| `PagePermissionGuard` | `@solvera/pace-core/rbac` | Page-level RBAC gate around `/comms/templates`. |
| `useCan` | `@solvera/pace-core/rbac` | Action-level RBAC for Create / Edit / Retire / Activate buttons. |
| `AccessDenied` | `@solvera/pace-core/rbac` | Default fallback for the page guard. |
| `useSecureSupabase` | `@solvera/pace-core/rbac` | Auth-bound Supabase client for RLS-checked list / mutate. |
| `useUnifiedAuth` | `@solvera/pace-core/hooks` | Source of `selectedOrganisation.id` and `user.id`. |
| `DataTable`, `DataTableColumn` | `@solvera/pace-core/components` | Templates list table. |
| `Button` | `@solvera/pace-core/components` | All action / footer / row-action buttons. |
| `Input` | `@solvera/pace-core/components` | Search input; Name and Subject form fields. |
| `Textarea` | `@solvera/pace-core/components` | Description and Body form fields. |
| `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` | `@solvera/pace-core/components` | Channel form field. |
| `Switch` | `@solvera/pace-core/components` | "Show retired" toggle and strict-mode toggle. |
| `Label` | `@solvera/pace-core/components` | Form-field labels. |
| `Badge` | `@solvera/pace-core/components` | Channel / Strict / Inactive cell badges. |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` | `@solvera/pace-core/components` | Editor / Preview / Retire-confirm modal surfaces. |
| `toast` | `@solvera/pace-core/components` | Module-level fire-and-forget toasts (`'default' \| 'destructive' \| 'success'`). |
| `useZodForm` | `@solvera/pace-core/hooks` | Editor form (RHF + Zod resolver). |
| `MessagePreview` | `@solvera/pace-core/comms` | Shared template preview rendering. |
| `extractMergeTokens` | `@solvera/pace-core/comms` | Compute `merge_fields_used` on save. |
| `CommDraft`, `CommTemplate`, `CommChannel` | `@solvera/pace-core/comms` (types) | TypeScript shapes for the row, preview draft, and channel enum literal. |

### 9.2 Slice-specific caveats

- **`MessagePreview`:** PUMP-04 invokes it with `mergeFields = []` and `sampleValues = {}` (no catalogue is loaded in v1; all tokens highlight as unresolved by design). Constructing the `CommDraft` for preview uses a placeholder `sender_name = 'Preview'` because the type requires the field; preview does not display sender identity.
- **`extractMergeTokens`:** PUMP-04 calls it on save against the concatenation `subject + '\n' + body_html + '\n' + body_text` (using `?? ''` for nullable channel-conditional fields). The result is deduplicated by the function and persisted directly to `merge_fields_used`.
- **`useSecureSupabase`:** PUMP-04 calls `useSecureSupabase()` without arguments — pace-core2 resolves the underlying client internally.
- **`Dialog`:** PUMP-04 uses three separate `Dialog` instances (editor, preview, retire-confirm). Each closes independently. The retire-confirm dialog focuses Cancel by default so that an accidental Enter does not destructively retire.
- **No catalogue / toolbar imports.** PUMP-04 v1 must NOT import `MergeFieldToolbar`, `useCommTemplates`, `useCommMergeFields`, `getUnresolvedTokens`, `resolveMergeTokens`, `insertMergeToken`, `sanitiseCommHtml`, or `validateCommDraft`. The first six belong to the catalogue / token-insert surface that S-2 (b) excludes from v1; `validateCommDraft` requires fields PUMP-04 does not have (`sender_name`, channel-specific sender contact) and is unsuitable for template-editor save validation.
- **No Tooltip primitives.** pace-core2 does not export `Tooltip` / `TooltipProvider` from `@solvera/pace-core/components` (capability gap verified during PUMP-01 resolution). PUMP-04 must not introduce app-local tooltip primitives. Hover help / explanatory copy is delivered via inline labels, accessible `aria-label` attributes, and surface-level helper copy.

---

## 10. Permission and access rules

### Page-level access

`<PagePermissionGuard pageName="comms-templates" operation="read">` wraps the `/comms/templates` route. Default fallback `<AccessDenied />`. Scope passed to the guard: `{ organisationId: selectedOrganisation.id }`. The guard's loading state renders `null` (no `loading` prop is supplied).

### Action-level access

| Action | Permission gate | Visible / enabled when |
|---|---|---|
| List / Search / Show retired toggle / Preview row action | `read:page.comms-templates` (gated by the page guard) | Always once the route content renders. |
| Create button (header) and empty-state CTA | `useCan('create:page.comms-templates', { organisationId })` | True. |
| Edit row action | `useCan('update:page.comms-templates', { organisationId })` | True AND row is `is_active = true`. |
| Retire row action | `useCan('update:page.comms-templates', { organisationId })` | True AND row is `is_active = true`. |
| Activate row action | `useCan('update:page.comms-templates', { organisationId })` | True AND row is `is_active = false`. |
| Editor strict-mode toggle (interactive) | `useCan('update:page.comms-templates', { organisationId })` | True. (When false, toggle is rendered disabled with current value.) |

### Role × action matrix

| Role / capability | Read list | Preview | Create | Edit | Retire | Activate | Strict-mode toggle |
|---|---|---|---|---|---|---|---|
| No PUMP grants | No (AccessDenied) | n/a | n/a | n/a | n/a | n/a | n/a |
| `read:page.comms-templates` only | Yes | Yes | No | No | No | No | Disabled |
| `read` + `create:page.comms-templates` | Yes | Yes | Yes | No | No | No | Disabled |
| `read` + `update:page.comms-templates` | Yes | Yes | No | Yes | Yes | Yes | Enabled |
| `read` + `create` + `update:page.comms-templates` | Yes | Yes | Yes | Yes | Yes | Yes | Enabled |
| Service role (Edge) | n/a — Edge does not consume PUMP-04 in v1 |

### Proxy / impersonation

Standard PDLC proxy rules apply. PUMP-04 does not introduce a slice-specific proxy rule.

---

## 11. Acceptance criteria

1. **Given** an authenticated operator with `read:page.comms-templates` and at least one template in their organisation, **when** they navigate to `/comms/templates`, **then** the list view renders the seven-column DataTable with one row per template, sorted by `created_at` descending. (Traces §4 items 1–3, 9–18.)
2. **Given** an operator with `read:page.comms-templates` and zero templates in their organisation, **when** they navigate to `/comms/templates`, **then** the inline empty-state panel renders with copy "No templates yet — create one to get started." (Traces §4 item 6.)
3. **Given** an operator with `read:page.comms-templates` but without `create:page.comms-templates` and zero templates, **when** they navigate to `/comms/templates`, **then** the empty-state panel shows the copy without a Create CTA. (Traces §4 items 6–7, 47.)
4. **Given** an operator without `read:page.comms-templates`, **when** they navigate to `/comms/templates`, **then** the route renders `AccessDenied` instead of the list. (Traces §4 item 49; §10 page-level access.)
5. **Given** an operator with `create:page.comms-templates`, **when** they click "Create template" and submit a valid email template (Name = "Welcome", Channel = email, Subject = "Hi", Body = `<p>Hello {{first_name}}</p>`), **then** a row is inserted into `pump_organisation_templates` with `body_text` populated as `Hello {{first_name}}` (HTML stripped per BR-BodyTextDerivation), `merge_fields_used = ['{{first_name}}']`, `require_merge_field_validation = false`, `created_by = auth.uid()`, the editor closes, the list refreshes, and a success toast reads "Template created." (Traces §4 items 24–32; §6 BR-BodyTextDerivation, BR-MergeFieldsUsedDerived, BR-CreatedBy.)
6. **Given** an operator with `create:page.comms-templates` editing a Create form, **when** they submit with Name empty, **then** the editor blocks the save, surfaces inline copy "Name is required." on the Name field, and shows a destructive toast "Fix the highlighted fields before saving." (Traces §4 item 35; §6 BR-NameRequired, BR-FormValidation.)
7. **Given** an operator authoring an email template with body `Hello {{ first_name }}` (well-formed token), **when** they submit, **then** the save proceeds and the persisted `merge_fields_used` array contains `{{first_name}}`. (Traces §4 item 32; §6 BR-MergeFieldsUsedDerived, BR-TokenValidation.)
8. **Given** an operator authoring a template with a shape-malformed merge token (e.g. body `Hello {{ first_name`), **when** they submit, **then** the editor blocks save, surfaces inline copy "Merge tokens must be in the form `{{token_name}}`." on the Body field, and shows a destructive toast. (Traces §4 item 36; §6 BR-TokenValidation.)
9. **Given** an operator with `update:page.comms-templates`, **when** they click an active row's Retire action and confirm in the retire-confirm dialog, **then** the row's `is_active` becomes `false`, the dialog closes, the list refreshes, and a success toast reads "Template retired." (Traces §4 items 40–42; §6 BR-RetireTemplate, BR-RetireConfirmation.)
10. **Given** an operator with `update:page.comms-templates` and "Show retired" toggled on, **when** they click a retired row's Activate action, **then** the row's `is_active` becomes `true`, the list refreshes, and a success toast reads "Template activated." No confirmation dialog appears. (Traces §4 item 44; §6 BR-ActivateTemplate.)
11. **Given** an operator with `read:page.comms-templates` only, **when** the list view renders, **then** the Create button, Edit row action, Retire row action, and Activate row action are all hidden. The Preview row action is visible. (Traces §4 items 46–48; §10 role × action matrix.)
12. **Given** an operator clicks Preview on any row, **when** the preview dialog opens, **then** `MessagePreview` renders the row's content; for an email row with body `<p>Hello {{first_name}}</p>` the preview shows the sanitised HTML rendering with the `{{first_name}}` token wrapped in `<mark>` and listed in the unresolved-tokens Alert (because `sampleValues = {}` and `mergeFields = []`). (Traces §4 item 38; §6 BR-Preview, BR-PreviewSampleValues.)
13. **Given** the templates list query fails (e.g. RLS rejection or network error), **when** the failure surfaces, **then** the table area shows the error panel with copy "Couldn't load templates." and a Retry button, and a destructive toast carries the underlying error message. (Traces §4 item 8; §6 BR-FetchError.)
14. **Given** the operator has typed valid template content and clicks Save, **when** the database call fails (e.g. simulated RLS rejection), **then** the editor remains open with form values intact and a destructive toast carries the failure cause. No row is inserted or updated. (Traces §4 item 37; §6 BR-SaveFailure.)
15. **Given** the list contains both active and retired templates, **when** the operator toggles "Show retired" on, **then** all rows render and retired rows show a muted Name with an "Inactive" badge in the Status column. With the toggle off, only active rows render. (Traces §4 items 9, 16, 22; §6 BR-ListFilterDefault.)
16. **Given** the operator types "welcome" into the search field, **when** the filter applies, **then** only rows where `name` or `description` contains "welcome" (case-insensitive) remain visible. Clearing the search restores the unfiltered list (subject to "Show retired"). (Traces §4 items 20–21; §6 BR-ListSearchScope.)
17. **Given** an operator switches the editor's Channel from email to sms while the Subject field has content, **when** the operator saves, **then** the persisted row has `subject = null` and `body_html = null`; the body content is in `body_text`. (Traces §4 items 28–29; §6 BR-SubjectChannelRule, BR-BodyHtmlAuthoring, BR-BodyTextDerivation.)

---

## 12. Verification

Slice-unique proof steps (feed the QA pack):

1. **Live RLS check.** As an authenticated operator without any PUMP grants, query `SELECT COUNT(*) FROM pump_organisation_templates WHERE organisation_id = '<their-org>'::uuid;` directly via the secure Supabase client — confirm zero rows returned regardless of actual row count, demonstrating RLS bypass impossibility.
2. **Round-trip body derivation.** Save an email template with `body_html = '<p>Hello <strong>{{first_name}}</strong>!</p>'`. Inspect the persisted row in dev-db — confirm `body_text = 'Hello {{first_name}}!'` (or with single space between collapsed runs of whitespace).
3. **`merge_fields_used` deduplication.** Save a template with body `<p>Hi {{first_name}} — {{first_name}} is great. {{org_name}} welcomes you.</p>`. Inspect the persisted row — confirm `merge_fields_used = ['{{first_name}}', '{{org_name}}']` with two entries, not three.
4. **Strict-mode toggle gate.** As an operator with `read:page.comms-templates` only, open the Preview dialog (allowed). Then attempt to open the editor in Edit mode — confirm the Edit action is hidden in the row's Actions cell (the path to mutating strict-mode is closed).
5. **Retire vs hard-delete.** Retire a template, then confirm directly in dev-db that the row is still present with `is_active = false` and that no DELETE statement is logged in the Postgres query log for this slice.
6. **Activate flow.** With "Show retired" on, click Activate on a retired row. Confirm the row's `is_active = true` in dev-db and that "Inactive" badge disappears immediately.
7. **Search across name + description.** Create two templates: A with name "Welcome", description "First contact". B with name "Reminder", description "Reminder welcome wagon". Type "welcome" — confirm both rows match (A by name, B by description).
8. **Token shape rejection.** Attempt to save with body `Hello {{first_name`. Confirm save is blocked with the inline copy and destructive toast; confirm no INSERT statement reaches the database.
9. **Preview unresolved-tokens Alert.** Open Preview for any template containing a merge token. Confirm `MessagePreview`'s "Unresolved merge tokens" Alert lists every token in the template (because `sampleValues = {}` ensures none resolves).

---

## 13. Testing requirements

n/a — standard PDLC quality gates apply, plus the verification scenarios in §12 land as automated coverage where the QA pack lists them. PUMP-04 has no concurrency hazard (single-row edits, no shared mutation queue), no optimistic-update path (mutations are blocking with their own toasts), and no critical mid-flight UX beyond the in-flight save spinner.

---

## 14. Build execution rules

- All template reads / writes go via `useSecureSupabase()` against `pump_organisation_templates` directly. No Edge function call. No `pump_list_merge_fields` call.
- The slice does not introduce app-local Tooltip primitives. (pace-core2 capability gap verified during PUMP-01 resolution; surface-level help copy / `aria-label` covers the design need.)
- The slice does not introduce app-local sanitisation utilities. `MessagePreview` owns sanitised rendering; `sanitiseCommHtml` is invoked internally by the component.
- The slice does not invoke `validateCommDraft` for save validation — that helper requires sender-identity fields PUMP-04 does not own. Save validation uses the slice-local Zod schema described in §6 BR-FormValidation.
- The slice does not issue DELETE statements against `pump_organisation_templates` in v1.

---

## 15. Done criteria

- `body_text` derivation in §6 BR-BodyTextDerivation produces the exact transform listed when applied to a representative HTML input set (covered by an automated unit test on the derivation helper).
- The 17 acceptance criteria in §11 each have at least one passing test (unit or integration) traced to them in the QA pack.
- The role × action matrix in §10 is exercised by integration tests for at least the four representative role profiles (no grants, read only, read + create, read + update).
- `merge_fields_used` is populated correctly for every save path tested by §11 #5 and §12 #3.

---

## 16. Do not

- Do not hard-delete rows from `pump_organisation_templates` in v1. Retirement is `is_active = false` only.
- Do not invoke `pump_list_merge_fields(...)` from PUMP-04. Merge-field availability is checked at send time by PUMP-05.
- Do not import `MergeFieldToolbar`, `useCommTemplates`, `useCommMergeFields`, `getUnresolvedTokens`, `resolveMergeTokens`, `insertMergeToken`, `sanitiseCommHtml`, or `validateCommDraft` into PUMP-04. The first six belong to the catalogue / token-insert surface excluded from v1; `validateCommDraft` is unsuitable because it requires sender-identity fields PUMP-04 does not own.
- Do not introduce a merge-field toolbar or token-insert UI in v1.
- Do not block save on unknown-but-well-formed merge tokens. Save blocks only on shape-malformed tokens.
- Do not use the lower-case-snake `comms_templates` page key. PUMP-04 uses `comms-templates` exclusively.
- Do not call `sendSystemNotification` or in any way address `pump_system_templates` from PUMP-04. System templates are platform-managed copy invoked by source apps.
- Do not import `TooltipProvider` or any Tooltip primitive — none is exported by `@solvera/pace-core/components`. Do not introduce app-local Tooltip primitives. Use inline labels, `aria-label`, and helper copy instead.
- Do not write a parallel app-local sanitiser. `MessagePreview` handles sanitisation; PUMP-04 must not bypass it with raw `dangerouslySetInnerHTML`.
- Do not surface a CR23-style adapter / Edge call from PUMP-04. The slice is a pure direct-table CRUD surface.

---

## 17. References

- [`pump-project-brief.md`](./pump-project-brief.md)
- [`pump-architecture.md`](./pump-architecture.md) — § "RBAC model (PUMP management app)" (page-key registry; PUMP-04 uses `comms-templates`); § "Bounded contexts → Templates" (the template-library bounded context); § "Slice overview" (PUMP-04 row).
- [`pump-feature-list.md`](./pump-feature-list.md) — derived feature inventory (traceability).
- [`pump-user-stories.md`](./pump-user-stories.md) — derived user stories (traceability).
- **PUMP-01** (PUMP shell + IA + RBAC): owns the `<AuthenticatedShell>`, `<ToastProvider>` mount, and the route registration that mounts PUMP-04 at `/comms/templates`. Toaster mount convention applied (per cross-app-decisions.md 2026-05-04). PUMP-01's Tooltip capability-gap callout applies here.
- **PUMP-03** (sender-identity contract): no direct dependency for PUMP-04, listed for context — PUMP-04 templates feed PUMP-05's compose surface, which consumes PUMP-03's RPC for sender display at compose time.
- **PUMP-05** (compose & send): downstream consumer of PUMP-04 rows. PUMP-05's `CommSendAdapter.loadTemplates` reads the table directly. PUMP-05's compose-time strict-mode check (gated by `require_merge_field_validation`) is where token-vs-pool availability is enforced; PUMP-04 stores raw `{{token}}` strings without pool validation.
- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — comms-platform contract for the row shape PUMP-05 / `CommSendAdapter.loadTemplates` consumes.
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md) (verify live dev-db via Supabase MCP) — live dev-db state for `pump_organisation_templates` (lines 112–131), RLS policies (lines 264–270), and the `comm_channel` enum.

### Outstanding follow-ups (not blocking PUMP-04 v1)

- **Platform follow-up — legacy `comms_templates` page key on dev-db.** The legacy lower-case-snake `comms_templates` page persists on dev-db's `rbac_app_pages`. The rebuild does not adopt it; any user grants currently held on `comms_templates` must be re-issued on `comms-templates` for impacted operators before they can use PUMP-04. PUMP-04 SPA gates use `comms-templates` only.
- **Future enhancement — poolless catalogue read.** Once a poolless catalogue read contract exists in pace-core2 / dev-db (e.g. a new `pump_list_merge_fields_global(organisation_id, channel)` RPC variant or an adapter pattern that supplies a synthetic pool), PUMP-04 may surface a merge-field toolbar via that approved contract. Not blocking for v1 — token validation in PUMP-04 stays shape-only until then.
- **pace-core2 capability — Tooltip primitives.** `Tooltip` / `TooltipProvider` are not exported by `@solvera/pace-core/components` at PUMP-04 authoring time. PUMP-04 sidesteps with inline labels and `aria-label` per §9.2. References PUMP-01's Tooltip capability-gap callout; not blocking for PUMP-04 v1.

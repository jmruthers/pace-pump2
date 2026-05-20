# PUMP-02 — Communications log home

## 1. Slice metadata

- Slice ID: PUMP-02
- Name: Communications log home
- Status: Draft
- Depends on: PUMP-01
- Backend impact: Read contract only (consumes live post-p4 `pump_message`, `pump_message_recipient`, `pump_delivery_event`; calls Edge `pump-cancel`; issues DELETE on `pump_message`)
- Frontend impact: UI
- Routes owned: `/`
- QA pack: `docs/test-packs/PUMP-02-qa-pack.md`

This file is **`PU02-comms-log-home-requirements.md`** (slice **PUMP-02**) under `docs/requirements/pump/`.

This slice ships in two internal sub-passes under the same route owner. The build agent implements PUMP-02A first, then PUMP-02B; both passes share §3 / §6 / §9 / §16 / §17 / §18, while §4 / §5 / §10 / §11 / §12 are sub-divided with explicit **A** and **B** headers.

- **PUMP-02A** — read-only: list, filters, pagination, refresh, drill-down, recipient list, delivery-event timeline.
- **PUMP-02B** — row actions: scheduled-message cancel via `pump-cancel`; own-draft delete.

---

## 2. Overview

PUMP-02 owns the operator home at `/`: a communications log over `pump_message` for the active organisation, with a recipient and delivery-event drill-down opened in a modal `Dialog`. The list is built on pace-core2 `DataTable` in server-side mode with channel / status / date filters serialised into URL query state. The drill-down is URL-stateful (`?message=<id>`) so reload and share work. PUMP-02B layers two row actions on top of the read path: cancelling a scheduled message via the `pump-cancel` Edge function, and deleting an own draft via a direct `DELETE` against `pump_message` under live RLS.

---

## 3. What this slice delivers

### Purpose

Give an operator a single, focused surface to see what their organisation has sent and what is queued, drill into per-recipient delivery, and act on a row when the action is in scope (cancel a scheduled message; delete an own draft). The home page answers "what went out, what is going out, and is anything failing?" without exposing compose mechanics, template authoring, or platform settings.

### Surfaces

- **Route:** `/` (mounted by PUMP-01's app shell; PUMP-02 supplies the lazy-loaded page component).
- **List view** at `/`: page heading, filter toolbar, the `DataTable` itself, and a header-row "New message" Compose CTA.
- **Drill-down `Dialog`** (modal): opened by clicking a row in the list. URL state `?message=<id>` opens the dialog on entry; closing the dialog clears the param. Contents: header (channel + subject, `source_app` text, status badge, key timestamps), recipient list, delivery-event timeline.
- **Cancel confirmation `Dialog`** (modal): pace-core2 `Dialog` shown when an operator clicks the Cancel row action on a scheduled row. Confirmation issues the `pump-cancel` Edge call.
- **Delete confirmation `Dialog`** (modal): pace-core2 `Dialog` shown when an operator clicks the Delete row action on an own draft. Confirmation issues the `DELETE` statement.
- **Access-denied surface:** when PUMP-01's page-level guard denies read, the route renders pace-core2 `<AccessDenied />` (PUMP-01 owns the guard mount; PUMP-02 inherits the behaviour).

### Boundaries

This slice does **not** own:

- The `<PagePermissionGuard pageName="CommsLog" operation="read">` mount on `/`. PUMP-01 owns the route guard.
- The `<ToastProvider>` mount. PUMP-01's `<AuthenticatedShell>` mounts it; PUMP-02 imports `toast` module-level for fire-and-forget notifications.
- The `<CommRbacContextProvider>` mount. PUMP-01 mounts the provider app-locally inside `<AuthenticatedShell>` (pace-core2 publishes only the `CommRbacContext` type today, not the runtime provider/hook); PUMP-02 consumes `useCommRbacContext()` from the local provider.
- Compose / send. PUMP-05 owns `/comms/create`. PUMP-02 only renders a "New message" CTA that links there.
- Templates. PUMP-04 owns `/comms/templates`.
- Sender-identity / `/comms/settings`. Platform-managed; no PUMP UI in v1.
- Webhook ingestion / Edge function deployment. PUMP-06.
- Route-table changes. PUMP-01 owns the router.
- Aggregate summary row of failed / scheduled counts at the top of `/` (intentionally deferred to a future enhancement; see §17).

### Architectural posture

- **Read pattern.** Direct `SELECT` from `pump_message` filtered by `organisation_id = selectedOrganisation.id`, executed through `useSecureSupabase()` and TanStack Query in the server-side mode wired into pace-core2 `DataTable`. Draft visibility is enforced by the live RLS split on `pump_message` (`rbac_select_nondraft_pump_message` + `rbac_select_own_drafts_pump_message`); the SPA does NOT add any `created_by` / `status` predicate of its own. The slice does NOT call `pump_comms_log` (legacy reporting view; superseded for v6).
- **Drill-down read pattern.** When a `?message=<id>` is in scope, the slice issues two additional queries through `useSecureSupabase()`: a `SELECT` from `pump_message_recipient` filtered by `message_id`, and a `SELECT` from `pump_delivery_event` joined through `recipient_id`. Both are gated by RLS on `read:page.CommsLog`.
- **Cancel mutation pattern.** `secureSupabase.functions.invoke('pump-cancel', { body: { messageId, organisationId } })`. The Edge function returns `ApiResult<{ message_id: string }>`. On success the SPA invalidates the list query and refetches; on failure the SPA surfaces the Edge `error.message` in a destructive toast.
- **Delete mutation pattern.** Direct `DELETE FROM pump_message WHERE id = $1 AND status = 'draft' AND created_by = auth.uid()` through `useSecureSupabase()`. RLS gate `rbac_delete_pump_message` (`delete:page.CommsLog`) is the platform check; the SPA-side `created_by` predicate is the v1 own-drafts-only restriction (per §6 BR-DeleteVisibility).
- **Toaster.** `toast` is imported module-level from `@solvera/pace-core/components`. Variants in v1 are `'default' | 'destructive' | 'success'` only — no `'warning'`, no `'info'`.
- **Page-guard ownership boundary.** PUMP-01 mounts `<PagePermissionGuard pageName="CommsLog" operation="read">` on `/`. PUMP-02 does NOT re-mount the guard. Operators without `read:page.CommsLog` see PUMP-01's `<AccessDenied />` surface before any PUMP-02 content renders.
- **`useCommRbacContext` consumption.** The Compose CTA gate reads `useCommRbacContext().canCompose` (the boolean PUMP-01 derives from `create:page.CommsLog`). The hook is imported from PUMP-01's local provider at `src/comms/CommRbacContextProvider.tsx`; if pace-core2 later publishes the runtime provider/hook, PUMP-01's local fallback is retired without changes to PUMP-02's import shape.

### Page-level guards and evaluation ordering

The route `/` has both PUMP-01's page-level guard (`<PagePermissionGuard pageName="CommsLog" operation="read">`) and PUMP-02's data-state empty / error / loading states. They are not in conflict — the empty / error / loading states are data-state, not context-state. Evaluation order on `/`:

1. **Session restoration → authentication → no-organisation** are owned by PUMP-01's wrapper chain (`<ProtectedRoute>` → `<SessionRestorationLoader>` → `<AuthenticatedShell>`). When `selectedOrganisation === null`, PUMP-01's no-organisation empty state renders inside the chrome and PUMP-02's content does not mount. PUMP-02 does not render its own no-organisation state.
2. **`PagePermissionGuard`** (PUMP-01) evaluates `read:page.CommsLog` against the active scope (organisation-scoped). Scope is resolved by the guard internally from `<OrganisationServiceProvider>`; PUMP-01 does not pass a `scope` prop. While `useCan`'s `isLoading` is true, the guard renders `null` (its loading default; PUMP-01 does not pass a `loading` prop). On denied → `<AccessDenied />`. On allowed → PUMP-02's content mounts.
3. **Inside the route content**, PUMP-02 mounts the list query. The loading / error / empty states render only after the guard has admitted the user.

**Scope passed to the guard** is `{ organisationId: selectedOrganisation.id }`. The guard is invoked only after PUMP-01's shell guarantees `selectedOrganisation.id` is non-null, so the guard never sees an undefined `organisationId`. If the underlying scope were ever undefined, the RBAC RPC would treat the scope as missing and return `false`, and the guard would render `<AccessDenied />` — but this code path is unreachable in PUMP because of the upstream shell gate.

---

## 4. Functional specification

### Page entry (A + B)

1. The route `/` renders inside PUMP-01's authenticated shell and page guard. Operators with `read:page.CommsLog` for the active organisation reach PUMP-02's content; operators without it see PUMP-01's `<AccessDenied />`.
2. On entry, the page renders three regions stacked top-to-bottom: the header row (page heading "Communications", description "View and manage your sent and scheduled messages.", and a primary "New message" button on the right when `canCompose` resolves true); the filter toolbar (Channel select, Status multi-select, Date-range picker pair, Refresh icon button); and the `DataTable`.
3. On entry, the slice reads URL query state to seed initial filters, sort, page, and drill-down state. Recognised params: `channel`, `status`, `from`, `to`, `pageIndex`, `pageSize`, `sortDir`, `message`.
4. On entry, the slice issues the list query with the seeded filters, ordering on `(sent_at NULLS LAST, created_at, id)` DESC by default, and asks for `pageSize` (default 25) rows starting at `pageIndex × pageSize`. The query runs through `useSecureSupabase()` against `pump_message` with `organisation_id = selectedOrganisation.id`.

### Loading states (A)

5. While the page-level guard's permission check is in flight (PUMP-01 owns this), the route renders nothing under the chrome (`null` from the guard); PUMP-02 has no loading copy of its own at this stage.
6. While the initial list query is in flight, the table area renders pace-core2 `DataTable`'s built-in skeleton via the `isLoading` prop (rows-shaped placeholder). The header row, filter toolbar, and Compose CTA remain visible.
7. While the drill-down's recipient query and delivery-event query are in flight, the dialog body renders a small in-dialog skeleton (rows-shaped placeholder); the dialog header (channel, subject, status, timestamps) is rendered immediately from the row already present in the list cache.

### Empty states (A)

8. When the list query succeeds and returns zero rows for the operator's organisation under the active filters, the table area is replaced with an inline empty-state panel. Copy: "No messages yet — start one to see it here."
9. When `useCommRbacContext().canCompose` resolves true, the empty-state panel includes a "Compose" button that navigates to `/comms/create`. When `canCompose` is false, the copy alone is shown.
10. When the drill-down's recipient query returns zero rows (an unusual case for a non-draft message), the Recipients section renders inline copy "No recipients on this message yet." in place of the table. The Delivery events section similarly renders "No delivery events recorded yet." when the timeline query returns zero rows.

### Error states (A + B)

11. When the list query fails (network, RLS rejection, RPC error), the table area renders an error panel. Copy: "Couldn't load communications." A "Retry" button re-runs the list query. A `'destructive'` toast surfaces the underlying error message at the same time (per BR-FetchError).
12. When the drill-down recipient or delivery-event query fails, the affected section inside the dialog renders the same error panel with copy "Couldn't load recipient details." or "Couldn't load delivery events." plus a "Retry" button. A `'destructive'` toast surfaces the underlying error message.
13. When a `?message=<id>` value is not a valid uuid, or resolves to no `pump_message` row under RLS, the drill-down dialog opens in an inline error state. Body copy: "Message not found or not visible." The dialog has only a Close button. No console error, no thrown error (per BR-MalformedDrillDownId).

### Primary content — list view (A)

14. The list view is a single dense pace-core2 `DataTable` placed directly under the filter toolbar.
15. The table has six columns in this order: **Channel**, **Subject preview**, **Status**, **Date**, **Recipients**, **Actions**.
16. **Channel** column shows a pace-core2 `Badge` carrying the channel's icon and label: `email` → `<Mail />` icon + "Email"; `sms` → `<Phone />` icon + "SMS".
17. **Subject preview** column shows two lines on desktop / tablet: line 1 is the row's `subject` for email rows or the literal "SMS message" for sms rows; line 2 is the first ~80 characters of `body_text`, truncated with ellipsis. On the mobile breakpoint the cell collapses to line 1 only.
18. **Status** column shows a pace-core2 `Badge` whose variant and copy are: `draft` → outline-sec-muted "Draft"; `scheduled` → outline-main-muted "Scheduled"; `sending` → solid-main-muted "Sending"; `sent` → solid-main-normal "Sent"; `cancelled` → outline-sec-muted "Cancelled"; `failed` → solid-acc-strong "Failed".
19. **Date** column shows the row's effective date — `sent_at` if non-null, else `scheduled_at`, else `created_at` — formatted on two lines: short date (operator's locale) on line 1, time (24-hour) on line 2.
20. **Recipients** column shows the row's `total_recipients` as an integer when non-null. When `total_recipients` is null (a draft whose pool has not yet been resolved by the Edge), the cell shows "—" with `aria-label="Pool not yet resolved"`.
21. **Actions** column hosts the row-action dropdown (PUMP-02B). For PUMP-02A this column is reserved but renders an empty cell or a kebab menu containing only future actions. For PUMP-02B it carries the Cancel and Delete row actions per their visibility rules.
22. The default ordering of rows is `(sent_at NULLS LAST, created_at, id)` DESC. Drafts (which have null `sent_at` and null `scheduled_at`) sort by `created_at` DESC under this rule and appear interleaved with their owning operator's other recent rows.
23. The Date column header is the only sortable header. Clicking it toggles between `(sent_at NULLS LAST, created_at, id)` DESC and the same triple ASC. The sort direction is reflected in URL state as `?sortDir=asc|desc`. The other column headers are not sortable.
24. The DataTable runs in pace-core2 server-side mode. Pagination uses `pageIndex` and `pageSize` (default `pageSize = 25`; the size selector also offers 50). Page changes update URL state as `?pageIndex=<n>&pageSize=<25|50>`.

### Filter toolbar (A)

25. The filter toolbar sits directly above the DataTable and below the page header row. It is a single horizontal row on desktop / tablet that wraps onto two rows on mobile.
26. The toolbar contains, left to right: a Channel `Select` (options: "All channels", "Email", "SMS"); a Status `MultiSelect` (chip-trigger, checkbox-list dropdown, rendering the six enum values as toggleable items: Draft, Scheduled, Sending, Sent, Cancelled, Failed; selected items chip back into the trigger); a Date-range pair (two `DatePickerWithTimezone` inputs, "From" and "To" — timezone-aware so a comms-log filter spanning UTC offsets resolves predictably); a "Refresh" icon `Button` (variant `outline`, `<RefreshCcw />` icon, `aria-label="Refresh"`).
27. Filter values serialise to URL query state. Channel writes `?channel=email|sms` (omitted when "All channels"). Status writes `?status=scheduled,failed` (comma-separated, omitted when no statuses are selected). Date range writes `?from=YYYY-MM-DD` and `?to=YYYY-MM-DD` (each omitted when empty). Removing a filter strips the corresponding param.
28. Filter values apply via the list query. Channel adds `.eq('channel', value)`. Status adds `.in('status', selected)`. Date range adds a predicate against `coalesce(sent_at, scheduled_at, created_at)` between the inclusive `from` 00:00 and inclusive `to` 23:59:59 in the operator's locale. (The slice uses Postgres `coalesce` server-side; the SPA passes the raw column references through `.or(...)` or a parameterised RPC predicate where required.)
29. Clicking the Refresh icon button re-runs the list query without changing filters. Refresh also invalidates the recipient and delivery-event queries so the open drill-down (if any) refetches when next reopened. There is no realtime subscription; refresh is operator-driven.

### Drill-down (A)

30. Clicking anywhere on a row (except the Actions column) opens the drill-down `Dialog` for that row. Pressing Enter on a focused row achieves the same outcome (accessibility).
31. Opening the drill-down sets the URL query param `?message=<row.id>`. Reload or sharing the URL while `?message=<id>` is present opens the dialog at mount with that row in scope.
32. The drill-down is a pace-core2 `<Dialog>` (centred, scrollable). The dialog content is structured top to bottom as: a header block, a Recipients section, and a Delivery events section.
33. The header block renders the channel badge (from §4 item 16), the subject text (or "SMS message" for sms rows), a `source_app` text line ("Source: <source_app>"), the status badge (from §4 item 18), and a timestamps block listing `created_at`, `scheduled_at` (if non-null), and `sent_at` (if non-null).
34. The Recipients section renders a table of `pump_message_recipient` rows for `message_id = <row.id>`, ordered by `address` ASC. Columns (left to right): Address (`pump_message_recipient.address`); Member (joined `core_member.full_name` when `pump_message_recipient.member_id` is non-null, otherwise blank); Status (a `Badge` whose variant follows §6 BR-RecipientStatusBadge); Delivered at (`delivered_at` formatted short date + time, or "—"); Engagement (for email rows shows `Opened: <opened_at>` and `Clicked: <clicked_at>` lines; sms rows show "—"); Reason (`failure_reason` text shown only when status is `failed`, `bounced`, or `suppression_skipped`).
35. The Delivery events section renders a chronological list of `pump_delivery_event` rows for the message's recipients, ordered `occurred_at` ASC. Each row shows: `occurred_at` (short date + time); recipient address (joined from `pump_message_recipient`); event type (`delivered | bounced | failed | opened | clicked | suppression_skipped`); gateway (`resend | twilio`); failure reason text from `raw_payload->>'reason'` (or its provider-specific equivalent) when present.
36. The drill-down closes via pace-core2's built-in `<DialogClose>` button (top-right inside `<DialogContent>`), via the Escape key, or via a click on the overlay (pace-core2 default). Closing clears `?message=<id>` from the URL via `navigate({ search: '<remaining filters>' })` while leaving any non-message filter params intact.

### Permission-conditional rendering (A + B)

37. The "New message" header CTA renders only when `useCommRbacContext().canCompose` is true. When false, the CTA is omitted; the heading and description remain.
38. The empty-state "Compose" button (§4 item 9) follows the same gate.
39. The Cancel row action (PUMP-02B) renders in a row's Actions column only when the row's `status === 'scheduled'` AND the caller is in the same organisation AND (caller is `created_by` OR caller holds `update:page.CommsLog`). The author check uses `user.id === row.created_by`; the admin check uses `useCan('update:page.CommsLog', { organisationId })`.
40. The Delete row action (PUMP-02B) renders in a row's Actions column only when the row's `status === 'draft'` AND `user.id === row.created_by` AND `useCan('delete:page.CommsLog', { organisationId })` resolves true. Admins (`update:page.CommsLog` + `delete:page.CommsLog`) do not see Delete on others' drafts in v1; the SELECT split makes those rows invisible to admins anyway, so the SPA-side restriction does not introduce a new gate.

### Navigation (A)

41. Clicking the header "New message" button navigates to `/comms/create` (PUMP-05's route). The navigation does not carry filter values forward; the compose page does not consume PUMP-02's URL params.
42. The empty-state "Compose" button navigates to `/comms/create` with the same behaviour.
43. Clicking the channel icon, the subject text, or any non-Actions cell on a row opens the drill-down (§4 item 30). The Actions column is the only row region that does not open the drill-down on click.

### Edge cases and constraints (A)

44. When the list query succeeds but a draft authored by another operator is excluded by RLS, the row is simply absent from the result set; PUMP-02 does not render any "hidden draft" placeholder.
45. When the active organisation changes (via PUMP-01's organisation context selector), all queries (list, recipient list, delivery events) re-run against the new organisation. URL state stays as-is — filters carry across; if the filtered URL state has rows in the new org they render, otherwise the empty state shows.
46. When `?message=<id>` is set in the URL but the dialog is closed via the close button, the URL param is cleared. Subsequent re-opens of the dialog generate a fresh `?message=<id>` write.
47. When the drill-down is open and the operator clicks a different row (visible behind the dialog), the dialog's active `?message=<id>` is replaced by the new row's id and the dialog content updates without unmounting the dialog (`Dialog` stays open; query keys swap on the new id).

---

### B. Row actions (PUMP-02B)

#### Cancel scheduled (B)

48. The Cancel row action is a row-action menu item in the Actions column. Visibility per §4 item 39. Click opens the Cancel confirmation `Dialog`.
49. The Cancel confirmation `Dialog` renders the row's subject (or "SMS message" for sms) in the heading and the body copy "Cancel this scheduled message? It will not send." It has two buttons: "Cancel message" (`variant="destructive"`, primary) and "Keep scheduled" (`variant="outline"`, secondary).
50. Clicking "Keep scheduled" (or Escape, or the close button) closes the dialog without invoking the Edge function. The row state is unchanged.
51. Clicking "Cancel message" issues `secureSupabase.functions.invoke('pump-cancel', { body: { messageId: row.id, organisationId: selectedOrganisation.id } })`. While the call is in flight, the "Cancel message" button shows a spinner and is disabled; the "Keep scheduled" button is also disabled.
52. On Edge success (`{ ok: true, data: { message_id } }`), the dialog closes, the list query is invalidated and refetches (the row's status changes to `cancelled` on next render), and a `variant="success"` toast reads "Message cancelled."
53. On Edge failure with `error.code === 'PUMP_CANCEL_INVALID_STATUS'` (the row transitioned out of `scheduled` between visibility check and Edge invocation), the dialog closes, a `variant="destructive"` toast surfaces `error.message` ("Only scheduled messages can be cancelled."), and the list query refetches so the new status is visible immediately.
54. On Edge failure with `error.code === 'PUMP_RBAC_DENIED'`, the dialog closes and a `variant="destructive"` toast surfaces `error.message` ("Not permitted to cancel this message."). The list does not refetch — the row state was correct.
55. On Edge failure with `error.code === 'PUMP_CANCEL_OWNER_MISMATCH'`, the dialog closes and a `variant="destructive"` toast surfaces `error.message` ("Only the creator can cancel this message."). The list does not refetch.
56. On Edge failure with `error.code === 'PUMP_CANCEL_FAILED'` (or any other unrecognised error code), the dialog closes and a `variant="destructive"` toast surfaces `error.message`. The list does not refetch.
57. On network failure (no `ApiResult` returned, or `invoke` throws), the dialog closes and a `variant="destructive"` toast surfaces "Couldn't reach the cancel service." The list does not refetch.

#### Delete own draft (B)

58. The Delete row action is a row-action menu item in the Actions column. Visibility per §4 item 40. Click opens the Delete confirmation `Dialog`.
59. The Delete confirmation `Dialog` renders the draft's subject (or "SMS message" for sms) in the heading and the body copy "Delete this draft? This cannot be undone." It has two buttons: "Delete draft" (`variant="destructive"`, primary) and "Cancel" (`variant="outline"`, secondary).
60. Clicking "Cancel" (or Escape, or the close button) closes the dialog without issuing a DELETE. The row state is unchanged.
61. Clicking "Delete draft" issues `DELETE FROM pump_message WHERE id = $1 AND status = 'draft' AND created_by = auth.uid() RETURNING id` through `useSecureSupabase()`. While the call is in flight, the "Delete draft" button shows a spinner and is disabled; the "Cancel" button is also disabled.
62. On success returning one row, the dialog closes, the list query is invalidated and refetches (the row no longer renders), and a `variant="success"` toast reads "Draft deleted."
63. On success returning zero rows (the draft was already deleted in another tab; or status changed; or `created_by` mismatch), the dialog closes, the list query refetches, and a `variant="default"` toast reads "Draft already removed." This is treated as a benign concurrency outcome, not an error.
64. On RLS rejection / Postgres error / network failure, the dialog closes and a `variant="destructive"` toast surfaces the underlying error's `message`. The list does not refetch (the row state is correct).

---

## 5. Visual specification

### Layout

The route `/` renders inside PUMP-01's authenticated chrome (`<PaceAppLayout>` header + footer). PUMP-02 owns the content area between them. The content area is a single column with three stacked sections:

1. **Header row** — page title "Communications" (`text-2xl font-semibold` per pace-core2 typography), a description line "View and manage your sent and scheduled messages." (`text-sm text-secondary`), and a primary "New message" `Button` aligned to the right end of the row. On the mobile breakpoint the heading and description stack above the button.
2. **Filter toolbar** — a single horizontal row of controls below the header row: Channel `Select` → Status `MultiSelect` → Date "From" `DatePickerWithTimezone` → Date "To" `DatePickerWithTimezone` → Refresh icon `Button`. Each control is separated by a small horizontal gap. On the mobile breakpoint the toolbar wraps onto two rows (Channel + Status on row 1; From + To + Refresh on row 2).
3. **DataTable region** — pace-core2 `DataTable` filling the remaining width and growing to its row content height. The table is rendered inside its default `Card` chrome.

There are no sidebars, no sub-tabs, no sticky scroll regions in PUMP-02's content. The drill-down is a centred modal overlay supplied by pace-core2 `Dialog`.

### Components

#### Header row

- **Heading and description.** Plain text rendered as a stacked `<h1>` + `<p>`. No icon, no badge.
- **`Button` "New message".** pace-core2 `Button`, `variant="default"`, with the `<Plus />` icon (lucide-react via the pace-core2 icons re-export) before the label. `aria-label="New message"`. Hidden when `useCommRbacContext().canCompose` is false. Click navigates to `/comms/create`.

#### Filter toolbar

- **`Select` "Channel".** pace-core2 `Select` with three items: "All channels" (default), "Email", "SMS". Trigger shows the selected label. Width: ~160 px on desktop, full-width on mobile. Placeholder copy: "All channels".
- **Status `MultiSelect`.** pace-core2 `MultiSelect` rendering the six enum values: Draft, Scheduled, Sending, Sent, Cancelled, Failed. The primitive supplies the chip trigger and checkbox-list dropdown natively. Trigger shows "All statuses" when no items are selected, otherwise a count chip ("3 selected"). Width: ~180 px on desktop, full-width on mobile.
- **Date `DatePickerWithTimezone` "From".** pace-core2 `DatePickerWithTimezone` with placeholder "From". Inclusive lower bound. Timezone-aware so a comms-log filter spanning UTC offsets resolves predictably. Width: ~150 px.
- **Date `DatePickerWithTimezone` "To".** pace-core2 `DatePickerWithTimezone` with placeholder "To". Inclusive upper bound. Timezone-aware so a comms-log filter spanning UTC offsets resolves predictably. Width: ~150 px.
- **`Button` "Refresh".** pace-core2 `Button`, `variant="outline"`, `size="icon"`, with the `<RefreshCcw />` icon (lucide-react). `aria-label="Refresh"`. Click re-runs the list query without changing filters.

#### DataTable

- **`DataTable<MessageRow>`** from `@solvera/pace-core/components`. Configured with `rbac={{ pageName: 'CommsLog' }}`, `serverSide={{ fetchData, enableServerSorting: true }}`, `initialPageSize={25}`, `getRowId={(row) => row.id}`, `isLoading` bound to the list query's `isLoading`, `actions={[...]}` per PUMP-02B (empty array in PUMP-02A), `columns` per the six-column spec below. The DataTable's built-in Search, Filter, Create, Export, Import features are disabled — PUMP-02 owns the toolbar.
- **Columns (six total).**
  - **Channel** — header copy "Channel". Width: ~110 px. Cell renders `<Badge variant="solid-sec-muted">{icon}{label}</Badge>` where icon is `<Mail />` for email or `<Phone />` for sms, and label is "Email" or "SMS". Not sortable.
  - **Subject preview** — header copy "Subject". Width: flex (largest column). Cell renders two lines stacked: line 1 (`text-sm font-medium`) shows the row's `subject` for email or the literal "SMS message" for sms; line 2 (`text-xs text-secondary truncate`) shows the first 80 characters of `body_text` with ellipsis when longer. On the mobile breakpoint line 2 is hidden. Not sortable.
  - **Status** — header copy "Status". Width: ~120 px. Cell renders `<Badge variant={...}>{label}</Badge>` per BR-StatusBadge: `draft → outline-sec-muted "Draft"`; `scheduled → outline-main-muted "Scheduled"`; `sending → solid-main-muted "Sending"`; `sent → solid-main-normal "Sent"`; `cancelled → outline-sec-muted "Cancelled"`; `failed → solid-acc-strong "Failed"`. Not sortable.
  - **Date** — header copy "Date". Width: ~140 px. Cell renders two lines: line 1 (`text-sm`) shows the short date in the operator's locale; line 2 (`text-xs text-secondary`) shows the time in 24-hour format. Source value is `coalesce(sent_at, scheduled_at, created_at)`. **Sortable** — header carries the `<ArrowUp />` / `<ArrowDown />` indicator from pace-core2's icon set.
  - **Recipients** — header copy "Recipients". Width: ~110 px. Cell renders `total_recipients` as a right-aligned integer when non-null; renders "—" with `aria-label="Pool not yet resolved"` when null. Not sortable.
  - **Actions** — header copy is empty. Width: ~64 px. Cell renders a kebab `<MoreHorizontal />` menu containing the Cancel and Delete row actions per their visibility rules (PUMP-02B). In PUMP-02A the cell is empty when no actions apply. Not sortable.
- **Empty state**, **error state**, **loading state** — see "States" sub-section below.
- **Pagination** — pace-core2 `DataTable`'s built-in pagination footer. Page-size selector offers 25 (default) and 50. Page index controls show "First / Previous / Page X of Y / Next / Last".
- **Row click target** — clicking anywhere outside the Actions column opens the drill-down. The Actions cell stops propagation so its kebab menu does not open the drill-down.

#### Drill-down `Dialog`

- **`Dialog`** from `@solvera/pace-core/components`. `open` is bound to `useSearchParams()` reading `?message`; `onOpenChange(false)` clears the param.
- **`DialogContent`** uses pace-core2's default sizing (centred at desktop, full-height on mobile). Width: ~720 px on desktop. Scrolls internally on overflow.
- **`DialogHeader`** contains:
  - `DialogTitle` — a horizontal flex row: Channel `Badge` + subject text (or "SMS message" for sms) + status `Badge`.
  - Below the title row, a small block of secondary text: "Source: <source_app>" on its own line; a timestamps line listing "Created <created_at>", and (when non-null) "Scheduled <scheduled_at>" and "Sent <sent_at>" each on its own line.
  - `DialogDescription` is unused (the secondary text block above carries the equivalent content). pace-core2's accessibility default still requires a description; PUMP-02 supplies an `sr-only` description "Message details and recipient delivery timeline."
- **`DialogBody`** contains two sections stacked vertically:
  - **Recipients section.** Heading "Recipients" (`text-sm font-medium`), then a table of recipient rows. The table renders inside a thin `Card` and uses pace-core2 typography. Six columns left to right: Address (flex), Member (~160 px), Status (~110 px, `Badge`), Delivered at (~140 px, two-line short date + time), Engagement (~160 px, two stacked rows "Opened <opened_at>" and "Clicked <clicked_at>" for email rows; "—" for sms rows), Reason (flex, only populated for `failed | bounced | suppression_skipped`). Empty state copy: "No recipients on this message yet." Loading state: in-section skeleton rows.
  - **Delivery events section.** Heading "Delivery events" (`text-sm font-medium`), then a chronological list of event entries rendered as rows in a `Card`. Each row is a single line: `<time>` (short date + time, ~140 px) — `<recipient.address>` — `<event_type>` — `<gateway>` — optional `failure_reason` text. Empty state copy: "No delivery events recorded yet." Loading state: in-section skeleton rows.
- **`DialogFooter`** is empty for PUMP-02A's read-only drill-down. PUMP-02B does not add footer actions to the drill-down — the Cancel and Delete row actions live in the list-row Actions column, not in the dialog.
- **`DialogClose`** button is provided by pace-core2 `DialogContent` defaults (top-right, `<X />` icon).

#### Cancel confirmation `Dialog` (B)

- **`Dialog`** opened by clicking the Cancel row action. `open` controlled by local component state.
- **`DialogHeader`** contains `DialogTitle` "Cancel scheduled message?" and `DialogDescription` showing the row's subject (or "SMS message").
- **`DialogBody`** contains body copy: "Cancel this scheduled message? It will not send."
- **`DialogFooter`** contains two buttons in a right-aligned flex row: "Keep scheduled" (`Button` `variant="outline"`) and "Cancel message" (`Button` `variant="destructive"`). Default focus is on "Keep scheduled" so an accidental Enter does not destructively cancel.
- **In-flight state.** Both buttons disabled; "Cancel message" shows a spinner.

#### Delete confirmation `Dialog` (B)

- **`Dialog`** opened by clicking the Delete row action. `open` controlled by local component state.
- **`DialogHeader`** contains `DialogTitle` "Delete draft?" and `DialogDescription` showing the draft's subject (or "SMS message").
- **`DialogBody`** contains body copy: "Delete this draft? This cannot be undone."
- **`DialogFooter`** contains two buttons in a right-aligned flex row: "Cancel" (`Button` `variant="outline"`) and "Delete draft" (`Button` `variant="destructive"`). Default focus is on "Cancel" so an accidental Enter does not destructively delete.
- **In-flight state.** Both buttons disabled; "Delete draft" shows a spinner.

### States

- **List loading.** The DataTable shows pace-core2's built-in skeleton rows (rows-shaped placeholder) while the list query is in flight. The header row, filter toolbar, and Compose CTA remain visible.
- **List empty.** The DataTable region is replaced with an inline panel (centre-aligned within the table area). Panel copy: "No messages yet — start one to see it here." A "Compose" `Button` appears below the copy when `canCompose` is true.
- **List error.** The DataTable region is replaced with an inline panel. Panel copy: "Couldn't load communications." A "Retry" `Button` appears below the copy. Concurrently a `variant="destructive"` toast surfaces the underlying error message.
- **Drill-down loading.** The dialog header (channel, subject, status, timestamps) renders immediately from the row already in cache. The Recipients and Delivery events sections each show in-section skeleton rows until their query resolves.
- **Drill-down empty (sub-section).** Recipients section renders "No recipients on this message yet." Delivery events section renders "No delivery events recorded yet."
- **Drill-down error.** Affected section renders an inline error panel ("Couldn't load recipient details." or "Couldn't load delivery events.") plus a "Retry" `Button`. Toast `variant="destructive"` surfaces the underlying error message.
- **Drill-down malformed id.** Dialog opens but the body copy reads "Message not found or not visible." Recipients and Delivery events sections do not render. The dialog has only the close affordance.
- **Cancel / Delete success.** Confirmation dialog closes; corresponding success toast (`variant="success"`); list refetches.
- **Cancel / Delete failure.** Confirmation dialog closes; destructive toast surfaces the underlying error (Edge `error.message` for cancel; underlying error message for delete).

### Interactions

- **Row click.** Cursor is a pointer when hovering any non-Actions cell. Click opens the drill-down. Active state: row background tint per pace-core2 `DataTable` defaults. Keyboard: Tab / Shift+Tab moves focus row-by-row; Enter on a focused row opens the drill-down.
- **Compose CTA click.** Navigates to `/comms/create`. Default browser navigation; no transition.
- **Filter change.** Each control fires its `onChange` synchronously. URL state updates immediately; the list query re-runs against the new filters with `pageIndex` reset to 0.
- **Refresh click.** Re-runs the list query (and invalidates recipient / event queries). Button shows a brief disabled state while the query is in flight.
- **Drill-down open.** `Dialog` enters via pace-core2's default fade-in. Focus moves into the dialog (pace-core2 default focus management). Body scroll is locked (pace-core2 default).
- **Drill-down close.** `Dialog` exits via fade-out. Focus returns to the row that opened it (pace-core2 default focus restore).
- **Cancel / Delete confirm click.** Triggers Edge invoke / DELETE; in-flight state shows spinner; success closes dialog and toasts; failure closes dialog and toasts.
- **Cancel / Delete dismiss.** Escape, overlay click, close-button click, and "Keep scheduled" / "Cancel" button click all dismiss the confirmation dialog without invoking the mutation.

### Permission-conditional rendering

| Permission state | Compose CTA (header) | Compose CTA (empty state) | Cancel row action | Delete row action |
|---|---|---|---|---|
| No `read:page.CommsLog` | n/a (PUMP-01's `<AccessDenied />` renders instead) | n/a | n/a | n/a |
| `read` only | Hidden | Hidden | Hidden on every row | Hidden on every row |
| `read` + `create` (`canCompose = true`) | Visible | Visible | Hidden on every row | Hidden on every row |
| `read` + `update` | Hidden | Hidden | Visible on `scheduled` rows where caller is in same org (author or admin) | Hidden on every row |
| `read` + `update` + `create` | Visible | Visible | Visible per the previous row | Hidden on every row |
| `read` + `delete` | Hidden | Hidden | Hidden on every row | Visible on own-draft rows (`status='draft'` AND `created_by=auth.uid()`) only |
| `read` + `update` + `delete` | Hidden | Hidden | Visible on `scheduled` rows where caller is in same org (author or admin) | Visible on own-draft rows only (admins do NOT see Delete on others' drafts in v1) |
| `read` + `create` + `update` + `delete` | Visible | Visible | Visible per the matrix above | Visible on own-draft rows only |

---

## 6. Business rules

### A. Read path

#### BR-OrgScope — list and drill-down queries are organisation-scoped

Every list query passes `organisation_id = selectedOrganisation.id` as a `.eq()` filter through the auth-bound Supabase client. RLS is the primary gate; the explicit filter is defence-in-depth. The drill-down recipient query passes `message_id = <id>` and inherits organisation scope through the recipient table's RLS join. The drill-down delivery-event query inherits organisation scope through the recipient join.

#### BR-DraftVisibility — split RLS enforces draft visibility, not the SPA

Draft visibility is enforced by the dev-db RLS split on `pump_message`: `rbac_select_nondraft_pump_message` admits all in-org rows where `status ≠ 'draft'` to anyone with `read:page.CommsLog`; `rbac_select_own_drafts_pump_message` admits rows where `status = 'draft' AND created_by = effective_user` to anyone with `read:page.CommsLog`. The SPA does NOT add `created_by = auth.uid() OR status != 'draft'` predicates of its own. Doing so would silently constrain admin reads inconsistently with the live policy semantics.

#### BR-InitialSort — list ordering

The list is initially sorted `(coalesce(sent_at, scheduled_at, created_at), id)` DESC — but with a deterministic `NULLS LAST` shape on the `sent_at` portion to ensure drafts (null `sent_at`) sort by `created_at` rather than colliding at the top. The implementation expression is `(sent_at NULLS LAST, created_at, id)` DESC. The triple-key form is deterministic (no ties) so offset pagination is stable across page boundaries even when concurrent inserts arrive between page fetches.

#### BR-ColumnSort — only Date is sortable

The Date column header toggles sort direction. ASC reverses to `(sent_at NULLS LAST, created_at, id)` ASC. Other column headers do not carry sort affordances; ordering across other dimensions is filter-driven.

#### BR-StatusBadge — status badge variants

| Status | Variant | Copy |
|---|---|---|
| `draft` | `outline-sec-muted` | "Draft" |
| `scheduled` | `outline-main-muted` | "Scheduled" |
| `sending` | `solid-main-muted` | "Sending" |
| `sent` | `solid-main-normal` | "Sent" |
| `cancelled` | `outline-sec-muted` | "Cancelled" |
| `failed` | `solid-acc-strong` | "Failed" |

#### BR-ChannelBadge — channel badge

`channel = 'email'` renders `<Badge variant="solid-sec-muted"><Mail /> Email</Badge>`. `channel = 'sms'` renders `<Badge variant="solid-sec-muted"><Phone /> SMS</Badge>`. The icons come from `lucide-react` directly (pace-core2's icon re-export does not include `Mail` or `Phone` per platform-snapshot-2026-05-07 line 102).

#### BR-DateColumn — Date column derivation

The Date cell shows `coalesce(sent_at, scheduled_at, created_at)`. Format: short date (operator's locale, e.g. "8 May 2026" for `en-AU`) on line 1, time in 24-hour format (e.g. "14:32") on line 2.

#### BR-SubjectPreview — Subject column derivation

Subject cell is two stacked lines on desktop / tablet:

- Line 1: for `channel = 'email'`, the row's `subject` field; for `channel = 'sms'`, the literal copy "SMS message".
- Line 2: the first 80 characters of `body_text` with ellipsis when longer.

On the mobile breakpoint, line 2 is hidden.

#### BR-RecipientCount — Recipients column derivation

Recipients cell shows the row's `total_recipients` (integer) when non-null. When null (a draft whose pool has not been resolved by the Edge yet), the cell shows "—" with `aria-label="Pool not yet resolved"`. The cell never displays the literal value `0` for un-resolved drafts.

#### BR-Filters — three filters in v1

The list supports three filters: Channel (single select, allowed values `email | sms`), Status (multi-select across the six `pump_message_status` enum values), Date range (inclusive `from` and `to` dates). All filters compose as conjunctive predicates against the list query.

#### BR-FilterDateDimension — Date filter dimension

The Date range filter applies to `coalesce(sent_at, scheduled_at, created_at)` — the same fallback chain as the Date column display. The `from` value is treated as inclusive `00:00:00` of the operator's locale; the `to` value is inclusive `23:59:59` of the operator's locale. Both are sent through to Postgres as ISO timestamps in UTC (the SPA converts using the operator's `Intl` locale settings).

#### BR-FilterPersistence — filter values are URL-state

Filter values serialise to URL query state on each change:

| Param | Shape | When omitted |
|---|---|---|
| `channel` | `email` or `sms` | omitted when "All channels" |
| `status` | comma-separated subset of the six enum values, e.g. `scheduled,failed` | omitted when no statuses selected |
| `from` | `YYYY-MM-DD` | omitted when empty |
| `to` | `YYYY-MM-DD` | omitted when empty |
| `pageIndex` | non-negative integer | omitted when 0 |
| `pageSize` | `25` or `50` | omitted when 25 |
| `sortDir` | `asc` or `desc` | omitted when `desc` |
| `message` | uuid | omitted when no drill-down open |

Reload, share, and back-button navigation reproduce the same filter / sort / page / drill-down state.

#### BR-Pagination — server-side offset pagination

The list uses pace-core2 `DataTable` `serverSide` mode. The `fetchData` callback issues a Postgres query with `limit pageSize offset (pageIndex × pageSize)`. Default `pageSize = 25`; the size selector also offers 50. Total row count is read from a parallel `count: 'exact'` `head: true` query so the page footer shows "Page X of Y".

#### BR-RefreshSemantics — operator-driven refresh only

The list refetches on hard-navigation (TanStack Query's normal mount behaviour) and when the operator clicks the toolbar Refresh button. The slice does NOT subscribe to Supabase Realtime, does NOT poll, and does NOT refetch on window focus (`refetchOnWindowFocus = false` is inherited from PUMP-01's `<QueryClientProvider>` defaults).

#### BR-FetchError — list query failure

When the list query fails (network, RLS rejection, RPC error), the table area renders an error panel with copy "Couldn't load communications." and a Retry button that re-runs the query. A `variant="destructive"` toast carries the underlying error's `message` at the same time. The slice does not implement a Postgres-error-code-to-friendly-copy mapping; the error message is surfaced as-is.

#### BR-EmptyState — empty state copy and CTA

When the list query succeeds with zero rows under the active filters, the table area renders an inline panel: copy "No messages yet — start one to see it here." and (when `useCommRbacContext().canCompose` is true) a "Compose" `Button` below the copy. When `canCompose` is false, the copy alone is shown.

#### BR-ComposeCTA — Compose CTA gate

The header-row "New message" `Button` and the empty-state "Compose" `Button` are gated by `useCommRbacContext().canCompose`. The provider PUMP-01 mounts derives this boolean from `useCan('create:page.CommsLog', { organisationId })`. Both buttons navigate to `/comms/create` when clicked.

#### BR-DrillDownTrigger — row click opens drill-down

Clicking anywhere on a row outside the Actions column opens the drill-down `Dialog`. Pressing Enter on a focused row achieves the same outcome (accessibility). Clicking inside the Actions column does not open the drill-down — the kebab menu owns that region.

#### BR-DrillDown — drill-down URL contract

The drill-down's open / closed state is bound to the URL query param `?message=<id>`. Setting the param opens the dialog; clearing it closes the dialog. URL navigation that adds or removes the param drives the dialog without component-internal state. Closing the dialog clears the param via `navigate({ search: '<remaining filters>' })` while leaving any non-message filter params (channel, status, from, to, pageIndex, pageSize, sortDir) intact.

#### BR-DrillDownContent — drill-down dialog content layout

The dialog content is structured top to bottom:

1. **Header.** Channel `Badge` + subject text (or "SMS message" for sms) + status `Badge` on a single row. Below it, secondary text: `Source: <source_app>` line; `Created <created_at>` line; `Scheduled <scheduled_at>` line (only when non-null); `Sent <sent_at>` line (only when non-null). All timestamps formatted as short date + time.
2. **Recipients section.** Heading "Recipients" then a table of `pump_message_recipient` rows for the message, ordered by `address` ASC. Columns: Address, Member, Status, Delivered at, Engagement (email only), Reason (only when status is `failed`/`bounced`/`suppression_skipped`).
3. **Delivery events section.** Heading "Delivery events" then a chronological list of `pump_delivery_event` rows for the message's recipients, ordered by `occurred_at` ASC. Each row shows timestamp, recipient address, event type, gateway, optional failure reason.

#### BR-RecipientList — recipient list cell rules

| Column | Source | Notes |
|---|---|---|
| Address | `pump_message_recipient.address` | Plain text |
| Member | joined `core_member.full_name` when `member_id` non-null | Blank when `member_id` is null (ad-hoc address) |
| Status | `pump_message_recipient.status` | Renders as `Badge` per BR-RecipientStatusBadge |
| Delivered at | `pump_message_recipient.delivered_at` | Short date + time; "—" when null |
| Engagement | `opened_at` and `clicked_at` | Two stacked lines for email rows ("Opened <time>" + "Clicked <time>"); "—" for sms rows |
| Reason | `failure_reason` | Rendered only when status ∈ `{ 'failed', 'bounced', 'suppression_skipped' }`; otherwise the cell is blank |

#### BR-RecipientStatusBadge — recipient status badge

Recipient-status badge maps the six `pump_recipient_status` values (and only these): `pending → outline-sec-muted "Pending"`, `queued → outline-main-muted "Queued"`, `delivered → solid-main-normal "Delivered"`, `bounced → solid-acc-strong "Bounced"`, `failed → solid-acc-strong "Failed"`, `suppression_skipped → outline-sec-muted "Skipped (suppressed)"`. The badge NEVER renders an `opened` or `clicked` value — engagement is tracked via the `opened_at` / `clicked_at` timestamps in the Engagement column.

#### BR-DeliveryTimeline — delivery-event timeline rules

Each timeline row shows: `occurred_at` (short date + time); recipient `address` (joined from `pump_message_recipient`); event type (`delivered | bounced | failed | opened | clicked | suppression_skipped`); gateway (`resend | twilio`); optional failure reason. The event-type set is the webhook-mapped set used by the `pump_delivery_event.event_type` column — it is broader than the `pump_recipient_status` enum (it includes `opened` and `clicked` while the recipient-status enum does not).

#### BR-EngagementDisplay — engagement appears in drill-down only

Engagement (open / click) is rendered in the drill-down via timestamp presence in the Recipients section's Engagement column and via `opened` / `clicked` events in the Delivery events section. There is no row-level engagement aggregate on the list — the "Opens / Clicks" column is intentionally absent in v1.

#### BR-MalformedDrillDownId — malformed `?message=<id>` handling

When `?message=<id>` is set and the value is either not a valid uuid format or resolves to no `pump_message` row under the operator's RLS, the drill-down dialog opens but the body renders an inline error state: "Message not found or not visible." Recipients and Delivery events sections do not render. The dialog has only the close affordance. No console error, no thrown error, no toast. Clearing `?message=<id>` via the close button restores normal list view.

### B. Row actions

#### BR-CancelEligibility — when the Cancel row action shows

The Cancel row action is shown when:

- the row's `status === 'scheduled'` AND
- the row's `organisation_id === selectedOrganisation.id` (always true under RLS) AND
- one of: `user.id === row.created_by` (caller authored the message) **OR** `useCan('update:page.CommsLog', { organisationId })` resolves true (caller is an admin).

The OR rule mirrors the architecture's "caller is `created_by` OR holds `update:page.CommsLog`" framing.

#### BR-CancelAuthorisation — Edge enforces the same OR rule

The `pump-cancel` Edge function applies the same OR rule as the SPA-side visibility — author OR admin, in same org. Edge enforcement is the security backstop; an operator who manipulates the SPA to send an unauthorised cancel request receives `error.code = 'PUMP_CANCEL_OWNER_MISMATCH'` or `PUMP_RBAC_DENIED` from the Edge. The pace-core2 `pumpCancel` helper, in its present form, encodes AND (admin AND author); it must be patched to OR (admin OR author) before PUMP-02B build merges. Tracked in §15 build prerequisites and §17 platform follow-ups.

#### BR-CancelInvoke — cancel invocation contract

Cancel calls:

```
secureSupabase.functions.invoke('pump-cancel', {
  body: { messageId: row.id, organisationId: selectedOrganisation.id }
})
```

Response shape: `ApiResult<{ message_id: string }>` (`{ ok: true, data: { message_id } }` or `{ ok: false, error: { code, message } }`). The slice does not invoke `pumpCancel` from `@solvera/pace-core/comms/edge-service` directly — that helper is the server-side implementation, not an SPA-callable function. The slice does not extend `CommSendAdapter` with a `cancel` method (the adapter interface does not include one in v1).

#### BR-CancelConfirm — Cancel requires a confirmation dialog

Cancel is gated by a pace-core2 `Dialog` confirmation. Body copy: "Cancel this scheduled message? It will not send." Primary button "Cancel message" `variant="destructive"`; secondary button "Keep scheduled" `variant="outline"`. Default focus is on "Keep scheduled". Only the primary button issues the Edge invoke.

#### BR-CancelMutation — cancel success behaviour

On Edge success (`{ ok: true, data: { message_id } }`):

1. The confirmation dialog closes.
2. The list query (`['pumpMessages', organisationId, filters, sort, page]`) is invalidated and refetches; the row's status reads `cancelled` on the next render.
3. A `variant="success"` toast reads "Message cancelled."

The slice does not apply an optimistic update — the row's status flip waits on the refetch. (This is intentional: it lets the Edge's authoritative status appear without an out-of-sync optimistic state.)

#### BR-CancelFailure — cancel error mapping

| `error.code` | Toast variant | Toast copy | Refetch list |
|---|---|---|---|
| `PUMP_CANCEL_INVALID_STATUS` | `destructive` | Edge `error.message` ("Only scheduled messages can be cancelled.") | Yes |
| `PUMP_RBAC_DENIED` | `destructive` | Edge `error.message` ("Not permitted to cancel this message.") | No |
| `PUMP_CANCEL_OWNER_MISMATCH` | `destructive` | Edge `error.message` ("Only the creator can cancel this message.") | No |
| `PUMP_CANCEL_FAILED` (or any other code) | `destructive` | Edge `error.message` (or "Cancel failed." when `error.message` empty) | No |
| network / `invoke` throws | `destructive` | "Couldn't reach the cancel service." | No |

The confirmation dialog closes on every failure path.

#### BR-CancelRace — cancel race against `sending`

If the row's `status` transitions from `scheduled` to `sending` between the operator's confirmation click and the Edge's authorisation check, the Edge returns `PUMP_CANCEL_INVALID_STATUS`. The SPA closes the dialog, fires the `destructive` toast with the Edge message, and refetches the list so the new status is visible immediately.

#### BR-DeleteVisibility — when the Delete row action shows

The Delete row action is shown when, and only when:

- the row's `status === 'draft'` AND
- `user.id === row.created_by` (caller is the draft's author) AND
- `useCan('delete:page.CommsLog', { organisationId })` resolves true.

Admins (`update:page.CommsLog` plus `delete:page.CommsLog`) do NOT see Delete on others' drafts in v1. The dev-db RLS policy `rbac_delete_pump_message` is permissive on the author dimension (admins could delete by direct DML), but the SELECT split makes others' drafts invisible to admins anyway, so the SPA-side restriction does not introduce a new gate; it just makes the UX honest.

#### BR-DeleteIsDelete — Delete is a real DELETE

The Delete row action issues:

```
DELETE FROM pump_message
WHERE id = $1
  AND status = 'draft'
  AND created_by = auth.uid()
RETURNING id
```

through `useSecureSupabase()`. RLS gate `rbac_delete_pump_message` (`delete:page.CommsLog`) is the platform authorisation; the SPA-side `status` and `created_by` predicates are the v1 own-drafts-only restriction. The slice does NOT introduce a "discard draft" or "cancel draft" workflow as an alternative — Delete is a real DELETE.

#### BR-DeleteConfirm — Delete requires a confirmation dialog

Delete is gated by a pace-core2 `Dialog` confirmation. Body copy: "Delete this draft? This cannot be undone." Primary button "Delete draft" `variant="destructive"`; secondary button "Cancel" `variant="outline"`. Default focus is on "Cancel". Only the primary button issues the DELETE.

#### BR-DeleteMutation — delete success behaviour

On success returning one row:

1. The confirmation dialog closes.
2. The list query is invalidated and refetches; the row no longer renders.
3. A `variant="success"` toast reads "Draft deleted."

#### BR-DeleteRace — delete race on already-deleted draft

When the DELETE returns zero rows (the draft was already deleted in another tab; or status changed; or the row's `created_by` differs from `auth.uid()` — though the SPA-side visibility makes the third case unreachable), the SPA treats this as a benign concurrency outcome:

1. The confirmation dialog closes.
2. The list query refetches.
3. A `variant="default"` toast reads "Draft already removed."

No error treatment; no destructive toast.

#### BR-DeleteFailure — delete error handling

When the DELETE call fails (network, RLS rejection, Postgres error):

1. The confirmation dialog closes.
2. A `variant="destructive"` toast carries the underlying error's `message`.
3. The list does NOT refetch (the row state is correct — the draft is still there).

---

## 7. API / Contract

### Public exports

PUMP-02 publishes no cross-slice TypeScript exports. Other slices do not consume PUMP-02's hooks or row-shape types directly.

### Read contract

- **List query.** Direct `SELECT id, organisation_id, channel, subject, body_text, status, scheduled_at, sent_at, source_app, total_recipients, created_by, created_at FROM pump_message WHERE organisation_id = $1 [filter predicates] ORDER BY (sent_at NULLS LAST, created_at, id) [sortDir] LIMIT $2 OFFSET $3`. Filter predicates: optional `channel = $`, optional `status IN (...)`, optional `coalesce(sent_at, scheduled_at, created_at) BETWEEN $from AND $to`. Run through `useSecureSupabase()`. RLS gate: split SELECT policies on `pump_message`.
- **List count.** Parallel `SELECT count(*) FROM pump_message WHERE organisation_id = $1 [filter predicates]` (issued via Supabase client `.select('id', { count: 'exact', head: true })`) for total-row count rendered in pagination footer.
- **Drill-down message fetch.** Direct `SELECT * FROM pump_message WHERE id = $1` to populate the dialog header. RLS gate: same SELECT policies as the list query.
- **Drill-down recipients.** Direct `SELECT id, message_id, member_id, address, status, delivered_at, opened_at, clicked_at, failed_at, failure_reason FROM pump_message_recipient WHERE message_id = $1 ORDER BY address ASC`, joined to `core_member` for `full_name` (left join on `member_id`). RLS gate: `rbac_select_pump_message_recipient` (`read:page.CommsLog`).
- **Drill-down delivery events.** Direct `SELECT id, recipient_id, event_type, gateway, occurred_at, raw_payload FROM pump_delivery_event WHERE recipient_id IN (SELECT id FROM pump_message_recipient WHERE message_id = $1) ORDER BY occurred_at ASC`. RLS gate: `rbac_select_pump_delivery_event` (joined through recipient → `read:page.CommsLog`).

### Write contract

- **Cancel scheduled (B).** Edge invocation `pump-cancel`. Request body: `{ messageId: uuid, organisationId: uuid }`. Response: `ApiResult<{ message_id: string }>` — success returns `{ ok: true, data: { message_id } }`; failure returns `{ ok: false, error: { code, message } }` with `error.code` ∈ `{ 'PUMP_CANCEL_INVALID_STATUS', 'PUMP_RBAC_DENIED', 'PUMP_CANCEL_OWNER_MISMATCH', 'PUMP_CANCEL_FAILED' }`. Edge enforcement applies the OR rule — caller in same org AND (caller is `created_by` OR caller has `update:page.CommsLog`).
- **Delete own draft (B).** Direct `DELETE FROM pump_message WHERE id = $1 AND status = 'draft' AND created_by = auth.uid() RETURNING id`. Returns 1 row on success, 0 rows on benign race. RLS gate: `rbac_delete_pump_message` (`delete:page.CommsLog`).

PUMP-02 issues no UPDATE statements against `pump_message`. Compose / send-time updates belong to PUMP-05; status flips during sending are owned by the Edge functions in PUMP-05 and PUMP-06.

### RLS / permission contracts

| Table / function | Operation | Policy / authorisation | Required RBAC |
|---|---|---|---|
| `pump_message` | SELECT (non-draft) | `rbac_select_nondraft_pump_message` | `read:page.CommsLog` |
| `pump_message` | SELECT (own drafts) | `rbac_select_own_drafts_pump_message` | `read:page.CommsLog` AND `created_by = effective_user_id` |
| `pump_message` | DELETE | `rbac_delete_pump_message` | `delete:page.CommsLog` |
| `pump_message_recipient` | SELECT | `rbac_select_pump_message_recipient` | `read:page.CommsLog` |
| `pump_delivery_event` | SELECT | `rbac_select_pump_delivery_event` | `read:page.CommsLog` (via recipient join) |
| `pump-cancel` Edge | INVOKE | Edge-internal authorisation | same-org AND (`created_by` OR `update:page.CommsLog`) |

All RLS policies resolve via `check_rbac_permission_with_context(<op>, 'CommsLog', organisation_id, NULL::text, get_app_id('PUMP'))`.

### URL contract

URL state on `/`:

| Param | Type | Default |
|---|---|---|
| `channel` | `'email' \| 'sms'` | omitted (means "all") |
| `status` | comma-separated subset of `'draft' \| 'scheduled' \| 'sending' \| 'sent' \| 'cancelled' \| 'failed'` | omitted (means "all") |
| `from` | `YYYY-MM-DD` | omitted |
| `to` | `YYYY-MM-DD` | omitted |
| `pageIndex` | non-negative integer | `0` |
| `pageSize` | `25 \| 50` | `25` |
| `sortDir` | `'asc' \| 'desc'` | `'desc'` |
| `message` | uuid | omitted (drill-down closed) |

`message` composes with the other params; e.g. `?status=scheduled&message=<uuid>` opens the drill-down for `<uuid>` while leaving the scheduled-only filter intact.

### Cross-slice handoffs

| Hand to / from | Contract |
|---|---|
| **PUMP-01 → PUMP-02** | PUMP-01 owns the route table, the page guard mount on `/`, the `<ToastProvider>` mount, and the `<CommRbacContextProvider>` mount. PUMP-02 consumes the route slot, `toast` (module-level), and `useCommRbacContext()` from PUMP-01's local provider. |
| **PUMP-02 → PUMP-05** | PUMP-02 navigates to `/comms/create` from the Compose CTAs (header and empty state). No state is handed across the navigation boundary; PUMP-05 starts with its own empty compose draft. |
| **PUMP-05 → PUMP-02** | Drafts persisted by PUMP-05's `saveDraft` flow appear in PUMP-02's list under the author's own-drafts visibility once they exist on `pump_message`. PUMP-02 does not subscribe to PUMP-05's events; visibility is hard-navigation refresh + the toolbar Refresh button. |
| **PUMP-06 → PUMP-02** | Delivery events written by PUMP-06's webhook ingestion appear in PUMP-02's drill-down delivery-event timeline; recipient-status updates appear in the Recipients section. PUMP-02 reads on demand (drill-down open + refresh). |

### ID contracts

- `pump_message.id` is `uuid`; `organisation_id` is `uuid` from the active organisation.
- `pump_message_recipient.id` is `uuid`; `member_id` is `uuid` joining to `core_member.id`.
- `pump_delivery_event.id` is `uuid`; `recipient_id` is `uuid` joining to `pump_message_recipient.id`.

All IDs are server-generated `gen_random_uuid()`. PUMP-02 does not synthesise IDs.

---

## 8. Data and schema references

### Tables

- **`pump_message`** (FORCE RLS) — message envelope. Column shape per platform-snapshot-2026-05-07 lines 30–61. Columns consumed by PUMP-02: `id`, `organisation_id`, `channel`, `subject`, `body_text`, `status`, `scheduled_at`, `sent_at`, `source_app`, `total_recipients`, `created_by`, `created_at`. (`body_html`, `template_id`, `system_key`, `system_recipient`, `sender_*`, `reply_to_email`, `recipient_pool_descriptor`, `extra_merge_context`, `bypass_suppression`, `source_context_*`, `updated_at` are not consumed.)
- **`pump_message_recipient`** (FORCE RLS) — per-recipient row. Column shape per platform-snapshot-2026-05-07 lines 63–82. Columns consumed: `id`, `message_id`, `member_id`, `address`, `status`, `delivered_at`, `opened_at`, `clicked_at`, `failed_at`, `failure_reason`. Joined to `core_member` for `full_name` only.
- **`pump_delivery_event`** (FORCE RLS) — webhook-driven event log. Column shape per platform-snapshot-2026-05-07 lines 84–98. Columns consumed: `id`, `recipient_id`, `event_type`, `gateway`, `occurred_at`, `raw_payload`.
- **`core_member`** — joined for `full_name` in the drill-down recipient list when `pump_message_recipient.member_id` is non-null.

### RPCs

- **None directly invoked by PUMP-02.** The RBAC predicate `check_rbac_permission_with_context` is invoked by RLS policies, not by application code.

### Edge functions

- **`pump-cancel`** (PUMP-02B only). Path `/functions/v1/pump-cancel` on the dev-db Supabase project. NOT yet deployed on dev-db (per platform-snapshot-2026-05-07 lines 297–301). PUMP-02B authors against the CR23 contract; build is gated on Edge deployment (see §15).

### Verifications against dev-db

Verify against project `rkytnffgmwnnmewevqgp` (per global operating rules → Dev-db reference):

1. `pump_message` exists with the column shape in §3 and platform-snapshot-2026-05-07 lines 30–61.
2. The seven RLS policies on `pump_message` (`service_role_*`, `rbac_select_nondraft_*`, `rbac_select_own_drafts_*`, `rbac_insert_*`, `rbac_draft_owner_update_*`, `rbac_update_*`, `rbac_delete_*`) are present and resolve via `check_rbac_permission_with_context`.
3. `pump_message_recipient` exists with the column shape in platform-snapshot-2026-05-07 lines 63–82, including `delivered_at`, `opened_at`, `clicked_at`, `failed_at`, `failure_reason`, and the `pump_recipient_status` enum has six values (no `opened`/`clicked`).
4. `pump_delivery_event` exists with the column shape in platform-snapshot-2026-05-07 lines 84–98, including the unique `(gateway, dedupe_key)` index.
5. The `CommsLog` page is registered in `rbac_app_pages` for the PUMP app.
6. The `pump_message_status` enum has six values: `draft`, `scheduled`, `sending`, `sent`, `cancelled`, `failed`.
7. (PUMP-02B build prerequisite) `pump-cancel` Edge function is deployed and reachable.

### Domain / decision references

- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — comms-platform contract; defines the message and recipient shapes consumed.
- [`pump-architecture.md`](./pump-architecture.md) § "RBAC model (PUMP management app)" and § "Information architecture — home (`/`)".
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md) (verify live dev-db via Supabase MCP) — live dev-db state and pace-core2 export map at slice-doc time.

---

## 9. pace-core2 imports

### 9.1 Imports table

| Symbol | Import path | One-line why |
|---|---|---|
| `DataTable`, `DataTableColumn`, `DataTableRBACConfig` | `@solvera/pace-core/components` | Communications log list table (server-side mode). |
| `Badge` | `@solvera/pace-core/components` | Channel / status / recipient-status badges. |
| `Button` | `@solvera/pace-core/components` | Header CTA, toolbar Refresh, dialog footer buttons, retry buttons. |
| `Card` | `@solvera/pace-core/components` | Drill-down sub-section chrome. |
| `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` | `@solvera/pace-core/components` | Channel filter (single-select). |
| `MultiSelect` | `@solvera/pace-core/components` | Status filter (multi-value chip trigger + checkbox-list dropdown over the six `pump_message_status` values). |
| `DatePickerWithTimezone` | `@solvera/pace-core/components` | Date "From" / "To" inputs in the toolbar; timezone-aware so a filter spanning UTC offsets resolves predictably. |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogFooter`, `DialogClose` | `@solvera/pace-core/components` | Drill-down, cancel-confirm, delete-confirm modal surfaces. |
| `AccessDenied` | `@solvera/pace-core/rbac` | Default fallback rendered by PUMP-01's page guard (PUMP-02 does not mount it directly; relevant to the inherited behaviour). |
| `useCan` | `@solvera/pace-core/rbac` | Action-level RBAC for the Cancel row action's admin path; gating Delete row action visibility. |
| `useSecureSupabase` | `@solvera/pace-core/rbac` | Auth-bound Supabase client for list / drill-down queries, draft DELETE, and Edge `pump-cancel` invocation. |
| `useUnifiedAuth` | `@solvera/pace-core/hooks` | Source of `selectedOrganisation.id` and `user.id`. |
| `toast` | `@solvera/pace-core/components` | Module-level fire-and-forget toasts (`'default' \| 'destructive' \| 'success'`). |
| `CommChannel`, `CommMessageStatus`, `CommRecipientStatus` | `@solvera/pace-core/comms` (types) | TypeScript shapes for the row, filter values, and status enums. |
| `useCommRbacContext` | **app-local** (PUMP-01's `<CommRbacContextProvider>`; not in pace-core2) | Compose CTA gate (`canCompose`). pace-core2 publishes only the `CommRbacContext` type today; PUMP-01 mounts the runtime provider/hook. PUMP-02 imports from PUMP-01's local module path, not from `@solvera/pace-core/comms`. |
| `Mail`, `Phone`, `Plus`, `MoreHorizontal`, `RefreshCcw`, `ArrowUp`, `ArrowDown`, `X` | `lucide-react` (direct) for `Mail`, `Phone`, `RefreshCcw`, `MoreHorizontal`; `@solvera/pace-core/icons` for `Plus`, `ArrowUp`, `ArrowDown`, `X` | Icon set. `Mail` / `Phone` / `RefreshCcw` / `MoreHorizontal` are not in the pace-core2 icon barrel (per platform-snapshot-2026-05-07 line 102), so they are imported from `lucide-react` directly. |

### 9.2 Slice-specific caveats

- **`DataTable` server-side mode.** PUMP-02 wires `serverSide={{ fetchData, enableServerSorting: true }}` and consumes `pageIndex`, `pageSize`, `sorting` via the callback. The slice owns the toolbar above the DataTable; the DataTable's built-in Search, Filter, Create, Export, Import features are disabled. `rbac` prop is `{ pageName: 'CommsLog' }` — pace-core2 internally derives operation context for row-action gating, but PUMP-02's row-action gating is calculated externally via `useCan` and the row's `created_by` because the OR rule is custom.
- **`Dialog` URL binding.** The drill-down dialog's `open` is bound to `useSearchParams().get('message')` (truthy → open, null → closed). `onOpenChange(false)` calls `navigate({ search: '<remaining filters>' })` so closing the dialog clears `?message=<id>` while leaving the rest of the URL state intact.
- **`useCommRbacContext` consumption.** PUMP-02 imports the hook from PUMP-01's local provider module (the import path is the PUMP-01 component file — PUMP-02 does NOT import from `@solvera/pace-core/comms`). Reading the hook returns `{ canCompose, canSend, canSchedule }`; PUMP-02 consumes `canCompose` only. If pace-core2 later publishes the runtime provider/hook, PUMP-01's local fallback is retired and the import path moves to `@solvera/pace-core/comms` — PUMP-02's consumption pattern is unchanged.
- **`useSecureSupabase` invocation.** PUMP-02 calls `useSecureSupabase()` without arguments — pace-core2 resolves the underlying client internally. The returned client is used for both the table reads (list, recipient list, delivery events) and the draft DELETE; it is also used as the surface for `secureSupabase.functions.invoke('pump-cancel', ...)`.
- **`pumpCancel` helper is NOT called.** PUMP-02 does NOT import or call `pumpCancel` from `@solvera/pace-core/comms/edge-service`. That function is the server-side implementation of the `pump-cancel` Edge handler; the SPA path is the HTTP invocation through `secureSupabase.functions.invoke(...)`.
- **No `CommSendAdapter` context required.** PUMP-02 does not consume `useCommSendAdapter`. The adapter is PUMP-05's concern (compose / send / schedule / save-draft). PUMP-02's reads go through `useSecureSupabase()` directly; PUMP-02's cancel goes through `secureSupabase.functions.invoke('pump-cancel', ...)`.
- **No app-local Tooltip primitives.** pace-core2 does not export `Tooltip` / `TooltipProvider` from `@solvera/pace-core/components` (capability gap verified during PUMP-04 conversion). PUMP-02 must not introduce app-local tooltip primitives. Hover help / explanatory copy is delivered via inline labels, accessible `aria-label` attributes, and surface-level helper copy.

---

## 10. Permission and access rules

### A. Read path

#### Page-level access (A)

`<PagePermissionGuard pageName="CommsLog" operation="read">` wraps the `/` route. PUMP-01 owns the mount; PUMP-02 inherits the gate. Default fallback: `<AccessDenied />`. Scope passed by PUMP-01 is resolved internally from `<OrganisationServiceProvider>`. Loading state renders `null` (no `loading` prop is supplied).

#### Action-level access (A)

| Action | Permission gate | Visible / enabled when |
|---|---|---|
| List view / Filter toolbar / Pagination / Sort / Refresh | `read:page.CommsLog` (gated by the page guard) | Always once the route content renders. |
| Drill-down open (row click) | `read:page.CommsLog` (same gate) | Always once the route content renders. |
| Compose CTA (header) | `useCommRbacContext().canCompose` | True. |
| Compose CTA (empty state) | `useCommRbacContext().canCompose` | True. |

#### Role × action matrix (A)

| Role / capability | Read list | Drill-down | Compose CTA |
|---|---|---|---|
| No PUMP grants | No (`AccessDenied`) | No | n/a |
| `read:page.CommsLog` only | Yes (non-draft rows + own drafts) | Yes | Hidden |
| `read` + `create:page.CommsLog` | Yes | Yes | Visible |
| `read` + `update:page.CommsLog` | Yes (non-draft + own drafts) | Yes | Hidden |
| `read` + `update` + `create` | Yes | Yes | Visible |

### B. Row actions

#### Action-level access (B)

| Action | Permission gate | Visible / enabled when |
|---|---|---|
| Cancel row action | (`user.id === row.created_by`) OR `useCan('update:page.CommsLog', { organisationId })` | True AND row is `status === 'scheduled'`. |
| Delete row action | `user.id === row.created_by` AND `useCan('delete:page.CommsLog', { organisationId })` | True AND row is `status === 'draft'`. |

#### Role × action matrix (B)

| Role / capability | Cancel scheduled (own) | Cancel scheduled (others') | Delete own draft | Delete others' drafts |
|---|---|---|---|---|
| `read` only | No (button hidden) | No (button hidden) | No (button hidden) | No (button hidden + row invisible via SELECT split) |
| `read` + `update:page.CommsLog` | Yes | Yes | No | No (row invisible) |
| `read` + `delete:page.CommsLog` | No | No | Yes | No (button hidden by SPA-side own-drafts restriction) |
| `read` + `update` + `delete` | Yes | Yes | Yes | No (button hidden by SPA-side own-drafts restriction; admin-delete-others'-drafts is intentionally not exposed in v1) |

#### Edge enforcement (B)

`pump-cancel` Edge applies the OR rule (caller in same org AND (`created_by` OR `update:page.CommsLog`)) regardless of SPA-side visibility. An operator who manipulates the SPA to send an unauthorised cancel request receives `PUMP_CANCEL_OWNER_MISMATCH` or `PUMP_RBAC_DENIED`. The pace-core2 `pumpCancel` helper requires patching from AND to OR before PUMP-02B build merges (build prerequisite — see §15).

#### Proxy / impersonation

Standard PDLC proxy rules apply. PUMP-02 does not introduce a slice-specific proxy rule.

---

## 11. Acceptance criteria

### A. Read path

1. **Given** an authenticated operator with `read:page.CommsLog` and at least one non-draft `pump_message` row in their organisation, **when** they navigate to `/`, **then** the list view renders the six-column DataTable with one row per visible message, sorted by `(sent_at NULLS LAST, created_at, id)` DESC. (Traces §4 items 1–4, 14–24.)
2. **Given** an operator with `read:page.CommsLog` and zero `pump_message` rows in their organisation under the active filters, **when** they navigate to `/`, **then** the inline empty-state panel renders with copy "No messages yet — start one to see it here." (Traces §4 items 8–9.)
3. **Given** an operator with `read:page.CommsLog` and `useCommRbacContext().canCompose === true` viewing the empty state, **when** the panel renders, **then** the panel includes a "Compose" `Button` that navigates to `/comms/create` on click. (Traces §4 item 9.)
4. **Given** an operator without `read:page.CommsLog`, **when** they navigate to `/`, **then** the route renders `<AccessDenied />` (rendered by PUMP-01's guard) instead of any PUMP-02 content. (Traces §4 item 1; §10A page-level access.)
5. **Given** an operator with `read:page.CommsLog` viewing the list, **when** they click the Channel filter and select "Email", **then** the URL updates to include `?channel=email`, the list query re-runs with `channel = 'email'` predicate, only email rows remain, and `pageIndex` resets to 0. (Traces §4 items 25–28; §6 BR-Filters, BR-FilterPersistence.)
6. **Given** an operator with `read:page.CommsLog` viewing the list, **when** they pick a Date range "From = 2026-04-01, To = 2026-05-01", **then** the URL updates to include `?from=2026-04-01&to=2026-05-01`, the list query re-runs filtering on `coalesce(sent_at, scheduled_at, created_at)` between the two inclusive bounds, and the result rows fall within the range. (Traces §4 items 25–28; §6 BR-FilterDateDimension.)
7. **Given** an operator with `read:page.CommsLog` viewing a list with more than 25 rows, **when** they click the second pagination page, **then** the URL updates to `?pageIndex=1`, the list re-runs with offset = `pageSize`, and rows 26–50 render. The pagination footer shows "Page 2 of <Y>". (Traces §4 item 24; §6 BR-Pagination.)
8. **Given** an operator viewing the list, **when** they click the Date column header, **then** the sort direction toggles (`?sortDir=asc`), the list re-runs in ASC order, and the rows render oldest-first. Clicking again returns to DESC. (Traces §4 item 23; §6 BR-ColumnSort.)
9. **Given** an operator clicks anywhere on a non-Actions cell of a row whose id is `<uuid>`, **when** the dialog opens, **then** the URL updates to include `?message=<uuid>`, the drill-down dialog renders the row's header, recipient list, and delivery-event timeline. Pressing Escape closes the dialog and clears `?message=<uuid>` from the URL while leaving any active filter params intact. (Traces §4 items 30–36; §6 BR-DrillDown, BR-DrillDownContent.)
10. **Given** an operator pastes `/?message=<uuid>` into the address bar with `<uuid>` resolving to a `pump_message` row in their organisation, **when** the page mounts, **then** the list and the drill-down dialog both render — the list shows the un-filtered first page; the dialog shows the message detail. (Traces §4 item 31; §6 BR-DrillDown.)
11. **Given** an operator pastes `/?message=not-a-real-id` into the address bar, **when** the page mounts, **then** the list renders normally and the drill-down dialog opens but renders the inline error state "Message not found or not visible." with no recipient or event sections. (Traces §4 item 13; §6 BR-MalformedDrillDownId.)
12. **Given** the list query fails (e.g. RLS rejection or network error), **when** the failure surfaces, **then** the table area shows the error panel with copy "Couldn't load communications." and a Retry button, and a `variant="destructive"` toast carries the underlying error message. (Traces §4 item 11; §6 BR-FetchError.)
13. **Given** the list contains rows authored by another operator with `status = 'draft'`, **when** the list renders, **then** those drafts do not appear (the SELECT split makes them invisible) regardless of the operator's `read:page.CommsLog` grant. (Traces §6 BR-DraftVisibility.)
14. **Given** a row with `status = 'draft'` authored by the authenticated user, **when** the list renders, **then** the row is visible with status badge "Draft" (variant `outline-sec-muted`), the Date column shows the `created_at` value (since `sent_at` and `scheduled_at` are null), and the Recipients cell shows "—" with `aria-label="Pool not yet resolved"` if `total_recipients` is null. (Traces §4 items 17–20; §6 BR-DateColumn, BR-RecipientCount, BR-StatusBadge.)
15. **Given** an open drill-down for a message with three recipients including one bounced, **when** the recipient query resolves, **then** the Recipients section renders three rows with the bounced row's Status badge using `solid-acc-strong` variant ("Bounced") and the `failure_reason` cell populated. (Traces §4 item 34; §6 BR-RecipientList, BR-RecipientStatusBadge.)
16. **Given** an operator clicks the Refresh icon button, **when** the click fires, **then** the list query refetches (the icon button briefly disables during the in-flight state) and the open drill-down's queries are invalidated such that the next reopen refetches them. (Traces §4 item 29; §6 BR-RefreshSemantics.)

### B. Row actions

17. **Given** an operator who is the author of a `pump_message` row with `status = 'scheduled'`, **when** the list renders, **then** the row's Actions kebab menu contains a Cancel item; clicking Cancel opens the cancel confirmation dialog with copy "Cancel this scheduled message? It will not send." (Traces §4 items 39, 48–49; §6 BR-CancelEligibility, BR-CancelConfirm.)
18. **Given** an admin (`update:page.CommsLog`) viewing a scheduled message authored by another operator in the same org, **when** the list renders, **then** the row's Actions kebab menu contains the Cancel item; clicking it opens the cancel confirmation dialog. (Traces §4 item 39; §6 BR-CancelEligibility.)
19. **Given** an operator clicks "Cancel message" in the cancel confirmation dialog, **when** the Edge returns `{ ok: true, data: { message_id } }`, **then** the dialog closes, the list refetches, the row's status now reads `Cancelled`, and a `variant="success"` toast reads "Message cancelled." (Traces §4 item 52; §6 BR-CancelMutation.)
20. **Given** an operator clicks "Cancel message" and the Edge returns `{ ok: false, error: { code: 'PUMP_CANCEL_INVALID_STATUS', message: 'Only scheduled messages can be cancelled.' } }`, **when** the response surfaces, **then** the dialog closes, a `variant="destructive"` toast reads "Only scheduled messages can be cancelled.", and the list refetches. (Traces §4 item 53; §6 BR-CancelFailure.)
21. **Given** an operator clicks "Cancel message" and the network throws, **when** the failure surfaces, **then** the dialog closes and a `variant="destructive"` toast reads "Couldn't reach the cancel service." (Traces §4 item 57; §6 BR-CancelFailure.)
22. **Given** the operator is the author of a `pump_message` row with `status = 'draft'` AND holds `delete:page.CommsLog`, **when** the list renders, **then** the row's Actions kebab menu contains a Delete item; clicking it opens the delete confirmation dialog with copy "Delete this draft? This cannot be undone." (Traces §4 items 40, 58–59; §6 BR-DeleteVisibility, BR-DeleteConfirm.)
23. **Given** an admin with `update:page.CommsLog` + `delete:page.CommsLog` viewing the list, **when** the list renders, **then** no row authored by another operator shows the Delete action (the SELECT split makes others' drafts invisible to admins, and even if a row were visible the SPA-side restriction would hide Delete). (Traces §6 BR-DeleteVisibility.)
24. **Given** an operator clicks "Delete draft" in the delete confirmation dialog, **when** the DELETE returns one row, **then** the dialog closes, the list refetches, the row no longer renders, and a `variant="success"` toast reads "Draft deleted." (Traces §4 item 62; §6 BR-DeleteMutation.)
25. **Given** an operator clicks "Delete draft" and the DELETE returns zero rows (the draft was already removed in another tab), **when** the response resolves, **then** the dialog closes, the list refetches, and a `variant="default"` toast reads "Draft already removed." No destructive toast appears. (Traces §4 item 63; §6 BR-DeleteRace.)
26. **Given** an operator clicks "Delete draft" and the DELETE fails with an RLS rejection, **when** the failure surfaces, **then** the dialog closes, the list does not refetch, and a `variant="destructive"` toast carries the underlying error message. (Traces §4 item 64; §6 BR-DeleteFailure.)

---

## 12. Verification

### A. Read path

1. **Live RLS — non-draft visibility.** As an authenticated operator with `read:page.CommsLog`, query `SELECT count(*) FROM pump_message WHERE organisation_id = '<their-org>'::uuid AND status = 'sent'` directly via `useSecureSupabase()`. Confirm the count matches the count of `sent` rows in dev-db for that org.
2. **Live RLS — draft visibility split.** As operator A, INSERT a draft row authored by operator B (via service role). Then as operator A, query `SELECT count(*) FROM pump_message WHERE organisation_id = '<their-org>'::uuid AND status = 'draft'`. Confirm operator B's draft is NOT included in the count.
3. **Foreign-org isolation.** As an operator in org X, query `pump_message` filtered by `organisation_id = '<other-org>'::uuid`. Confirm zero rows returned regardless of actual row count in the other org.
4. **Initial sort stability.** Insert two messages within the same millisecond `created_at`. Confirm the list returns them in stable `id` ASC order under the same `(sent_at NULLS LAST, created_at, id)` DESC sort.
5. **Date filter dimension.** Filter the list with `from = 2026-04-01, to = 2026-04-30`. Confirm the result includes rows where `sent_at` falls in April, rows where `scheduled_at` falls in April (no `sent_at`), and rows where `created_at` falls in April (no `sent_at`, no `scheduled_at`).
6. **URL state round-trip.** Apply Channel = "Email", Status = "Scheduled,Failed", From = "2026-04-01", To = "2026-05-01", PageIndex = 2. Reload the page. Confirm the URL query state seeds the same filters and the second page renders.
7. **Drill-down query.** Open a drill-down on a message with five recipients. Confirm the Recipients section shows five rows ordered by address ASC. Confirm the Delivery events section shows the `pump_delivery_event` rows for those recipients ordered by `occurred_at` ASC.
8. **Engagement timestamps.** Open a drill-down on an email message whose recipients include `opened_at` and `clicked_at`. Confirm the Engagement column shows "Opened <time>" and "Clicked <time>"; confirm the Status badge does NOT show `Opened` or `Clicked` (those are not enum values).
9. **Malformed drill-down id.** Set `?message=abc` in the URL. Confirm the dialog opens and renders "Message not found or not visible." Confirm no console error appears.
10. **Refresh button.** With the list mounted, click Refresh. Confirm the list query refetches (network tab shows a new request) without changing the URL state.

### B. Row actions

11. **Cancel happy path.** As the author of a scheduled message, click Cancel and confirm. Inspect dev-db: confirm the row's `status` is now `cancelled`. Confirm the success toast appeared.
12. **Cancel by admin.** As an admin (not the author), click Cancel on a scheduled message authored by another operator in the same org. Confirm the Edge succeeds and the row's status becomes `cancelled`.
13. **Cancel race against `sending`.** Manually flip the row's `status` from `scheduled` to `sending` (via service role) between opening the confirm dialog and clicking "Cancel message". Confirm the Edge returns `PUMP_CANCEL_INVALID_STATUS`, the destructive toast surfaces, and the list refetches showing the new `sending` status.
14. **Delete happy path.** As the author of a draft, click Delete and confirm. Inspect dev-db: confirm the row is gone. Confirm the success toast appeared.
15. **Delete race on already-deleted draft.** Manually delete the draft in dev-db (via service role) between opening the confirm dialog and clicking "Delete draft". Confirm the SPA's DELETE returns 0 rows, the neutral toast "Draft already removed." appears, and the list refetches.
16. **Delete admin-delete restriction.** As an admin (`update:page.CommsLog` + `delete:page.CommsLog`), confirm the Delete action does not appear on any row authored by another operator (the SELECT split makes those rows invisible; the SPA-side `created_by` check makes the action hidden).

---

## 13. Testing requirements

### A. Read path

- **URL state ↔ list query consistency.** Test that toggling each filter writes the expected URL param, and that mounting `/` with each URL param shape applies the same filter to the list query (round-trip).
- **Sort toggle determinism.** Test that toggling the Date column from DESC to ASC and back produces the same row order both times.
- **Drill-down URL binding.** Test that opening a row sets `?message=<id>`; closing via Escape, close button, and overlay click all clear the param while leaving other filter params intact.
- **Malformed drill-down id.** Test that `?message=abc` and `?message=00000000-0000-0000-0000-000000000000` (valid uuid, non-existent row) both render the inline error state without throwing.

### B. Row actions

- **Cancel error-code mapping.** Test that each Edge error code (`PUMP_CANCEL_INVALID_STATUS`, `PUMP_RBAC_DENIED`, `PUMP_CANCEL_OWNER_MISMATCH`, `PUMP_CANCEL_FAILED`) and the network-throw case each produce the expected destructive toast and the expected refetch behaviour (refetch only on `PUMP_CANCEL_INVALID_STATUS`).
- **Cancel race detection.** Mock the Edge to return `PUMP_CANCEL_INVALID_STATUS` and assert the list refetches (the mocked refetch returns a row with `status: 'sending'`).
- **Delete benign-race.** Mock the DELETE to return zero rows and assert the neutral toast fires (not the destructive toast); assert the list refetches.

---

## 14. Build execution rules

- All `pump_message`, `pump_message_recipient`, and `pump_delivery_event` reads go via `useSecureSupabase()` against the post-p4 base tables. The slice does NOT call the legacy `pump_comms_log` reporting view. The slice does NOT call `useCommTemplates`, `useCommSendAdapter`, or any adapter-backed hook.
- The list query is a single direct `SELECT` against `pump_message`. The slice does NOT add `created_by = auth.uid() OR status != 'draft'` predicates of its own — the dev-db RLS split owns draft visibility.
- The `pump-cancel` Edge invocation goes via `secureSupabase.functions.invoke('pump-cancel', { body: ... })`. The slice does NOT import or call `pumpCancel` from `@solvera/pace-core/comms/edge-service` (server-side helper). The slice does NOT extend `CommSendAdapter` with a `cancel` method.
- The Delete mutation issues a direct `DELETE` against `pump_message` with both `status = 'draft'` and `created_by = auth.uid()` in the predicate (defensive — RLS only enforces `delete:page.CommsLog`).
- The slice does NOT introduce app-local Tooltip primitives. (pace-core2 capability gap; surface help via inline labels, `aria-label`, surface-level helper copy.)
- The slice does NOT mount `<PagePermissionGuard>`, `<ToastProvider>`, or `<CommRbacContextProvider>` — PUMP-01 owns those mounts.
- The slice does NOT subscribe to Supabase Realtime, does NOT poll, and does NOT refetch on window focus. Refresh semantics are per BR-RefreshSemantics.
- The slice does NOT introduce a "discard draft" or "cancel draft" workflow as an alternative to Delete. Delete is a real `DELETE`.

---

## 15. Done criteria

- All 26 acceptance criteria in §11 pass against dev-db.
- The DataTable renders six columns in the prescribed order at desktop, tablet, and mobile breakpoints; the mobile breakpoint correctly collapses the Subject preview cell to one line.
- The drill-down dialog opens, closes, and updates URL state per BR-DrillDown across all three close paths (close button, Escape, overlay click).
- The cancel and delete confirmation dialogs default focus to the secondary (non-destructive) button per the §5 specification.
- The status badge variants match BR-StatusBadge across all six values; the recipient-status badge matches BR-RecipientStatusBadge across all six recipient-status values.

### Build prerequisites (PUMP-02B only)

- **`pump-cancel` Edge function deployed to dev-db.** PUMP-02A may build and merge ahead of this prerequisite; PUMP-02B (cancel row action) cannot ship until the Edge function is reachable. Tracked in §17 platform follow-ups.
- **`pumpCancel` helper patched from AND to OR.** The pace-core2 `pumpCancel` helper at `../../../packages/core/src/comms/edge-service.ts` lines 577–586, in its present form, encodes "admin AND author"; the architecture's authorisation rule is "admin OR author". The helper must be patched before PUMP-02B build merges. The helper is build-time only — not yet deployed (see prior bullet) — so the patch can land before any operator hits the path.

---

## 16. Do not

- Do not re-mount `<PagePermissionGuard pageName="CommsLog" operation="read">` on `/`. PUMP-01 owns the mount.
- Do not mount `<ToastProvider>`. PUMP-01 owns the mount; import `toast` module-level.
- Do not mount `<CommRbacContextProvider>`. PUMP-01 owns the mount; import `useCommRbacContext` from PUMP-01's local provider module.
- Do not consult `pump_comms_log` (the legacy reporting view) for any list, drill-down, or count. Read against the post-p4 base tables only.
- Do not add `created_by = auth.uid() OR status != 'draft'` predicates to the list query. The dev-db RLS split enforces draft visibility; reimplementing the rule in the SPA causes silent inconsistency with admin reads.
- Do not introduce a search box on `/` in v1.
- Do not introduce a summary row of failed / scheduled / your-drafts counts at the top of `/` in v1. (Tracked as future enhancement in §17.)
- Do not introduce a `source_app` column on the list. `source_app` text appears inline in the drill-down dialog header only.
- Do not introduce row-level engagement aggregate columns (legacy "Opens / Clicks"). Engagement appears in the drill-down only.
- Do not show the Delete row action on non-draft rows.
- Do not show the Delete row action on other operators' drafts in v1, even when the user holds `delete:page.CommsLog`. (The SELECT split already hides those rows from admins, but the SPA-side `created_by` check is required defensively in case the policy changes.)
- Do not surface `'opened'` or `'clicked'` as recipient-status badge values. Those are not enum values; engagement is tracked via `opened_at` / `clicked_at` timestamps.
- Do not invoke `pumpCancel` from `@solvera/pace-core/comms/edge-service` directly. It is the server-side helper used inside the Edge runtime.
- Do not extend `CommSendAdapter` with a `cancel` method.
- Do not introduce app-local Tooltip primitives. pace-core2 does not export `Tooltip` / `TooltipProvider`; surface help via inline labels, `aria-label`, surface-level helper copy.
- Do not introduce a "discard draft" or "cancel draft" workflow as an alternative to Delete. Delete is a real `DELETE`.
- Do not subscribe to Supabase Realtime, poll the list, or refetch on window focus in v1. Refresh is operator-driven (toolbar Refresh button) plus hard-navigation TanStack Query default.
- Do not apply optimistic updates to the cancel or delete mutations. Both wait on refetch so the authoritative server state appears.

---

## 17. References

- [`pump-project-brief.md`](./pump-project-brief.md)
- [`pump-architecture.md`](./pump-architecture.md) § "Information architecture — home (`/`)"; § "RBAC model (PUMP management app)"; § "Slice sizing" (PUMP-02 A/B sub-pass guidance).
- [`pump-feature-list.md`](./pump-feature-list.md) — derived feature inventory (traceability).
- [`pump-user-stories.md`](./pump-user-stories.md) — derived user stories (traceability).
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md); [`../../database/domains/pump.md`](../../database/domains/pump.md) — live dev-db state (tables, RLS policies, enums, RPCs, Edge functions, pace-core2 export map).
- **PUMP-01** — owns the route table, page guard mount on `/`, `<ToastProvider>` mount, `<CommRbacContextProvider>` (app-local provider/hook implementation; pace-core2 publishes only the `CommRbacContext` type today).
- **PUMP-04** — owns `/comms/templates`. PUMP-02 navigates outward via the Compose CTA; templates do not appear on `/`.
- **PUMP-05** — owns `/comms/create`. Drafts persisted by PUMP-05 are surfaced under PUMP-02's own-drafts visibility on `/`.
- **PUMP-06** — owns webhook ingestion that writes `pump_delivery_event` rows and updates `pump_message_recipient.status` / `delivered_at` / `opened_at` / `clicked_at` / `failure_reason`. PUMP-02 reads on demand (drill-down open + Refresh).
- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — comms-platform contract (message and recipient row shapes; Edge function names; `CommSendAdapter` interface).
- `../../../packages/core/docs/standards/3-security-rbac-standards.md` — RBAC policy template; the canonical RLS helper `check_rbac_permission_with_context(...)` paired with `get_app_id('PUMP')`.
- `../../../packages/core/docs/standards/7-visual-standards.md` — visual standards for shared component styling.

### Outstanding platform follow-ups (build prerequisites for PUMP-02B)

- **`pump-cancel` Edge function deployment to dev-db.** Not yet deployed to dev-db (per platform-snapshot-2026-05-07 lines 297–301). PUMP-02A may merge first; PUMP-02B build is gated on this Edge function being reachable.
- **pace-core2 `pumpCancel` helper OR-rule patch.** The helper at `../../../packages/core/src/comms/edge-service.ts` lines 577–586 encodes "admin AND author"; the architecture's authorisation rule is "admin OR author". Patch must land before PUMP-02B build merges. Build-time only (the helper is not yet deployed), so the patch can land before any operator hits the path. Tracked across the PUMP rollout cross-app decisions log.

### Future enhancements (intentionally deferred from v1)

- **Summary row at top of `/`.** Operator feedback may surface need for a summary row of failed / scheduled / your-drafts counts. Cheap to add later via a small read query; intentionally deferred for v1 to maintain log-first surface (per architecture line 174's "optional / lightweight" framing).
- **Search box on `/`.** v1 omits a search box; if needed in a later release, scope across `subject + sender_name + body_text` and add as a toolbar control.
- **`source_app` filter.** v1 omits the filter; `source_app` text is shown inline in drill-down only.

---

# PUMP-05 — Compose & send

## §1 Slice metadata

```
- Slice ID: PUMP-05
- Name: Compose & send
- Status: Draft
- Depends on: PUMP-01 (route mount, page guard, ToastProvider, CommRbacContextProvider), PUMP-03 (sender-identity RPC contract), PUMP-04 (templates CRUD owner — read consumer only)
- Backend impact: Read contract only at the slice boundary (the slice consumes CR23 PUMP Edge functions and writes draft rows directly to `pump_message`; no schema change is authored here). Build gated on CR23 PUMP Edge function deployment to dev-db.
- Frontend impact: UI
- Routes owned: /comms/create
- QA pack: docs/test-packs/PUMP-05-qa-pack.md
```

This is a single v6 slice with internal A/B sub-pass markers. PUMP-05A delivers the route content, composer mount, RBAC consumption, recipient-mode picker, sender-identity banner, save-draft path, and pool resolution. PUMP-05B delivers the send / schedule / send-test paths and the result UX.

---

## §2 Overview

PUMP-05 mounts the composer surface at `/comms/create` inside the route shell PUMP-01 owns. The page renders `<CommComposer>` from `@solvera/pace-core/comms` and wires it to PUMP Edge through `useCommSendAdapter()`. An organisation operator picks a recipient mode (org members, event participants, or a manually-curated list), composes an email or SMS message, optionally selects an active org template, and either sends now, schedules, sends a test to themselves, or saves a draft. PUMP-05 is the comms platform's own compose surface — it is the only consumer slice in the suite that DB-persists drafts (writing to `pump_message`), because draft visibility lands inside PUMP-02's comms log via the table's RLS draft-visibility split. Save Draft authoring lives inside `<CommComposer>` post-pace-core2 enhancement (§17) — PUMP-05 hooks the persistence by overriding `adapter.saveDraft`, not by mounting a separate page-level button.

---

## §3 What this slice delivers

### Purpose

A single screen that lets an operator with `create:page.comms-log` and `update:page.comms-log` build and dispatch a one-off broadcast. The slice covers compose, recipient targeting, preview, send, schedule, send-test, save-draft, and cancel. Template authoring, scheduled-message lifecycle management, gateway configuration, suppression administration, and delivery analytics are out of scope.

### Surfaces

| Surface | Route | Notes |
|---|---|---|
| Compose & send page | `/comms/create` | Single page; renders the page chrome, sender-identity banner, recipient-mode card, and `<CommComposer>` |
| Discard-confirmation dialog | n/a — modal | Triggered by Cancel when the draft is dirty |

### Boundaries

PUMP-01 mounts the route via `<PagePermissionGuard>` and the application chrome via `<PaceAppLayout>`; PUMP-05 owns the page content rendered inside the layout's main content area, including: page heading "Compose", subtitle, back-to-log link, breadcrumb row, sender-identity banner, recipient-mode toggle, the `<CommComposer>` mount, the discard-confirmation Dialog, and the post-send light-reset behaviour.

PUMP-05 does **not** own:

- Route registration, lazy import, `<Suspense>` boundary, `<PagePermissionGuard pageName="comms-log" operation="create">` mount, `<CommRbacContextProvider>` mount, application-chrome `<PaceAppLayout>` (header / navigation menu) — all owned by PUMP-01.
- `<ToastProvider>` mount — owned by PUMP-01.
- Template CRUD (`pump_organisation_templates` writes), strict-mode toggle authoring — owned by PUMP-04. PUMP-05 reads templates exclusively via the adapter.
- The `pump_get_effective_sender_identity(...)` RPC contract — PUMP-03 prerequisite.
- Scheduled-message cancel — owned by PUMP-02B.
- Draft DELETE — owned by PUMP-02B.
- Webhook ingest, recipient status transitions, `pump_delivery_event` writes, `gateway_message_id` writes — owned by PUMP-06. PUMP-05B documents the contract handoff (PUMP-05B's send pipeline causes `pump_message_recipient.gateway_message_id` to be populated by Edge on send completion).
- Edge function bodies (`pump-send`, `pump-resolve-pool`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields`) — implemented by PUMP Edge. PUMP-05 calls the contracts.
- Sender-identity editing — operators do not edit identity in v1. The composer's own identity inputs technically remain editable, but Edge re-validates and silently uses server-resolved values.
- Pool enumeration in the browser — pool resolution is server-side via `pump-resolve-pool`. The single exception is `ManualPool.member_ids` (the inline multi-select builds the id list directly from a `core_member` query, but only ids leave the browser).

### Architectural posture

**Adapter-only mutations.** Every send, schedule, send-test, template load, merge-field load, and pool resolve goes through the `CommSendAdapter` returned by `useCommSendAdapter({ organisationId, sourceApp: 'pump', sourceContextType?, sourceContextId? })`. The slice does not invoke `functions.invoke` directly and never writes to `pump_message_recipient` from the browser. `source_app` is always the literal string `'pump'`.

**One adapter override — `saveDraft` write path.** The composer footer renders the Save Draft button itself (post-pace-core2 enhancement — see §17). When the operator clicks the button, the composer invokes `adapter.saveDraft(draft)`. PUMP-05 builds a custom `CommSendAdapter` instance that wraps `useCommSendAdapter()` output and overrides `saveDraft` only — the override upserts a row into `pump_message`. All other adapter methods (`resolvePool`, `loadTemplates`, `loadMergeFields`, `send`, `sendTest`, `schedule`) delegate to the wrapped hook output unchanged. This adapter wrapper is unique to PUMP-05; sibling consumer slices (TEAM-13, BA17) leave drafts ephemeral by using the hook output directly without wrapping.

**Pool descriptor, not resolved list.** Send / schedule / send-test invocations carry a `RecipientPoolDescriptor`. PUMP Edge resolves the descriptor server-side. The browser never assembles a resolved recipient list. ManualPool's `member_ids` array is the only id-only exception — it carries member ids, never addresses or merge data.

**Pool drives source context.** When the operator picks a pool mode, the slice derives `sourceContextType` / `sourceContextId`:
- OrgMembersPool → `null` / `null`
- EventParticipantsPool → `'event'` / `pool.event_id`
- ManualPool → `null` / `null`

The adapter is mounted with these derived values. There is no separate event picker or context selector. The composer remounts when the pool's source-context changes.

**Page guard mount lives in PUMP-01.** `/comms/create` is wrapped by `<PagePermissionGuard pageName="comms-log" operation="create">` mounted by PUMP-01. PUMP-05 does not re-mount the guard.

**RBAC context is app-local.** PUMP-05 calls `useCommRbacContext()` to read `{ canCompose, canSend, canSchedule, scopeType, scopeId }`. The hook is published by PUMP-01 (an app-local provider; pace-core2 publishes only the `CommRbacContext` type today — see §9.1). The slice does not call `useCan` for these booleans directly.

**Block-on-unresolved is on.** `<CommComposer>` is mounted with `blockSendOnUnresolvedTokens={true}`. Send and Schedule will refuse to dispatch while any merge token in the draft cannot be resolved against the loaded merge fields. Strict-mode templates layer their own server-side gate on top.

**Sender identity is read-only by display contract.** A read-only banner above the composer surfaces the resolved sender (`senderName`, `fromAddress` for email or `senderPhone` for SMS, and `resolvedFrom`). The composer's own sender inputs are pre-populated from the resolved identity. The composer's identity inputs technically remain editable; Edge re-validates and silently uses the server-resolved values on send. A pace-core2 `lockSenderIdentity` enhancement is consolidated on TEAM-13's existing backlog item to close the UX gap properly.

**No bypass_suppression.** Every `pump-send` / `pump-schedule` request from this slice omits `bypass_suppression` (defaults to `false`). The composer never offers an affordance to bypass the suppression registry.

### Page-level guards and evaluation ordering

The route `/comms/create` evaluates these layers in order when context is absent:

1. **Authentication.** PUMP-01's `ProtectedRoute` redirects unauthenticated users to `/login`. The page guard never evaluates.
2. **Org context.** PUMP-01's organisation context provider resolves the operator's selected organisation. While loading, PUMP-01 renders its loading state; the page body does not mount.
3. **No-org check.** When the organisation context resolves and `selectedOrganisation === null`, PUMP-01 renders its "no organisation" empty state. `<PagePermissionGuard>` is not reached; no RBAC query fires.
4. **Page permission guard.** Once org context is resolved, PUMP-01's `<PagePermissionGuard pageName="comms-log" operation="create">` evaluates. Scope resolves internally from the organisation context; PUMP-05 passes no `scope` prop. While the RBAC check is in flight (`isLoading === true`), the guard returns `null` — a brief blank inside the page content area is acceptable. On `can === false`, PUMP-01's `<AccessDenied>` is rendered. On `can === true`, PUMP-05's page body renders.

If `selectedOrganisation` resolves to `null` after step 3 (a race during org switch), the RBAC engine evaluates with `organisationId: undefined`, the check returns pending, and the guard returns `null`. Step 3 prevents this path under normal conditions.

---

## §4 Functional specification

Items are numbered with the prefix matching their sub-pass. Each item is testable by a QA reviewer with no code access.

### PUMP-05A — Route content + composer mount + recipient targeting + draft save

#### Page entry

- **A-01** The route `/comms/create` renders for an authenticated user whose currently selected organisation has resolved and who has `create:page.comms-log` permission. The route is reached either from PUMP-02's "New message" / "Compose" CTA or from direct URL entry.
- **A-02** On entry, the page mounts the page-level content inside PUMP-01's `<PaceAppLayout>` main content area (heading "Compose", subtitle "Send a message to members of <organisation name>", breadcrumb "Comms log / Compose" with `Comms log` linking to `/`, top "Back to comms log" link with `<ChevronLeft>` icon). PUMP-01 provides the surrounding application chrome (`<PaceAppLayout>`, header, navigation menu); PUMP-05 mounts the page-level content within `<main>` for `/comms/create`.
- **A-03** The page calls `useCommRbacContext()` (published by PUMP-01) to obtain the current `CommRbacContext` and consumes `canCompose`, `canSend`, `canSchedule`, `scopeType`, `scopeId`.
- **A-04** On mount with a resolved organisation, the page calls `pump_get_effective_sender_identity(p_organisation_id := <orgId>, p_source_context_type := <derived>, p_source_context_id := <derived>)` via `useSecureSupabase().rpc(...)` to obtain the effective sender identity. The returned `EffectivePumpSenderIdentity` shape is destructured directly. `resolvedFrom` is captured for the audit display.
- **A-05** The sender-identity read-only banner renders above the composer, showing channel-conditional copy (see §5 Components — Sender-identity banner).
- **A-06** The composer's draft state is seeded from the resolved identity: `draft.sender_name = senderName`, `draft.sender_email = fromAddress`, `draft.sender_phone = senderPhone`, `draft.reply_to = replyToAddress`. Null fields seed empty strings.
- **A-07** The initial draft channel is `'email'`. Initial body fields are empty.
- **A-08** The initial recipient mode is "Org members" (the OrgMembersPool default; no filters applied — the descriptor targets the entire active organisation membership, resolved server-side).
- **A-09** The composer is mounted with `recipientPool` set to the slice's current pool descriptor (built from the recipient-mode selection per §6 BR-RecipientModeToggle). The composer's internal `useResolvedPool` re-runs whenever the descriptor changes.
- **A-10** The composer is mounted with `rbac` set to the consumed `CommRbacContext`, with `organisationId = selectedOrganisation.id`, with `sourceApp = 'pump'`, with `adapter = useCommSendAdapter({ organisationId: selectedOrganisation.id, sourceApp: 'pump', sourceContextType: <derived>, sourceContextId: <derived> })`, with `blockSendOnUnresolvedTokens = true`, and with `onCancel = handleCancel` (the slice's cancel handler — see A-45).
- **A-11** The composer's `templates`, `mergeFields`, and `recipientPreview` props are not supplied by this slice. The composer drives those queries internally via `useCommTemplates`, `useCommMergeFields`, and `useResolvedPool` (Edge: `pump-load-templates`, `pump-load-merge-fields`, `pump-resolve-pool`).

#### Loading states

- **A-12** While the page-level RBAC check is in flight (PUMP-01's guard), a brief blank inside the page content area is acceptable.
- **A-13** While the `pump_get_effective_sender_identity` RPC is in flight, the sender-identity banner renders a placeholder line `"Resolving sender identity…"` and the composer's sender inputs render empty (placeholder text only).
- **A-14** While the composer's internal pool resolution (`pump-resolve-pool`) is in flight, the recipient pool preview area renders an `<Alert role="status">` reading "Resolving recipient pool." The composer Card itself remains visible and editable.
- **A-15** While the composer's internal templates fetch (`pump-load-templates`) is in flight, the templates section is omitted. When the fetch returns zero templates total, the templates section is omitted. The composer renders the templates section whenever `effectiveTemplates.length > 0`; within the section, only templates matching the active channel render as buttons. When at least one template exists overall but zero match the active channel, the section renders with no buttons inside it.
- **A-16** While the composer's internal merge-fields fetch (`pump-load-merge-fields`) is in flight, the merge-field toolbar renders zero buttons but does not block editing.

#### Empty states

- **A-17** When the org has zero active templates total, the templates section of the composer is not rendered. When at least one template exists but zero match the active channel, the templates section renders with no buttons. The composer remains usable in either case; the operator may compose without selecting a template.
- **A-18** When `pump-resolve-pool` returns `estimated_count === 0`, the recipient pool preview shows "0 estimated recipients" and the composer's standard zero-recipient warning copy renders. Send / Schedule are NOT slice-disabled by the empty pool. If the operator clicks Send / Schedule, Edge `pump-send` / `pump-schedule` returns an `EMPTY_POOL` error which surfaces as a destructive toast (see B-04 / BR-EdgeErrorSurface).
- **A-19** When the organisation has no events, the Event participants recipient-mode option is disabled with helper copy "No events available for this organisation." The Org members and Manual modes remain selectable.

#### Error states

- **A-20** When PUMP-01's `<PagePermissionGuard>` denies, PUMP-01 renders `<AccessDenied>`; PUMP-05's page body does not mount.
- **A-21** When `pump_get_effective_sender_identity` fails, the sender-identity banner area renders an `<Alert variant="destructive">` titled "Sender identity could not be resolved" with the error message. A `'destructive'`-variant toast also renders. Send / Schedule / Send test buttons in the composer are NOT slice-disabled by the RPC failure; if the operator clicks them, Edge re-validates and returns an error that surfaces as a destructive toast (BR-EdgeErrorSurface).
- **A-22** When `canSendEmail === false` for the active email channel, an `<Alert variant="destructive">` renders above the composer with copy "Email is unavailable — no sender address is configured for this organisation. Contact a platform administrator." This Alert is a slice-level affordance above the composer (per Q-D5); the composer's own Send / Schedule / Send test buttons are NOT slice-disabled by the channel check. If the operator clicks Send / Schedule / Send test against an unavailable channel, Edge returns a gateway-config-missing error that surfaces as a destructive toast (BR-EdgeErrorSurface). The channel-switch button to SMS remains clickable.
- **A-23** When `canSendSms === false` for the active SMS channel, the equivalent `<Alert variant="destructive">` renders with copy "SMS is unavailable — no sender phone is configured for this organisation. Contact a platform administrator." This Alert is a slice-level affordance above the composer (per Q-D5); the composer's own Send / Schedule / Send test buttons are NOT slice-disabled. Edge returns a gateway-config-missing error on click → destructive toast (BR-EdgeErrorSurface). The channel-switch button to email remains clickable.
- **A-24** When `pump-resolve-pool` fails, the recipient pool preview area renders `<Alert variant="destructive">` titled "Recipient pool unavailable" with the error message. The composer's Send / Schedule buttons are NOT slice-disabled by the resolve failure; if clicked, Edge `pump-send` / `pump-schedule` returns an error which surfaces as a destructive toast (BR-EdgeErrorSurface). Switching mode or re-applying filters re-runs the resolve.
- **A-25** When the Save-draft handler fails, a `'destructive'`-variant toast renders with title "Save draft failed" and description = the error message. Composer state stays.

#### Primary content

- **A-26** **Sender-identity banner.** Renders above the composer as a read-only `<Card>` containing channel-conditional copy:
  - Email channel: `"Sending as <senderName> from <fromAddress> · resolved from <resolvedFrom>"`.
  - SMS channel: `"Sending as <senderName> from <senderPhone> · resolved from <resolvedFrom>"`.
  - Inline help text below the headline: `"Sender identity is resolved automatically from your organisation's settings."` (rendered as plain helper text — pace-core2 has no Tooltip primitive).
- **A-27** **Recipient-mode card.** Renders above the composer as a `<Card>` titled "Recipients" with three radio options: "Org members" (`'org_members'`, default), "Event participants" (`'event_participants'`, disabled when no events exist), "Manual" (`'manual'`). The card body changes per selection (filters for org members, event picker + filters for event participants, multi-select chip input for manual).
- **A-28** **Composer.** Renders below the recipient-mode card. The composer's own internal layout (channel selector, templates section, sender inputs, subject and body editors, merge toolbar, preview / edit toggle, recipient pool preview Card, footer with action buttons) is described in §5.

#### Primary actions

- **A-29** **Recipient mode — Org members.** Selecting the radio sets the slice's recipient mode to `'org_members'`. The slice rebuilds the descriptor as `{ type: 'org_members', organisation_id: selectedOrganisation.id, filters: { member_type_ids?, unit_ids?, include_inactive? } }` from the current chip / toggle state. The adapter is remounted with `sourceContextType: undefined, sourceContextId: undefined` and the composer remounts.
- **A-30** **Recipient mode — Event participants.** Selecting the radio sets the slice's recipient mode to `'event_participants'`. The slice renders an event single-select dropdown listing events for the organisation. Once an event is selected, the slice rebuilds the descriptor as `{ type: 'event_participants', event_id: <selectedEventId>, filters: { registration_type_ids?, status?, unit_ids? } }`. The adapter is remounted with `sourceContextType: 'event', sourceContextId: <selectedEventId>`. The composer remounts; the sender-identity RPC re-runs with the event context.
- **A-31** **Recipient mode — Manual.** Selecting the radio sets the slice's recipient mode to `'manual'`. The slice renders the inline multi-select chip input (see §5 Manual multi-select). As the operator types, a `core_member` query (joined to `core_person` for display name) returns suggestions scoped to the current organisation. Selecting a suggestion appends the member's id to the slice's `member_ids` list. The descriptor is `{ type: 'manual', member_ids: [...] }`. The adapter remounts with `sourceContextType: undefined, sourceContextId: undefined`. The composer remounts.
- **A-32** **Org-members filter — Membership types.** When mode is `'org_members'`, a multi-select chip control labelled "Membership types" lists `core_membership_type` rows for the organisation with `is_active = true`, ordered by `name` ascending. Toggling a chip updates `OrgMembersPool.filters.member_type_ids` (string[]; integer ids cast to strings — see §6 BR-MemberTypeIdCast). When zero chips are selected, the filter is omitted from the descriptor.
- **A-33** **Org-members filter — Units.** When mode is `'org_members'`, a multi-select chip control labelled "Units" lists `core_unit` rows for the organisation with `is_active = true`. Toggling a chip updates `OrgMembersPool.filters.unit_ids`. When zero chips are selected, the filter is omitted.
- **A-34** **Org-members filter — Include inactive.** A `<Switch>` labelled "Include inactive members". Default off. When on, sets `OrgMembersPool.filters.include_inactive = true`. When off, the property is omitted.
- **A-35** **Event-participants filter — Registration types.** When mode is `'event_participants'` and an event is selected, a multi-select chip control labelled "Registration types" lists registration types for the event. Toggling chips updates `EventParticipantsPool.filters.registration_type_ids`.
- **A-36** **Event-participants filter — Status.** A multi-select chip control labelled "Registration status" lists registration statuses (the canonical set surfaced by the EventParticipantsPool resolver). Toggling chips updates `EventParticipantsPool.filters.status`.
- **A-37** **Event-participants filter — Units.** A multi-select chip control labelled "Units". Same options as A-33 (organisation units). Toggling chips updates `EventParticipantsPool.filters.unit_ids`.
- **A-38** **Channel — Email.** Click on the composer's Email button sets `draft.channel = 'email'`. The composer's internal `draftForChannel` carries email-specific fields through; SMS-specific fields are not cleared on the transition. The pool re-resolves with `channel: 'email'`. The sender-identity banner re-evaluates the channel-aware row (`canSendEmail` validation, A-22).
- **A-39** **Channel — SMS.** Click on the composer's SMS button sets `draft.channel = 'sms'`. Email-specific fields (subject, body_html, sender_email, reply_to) clear from the draft. The pool re-resolves with `channel: 'sms'`.
- **A-40** **Template selection.** Click on a template button in the composer's templates section calls the composer's internal `applyTemplate` which sets `draft.template_id`, `draft.channel`, `draft.subject`, `draft.body_html`, `draft.body_text` from the template. The selected template button shows `variant="default"`; others show `variant="outline"`. Templates whose `require_merge_field_validation === true` show a "(Strict)" suffix and trigger the strict-mode banner above the composer Card.
- **A-41** **Sender / subject / body inputs.** Operator-editable text fields rendered by the composer, per the composer's own contract. The slice does not override these; the resolved-identity values seed them on mount.
- **A-42** **Merge-field button.** Click inserts the field's `token` (e.g. `{{first_name}}`) at the cursor position of the most recently focused field. (Composer-internal behaviour.)
- **A-43** **Preview / Edit toggle.** Click toggles between body-edit mode and preview mode. (Composer-internal behaviour.)
- **A-44** **Save draft.** The composer's footer (post-pace-core2 enhancement — see §17) renders the Save Draft button. Click invokes `adapter.saveDraft(draft)`. PUMP-05's `saveDraft` override (the single method overridden in the slice's wrapper around `useCommSendAdapter()` output) upserts a row into `pump_message` via `useSecureSupabase().from('pump_message').upsert({...})` with: `id` (a client-side UUID generated at composer mount via `crypto.randomUUID()` and held in component state for upsert-key reuse), `organisation_id`, `channel`, `subject`, `body_html`, `body_text`, `sender_name`, `sender_email`, `sender_phone`, `reply_to_email`, `template_id?`, `recipient_pool_descriptor` (JSON; null when no pool selected), `source_app: 'pump'`, `source_context_type`, `source_context_id`, `extra_merge_context` (default `{}`), `bypass_suppression: false`, `status: 'draft'`, `created_by` (from `useUnifiedAuth()`). The composer's button enable/disable state follows its own rules; when the override fires against an invalid draft, the override may short-circuit by reading `validateCommDraft(draft).valid` itself and bubbling an error back through the adapter's `ApiResult` shape. Success: `'success'`-variant toast "Draft saved." Failure: A-25.
- **A-45** **Cancel.** Click on "Cancel" calls the slice's `handleCancel`. If the draft is dirty (any composer state diverges from the post-Save state, or no save has occurred and any non-default field is populated), the slice opens a `<Dialog>` titled "Discard unsaved changes?" with body "Any text you've entered will be lost.", primary `Button variant="destructive"` "Discard", secondary `Button variant="outline"` "Keep editing". Click "Discard" → `navigate('/')` without saving. Click "Keep editing" → close the dialog; the operator remains on the page. If the draft is clean, navigate to `/` immediately.

#### Permission-conditional rendering

- **A-46** When `read:page.comms-log` is denied, PUMP-01's `<AccessDenied>` renders inside the page guard; PUMP-05 mounts no content.
- **A-47** When `read:page.comms-log` is allowed but `create:page.comms-log` is denied (`canCompose === false`), the composer renders its read-only banner; the slice's recipient-mode card and sender-identity banner remain visible (read-only context still surfaces). The Save draft button hides (no editable draft is reachable). Send / Schedule / Send test are also unavailable.
- **A-48** When `read:page.comms-log` and `create:page.comms-log` are allowed but `update:page.comms-log` is denied (`canSend === false`), the composer renders the read-only banner and the CardFooter renders a single read-only `<Alert>` "You have view-only access to this message." Save draft remains available because draft authorship is gated by `create:page.comms-log` and the per-row owner-update RLS policy on `pump_message`.

### PUMP-05B — Send / Schedule / Send-test pipeline + result UX

#### Primary actions

- **B-01** **Send now.** Click on "Send now" in the composer footer calls `adapter.send(...)` with a `CommSendRequest` assembled by the composer's internal `buildCommSendRequest` from the current `recipientPool`, `draft`, `sourceApp: 'pump'`, `sourceContextType` (per pool), `sourceContextId` (per pool). The composer-internal gates run first: `validateCommDraft(draft)`; strict-template gate; `blockSendOnUnresolvedTokens` gate. Failures call `onSendError` which the slice routes to a destructive toast (B-04).
- **B-02** **On send success.** `onSendComplete(result: CommSendResult)` fires. The slice renders a `'success'`-variant toast titled "Message sent" with description `"<total_recipients> recipients"`. When `result.suppression_skipped > 0`, append `" — <suppression_skipped> skipped"` to the description. When `result.warnings.length > 0`, append `" Some recipients had unresolved tokens or partial gateway failures; check delivery in the comms log."` After the toast, the slice performs a light reset: leave `draft.channel` unchanged and leave the resolved sender-identity values in place (`sender_name`, `sender_email`, `sender_phone`, `reply_to` carry through to the next compose); clear `draft.subject`, `draft.body_html`, `draft.body_text`, `draft.template_id`, `draft.extra_merge_context`; reset the recipient mode to `'org_members'` with no filters; clear any scheduled-time picker state. Operator stays on `/comms/create`.
- **B-03** **Schedule.** First click on the composer's "Schedule" button expands the datetime-local input below the button and changes its label to "Confirm schedule" (composer-internal). Second click ("Confirm schedule") calls `adapter.schedule(...)` with a `CommScheduleRequest` (the assembled `CommSendRequest` plus `scheduled_at`). The slice gates the click on the schedule-time validation (B-08). On success, `onScheduleComplete(message_id)` fires; the slice renders a `'success'`-variant toast titled "Message scheduled" with description `"Message scheduled for <formatted scheduled_at>"`. Light reset matches B-02. Operator stays on `/comms/create`.
- **B-04** **On send / schedule / send-test failure.** `onSendError(message)` fires. The slice renders `toast({ variant: 'destructive', title: '<action> failed', description: <message> })` where `<action>` is "Send" / "Schedule" / "Send test". Composer state stays intact. No inline banner is added.
- **B-05** **Send test.** Click on "Send test" calls `adapter.sendTest(...)` with a `CommSendTestRequest` built from the current draft (no `pool`, no `system_key`, no `system_recipient`, no `bypass_suppression`). PUMP Edge dispatches to the signed-in user's contact for the active channel. Click fires immediately; no confirmation dialog. On success, the slice renders a `'success'`-variant toast: email channel — title "Test sent", description "Test sent to your email"; SMS channel — title "Test sent", description "Test sent to your phone". On failure, B-04 applies with action "Send test". Draft remains unchanged either way. Button disabled when `validateCommDraft(draft).valid === false` OR the channel-specific sender-identity check fails (`!canSendEmail` for email; `!canSendSms` for SMS).
- **B-06** **`gateway_message_id` cross-slice handoff.** PUMP-05B's send pipeline causes `pump-send` Edge to populate `pump_message_recipient.gateway_message_id` once the gateway acknowledges dispatch. PUMP-05 does not write this column directly; the contract belongs to PUMP-06 (delivery / webhook ingest). PUMP-05B documents the handoff so PUMP-06A can rely on the column being present after a successful send.

#### Edge cases and constraints

- **B-07** **Strict template gate.** When the active template's `require_merge_field_validation === true` and the draft has unresolved tokens against the loaded merge fields, the composer's internal `handleSend` calls `onSendError('Resolve merge tokens before sending this strict template.')` and the adapter is not invoked. The slice surfaces this as a destructive toast per B-04.
- **B-08** **Schedule time surface.** The composer renders the bare `<Input type="datetime-local">` with no helper text and no inline error. The slice does NOT impose pre-click 5-minute or past-time validation in v1. The "Confirm schedule" button is disabled by composer-internal rules only (`!rbac.canSchedule || blockForUnresolved`). If the operator picks an invalid `scheduled_at` (past time, sub-5-minute) and clicks Confirm, Edge `pump-schedule` returns a schedule-time error such as `"Scheduled time must be in the future."` which surfaces as a destructive toast per BR-EdgeErrorSurface.
- **B-09** **Empty pool surface.** When `pump-resolve-pool` returns `estimated_count === 0`, the composer's standard zero-recipient warning copy renders inline. The slice does NOT disable Send or Schedule on the empty pool in v1; if the operator clicks, Edge returns an `EMPTY_POOL` error that surfaces as a destructive toast per BR-EdgeErrorSurface. Send-test is unaffected (it does not depend on the pool).
- **B-10** **`bypass_suppression` invariant.** Every `adapter.send` and `adapter.schedule` call from this slice omits `bypass_suppression`. The default `false` applies. The composer offers no affordance to set it true.
- **B-11** **`source_app` invariant.** Every adapter call from this slice carries `source_app === 'pump'` (set by the adapter's `sourceApp: 'pump'` mount option).
- **B-12** **Source-context invariants.** When the active pool is `OrgMembersPool` or `ManualPool`, the request's `source_context_type` and `source_context_id` are both `undefined`. When the active pool is `EventParticipantsPool`, `source_context_type === 'event'` and `source_context_id === pool.event_id`.

---

## §5 Visual specification

### Layout

The page renders inside PUMP-01's authenticated route shell. Within the page content area, top-to-bottom:

1. **Page chrome row.** A breadcrumb `"Comms log / Compose"` (with `Comms log` linked to `/`) at the top of the content area, followed by a `"Back to comms log"` link (with a `<ChevronLeft>` icon, 16×16, sitting to the left of the link text) on the next line. Below those, a heading `"Compose"` (h1; large weight) and immediately below it a subtitle `"Send a message to members of <organisation name>"` (muted body text).
2. **Sender-identity banner.** A read-only `<Card>` immediately below the page chrome. Single row of body text describing the resolved sender per the channel (see Components below). Inline help text below the headline. No actions.
3. **Recipient-mode card.** A `<Card>` titled "Recipients". Body contains the radio group + the per-mode body (filters / event picker / manual multi-select).
4. **Composer.** `<CommComposer>` rendered below the recipient-mode card. The composer renders a `<section aria-label="Communication composer" class="grid gap-4">` containing (top-to-bottom): conditional `<Alert>` banners (block-on-unresolved, read-only, strict template), then the Compose `<Card>` (header "Compose communication"; channel selector; templates section when present; sender inputs; channel-conditional fields; preview / edit toggle; body editors with merge toolbar; CardFooter with the four action buttons), then the recipient pool preview `<Card>` as a sibling Card below the Compose Card.

The page is single-column on all breakpoints. Standard pace-core2 responsive behaviour applies. Maximum content width and page padding are inherited from PUMP-01's shell.

### Components

**Page chrome**

- Breadcrumb row: `"Comms log"` (link, navigates to `/`) + `" / "` (muted) + `"Compose"` (current; non-link). Rendered as a single line.
- Back link: `<ChevronLeft>` icon (16×16) followed by `"Back to comms log"`. The whole element is one click target navigating to `/`.
- Heading: `"Compose"`, h1 weight.
- Subtitle: `"Send a message to members of <organisation name>"`. Muted body text style. `<organisation name>` resolves from the current organisation context.

**Sender-identity banner** (`<Card>` from `@solvera/pace-core/components`)

- `<CardHeader>` is omitted (no title row); content rendered directly inside `<CardContent>` (or inside the Card's body when no header is used).
- Channel-conditional headline (single line):
  - Email: `"Sending as <senderName> from <fromAddress> · resolved from <resolvedFrom>"`. `<senderName>` and `<fromAddress>` rendered with normal weight; the leading `"Sending as "` is muted body text.
  - SMS: `"Sending as <senderName> from <senderPhone> · resolved from <resolvedFrom>"`. Same emphasis pattern.
- Helper text below the headline (smaller / muted): `"Sender identity is resolved automatically from your organisation's settings."`.
- When the resolution RPC is in flight, the headline reads `"Resolving sender identity…"` and the helper text remains in place.
- When `canSendEmail === false` (active channel email) OR `canSendSms === false` (active channel SMS), the banner's surrounding card position is also occupied by the destructive `<Alert>` described below; the read-only banner still renders above the Alert when an identity is resolvable but channel-incompatible. When the identity cannot be resolved at all (RPC failed), only the destructive Alert renders in this area.
- The destructive Alert (when `canSendEmail === false` for email channel) renders as `<Alert variant="destructive">` with title `"Email is unavailable"` and description `"Email is unavailable — no sender address is configured for this organisation. Contact a platform administrator."` The SMS-equivalent uses title `"SMS is unavailable"` and description `"SMS is unavailable — no sender phone is configured for this organisation. Contact a platform administrator."`

**Recipient-mode card** (`<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`)

- `<CardHeader>` contains `<CardTitle>Recipients</CardTitle>`. No description.
- `<CardContent>` arranges controls in a vertical stack (`grid gap-4`).
- **Radio group** (single-select). Three rows; each row is a `<Label>` containing a radio `<Input>` and the visible label text plus a muted helper paragraph below it.
  - Row 1: `value="org_members"`; label `"Org members"`; helper `"Send to filtered organisation members"`.
  - Row 2: `value="event_participants"`; label `"Event participants"`; helper `"Send to participants of an event"`. Disabled (radio + label both disabled state) when the organisation has no events; helper text replaces with `"No events available for this organisation."`.
  - Row 3: `value="manual"`; label `"Manual"`; helper `"Pick specific members"`.
- **Org-members body (when value === 'org_members').** Vertical sub-stack:
  - Heading `"Membership types"` (small heading). Below it, a horizontal flex of `<Button>` chips, one per active `core_membership_type`. Selected chips render `variant="default"`; unselected render `variant="outline"`. `size="small"`. Click toggles inclusion.
  - Heading `"Units"` (small heading). Below it, a horizontal flex of `<Button>` chips, one per active `core_unit`. Same selection visuals as Membership types.
  - A `<Switch>` row labelled `"Include inactive members"`. Default off.
- **Event-participants body (when value === 'event_participants').** Vertical sub-stack:
  - `<Select>` (`@solvera/pace-core/components` `<Select>` family — `<Select>`, `<SelectTrigger>`, `<SelectContent>`, `<SelectItem>`) labelled `"Event"`, with options drawn from organisation events ordered by event start descending. Placeholder `"Choose an event"`. Single-select.
  - When an event is selected, three filter chip groups render: `"Registration types"`, `"Registration status"`, `"Units"`. Each is a horizontal flex of `<Button>` chips with the same selection visuals as Membership types above.
  - When no event is selected, the filter chip groups are not rendered.
- **Manual body (when value === 'manual').** Vertical sub-stack:
  - A type-ahead chip input rendered via the pace-core2 typeahead primitive (post-pace-core2 enhancement — see §17 and §9.2 caveat). The control is wired to a type-ahead query against `core_member` joined to `core_person` for display name, scoped to the current `organisationId`. The query is debounced at 300ms; each option's `value = core_member.id`, `label = "<core_person.preferred_name OR core_person.first_name> <core_person.surname>"` (fallback chain when `preferred_name` is null). Placeholder `"Search and add members"`. Selected members render as chips in a horizontal strip below the type-ahead input; each chip carries the member's display name and a `<X>` removal control. Clicking the × removes the member_id from the array and re-renders the chip strip; removed members are not re-added to the type-ahead suggestion list automatically — the operator types again to re-add.
  - When `member_ids.length > 0`, a small footer line below the chip strip reads `"<N> members selected"`.

**`<CommComposer>`** (`@solvera/pace-core/comms`)

The composer renders (composer-internal layout):

- A `<section aria-label="Communication composer" class="grid gap-4">` containing:
- **Conditional banners.**
  - `<Alert role="status">` with title `"Resolve all tokens before sending"` and description `"Resolve all tokens before sending."` when `blockSendOnUnresolvedTokens === true` and unresolved tokens exist.
  - `<Alert>` titled `"Read-only mode"` with description `"You have view-only access to this message."` when `canCompose === false` or `canSend === false`.
  - `<Alert role="status">` titled `"Strict template"` with description `"All merge tokens must resolve before this template can be sent."` when the selected template has `require_merge_field_validation === true`.
- **Compose `<Card>`.** `<CardHeader>` shows title `"Compose communication"` and description `"PUMP resolves recipients, sender identity, suppression, and delivery."`. `<CardContent>` is a vertical `grid gap-4`:
  - **Channel `<fieldset>`.** Legend `"Channel"`. A two-column `<menu>` of two `<Button>` controls — `"Email"` (`variant="default"` when active, `"outline"` otherwise) and `"SMS"` (same).
  - **Templates `<section>` (rendered only when at least one template exists for the active channel).** Heading `"Templates"`. A `<menu>` (auto-fit grid, `minmax(12rem, 1fr)` columns) of `<Button>` chips — one per template. Label is the template `name`, with `" (Strict)"` suffix when the template is strict. Selected template `variant="default"`; others `variant="outline"`. `size="small"`. Disabled when `canCompose === false`.
  - **`"Sender name"` `<Label>`.** Text `<Input>` bound to `draft.sender_name`. Disabled when `canCompose === false`.
  - **Email-only fields (channel === 'email').**
    - `"Sender email"` `<Label>` + text `<Input>` bound to `draft.sender_email`.
    - `"Subject"` `<Label>` + text `<Input>` bound to `draft.subject`.
  - **SMS-only field (channel === 'sms').**
    - `"Sender phone"` `<Label>` + text `<Input>` bound to `draft.sender_phone`.
  - **Preview / Edit toggle.** A `<Button variant="outline">` labelled `"Preview"` (when in edit mode) or `"Edit"` (when in preview mode). Disabled when `canCompose === false`.
  - **In edit mode (channel === 'email').** A `"HTML body"` `<Label>` + `<Textarea>` bound to `draft.body_html`; a `"Plain text body"` `<Label>` + `<Textarea>` bound to `draft.body_text`; the `<MergeFieldToolbar>`.
  - **In edit mode (channel === 'sms').** A `"Plain text body"` `<Label>` + `<Textarea>` bound to `draft.body_text`; the `<MergeFieldToolbar>`.
  - **In preview mode.** A `<MessagePreview>` Card replaces the body fields and toolbar.
- **`<CardFooter>`.** Right-aligned `grid gap-2` rendered by the composer. When `canSend === false`, the composer renders a single `<Alert role="status">` `"You have view-only access to this message."` When `canSend === true`, the composer renders these controls top-to-bottom (composer-internal layout — PUMP-05 does not override visual treatment or disable rules):
  - `<Button variant="outline">` `"Save draft"` (rendered by `<CommComposer>` post-pace-core2 enhancement — see §17). The composer wires the click to `adapter.saveDraft(draft)`; PUMP-05's adapter `saveDraft` override (Decision 2) implements the persistence. Composer-internal enable / disable rules apply.
  - `<Button variant="outline">` `"Send test"`. Disabled by composer when `blockForUnresolved` is true. The slice does NOT add channel-availability or `validateCommDraft` disable conditions; the channel-unavailable Alert above the composer (A-22 / A-23) is the slice-level affordance, and Edge returns errors that surface as destructive toasts (BR-EdgeErrorSurface).
  - When schedule expanded: a `<Label>` `"Schedule at"` wraps an `<Input type="datetime-local">` bound to the composer's local `scheduledAt` state. The composer renders no helper text and no inline 5-minute validation error.
  - `<Button variant="outline">` `"Schedule"` (or `"Confirm schedule"` when expanded). Disabled by composer when `!rbac.canSchedule || blockForUnresolved`. The slice does NOT add 5-minute pre-click validation, empty-pool disable, or extra disable conditions; an invalid `scheduled_at` (past time, sub-5-minute) triggers an Edge error on click that surfaces as a destructive toast (BR-EdgeErrorSurface).
  - `<Button variant="outline">` `"Cancel"` (renders because PUMP-05 supplies `onCancel`). Disabled by composer when `readOnlyCompose` is true.
  - `<Button>` (default / primary variant) `"Send now"`. Disabled by composer when `blockForUnresolved` is true. The slice does NOT add empty-pool disable; an empty pool triggers an Edge `EMPTY_POOL` error on click that surfaces as a destructive toast (BR-EdgeErrorSurface).
- **`<RecipientPoolPreview>` `<Card>` (sibling to the Compose Card).** When pool resolution is loading: `<Alert role="status">Resolving recipient pool.</Alert>`. When the resolve failed: `<Alert variant="destructive">` titled `"Recipient pool unavailable"` with the error message. When no preview yet: `<Alert role="status">No recipient pool has been resolved yet.</Alert>`. When resolved: a `<Card>` with `<CardHeader>` (`"Recipients"` title, `"<estimated_count> estimated recipients"` description) and `<CardContent>` containing a `"Sample"` sub-section listing names (when `sample_names.length > 0`) and a `"Warnings"` `<Alert>` with `<ul>` of warning messages formatted via `poolWarningLabel(warning)` (when `warnings.length > 0`).

**Save draft button (rendered by `<CommComposer>` post-pace-core2 enhancement)**

The composer's footer renders the Save Draft button itself once the pace-core2 enhancement (§17) lands. Visual treatment: `<Button variant="outline">` labelled `"Save draft"`. The composer wires the click to `adapter.saveDraft(draft)`; PUMP-05's persistence flows from its `CommSendAdapter` wrapper (Decision 2) overriding `saveDraft` to upsert against `pump_message`. PUMP-05 does NOT mount a separate slice-level button.

**`<MergeFieldToolbar>`** (`@solvera/pace-core/comms`)

Renders inside the composer body in edit mode. When `mergeFields.length === 0`, a single paragraph `"No merge fields are available for this pool."` When `mergeFields.length > 0`, a `<section aria-label="Merge fields">` with a heading `"Merge fields"` and an auto-fit grid `<menu>` (`minmax(10rem, 1fr)` columns) of `<Button variant="outline" size="small">` chips, one per merge field. Each chip's label is the field's `label`. Click inserts the field's `token` at the cursor of the most recently focused field.

**`<MessagePreview>`** (`@solvera/pace-core/comms`)

Renders inside the composer body in preview mode. A `<Card>` with `<CardHeader>` (`"Preview"` title; `"Email preview uses sanitised HTML."` or `"SMS preview uses plain text."` per channel) and `<CardContent>`:

- When `draft.subject` is non-empty: a `"Subject"` sub-section with the subject text.
- When channel is email: a sanitised-HTML preview rendered after `sanitiseCommHtml`. Max-height `16rem` with `overflow-auto`.
- When channel is SMS: a plain-text preview rendered as a paragraph in a bordered article (same max-height).
- When unresolved tokens are present: an `<Alert>` titled `"Unresolved merge tokens"` with the token list highlighted via `<mark>`.

**Discard-confirmation `<Dialog>`**

A modal `<Dialog>` (`@solvera/pace-core/components` `<Dialog>` family — `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogDescription>`, `<DialogFooter>`).

- Title: `"Discard unsaved changes?"`.
- Description / body: `"Any text you've entered will be lost."`.
- Footer: `<Button variant="outline">` `"Keep editing"` (closes the dialog without navigating), `<Button variant="destructive">` `"Discard"` (closes the dialog and navigates to `/`).
- Close behaviour: clicking the dialog's overlay or pressing Escape closes the dialog without navigating. Focus management follows the dialog primitive's defaults.

**Toasts** — surfaced via the module-level `toast({ title, description?, variant? })` from `@solvera/pace-core/components`. Variants:

- `'success'` — Save draft success, send success, schedule success, send-test success.
- `'destructive'` — Save draft failure, send failure, schedule failure, send-test failure, sender-identity RPC failure.

`<ToastProvider>` is mounted by PUMP-01; PUMP-05 does not mount `<Toaster />` itself.

### States

- **Loading — page-level RBAC pending.** Brief blank inside the page content area.
- **Loading — sender-identity RPC.** Banner shows `"Resolving sender identity…"`; composer sender inputs render empty.
- **Loading — pool resolve.** Pool preview shows `<Alert role="status">Resolving recipient pool.</Alert>`. Composer Card remains editable.
- **Loading — templates fetch.** Templates section omitted.
- **Empty — no templates for active channel.** Templates section omitted.
- **Empty — pool resolves to zero recipients.** Pool preview description `"0 estimated recipients"`. Composer's standard zero-recipient warning copy renders. Send / Schedule are not slice-disabled; click → Edge `EMPTY_POOL` error → destructive toast (BR-EdgeErrorSurface).
- **Empty — no events for the org.** Event-participants radio disabled with helper `"No events available for this organisation."`.
- **Error — page guard denied.** PUMP-01's `<AccessDenied>` renders.
- **Error — sender-identity RPC failed.** Banner shows `<Alert variant="destructive">` titled `"Sender identity could not be resolved"` with the error message; destructive toast renders. Send / Schedule / Send test buttons are not slice-disabled; click → Edge re-validation error → destructive toast (BR-EdgeErrorSurface).
- **Error — channel sender-identity unavailable.** `<Alert variant="destructive">` "Email is unavailable …" or "SMS is unavailable …" above the composer. Send / Schedule / Send test buttons are not slice-disabled; click → Edge gateway-config-missing error → destructive toast (BR-EdgeErrorSurface).
- **Error — pool resolve failed.** Pool preview `<Alert variant="destructive">` titled `"Recipient pool unavailable"` with the error message. Send / Schedule buttons are not slice-disabled; click → Edge error → destructive toast (BR-EdgeErrorSurface).
- **Error — Save draft failed.** Destructive toast titled `"Save draft failed"` with the error message. Composer state stays.
- **Error — send / schedule / send-test failed.** Destructive toast titled `"Send failed"` / `"Schedule failed"` / `"Send test failed"` with the error message. Composer state stays.
- **Success — send.** `'success'` toast `"Message sent — <total_recipients> recipients"` (with optional `" — <suppression_skipped> skipped"` and warnings clause). Light reset; operator stays.
- **Success — schedule.** `'success'` toast `"Message scheduled for <formatted scheduled_at>"`. Light reset; operator stays.
- **Success — send-test.** `'success'` toast titled `"Test sent"` with description `"Test sent to your email"` or `"Test sent to your phone"`. Draft unchanged.
- **Success — Save draft.** `'success'` toast `"Draft saved."`.
- **Confirm — discard unsaved changes.** Modal Dialog open; focus trapped inside. Close on Escape, overlay click, or the "Keep editing" button.

### Interactions

- **Recipient-mode radio.** Click updates the slice's recipient mode. The mode-body of the recipient-mode card swaps. The composer's `recipientPool` and adapter mount values update; the composer remounts as needed.
- **Filter chip.** Hover: `<Button variant="outline">` hover treatment. Click: toggles selection (default ↔ outline visual). Pool re-resolves.
- **Include-inactive switch.** Click: toggles. Pool re-resolves.
- **Event single-select.** Standard `<Select>` open / close. Choosing an event updates the descriptor and re-runs sender-identity resolution and pool resolve.
- **Manual multi-select.** Type-ahead populates options live. Clicking an option appends a chip; clicking a chip's × removes it.
- **Channel buttons.** Click: sets channel and re-resolves pool. Email-only or SMS-only fields swap accordingly. Sender-identity banner re-checks `canSendEmail` / `canSendSms`.
- **Template button.** Click: applies the template (writes subject, body_html, body_text, template_id, channel into the draft). Selected button flips to `default`; previously-selected flips to `outline`.
- **Sender / subject / body inputs.** Standard text-input interactions. Selection captured by the composer for merge-token insertion.
- **Preview / Edit toggle.** Click swaps body area between editor and `<MessagePreview>`.
- **Merge-field button.** Click inserts `token` at the captured cursor position of the active field.
- **Save draft.** Click invokes the slice's upsert handler. Success / failure toasts per A-44 / A-25.
- **Send test.** Click invokes `adapter.sendTest`. Disabled per B-05.
- **Schedule.** First click expands; second click invokes `adapter.schedule`. Validation per B-08.
- **Send now.** Click invokes `adapter.send`. Disabled per B-09 / blockForUnresolved.
- **Cancel.** Click triggers dirty-check. If dirty, opens the Dialog. If clean, navigates immediately.
- **Toast.** Auto-dismiss per pace-core2 default. Non-blocking.
- **Org switch.** When the selected organisation changes mid-mount, the slice resets recipient mode to `'org_members'` with no filters, clears any manual `member_ids`, clears chip selections, resets the include-inactive switch, re-runs `pump_get_effective_sender_identity` against the new org, and remounts the composer with the new `organisationId`. The change does not affect any in-flight Save-draft upsert.

### Permission-conditional rendering

| Condition | Page entry | Sender banner | Recipient mode | Composer | Save draft | Send / Schedule / Send test |
|---|---|---|---|---|---|---|
| Not authenticated | Redirect to `/login` (PUMP-01) | n/a | n/a | n/a | n/a | n/a |
| Authenticated, no org | PUMP-01 no-org empty state | n/a | n/a | n/a | n/a | n/a |
| `read:page.comms-log` denied → `create:page.comms-log` denied | PUMP-01 `<AccessDenied>` | hidden | hidden | hidden | hidden | hidden |
| `create:page.comms-log` allowed, `update:page.comms-log` denied | Visible | Visible | Visible | Read-only banner; inputs disabled | Visible (per draft-owner RLS) | Composer footer shows read-only Alert; no Send / Schedule / Send test |
| `create:page.comms-log` and `update:page.comms-log` allowed | Visible | Visible | Visible | Editable | Visible | All four buttons render with normal gating |

---

## §6 Business rules

**BR-RouteGate** — Access to `/comms/create` requires `create:page.comms-log`. PUMP-01 mounts the page guard; PUMP-05 does not re-mount.

**BR-CommRbacContext** — Derived from page grants on `comms-log` (provider mounted by PUMP-01 — see PUMP-01 §7 cross-slice handoffs for the published hook signature):
- `canCompose` ← `create:page.comms-log`
- `canSend` ← `update:page.comms-log`
- `canSchedule` ← `update:page.comms-log`
- `scopeType = 'organisation'`, `scopeId = selectedOrganisation.id`.

**BR-RbacGating** — The composer renders its read-only banner when `!canCompose || !canSend`, and the CardFooter's read-only Alert in place of Send / Schedule / Send test when `!canSend`. The Schedule button is composer-disabled when `!rbac.canSchedule || blockForUnresolved`. UI gating is UX only; Edge re-checks `isPermitted` and re-validates context.

**BR-RecipientModeToggle** — Inputs: operator selects radio `'org_members' | 'event_participants' | 'manual'`. Outputs:
- `'org_members'` → descriptor `{ type: 'org_members', organisation_id, filters: { member_type_ids?, unit_ids?, include_inactive? } }`. Filters omitted when empty.
- `'event_participants'` (only when at least one event exists) → descriptor `{ type: 'event_participants', event_id: <selected event>, filters: { registration_type_ids?, status?, unit_ids? } }`. Filters omitted when empty.
- `'manual'` → descriptor `{ type: 'manual', member_ids: [...] }` (empty array when no member chosen).
- Mode switch does not reset draft body / subject / sender / template.

**BR-SourceContextDerivation** — Source context is derived from the active pool:
- `OrgMembersPool` → `source_context_type = null`, `source_context_id = null`.
- `EventParticipantsPool` → `source_context_type = 'event'`, `source_context_id = pool.event_id`.
- `ManualPool` → `source_context_type = null`, `source_context_id = null`.

The adapter is mounted with these derived values; the composer remounts when the source context changes. There is no operator-facing event picker outside the EventParticipantsPool body.

**BR-ManualMode** — In manual mode, the slice queries `core_member` joined to `core_person` for display name, scoped to `organisation_id = selectedOrganisation.id`. Selected ids populate `ManualPool.member_ids`. The browser carries ids only; no addresses or merge data leave the browser. The query uses `useSecureSupabase()` and standard pace-core2 RLS-respecting reads.

**BR-MemberTypeIdCast** — `core_membership_type.id` is integer in dev-db; CR23's `OrgMembersPoolFilters.member_type_ids` is `string[]`. The slice casts integer ids to strings before placing them in the descriptor.

**BR-SenderIdentityResolution** — On mount and on source-context change (driven by pool changes per BR-SourceContextDerivation), the slice calls `pump_get_effective_sender_identity(organisation_id, source_context_type, source_context_id)` via `useSecureSupabase().rpc(...)`. The returned `EffectivePumpSenderIdentity` is destructured directly. `resolvedFrom` is the discriminator for the audit display ("which tier resolved").

**BR-SenderIdentityDisplay** — Operators do not edit identity. The slice renders the read-only banner above the composer with channel-conditional copy (§5 — Sender-identity banner). The composer's own sender inputs are pre-populated from the resolved identity. The composer's identity inputs technically remain editable in v1; Edge re-validates and silently uses server-resolved values. The pace-core2 `lockSenderIdentity` enhancement (consolidated on TEAM-13's existing backlog item — see §17) closes the UX gap properly when it lands.

**BR-SenderIdentityValidation** — `canSendEmail = senderName !== null && fromAddress !== null` (per the RPC return). `canSendSms = senderPhone !== null`. When the active channel's `canSendX === false`, the slice renders the destructive `<Alert>` above the composer (§5 — channel-unavailable copy). The composer's Send / Schedule / Send test buttons are NOT slice-disabled; if the operator clicks them, Edge returns a gateway-config-missing error which surfaces as a destructive toast per BR-EdgeErrorSurface. The channel-switch button stays clickable.

**BR-Strict** — When the selected template's `require_merge_field_validation === true`, the composer blocks send if any token in subject / body is unresolved against `loadMergeFields` for the current pool. The composer surfaces `onSendError('Resolve merge tokens before sending this strict template.')`; the slice converts this to a destructive toast.

**BR-PermissiveTokens** — When strict-mode is off, unresolved tokens do not block send unless `blockSendOnUnresolvedTokens === true`. With `blockSendOnUnresolvedTokens={true}` mounted (PUMP-05's choice), every unresolved token blocks. Edge re-runs token validation per CR23.

**BR-BlockToggle** — `blockSendOnUnresolvedTokens={true}` is the slice's mount value. While unresolved tokens exist, the composer surfaces `onSendError('Resolve all tokens before sending.')` for any send / schedule attempt.

**BR-AdapterOnly** — Templates load via `adapter.loadTemplates(...)` (Edge `pump-load-templates`). Merge fields load via `adapter.loadMergeFields(...)` (Edge `pump-load-merge-fields`). The slice does NOT call `pump_list_merge_fields(...)` directly; the slice does NOT SELECT against `pump_organisation_templates` directly. PUMP-04 (templates CRUD) is the only slice that reads / writes `pump_organisation_templates` directly. This rule is the documented contract for compose / send consumer slices across the suite.

**BR-MergeFieldsRead** — Composer-internal `useCommMergeFields` is the read path; PUMP-05 does not invoke it directly. The hook calls `adapter.loadMergeFields({ organisationId, channel, recipientPool, sourceContextType?, sourceContextId? })` which routes to `pump-load-merge-fields`.

**BR-PoolPreview** — The composer's internal `useResolvedPool` invokes `adapter.resolvePool(pool, { organisationId, channel })` → `CommRecipientPreview` (count, sample names, warnings). The SPA never enumerates recipients in-browser.

**BR-PoolWarnings** — Pool warnings render labelled text via `poolWarningLabel(warning)` for `no_email`, `no_phone`, `suppressed`, `unknown`.

**BR-EmptyPoolGuard** — When `recipientPreview.estimated_count === 0`, the composer renders its standard zero-recipient warning copy inline. Send and Schedule are NOT slice-disabled in v1 — the composer's defaults stand (it disables only on `blockForUnresolved`). If the operator clicks Send or Schedule against an empty pool, Edge `pump-send` / `pump-schedule` returns an `EMPTY_POOL` error which surfaces as a destructive toast per BR-EdgeErrorSurface. Send-test does not depend on the pool. Future pace-core2 enhancement may add a `blockSendOnEmptyPool` prop — see §17.

**BR-Send** — `adapter.send(buildCommSendRequest(...))` invokes `pump-send`. The request carries: `organisation_id`, `channel`, `subject?`, `body_html?`, `body_text`, `pool: RecipientPoolDescriptor`, `sender_name`, `sender_email?`, `sender_phone?`, `reply_to?`, `source_app: 'pump'`, `source_context_type?`, `source_context_id?`, `extra_merge_context?`, `template_id?`. `bypass_suppression` is omitted (defaults to `false`).

**BR-Schedule** — `adapter.schedule(...)` invokes `pump-schedule` with the assembled `CommSendRequest + scheduled_at` (ISO 8601). The composer renders the bare `<Input type="datetime-local">` with no helper text and no inline validation; pre-click 5-minute or past-time validation is NOT slice-imposed in v1. If the operator picks an invalid `scheduled_at` (past time, sub-5-minute) and clicks Confirm schedule, Edge `pump-schedule` returns an error such as `"Scheduled time must be in the future."` which surfaces as a destructive toast per BR-EdgeErrorSurface. The Confirm-schedule button's disable rules are composer-internal (`!rbac.canSchedule || blockForUnresolved`). The derived `scheduled_at` shape (ISO 8601 string from the datetime-local value) is consumed by the composer's internal `handleSchedule`. Future pace-core2 enhancement may add `scheduleAtMin` and `scheduleAtHelperText` props — see §17.

**BR-SendTest** — `adapter.sendTest(...)` invokes `pump-send-test` with content + sender + source-context fields. The request shape OMITS `pool`, `system_key`, `system_recipient`, `bypass_suppression`. Destination is the signed-in user's contact for the active channel, resolved server-side. Click fires immediately; no confirmation. Channel-aware success copy: email → `"Test sent to your email"`; SMS → `"Test sent to your phone"`. The Send-test button's disable rules are composer-internal (only `blockForUnresolved`). The slice does NOT add `validateCommDraft` or channel-availability disable conditions in v1; an unavailable channel triggers an Edge `pump-send-test` gateway-config-missing error on click which surfaces as a destructive toast per BR-EdgeErrorSurface. Future pace-core2 enhancement may add a `blockTestOnUnavailableChannel` prop — see §17.

**BR-Warnings** — `CommSendResult.warnings: CommTokenWarning[]` carry `type: 'unresolved_token' | 'gateway_partial_failure'`, `token?`, `count`, `message`. UX: appended to the send-success toast description per §4 B-02 (TEAM-13 precedent — append-to-toast). The clause `" Some recipients had unresolved tokens or partial gateway failures; check delivery in the comms log."` is appended when `warnings.length > 0`. The slice does not render an inline warnings list; operators drill into PUMP-02's message detail for per-warning content.

**BR-PostSendNavigation** — On send / schedule success, the operator stays on `/comms/create`. Light reset leaves `draft.channel` and the resolved sender-identity values in place; clears `subject`, `body_html`, `body_text`, `template_id`, `extra_merge_context`; resets recipient mode to `'org_members'` with no filters; clears scheduled-time picker state. The recipient pool is cleared as part of the mode reset. If the prior pool mode was EventParticipants (which mounted the adapter with `sourceContextType: 'event', sourceContextId: <event_id>`), the next compose defaults to OrgMembers mode, which requires the adapter to remount with no source-context args. The slice handles this by reading the current pool mode and rebuilding the adapter via `useCommSendAdapter()` when the mode changes — React's hook rules permit this because the hook is called unconditionally and only its arguments change. The composer subtree re-mounts when the adapter reference changes.

**BR-ErrorSurface** — Failed `ApiResult` from any adapter call renders via `toast({ variant: 'destructive', title: '<action> failed', description: result.error.message })` where `<action>` is `Send` / `Schedule` / `Send test` / `Save draft`. Composer state stays. No inline banner.

**BR-DraftSaveTrigger** — When the operator clicks the composer's Save Draft button (rendered by `<CommComposer>` post-pace-core2 enhancement — see §17), the composer invokes `adapter.saveDraft(draft)`. PUMP-05's adapter override implements `saveDraft` as an UPSERT into `pump_message` with `status='draft'` and required NOT NULL columns populated (channel, body_text, sender_name, source_app='pump', recipient_pool_descriptor as JSONB nullable, organisation_id, created_by). The same draft id is reused across save calls within a session — PUMP-05 generates a client-side UUID at composer mount via `crypto.randomUUID()` and stores it in component state for the upsert key. Auto-save on blur / unmount / template-select is NOT used; persistence fires only when the operator clicks Save Draft.

**BR-DraftAdapterOverride** — PUMP-05 builds a `CommSendAdapter` instance that wraps `useCommSendAdapter()` output with a single `saveDraft` override. All other adapter methods (`resolvePool`, `loadTemplates`, `loadMergeFields`, `send`, `sendTest`, `schedule`) are passed through unchanged, so read paths (templates, merge fields, pool resolve) flow through the unwrapped adapter via Edge per S-4. The `saveDraft` override calls `useSecureSupabase().from('pump_message').upsert(...)` directly with the draft state. Required NOT NULL columns populated: `body_text`, `sender_name`, `source_app='pump'`, `organisation_id`, `channel`, `status='draft'`. Optional columns populated when known: `subject`, `body_html`, `sender_email`, `sender_phone`, `reply_to_email`, `template_id`, `recipient_pool_descriptor` (JSON; null when no pool selected), `source_context_type`, `source_context_id`, `extra_merge_context` (default `{}`), `bypass_suppression: false`, `created_by` (from `useUnifiedAuth().user?.id`). First save inserts (id is the client-side UUID held in state); subsequent saves update by id.

**BR-EdgeErrorSurface** — Pre-click UX guards for empty pool, past / sub-5-minute schedule time, and channel availability are NOT enforced at the composer in v1. The composer's defaults stand (Send / Schedule disabled only on `blockForUnresolved`; Schedule additionally on `!rbac.canSchedule`; Send-test disabled only on `blockForUnresolved`). Edge functions return error codes which surface as destructive toasts: empty pool → Edge `EMPTY_POOL` → toast `"Cannot send to an empty pool. Add recipients before sending."`; past schedule time → Edge schedule error → toast `"Scheduled time must be in the future."`; channel unavailable → Edge gateway-config-missing → toast with the Edge `error.message`. The slice's channel-unavailable Alert above the composer (per Q-D5) is a slice-level affordance, not a composer guard. Future pace-core2 enhancements may add `blockSendOnEmptyPool`, `scheduleAtMin`, `scheduleAtHelperText`, and `blockTestOnUnavailableChannel` props — see §17.

**BR-DraftHookConsumption** — PUMP-05 instantiates `useCommDraft()` at composer mount, passing the resolved sender identity from `pump_get_effective_sender_identity(...)` into the initial draft (`{ sender_name, sender_email, sender_phone }` pre-populated). The hook's returned `draft` is passed to `<CommComposer>` as the `draft` prop along with `setDraft`. Channel changes update `draft.channel`; pool changes update `draft.recipient_pool_descriptor`; body content updates `draft.body_html` / `draft.body_text` / `draft.subject` per the composer's standard wiring.

**BR-DirtyFlagDerivation** — Dirty state for the Cancel-confirm Dialog (Q-D6) is derived from comparing the current draft to the saved-draft baseline (the last successful Save Draft `pump_message` row). On first compose with no prior save, dirty = any non-empty body field, subject, or non-default pool. After Save Draft success, dirty = current draft differs from the saved row.

**BR-RecipientPoolNullable** — `pump_message.recipient_pool_descriptor` is nullable on dev-db (drift from architecture's NOT NULL claim). The slice authors against the live nullable shape; Save draft may insert with `recipient_pool_descriptor = null` when the operator has not yet chosen a pool.

**BR-CancelDestination** — Cancel navigates to `/`. If the draft is dirty, the slice opens the discard-confirmation Dialog first. "Discard" navigates to `/` without saving; "Keep editing" closes the dialog and the operator remains on `/comms/create`. Cancel does NOT auto-save and does NOT delete drafts.

**BR-NoBypassSuppression** — Adapter calls from PUMP-05 never set `bypass_suppression: true`. The default `false` applies. Edge treats absence as default-suppression-respecting.

**BR-CallerEnforcement** — UI gates derived from `useCommRbacContext()` are UX only. Edge re-checks `isPermitted` and re-validates `source_context_id` against the caller's scope. RLS is the security boundary.

**BR-NoBrowserGateways** — The composer / SPA never invokes Resend / Twilio SDKs. Adapter exclusively goes through the Edge contract.

**BR-NoPoolEnumerationInBrowser** — The composer / SPA never enumerates recipients. `ManualPool.member_ids` is the sole exception (ids only, no addresses or merge data).

**BR-ToastVocab** — Variants `'default' | 'destructive' | 'success'`; default duration 5000 ms (per cross-app decision).

**BR-AusEnglish** — Copy uses Australian English: organisation, behaviour, recognise.

---

## §7 API / Contract

### Public exports

PUMP-05 publishes no symbols for other slices to import. The composer surface lives behind `/comms/create`.

### Read contracts

- **Sender identity RPC.** `useSecureSupabase().rpc('pump_get_effective_sender_identity', { p_organisation_id: <orgId>, p_source_context_type: <derived>, p_source_context_id: <derived> })`. Returns `EffectivePumpSenderIdentity` (one row).
- **Manual-mode member query.** `useSecureSupabase().from('core_member').select('id, core_person!inner(preferred_name, first_name, surname)').eq('organisation_id', <orgId>).ilike(...)` for type-ahead matching. The query is type-ahead-bounded (e.g. limit 50) and only returns the columns required to compute the display name.
- **Recipient pool preview.** `adapter.resolvePool(pool, { organisationId, channel })` → `CommRecipientPreview`. Edge slug `pump-resolve-pool`. Driven by the composer's internal `useResolvedPool`.
- **Templates.** `adapter.loadTemplates({ organisationId, channel })` → `CommTemplate[]`. Edge slug `pump-load-templates`. Driven by `useCommTemplates`.
- **Merge fields.** `adapter.loadMergeFields({ organisationId, channel, recipientPool, sourceContextType?, sourceContextId? })` → `CommMergeField[]`. Edge slug `pump-load-merge-fields`. Driven by `useCommMergeFields`.

### Write contracts

- **Save draft (app-local).** `useSecureSupabase().from('pump_message').upsert({ id, organisation_id, channel, subject?, body_html?, body_text, sender_name, sender_email?, sender_phone?, reply_to_email?, template_id?, recipient_pool_descriptor: <json | null>, source_app: 'pump', source_context_type?, source_context_id?, extra_merge_context, bypass_suppression: false, status: 'draft', created_by })`. INSERT path is gated by RLS `rbac_insert_pump_message` (`create:page.comms-log`). UPDATE path is gated by RLS `rbac_draft_owner_update_pump_message` (draft owner) OR `rbac_update_pump_message` (`update:page.comms-log`).
- **Send.** `adapter.send(request: CommSendRequest)` → `ApiResult<CommSendResult>`. Edge slug `pump-send`. Invariants: `request.source_app === 'pump'`, `request.organisation_id === selectedOrganisation.id`, `request.bypass_suppression` omitted, source-context per BR-SourceContextDerivation.
- **Schedule.** `adapter.schedule(request: CommScheduleRequest)` → `ApiResult<CommScheduleResult>`. Edge slug `pump-schedule`. Same shape + `scheduled_at` (ISO 8601). Same invariants.
- **Send test.** `adapter.sendTest(request: CommSendTestRequest)` → `ApiResult<CommSendResult>`. Edge slug `pump-send-test`. OMITS `pool`, `system_key`, `system_recipient`, `bypass_suppression`. Destination resolved server-side from the signed-in user.

### Cross-slice handoffs

- **PUMP-01** mounts the page guard, the `<CommRbacContextProvider>` (publishing `useCommRbacContext()`), and the `<ToastProvider>`. PUMP-05 consumes the context and the toast module. PUMP-05 does not re-mount any of these.
- **PUMP-04** owns `pump_organisation_templates` CRUD. PUMP-05 reads templates exclusively via `adapter.loadTemplates`.
- **PUMP-02** owns the comms log at `/`. PUMP-05's "Back to comms log" link, breadcrumb `Comms log` link, post-send light reset, and Cancel destination all point to `/`. PUMP-05's Save-draft writes a row visible in PUMP-02's draft view (per the `pump_message` draft-visibility RLS split — only the draft author sees their own drafts in the log).
- **PUMP-02B** owns scheduled-message cancel and draft DELETE.
- **PUMP-06** consumes `pump_message_recipient.gateway_message_id` (populated by `pump-send` / `pump-schedule` Edge after PUMP-05B's call resolves). PUMP-05B does not write the column directly; the contract is documented here so PUMP-06A can rely on the column being present after a successful send.
- **PUMP-03** owns the `pump_get_effective_sender_identity(...)` RPC contract; PUMP-05 calls it.

### ID contracts

- `selectedOrganisation.id` (uuid) — used as `organisation_id` for the adapter mount, the `pump_get_effective_sender_identity` RPC argument, the Save-draft upsert, and `OrgMembersPool.organisation_id`.
- `<event_id>` (uuid) — used as `EventParticipantsPool.event_id` and as the `source_context_id` value when the event-participants pool is active.
- `core_member.id` (uuid) — populates `ManualPool.member_ids`.
- `core_membership_type.id` (integer) — read for chip rows; cast to string at the descriptor boundary per BR-MemberTypeIdCast.
- `core_unit.id` (uuid) — populates `OrgMembersPool.filters.unit_ids` and `EventParticipantsPool.filters.unit_ids`.

---

## §8 Data and schema references

### Tables

| Table | Use | RLS | Verification target |
|---|---|---|---|
| `pump_message` | INSERT (Save draft, first save). UPDATE (Save draft, subsequent saves, draft owner OR `update:page.comms-log`). | `rbac_insert_pump_message`, `rbac_draft_owner_update_pump_message`, `rbac_update_pump_message`, `rbac_select_*`, `rbac_delete_pump_message`. | `recipient_pool_descriptor` confirmed nullable on dev-db (drift from architecture; PUMP-05 authors against nullable). NOT NULL columns: `organisation_id`, `channel`, `body_text`, `sender_name`, `source_app`, `status`. |
| `pump_message_recipient` | NEVER from SPA. Edge-only. | `rbac_select_pump_message_recipient` only. | n/a. |
| `pump_organisation_templates` | NEVER directly from PUMP-05. Read via `adapter.loadTemplates` (Edge `pump-load-templates`). | `rbac_select_pump_organisation_templates` (`read:page.comms-templates`). | Adapter contract; build prerequisite for Edge deployment. |
| `pump_org_settings` | Not directly read. Sender identity flows through `pump_get_effective_sender_identity(...)`. | n/a — no v1 PUMP UI. | n/a. |
| `pump_suppression` | Not directly read. Edge consults at send time. | Service-role only. | `CommSendResult.suppression_skipped` reflects Edge-side skips. |
| `core_member` (via `core_person`) | SELECT for the Manual-mode type-ahead. | Standard org-scoped RLS on `core_member`. | Confirm `core_member` and `core_person` joins return the expected display fields for the demo org. |
| `core_membership_type` | SELECT for the Org-members membership-type chip row. | `read_team_membership_types` (or equivalent dev RLS). | Confirm `id, name, is_active, organisation_id` columns present and policy returns rows. |
| `core_unit` | SELECT for the Units chip rows. | Standard org-scoped RLS. | Confirm rows return for the demo org. |

### RPCs

| RPC | Use | Returns |
|---|---|---|
| `pump_get_effective_sender_identity(p_organisation_id uuid, p_source_context_type text, p_source_context_id uuid)` | Compose-time mount + on source-context change. | One row matching `EffectivePumpSenderIdentity` (camelCase aliases). STABLE SECURITY DEFINER. |
| `check_rbac_permission_with_context` | Used INSIDE RLS policies on `pump_message`; PUMP-05 SPA does not call directly. | boolean. |

### Edge functions

| Slug | Use | Notes |
|---|---|---|
| `pump-resolve-pool` | Composer-internal pool resolution. | ABSENT from dev-db — build prerequisite. |
| `pump-load-templates` | Composer-internal templates fetch. | ABSENT — build prerequisite. |
| `pump-load-merge-fields` | Composer-internal merge-fields fetch. | ABSENT — build prerequisite. |
| `pump-send` | Send now. | ABSENT — build prerequisite. |
| `pump-schedule` | Schedule. | ABSENT — build prerequisite. |
| `pump-send-test` | Send test. | ABSENT — build prerequisite. |

All six PUMP Edge functions deploy together before PUMP-05 build merges (per platform-snapshot-2026-05-07).

### Dev-db verification (project: `rkytnffgmwnnmewevqgp`)

- Confirm `pump_get_effective_sender_identity(uuid, text, uuid)` exists and returns the camelCase aliases.
- Confirm `pump_message.recipient_pool_descriptor` is nullable.
- Confirm `pump_message` RLS policies: `rbac_insert_pump_message`, `rbac_draft_owner_update_pump_message`, `rbac_update_pump_message`, `rbac_select_nondraft_pump_message`, `rbac_select_own_drafts_pump_message`, `rbac_delete_pump_message`.
- Confirm `core_member`, `core_person`, `core_membership_type`, `core_unit` shapes match the queries described in §7 for the demo org.
- Confirm via `list_edge_functions` whether `pump-resolve-pool`, `pump-send`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields` are deployed; build is gated on all six being present.

### Domain references

- `../../../packages/core/docs/standards/3-security-rbac-standards.md` — RBAC helper conventions; `check_rbac_permission_with_context`; `get_app_id`.
- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — authoritative integration contract.
- `../../../packages/core/docs/database/decisions/DB-change-decisions-p4.md` — PUMP DB foundation (DB-404 through DB-411).

---

## §9 pace-core2 imports

### §9.1 Imports table

| Symbol | Import path | One-line why |
|---|---|---|
| `CommComposer` | `@solvera/pace-core/comms` | Primary compose surface mounted on `/comms/create` |
| `MessagePreview` | `@solvera/pace-core/comms` | Composer-internal preview component (reference only; not directly mounted by PUMP-05) |
| `RecipientPoolPreview` | `@solvera/pace-core/comms` | Composer-internal pool preview (reference only) |
| `MergeFieldToolbar` | `@solvera/pace-core/comms` | Composer-internal merge toolbar (reference only) |
| `useCommSendAdapter` | `@solvera/pace-core/comms` | Builds the `CommSendAdapter` wired to PUMP Edge |
| `useCommDraft` | `@solvera/pace-core/comms` | Local draft state with dirty tracking |
| `useResolvedPool` | `@solvera/pace-core/comms` | Composer-internal pool resolution hook (reference only) |
| `useCommTemplates` | `@solvera/pace-core/comms` | Composer-internal templates hook (reference only) |
| `useCommMergeFields` | `@solvera/pace-core/comms` | Composer-internal merge-fields hook (reference only) |
| `validateCommDraft` | `@solvera/pace-core/comms` | Save-draft and Send-test gate evaluation |
| `extractMergeTokens`, `getUnresolvedTokens`, `resolveMergeTokens` | `@solvera/pace-core/comms` | Token analysis utilities (composer-internal; PUMP-05 references for completeness) |
| `buildCommSendRequest` | `@solvera/pace-core/comms` | Composer-internal request assembly (reference only) |
| `draftForChannel` | `@solvera/pace-core/comms` | Channel-switch helper (composer-internal) |
| `isOrgMembersPool`, `isEventParticipantsPool`, `isManualPool` | `@solvera/pace-core/comms` | Pool-variant type guards used in source-context derivation |
| `RecipientPoolDescriptor`, `OrgMembersPool`, `EventParticipantsPool`, `ManualPool` | `@solvera/pace-core/comms` (types) | Pool descriptor types |
| `CommDraft`, `CommSendRequest`, `CommSendResult`, `CommTokenWarning`, `CommPoolWarning`, `EffectivePumpSenderIdentity`, `CommSendAdapter` | `@solvera/pace-core/comms` (types) | Slice's typed boundary types |
| `useCommRbacContext` | App-local — published by PUMP-01 **[app-local; published by PUMP-01 — see PUMP-01 §7 cross-slice handoffs]** | Reads `{ canCompose, canSend, canSchedule, scopeType, scopeId }` derived from page grants |
| Typeahead / Combobox primitive (TBD symbol — pace-core2 enhancement) | `@solvera/pace-core/components` **[pace-core2 enhancement; see §17]** | Manual-mode inline type-ahead chip input for `core_member` ids; current `<MultiSelect>` is static-options only and cannot serve a debounced live query against `core_member`. Build is gated on the enhancement landing; the exact symbol name resolves as part of the consolidated pace-core2 PR (§17) |
| `Input` | `@solvera/pace-core/components` | Radio inputs in the recipient-mode card; chip filter triggers |
| `Button` | `@solvera/pace-core/components` | Filter chips, page-shell back link, footer Save-draft button, Dialog action buttons |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | `@solvera/pace-core/components` | Page-shell wrapping (sender-identity banner, recipient-mode card) |
| `Alert`, `AlertTitle`, `AlertDescription` | `@solvera/pace-core/components` | Error / read-only / sender-unavailable banners |
| `Badge` | `@solvera/pace-core/components` | Audit metadata in the sender-identity banner where useful (e.g. `resolvedFrom` chip) |
| `Switch` | `@solvera/pace-core/components` | Include-inactive toggle in Org-members mode |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue` | `@solvera/pace-core/components` | Event single-select in Event-participants mode |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` | `@solvera/pace-core/components` | Discard-unsaved-changes confirmation modal |
| `Label` | `@solvera/pace-core/components` | Radio-row labels and field labels |
| `toast` | `@solvera/pace-core/components` | Save-draft / send / schedule / send-test success and failure surfaces |
| `useCan` | `@solvera/pace-core/rbac` | Reserved — PUMP-05 derives gating from `useCommRbacContext()`; `useCan` is available as a fallback for any extra page-level check the slice needs |
| `useUnifiedAuth` | `@solvera/pace-core/hooks` | Reads `user?.id` for `created_by` on Save-draft upsert |
| `useSecureSupabase` | `@solvera/pace-core/hooks` | Org-scoped Supabase client for `pump_get_effective_sender_identity` RPC, the manual-mode `core_member` query, and the Save-draft `pump_message` upsert |
| `useZodForm` | `@solvera/pace-core/hooks` | Reserved for any local validation form the slice mounts (e.g. schedule-time helper); pace-core2 hook |
| `ChevronLeft` | `lucide-react` | Page-shell back-link icon |

### §9.2 Slice-specific caveats

- **`useCommSendAdapter` mount args.** Mount with `{ organisationId, sourceApp: 'pump', sourceContextType?, sourceContextId? }`. `sourceContextType` and `sourceContextId` are conditional on the active recipient mode per BR-SourceContextDerivation: provided as `'event'` / `<event_id>` only when EventParticipantsPool is active; both `undefined` for OrgMembersPool and ManualPool.
- **Single adapter override — `saveDraft` only.** PUMP-05 builds a custom `CommSendAdapter` instance that wraps `useCommSendAdapter()` output and overrides the `saveDraft` method only. All other methods (`resolvePool`, `loadTemplates`, `loadMergeFields`, `send`, `sendTest`, `schedule`) delegate to the wrapped adapter unchanged. Sibling apps (TEAM-13, BA17) use the hook output directly without wrapping. The override implements `pump_message` UPSERT; the composer footer's Save Draft button (post-pace-core2 enhancement) calls `adapter.saveDraft(draft)` and the override executes the persistence.
- **`useCommDraft` instantiation and sender-identity seeding.** PUMP-05 instantiates `useCommDraft()` at composer mount and seeds the initial draft with the resolved sender identity from `pump_get_effective_sender_identity(...)` (`sender_name`, `sender_email`, `sender_phone`, `reply_to`). The hook's returned `draft` and `setDraft` are passed to `<CommComposer>`. The slice computes its own dirty flag for the Cancel Dialog by comparing the current draft against the last-saved baseline (per BR-DirtyFlagDerivation), independent of the hook's internal `isDirty` if any.
- **`<CommComposer>` `senderIdentityReadOnly` UX gap.** v1 surfaces the resolved sender via the slice-rendered banner above the composer. Composer's own sender inputs technically remain editable; Edge re-validates and silently uses the server-resolved values on send. The pace-core2 `senderIdentityReadOnly` (or `lockSenderIdentity`) enhancement is consolidated in §17's pace-core2 PR proposal. Do not invent an inline lock prop; consume the enhancement when it lands.
- **Inline ManualPool typeahead.** ManualPool's typeahead chip input is authored against a pace-core2 enhancement (Decision 3). Until the primitive ships, ManualPool's runtime behaviour is build-gated. The exact symbol name is to-be-determined as part of the pace-core2 PR (Decision 4 — see §17). Today's `<MultiSelect>` is static-options only and cannot serve the debounced live `core_member` query the slice needs. There is no cross-slice picker hand-off in v1 — PUMP has no directory slice. §16 records the future-migration option when a PUMP directory slice arrives.
- **Client-uuid `pump_message.id` upsert.** PUMP-05 generates a client-side UUID at composer mount (`crypto.randomUUID()`) for the draft's `pump_message.id`. The Save Draft handler upserts using this id as the conflict key, ensuring multiple Save Draft clicks within a session update the same row rather than inserting duplicates. Verified: dev-db RLS policy `rbac_insert_pump_message` does not reference `id` in its WITH CHECK predicate (per platform-snapshot-2026-05-07 RLS summary), so explicit-id INSERT is permitted under the standard `create:page.comms-log` gate.
- **`recipient_pool_descriptor` JSONB nullable.** Dev-db has the column nullable (drift from architecture's NOT NULL claim). Save-draft upserts may insert with `recipient_pool_descriptor = null` when the operator has not yet chosen a pool. Author against the live nullable shape.
- **`useCommRbacContext` is app-local.** PUMP-01 publishes the provider and the hook (see PUMP-01 §7 cross-slice handoffs). pace-core2 publishes only the `CommRbacContext` type. Do not import the hook from `@solvera/pace-core/comms`.
- **No Tooltip primitive.** pace-core2 has no `<Tooltip>`. The sender-identity banner's helper text uses inline help copy instead. Apply the same rule for any other surface help in the slice.

---

## §10 Permission and access rules

### Page-level guards (PUMP-05A)

| Route | `pageName` | `operation` | Mounter | Fallback |
|---|---|---|---|---|
| `/comms/create` | `comms-log` | `create` | PUMP-01 | PUMP-01's `<AccessDenied>` |

### Action-level access (PUMP-05A + PUMP-05B)

| Action | Permission | Resolver | UI behaviour when denied |
|---|---|---|---|
| Render compose surface | `read:page.comms-log` (transitively required by `create`) | PUMP-01 page guard | `<AccessDenied />` (PUMP-01) |
| Compose / edit draft | `create:page.comms-log` | `useCommRbacContext()` → `canCompose` | Composer renders read-only banner; Save draft / Send / Schedule / Send test all hidden or in read-only Alert |
| Save draft | `create:page.comms-log` (INSERT) AND draft-author for UPDATE OR `update:page.comms-log` for non-author UPDATE | RLS policies on `pump_message`; UI check via `canCompose` | Save draft button rendered by composer (post-pace-core2 enhancement); composer-internal rules govern its enable / disable state. RLS at the database boundary is the security gate |
| Send now | `update:page.comms-log` | `useCommRbacContext()` → `canSend` | Composer footer shows read-only Alert; no Send / Schedule / Send test |
| Schedule | `update:page.comms-log` | `useCommRbacContext()` → `canSchedule` | Same |
| Send test | `update:page.comms-log` | `useCommRbacContext()` → `canSend` | Same |

### Server-side enforcement

- **`pump_message` RLS** enforces draft visibility split (`rbac_select_nondraft_pump_message` for non-drafts, `rbac_select_own_drafts_pump_message` for own drafts), insert (`rbac_insert_pump_message` requires `create:page.comms-log`), update (draft owner OR `update:page.comms-log`), delete (`delete:page.comms-log`).
- **`pump_message_recipient`** has no authenticated INSERT / UPDATE / DELETE; Edge writes via service role only.
- **PUMP Edge functions** call `isPermitted` against `{operation}:page.comms-log`, validate the `organisation_id` claim, validate `source_context_id` against caller scope, and re-run token validation. UI gating is UX only.
- **`pump_get_effective_sender_identity`** runs STABLE SECURITY DEFINER; PUMP-03 BR-CallerAuthorisation defines the RPC's authorisation contract.

---

## §11 Acceptance criteria

### PUMP-05A — Route content + composer mount + recipient targeting + draft save

**AC-A-01 — Page entry, authenticated, has org, has create permission.**
Given a user is authenticated, has an org, and has `create:page.comms-log`, when they navigate to `/comms/create`, then the page renders the heading "Compose", the breadcrumb "Comms log / Compose", the "Back to comms log" link with `<ChevronLeft>` icon, the sender-identity banner, the recipient-mode card with `'org_members'` selected, and the composer Card. (Traces A-01, A-02, A-03, A-26, A-27, A-28.)

**AC-A-02 — Sender-identity resolution and banner.**
Given the resolved organisation has `senderName: 'Org Comms'`, `fromAddress: 'comms@example.org'`, `senderPhone: null`, `resolvedFrom: 'organisation'`, and the active channel is email, when the page mounts, then the banner reads "Sending as Org Comms from comms@example.org · resolved from organisation" with the helper text "Sender identity is resolved automatically from your organisation's settings." (Traces A-04, A-05, A-26, BR-SenderIdentityResolution, BR-SenderIdentityDisplay.)

**AC-A-03 — Channel-unavailable Alert (email).**
Given the active channel is email and `canSendEmail === false`, when the page renders, then `<Alert variant="destructive">` "Email is unavailable — no sender address is configured for this organisation. Contact a platform administrator." renders above the composer; the channel-switch button to SMS remains clickable. The composer's Send / Schedule / Send test buttons are not slice-disabled; if the operator clicks them, Edge returns a gateway-config-missing error which surfaces as a destructive toast titled "Send failed" (or "Schedule failed" / "Send test failed") with the Edge error message. (Traces A-22, BR-SenderIdentityValidation, BR-EdgeErrorSurface.)

**AC-A-04 — Recipient mode default and OrgMembers descriptor.**
Given the page is loaded and the operator selects no filters, when `pump-resolve-pool` is invoked by the composer's internal `useResolvedPool`, then the descriptor is `{ type: 'org_members', organisation_id: <orgId>, filters: {} }` and the adapter is mounted with `sourceContextType: undefined, sourceContextId: undefined`. (Traces A-08, A-09, A-29, BR-RecipientModeToggle, BR-SourceContextDerivation.)

**AC-A-05 — Recipient mode Event-participants source context.**
Given the operator selects the Event-participants radio, picks an event with id `evt_1`, and applies no filters, when the composer remounts, then the descriptor is `{ type: 'event_participants', event_id: 'evt_1', filters: {} }` and the adapter is remounted with `sourceContextType: 'event', sourceContextId: 'evt_1'`; the sender-identity RPC re-runs with the event context. (Traces A-30, BR-RecipientModeToggle, BR-SourceContextDerivation, BR-SenderIdentityResolution.)

**AC-A-06 — Recipient mode Manual inline multi-select.**
Given the operator selects the Manual radio and types "Jane" into the multi-select trigger, when the type-ahead query against `core_member` joined to `core_person` returns one match (Jane Smith, member id `m_42`), then clicking the option appends a chip with text "Jane Smith" to the multi-select, the descriptor is `{ type: 'manual', member_ids: ['m_42'] }`, and the adapter remounts with `sourceContextType: undefined, sourceContextId: undefined`. (Traces A-31, BR-RecipientModeToggle, BR-ManualMode.)

**AC-A-07 — Membership-type filter applies to descriptor.**
Given the recipient mode is `'org_members'` and the org has membership types "Junior" (id 1) and "Senior" (id 2), when the operator selects only the Junior chip, then the descriptor is `{ type: 'org_members', organisation_id: <orgId>, filters: { member_type_ids: ['1'] } }` (id cast to string) and the pool re-resolves. (Traces A-32, BR-MemberTypeIdCast.)

**AC-A-08 — Include-inactive switch.**
Given the recipient mode is `'org_members'` and the include-inactive switch is off, when the operator turns it on, then the descriptor is `{ type: 'org_members', organisation_id: <orgId>, filters: { include_inactive: true } }` (other filters omitted) and the pool re-resolves. (Traces A-34, BR-RecipientModeToggle.)

**AC-A-09 — Save draft happy path.**
Given the operator has filled subject "Welcome", body_html "<p>Hi</p>", body_text "Hi", with channel email, sender_name pre-filled and non-empty, and clicks the composer's "Save draft" button (rendered post-pace-core2 enhancement), when the composer invokes `adapter.saveDraft(draft)` and the slice's adapter override resolves the UPSERT successfully, then a `'success'`-variant toast "Draft saved." renders, and a row in `pump_message` exists with `status='draft'`, `source_app='pump'`, the operator's `created_by`, and `id` equal to the client-side UUID generated at composer mount. (Traces A-44, BR-DraftSaveTrigger, BR-DraftAdapterOverride.)

**AC-A-10 — Save draft idempotency on second click.**
Given the operator has saved a draft once and then edits the body, when they click "Save draft" again, then `adapter.saveDraft(draft)` re-fires and the slice's override UPDATES the same `pump_message` row (matched by the client-side UUID kept in component state) — no second row is inserted. (Traces A-44, BR-DraftAdapterOverride.)

**AC-A-11 — Save draft failure.**
Given the operator clicks "Save draft" and the slice's `saveDraft` override returns a Supabase upsert error, when the failure surfaces, then a `'destructive'`-variant toast "Save draft failed" with the error message renders and the composer state stays. (Traces A-25, BR-ErrorSurface.)

**AC-A-12 — Cancel with clean draft.**
Given no draft fields have been edited, when the operator clicks "Cancel", then the app navigates to `/` immediately without a confirmation dialog. (Traces A-45, BR-CancelDestination.)

**AC-A-13 — Cancel with dirty draft opens dialog and discards.**
Given the operator has typed body content but not saved, when they click "Cancel", then a `<Dialog>` titled "Discard unsaved changes?" renders with body "Any text you've entered will be lost.", a `variant="destructive"` "Discard" button, and a `variant="outline"` "Keep editing" button. Clicking "Discard" navigates to `/` without saving; clicking "Keep editing" closes the dialog and the operator remains on `/comms/create`. (Traces A-45, BR-CancelDestination.)

**AC-A-14 — Permission denied — read.**
Given a user is authenticated with org context but lacks `read:page.comms-log`, when they navigate to `/comms/create`, then PUMP-01's `<AccessDenied>` renders inside the route shell and PUMP-05's page body does not render. (Traces A-20, A-46.)

**AC-A-15 — Read-only mode (canSend false).**
Given the user has `read:page.comms-log` and `create:page.comms-log` but lacks `update:page.comms-log`, when they view `/comms/create`, then the composer renders the read-only banner and the CardFooter renders a single read-only `<Alert>` "You have view-only access to this message." in place of Send / Schedule / Send test. The composer's footer Save draft button is governed by composer-internal rules in the readOnlySend branch; PUMP-05 does not impose additional slice-level gating. Draft authorship remains gated by `create:page.comms-log` and the per-row owner-update RLS at the database boundary. (Traces A-48.)

### PUMP-05B — Send / Schedule / Send-test pipeline + result UX

**AC-B-01 — Send now success with no warnings.**
Given a valid email draft with all tokens resolved and a non-empty pool of 47 recipients, when the operator clicks "Send now" and `pump-send` returns `{ message_id: 'msg_1', total_recipients: 47, suppression_skipped: 0, warnings: [] }`, then a `'success'`-variant toast titled "Message sent" with description "47 recipients" renders, the composer light-resets (channel + sender identity carry through; subject / body / pool / scheduled time cleared), and the operator stays on `/comms/create`. (Traces B-01, B-02, BR-PostSendNavigation, BR-Warnings.)

**AC-B-02 — Send now with suppression and warnings appended.**
Given the same draft and `pump-send` returns `{ message_id: 'msg_2', total_recipients: 47, suppression_skipped: 3, warnings: [{ type: 'unresolved_token', token: '{{x}}', count: 5, message: '...' }] }`, when the operator clicks "Send now" and the result resolves, then the success toast description reads "47 recipients — 3 skipped Some recipients had unresolved tokens or partial gateway failures; check delivery in the comms log." (Traces B-02, BR-Warnings.)

**AC-B-03 — Schedule success.**
Given a valid email draft with all tokens resolved and the operator has expanded the schedule control to a future datetime at least 5 minutes from now, when they click "Confirm schedule" and `pump-schedule` returns `{ message_id: 'msg_3' }`, then a `'success'`-variant toast titled "Message scheduled" with description "Message scheduled for <formatted scheduled_at>" renders, the schedule input collapses, the composer light-resets, and the operator stays on `/comms/create`. (Traces B-03, BR-Schedule, BR-PostSendNavigation.)

**AC-B-04 — Schedule time validation surfaces post-click via Edge.**
Given the operator picks a datetime in the past (or sub-5-minute) and clicks "Confirm schedule", when `pump-schedule` returns a schedule-time error such as `"Scheduled time must be in the future."`, then a destructive toast titled "Schedule failed" with that message renders. The composer renders the bare datetime-local input with no slice-supplied helper text and no inline 5-minute disable. (Traces B-03, B-04 surfaced post-click, BR-Schedule, BR-EdgeErrorSurface.)

**AC-B-05 — Send test success (email).**
Given a valid email draft and the active channel is email, when the operator clicks "Send test" and `pump-send-test` returns success, then a `'success'`-variant toast titled "Test sent" with description "Test sent to your email" renders and the draft remains unchanged. (Traces B-05, BR-SendTest.)

**AC-B-06 — Send test success (SMS).**
Given a valid SMS draft, when the operator clicks "Send test" and `pump-send-test` returns success, then a `'success'`-variant toast titled "Test sent" with description "Test sent to your phone" renders. (Traces B-05, BR-SendTest.)

**AC-B-07 — Send test on channel-unavailable surfaces post-click via Edge.**
Given the active channel's gateway config is missing on the org and the operator clicks "Send test", when `pump-send-test` returns a gateway-config-missing error, then a destructive toast titled "Send test failed" with the Edge `error.message` renders. The composer's Send test button itself is not slice-disabled by the channel-availability check; only `blockForUnresolved` disables it. (Traces B-05, BR-SendTest, BR-EdgeErrorSurface.)

**AC-B-08 — Send failure toast leaves draft intact.**
Given a valid draft and the adapter returns `{ ok: false, error: { code: 'PUMP_GATEWAY_DOWN', message: 'Gateway unavailable' } }`, when the operator clicks "Send now", then `toast({ variant: 'destructive', title: 'Send failed', description: 'Gateway unavailable' })` renders and the draft is unchanged. (Traces B-04, BR-ErrorSurface.)

**AC-B-09 — Strict template gates send.**
Given a strict template (`require_merge_field_validation: true`) is selected, the body contains `{{unknown}}` not present in merge fields, and the operator clicks "Send now", when the composer evaluates the gate, then the adapter is not called and a destructive toast titled "Send failed" with description "Resolve merge tokens before sending this strict template." renders. (Traces B-07, BR-Strict.)

**AC-B-10 — Block-on-unresolved gates send.**
Given no template is selected, the body contains `{{unknown}}`, and the operator clicks "Send now", when the composer evaluates the gate, then the adapter is not called and a destructive toast titled "Send failed" with description "Resolve all tokens before sending." renders. (Traces B-01, BR-BlockToggle.)

**AC-B-11 — Empty pool surfaces post-click via Edge.**
Given the recipient pool resolves to `estimated_count === 0`, when the operator clicks "Send now" against the empty pool, then `pump-send` returns an `EMPTY_POOL` error and a destructive toast titled "Send failed" with description such as `"Cannot send to an empty pool. Add recipients before sending."` renders. The composer's standard zero-recipient warning copy also renders inline; the Send-now and Schedule buttons themselves are not slice-disabled by the empty pool. (Traces B-09, BR-EmptyPoolGuard, BR-EdgeErrorSurface.)

**AC-B-12 — Source-app and source-context invariants on send (org-members).**
Given the active recipient mode is `'org_members'`, when the operator clicks "Send now" and the request reaches `pump-send`, then the request payload has `source_app === 'pump'`, `source_context_type === undefined`, `source_context_id === undefined`, and `bypass_suppression` omitted. (Traces B-10, B-11, B-12, BR-Send, BR-NoBypassSuppression.)

**AC-B-13 — Source-app and source-context invariants on send (event-participants).**
Given the active recipient mode is `'event_participants'` with selected event `evt_5`, when the operator clicks "Send now", then the request payload has `source_app === 'pump'`, `source_context_type === 'event'`, `source_context_id === 'evt_5'`. (Traces B-12, BR-Send, BR-SourceContextDerivation.)

**AC-B-14 — Source-app and source-context invariants on send (manual).**
Given the active recipient mode is `'manual'` with `member_ids: ['m1','m2']`, when the operator clicks "Send now", then the request payload has `source_app === 'pump'`, `source_context_type === undefined`, `source_context_id === undefined`, and the descriptor is `{ type: 'manual', member_ids: ['m1','m2'] }`. (Traces B-12, BR-Send, BR-SourceContextDerivation.)

---

## §12 Verification

### PUMP-05A

- **MCP test — `pump_get_effective_sender_identity`.** Against dev-db (`rkytnffgmwnnmewevqgp`), call the RPC with a known org id and `null` source context. Confirm the return columns match `EffectivePumpSenderIdentity` aliases.
- **MCP test — `pump_message` RLS policies present.** Confirm the six policies named under §10 exist on `pump_message`.
- **MCP test — `pump_message.recipient_pool_descriptor` is nullable.** Verify column metadata.
- **MCP test — Manual-mode query.** Run `SELECT id FROM core_member m INNER JOIN core_person p ON … WHERE m.organisation_id = :orgId LIMIT 5` and confirm at least one row for the demo org.
- **MCP test — Membership types and units.** Confirm `core_membership_type` and `core_unit` return rows for the demo org.
- **In-app demo — page entry and identity banner.** Sign in as a PUMP org-admin with `create:page.comms-log`. Visit `/comms/create`. Confirm the heading "Compose", subtitle, breadcrumb, back link, sender-identity banner, recipient-mode card with default `'org_members'`, and composer.
- **In-app demo — recipient-mode swap.** Switch to "Event participants" → confirm the Event single-select renders. Pick an event → confirm filter chips render. Switch to "Manual" → confirm the inline multi-select renders.
- **In-app demo — Save draft.** Type a body with channel email and sender_name pre-filled. Click "Save draft". Confirm the success toast and that a row exists in `pump_message` with `status='draft'`. Click "Save draft" again with new content; confirm the same row updates (no second row created).
- **In-app demo — Cancel dirty.** Type body content. Click "Cancel". Confirm the discard dialog opens. Click "Keep editing" → operator remains on `/comms/create`. Click "Discard" → navigates to `/`.

### PUMP-05B

- **MCP test — Edge function deployment.** Run `list_edge_functions` and confirm `pump-resolve-pool`, `pump-send`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields` all deployed. If any missing, build is gated.
- **MCP test — `pump_gateway_config`.** Confirm at least one row per channel for the dev environment.
- **Fixture seed — `pump_organisation_templates`.** Confirm at least one fixture row per channel for the demo org for the templates section to render.
- **In-app demo — happy-path send.** With a valid draft and non-empty pool, click "Send now". Confirm the success toast carries the recipient count and the composer light-resets.
- **In-app demo — schedule.** Pick a future datetime, click "Confirm schedule". Confirm the success toast and the light reset.
- **In-app demo — send-test.** With a valid draft, click "Send test". Confirm the channel-aware success toast.
- **In-app demo — strict template.** Seed a strict template. Select it. Type an unknown token. Click "Send now". Confirm the destructive toast.
- **In-app demo — block-on-unresolved.** Without a template, type an unknown token. Confirm "Send now" is disabled by the composer's gate; click forces the destructive toast.
- **In-app demo — channel unavailable.** Test the demo org with `canSendEmail === false`. Confirm the destructive Alert renders above the composer; the composer's Send / Schedule / Send test buttons remain enabled (composer-internal rules), but clicking them produces destructive toasts sourced from Edge gateway-config-missing errors. Switching to SMS removes the Alert when `canSendSms === true`.
- **In-app demo — empty pool send attempt.** Build a pool that resolves to `estimated_count === 0`. Confirm the composer's zero-recipient warning copy renders inline. Click "Send now"; confirm a destructive toast titled "Send failed" with the Edge `EMPTY_POOL` error message renders.
- **In-app demo — past-time schedule attempt.** Pick a past datetime, click "Confirm schedule"; confirm a destructive toast titled "Schedule failed" with the Edge schedule-time error message renders.
- **In-app demo — gateway_message_id handoff.** After a successful send, query `pump_message_recipient` for the resulting `message_id` and confirm `gateway_message_id` is populated by Edge.

---

## §13 Testing requirements

- **PUMP-05A — recipient-mode descriptor.** Component test that asserts the descriptor rebuilds correctly on each radio change (org_members ↔ event_participants ↔ manual), on each filter chip toggle, on the include-inactive switch, on event selection in event_participants mode, and on manual member-id append / remove.
- **PUMP-05A — source-context derivation.** Component test that asserts the adapter is mounted with `sourceContextType: undefined` for org_members and manual modes, and `sourceContextType: 'event'` with `sourceContextId: <event_id>` for event_participants mode.
- **PUMP-05A — `member_type_ids` cast.** Component test that asserts integer `core_membership_type.id` values are cast to strings before placement in the descriptor.
- **PUMP-05A — Save-draft trigger.** Component test that asserts the slice's `saveDraft` adapter override is invoked only when the operator clicks the composer's Save draft button (no `pump_message` upsert from the slice on blur / unmount / template-select).
- **PUMP-05A — Save-draft upsert idempotency.** Component test that asserts the second click on Save draft updates the same row (id reuse via the client-side UUID held in component state) rather than inserting a second row.
- **PUMP-05A — Cancel dirty / clean.** Component test that asserts clean cancel navigates immediately and dirty cancel opens the discard dialog. Dirty derivation per BR-DirtyFlagDerivation.
- **PUMP-05A — discard dialog actions.** Component test that asserts "Discard" navigates to `/` and "Keep editing" closes the dialog while the operator remains on `/comms/create`.
- **PUMP-05A — Adapter remount on pool-mode change.** Component test that asserts switching from EventParticipants mode (with mounted `sourceContextType: 'event'`) back to OrgMembers mode rebuilds the adapter via `useCommSendAdapter()` with `sourceContextType: undefined`, and the composer subtree remounts.
- **PUMP-05B — request invariants.** Component test that asserts every adapter call carries `source_app === 'pump'`, omits `bypass_suppression`, and matches the source-context invariants per recipient mode.
- **PUMP-05B — success-toast composition.** Component test that asserts the success-toast description includes the recipient count, conditionally appends `" — <suppression_skipped> skipped"` when > 0, and conditionally appends the warnings clause when `warnings.length > 0`.
- **PUMP-05B — light reset.** Component test that asserts post-send / post-schedule light reset leaves channel and resolved sender-identity values in place and clears subject / body_html / body_text / template_id / extra_merge_context / recipient mode / scheduled time.
- **PUMP-05B — Edge error surfaces.** Component test that asserts an Edge `EMPTY_POOL` error from `pump-send` produces a destructive toast titled "Send failed", and a past-time `pump-schedule` error produces a destructive toast titled "Schedule failed", and a gateway-config-missing `pump-send-test` error produces a destructive toast titled "Send test failed".
- **PUMP-05B — channel-aware Send-test toast.** Component test that asserts email channel produces "Test sent to your email" and SMS channel produces "Test sent to your phone".
- Otherwise: standard PDLC quality gates apply.

---

## §14 Build execution rules

- All Supabase reads (sender-identity RPC, manual-mode `core_member` query, `core_membership_type`, `core_unit`) and the Save-draft `pump_message` upsert go via `useSecureSupabase()`. Do not call `createClient` directly.
- All sends, schedules, send-tests, template loads, merge-field loads, and pool resolves go via the `CommSendAdapter` produced by wrapping `useCommSendAdapter()` output. Do not invoke `functions.invoke` directly. Do not write to `pump_message_recipient`, `pump_delivery_event`, or `pump_suppression` from this slice.
- Mount `<CommComposer>` with `blockSendOnUnresolvedTokens={true}`, `sourceApp='pump'`, `onCancel={handleCancel}`. Do not supply `templates`, `mergeFields`, or `recipientPreview` props — let the composer drive its own queries.
- Mount `useCommSendAdapter` with `{ organisationId, sourceApp: 'pump', sourceContextType?, sourceContextId? }`. Provide `sourceContextType: 'event'` + `sourceContextId: <event_id>` only when EventParticipantsPool is active.
- Build the slice's `CommSendAdapter` instance as a wrapper around `useCommSendAdapter()` output that overrides `saveDraft` only. All other methods delegate to the wrapped hook output unchanged.
- Cast `core_membership_type.id` (integer) to string before placing it in `OrgMembersPool.filters.member_type_ids`.
- Generate the draft's `pump_message.id` once at composer mount via `crypto.randomUUID()` and reuse it on subsequent Save draft clicks. The override calls `useSecureSupabase().from('pump_message').upsert(...)` with this id as the conflict key.
- Cancel does NOT auto-save and does NOT delete drafts.
- Do not query production database during build or test. All MCP verification targets dev-db only (`rkytnffgmwnnmewevqgp`).

---

## §15 Done criteria

- All 15 PUMP-05A acceptance criteria (AC-A-01 through AC-A-15) and 14 PUMP-05B acceptance criteria (AC-B-01 through AC-B-14) verified via the slice's QA pack — totals 29 criteria.
- **Implementation blocked until:**
  - **(a)** PUMP Edge functions `pump-resolve-pool`, `pump-send`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields` are deployed on dev (`rkytnffgmwnnmewevqgp`).
  - **(b)** `pump_gateway_config` is seeded with at least one row per channel for the dev environment so `pump-send` can dispatch.
  - **(c)** `pump_organisation_templates` is seeded with at least one fixture row per org per channel for the templates section to populate for demo.
  - **(d)** pace-core2 `<CommComposer>` Save Draft button enhancement (footer button calling `adapter.saveDraft(draft)`) is published, per the consolidated PR proposal in §17. Without this enhancement, the composer footer renders no Save Draft button and the slice's `saveDraft` adapter override is unreachable.
  - **(e)** pace-core2 typeahead / Combobox primitive (or `<MultiSelect>` async-loadOptions enhancement) is published, per the consolidated PR proposal in §17. Without this primitive, ManualPool's runtime behaviour cannot be wired against `core_member`.
  The v6 slice does not author the Edge function bodies or the pace-core2 enhancements. Until items (a), (b), (c), (d), and (e) are confirmed via Supabase MCP and pace-core2 import-resolution checks, this slice cannot be marked Done.
- **PUMP org-admin role-template seeding.** Confirm the PUMP org-admin role template includes `read:page.comms-log`, `create:page.comms-log`, and `update:page.comms-log` grants on dev. Without these grants, the page guard or `useCommRbacContext` denies and operators see `<AccessDenied />` or the read-only state.
- **gateway_message_id handoff.** Inspect `pump_message_recipient` after a successful PUMP-05B send and confirm `gateway_message_id` is populated by `pump-send` Edge — the contract handoff PUMP-06A relies on.
- **Send / schedule / send-test invariants verified.** Inspect a successful adapter call request body and confirm `source_app === 'pump'`, `bypass_suppression` omitted, source-context per BR-SourceContextDerivation.

---

## §16 Do not

- Do not implement an app-local parallel composer. The compose surface is `<CommComposer>` from `@solvera/pace-core/comms` exclusively.
- Do not call Resend or Twilio SDKs from the browser. The adapter is the only path to PUMP Edge.
- Do not call `pump_list_merge_fields(...)` directly. Merge fields load via `adapter.loadMergeFields` (Edge `pump-load-merge-fields`) only.
- Do not SELECT against `pump_organisation_templates` directly. Templates load via `adapter.loadTemplates` (Edge `pump-load-templates`) only. PUMP-04 is the only slice that reads / writes this table directly.
- Do not type or accept arbitrary from-addresses outside the org's verified senders. The composer's sender inputs are pre-populated from `pump_get_effective_sender_identity`; Edge re-validates and silently uses server-resolved values.
- Do not pass `bypass_suppression: true` from the composer. Adapter calls always omit the field; default `false` applies.
- Do not implement a sender-identity edit surface in v1.
- Do not implement scheduled-message cancel inside `<CommSendAdapter>` or in this slice. PUMP-02B owns it.
- Do not implement draft DELETE in this slice. PUMP-02B owns it.
- Do not write to `pump_message_recipient`, `pump_delivery_event`, or `pump_suppression` from the SPA. Edge owns those writes.
- Do not enumerate recipients in the browser. `ManualPool.member_ids` is the sole exception (ids only — no addresses, no merge data).
- Do not auto-save drafts on blur, unmount, or template selection. Save draft fires only when the operator clicks the composer's Save Draft button (which invokes `adapter.saveDraft(draft)`).
- Do not implement slice-level pre-click guards on the composer's Send / Schedule / Send-test buttons. The composer's defaults stand. Empty-pool, past / sub-5-minute schedule time, and channel-availability conditions surface as destructive toasts after click, sourced from Edge errors (BR-EdgeErrorSurface). The channel-unavailable Alert above the composer (per Q-D5) is a slice-level affordance, not a composer guard.
- Do not mount a separate slice-level Save Draft button. The composer footer's Save Draft button (post-pace-core2 enhancement) is the only Save Draft entry point; PUMP-05's adapter override implements the persistence.
- Do not use the standard `useCommSendAdapter()` output unwrapped. PUMP-05 must wrap it with a custom `CommSendAdapter` that overrides `saveDraft` only. Sibling apps (TEAM, BASE, future consumers) MUST NOT copy this wrapper — their composer slices use the hook output directly without wrapping, leaving drafts ephemeral.
- Do not mount `<Toaster />` or `<ToastProvider>` from this slice. PUMP-01 mounts the provider.
- Do not re-mount `<PagePermissionGuard>` for `/comms/create`. PUMP-01 mounts it with `pageName="comms-log" operation="create"`.
- Do not use `<Tooltip>` primitives — pace-core2 has none. Use inline help text or `aria-label`.
- Do not adopt the cross-slice picker hand-off pattern (TEAM-02 ↔ TEAM-13 sessionStorage doctrine) for ManualPool in v1. Manual mode is implemented inline in the composer because PUMP has no directory slice today. When a future PUMP directory slice arrives, manual mode may switch to the cross-slice handoff.
- Do not navigate away on send / schedule success. The operator stays on `/comms/create`; the slice performs a light reset (preserving channel + resolved sender identity).

---

## §17 References

- [`pump-project-brief.md`](./pump-project-brief.md) — admin-only mandate; communications scope; PUMP suite role.
- [`pump-architecture.md`](./pump-architecture.md) — Suite communications architecture, RBAC model, Effective sender identity contract, Slice sizing (PUMP-05 split A/B), High-risk slices, Information architecture — home, Routes owned.
- [`pump-feature-list.md`](./pump-feature-list.md) — derived feature inventory (traceability).
- [`pump-user-stories.md`](./pump-user-stories.md) — derived user stories (traceability).
- **PUMP-01** — provides the `/comms/create` route mount, `<PagePermissionGuard pageName="comms-log" operation="create">`, the app-local `<CommRbacContextProvider>` (publishing `useCommRbacContext()`; PUMP-01 §7 carries the published hook signature), the `<ToastProvider>`, and the application chrome (`<PaceAppLayout>`, header, navigation menu). PUMP-05 owns the page-level content rendered inside the layout's main content area — including the page heading, subtitle, breadcrumb row, and "Back to comms log" link. PUMP-05 consumes the route mount, page guard, RBAC provider, and toast provider from PUMP-01.
- **PUMP-02** — owns the comms log at `/`. PUMP-05's "Back to comms log" link, breadcrumb `Comms log` link, post-action light reset, and Cancel destination point to `/`. Save-draft writes a row visible in PUMP-02's draft view (per the `pump_message` draft-visibility RLS split — only the draft author sees their own drafts in the log).
- **PUMP-02B** — owns scheduled-message cancel and draft DELETE.
- **PUMP-03** — owns the `pump_get_effective_sender_identity(...)` RPC contract (PUMP-05 calls it).
- **PUMP-04** — owns `pump_organisation_templates` CRUD (PUMP-05 reads templates exclusively via the adapter).
- **PUMP-06** — consumes `pump_message_recipient.gateway_message_id` populated by `pump-send` after PUMP-05B's call. Documents the handoff in PUMP-05B's §7.
- `../../../packages/core/docs/standards/3-security-rbac-standards.md` — RBAC helper attributes; `check_rbac_permission_with_context`; `get_app_id`; canonical RLS policy templates.
- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — authoritative integration contract for `RecipientPoolDescriptor`, `CommSendAdapter`, `EffectivePumpSenderIdentity`, RBAC model.
- `../../../packages/core/docs/database/decisions/DB-change-decisions-p4.md` — PUMP DB foundation (DB-404 through DB-411).
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md); [`../../database/domains/pump.md`](../../database/domains/pump.md) — captured dev-db state of pace-core2 exports, tables, RPCs, RLS, and Edge functions. Cited for all dependency-map verifications.

### Platform prerequisites and follow-on items

- **Platform prerequisite — PUMP Edge deployment.** All six Edge functions (`pump-resolve-pool`, `pump-send`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields`) must be deployed on dev before PUMP-05 can be marked Done. Currently absent on dev (per platform-snapshot-2026-05-07). Listed in §15.
- **Platform prerequisite — `pump_gateway_config` seeding.** At least one row per channel must exist on dev for `pump-send` to dispatch.
- **Demo prerequisite — `pump_organisation_templates` seeding.** At least one fixture row per org per channel is needed for the templates section to render.
- **Platform prerequisite — PUMP org-admin role-template seeding.** Confirm the PUMP org-admin role template includes the three comms-log grants.
- **Platform team — consolidated pace-core2 PR proposal (PUMP-05 build prerequisite).** Propose a pace-core2 PR consolidating compose-related enhancements relevant to all comms apps (PUMP, TEAM, BASE, future):
  1. **`<CommComposer>` Save Draft button** in the footer, calling `adapter.saveDraft(draft)`. Default `saveDraft` (in-memory pass-through) handles ephemeral drafts for sibling apps with no work; apps that persist (PUMP-05) override `saveDraft` via a custom adapter wrapping the `useCommSendAdapter()` output.
  2. **Typeahead / Combobox primitive** for inline picker surfaces (PUMP-05 ManualPool; potentially other surfaces). Either a new component or a `<MultiSelect>` async-loadOptions enhancement that accepts a debounced async `loadOptions(query)` callback. The exact symbol resolves as part of the PR.
  3. **`<CommComposer>` `senderIdentityReadOnly` (or `lockSenderIdentity`) prop** to hide / disable the editable sender_name / sender_email / sender_phone inputs. Consolidates with TEAM-13's existing backlog item (cross-app-decisions.md 2026-05-04 / TEAM-13 §17 backlog entry).

  Items 1 and 2 are PUMP-05 build prerequisites (§15 (d) and (e)). Item 3 is non-blocking — PUMP-05 v1 lives with the editable-but-Edge-revalidated sender inputs.

  Decision 1 explicitly excludes pre-click UX-guard props (`blockSendOnEmptyPool`, `scheduleAtMin`, `scheduleAtHelperText`, `blockTestOnUnavailableChannel`) from this PR's v1 scope — Edge errors plus destructive toasts cover those conditions.
- **Drift (informational) — `pump_message.recipient_pool_descriptor` nullable on dev-db.** Architecture's DB-404 NOT NULL claim does not match dev-db. PUMP-05 authors against the live nullable shape; raise as platform follow-up for DB-404 contract review.
- **Drift (informational) — `pump_org_settings` is RLS-enabled but NOT forced.** Other `pump_*` tables are FORCE RLS. v6 slices do not depend on the difference but raise for platform follow-up.

---

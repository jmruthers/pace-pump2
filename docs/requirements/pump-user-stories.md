# PUMP user stories (derived)

## Scope and authority

This artefact is derived from:

- `docs/requirements/pump/pump-project-brief.md`
- `docs/requirements/pump/pump-architecture.md`
- `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md`
- `docs/requirements/pump/PU02-comms-log-home-requirements.md`
- `docs/requirements/pump/PU03-sender-identity-contract-requirements.md`
- `docs/requirements/pump/PU04-template-library-requirements.md`
- `docs/requirements/pump/PU05-compose-send-requirements.md`
- `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md`
- `docs/requirements/pump/PU07-send-pipeline-edge-requirements.md`

Only explicit or strongly implied stories are included.

## Cross-cutting constraints

- Route and action authorization is controlled by pace-core2 page RBAC contracts and standards.
- No app-specific RBAC model, permission namespace, or custom permission code is introduced in PUMP.
- PUMP-03 remains a prerequisite contract consumed by compose/send and Edge work; it is not a standalone implementation stream.

## Shell, navigation, and access control

### US-01 — Authenticated shell access

As an authenticated PUMP operator, I want the app shell to load with my organisation context, so that I can perform comms operations in the correct tenant.

Acceptance criteria:

- Shell renders for authenticated users with organisation context.
- Unauthenticated users are redirected to `/login` (or app-standard equivalent) for protected routes.

Source refs:

- `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (Overview, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (Implementation plan)

### US-02 — Canonical route set

As an operator, I want stable route ownership for home, compose, templates, login, and not found, so that navigation and permissions are predictable.

Acceptance criteria:

- Routes exist for `/`, `/comms/create`, `/comms/templates`, `/login`, and `*`.
- Feature ownership aligns to architecture slice ownership.

Source refs:

- `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (Information architecture, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (Route ownership)

### US-03 — Removed legacy list route

As an operator, I want only one canonical communications log route, so that there is no duplicate list experience.

Acceptance criteria:

- `/comms` is not registered.
- Direct navigation to `/comms` resolves NotFound.

Source refs:

- `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (Information architecture, Do not)
- `docs/requirements/pump/pump-architecture.md` (Information architecture — home, Route ownership)
- `docs/requirements/pump/pump-project-brief.md` (Known redesign areas)

### US-04 — Page-level RBAC route gating

As an authorised user, I want route access controlled by page RBAC permissions, so that users only access authorised comms surfaces.

Acceptance criteria:

- `/` requires `read:page.CommsLog`.
- `/comms/create` requires `create:page.CommsLog`.
- `/comms/templates` requires `read:page.CommsTemplates`.

Source refs:

- `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (API / Contract)
- `docs/requirements/pump/pump-architecture.md` (RBAC model, Route access mapping)

## Communications log and detail (home route)

### US-05 — Operator-first log home

As a communications operator, I want `/` to show the communications log, so that I can immediately see what was sent and its status.

Acceptance criteria:

- `/` displays communications log as the primary view.
- Compose entry point is present on home.

Source refs:

- `docs/requirements/pump/PU02-comms-log-home-requirements.md` (Overview, PUMP-02A contract)
- `docs/requirements/pump/pump-architecture.md` (Information architecture — home)

### US-06 — Draft visibility scoping

As an operator, I want to see my own drafts but not other users' drafts, so that draft work-in-progress remains scoped correctly.

Acceptance criteria:

- Non-draft rows in active org are visible per read permission.
- Draft rows are visible only where `created_by = current_user`.
- Edge case (implied): another user draft in same org is excluded from my log.

Source refs:

- `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02A contract, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (RBAC model: Draft visibility target)

### US-07 — Log filtering

As an operator, I want to filter log rows by channel, status, and date range, so that I can narrow message history quickly.

Acceptance criteria:

- Channel filter constrains results.
- Status filter constrains results.
- Date-range filter constrains results.

Source refs:

- `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02A contract, Acceptance criteria)

### US-08 — Stable pagination

As an operator, I want stable cursor-based pagination, so that log browsing remains reliable during concurrent inserts.

Acceptance criteria:

- Cursor/keyset paging behavior is documented.
- Paging remains stable under concurrent inserts.

Source refs:

- `docs/requirements/pump/PU02-comms-log-home-requirements.md` (Acceptance criteria)

### US-09 — In-page batch drill-down

As an operator, I want recipient and delivery detail to open from the home log without changing route, so that investigation stays in one workflow.

Acceptance criteria:

- Batch selection loads recipient and delivery detail on `/`.
- Selection state is URL-backed query state (refresh/share capable).
- Edge case (implied): malformed batch identifier returns controlled not-found/inline error state.

Source refs:

- `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02A contract, API / Contract, Testing requirements)

### US-10 — Cancel scheduled messages

As an authorised operator, I want to cancel eligible scheduled messages from log/detail, so that I can stop messages before dispatch.

Acceptance criteria:

- Eligible scheduled rows expose cancel action that uses `pump-cancel`.
- Cancel follows documented author/admin and org rules.
- Edge case (implied): unauthorised or ineligible rows cannot be cancelled.

Source refs:

- `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02B contract, API / Contract)
- `docs/requirements/pump/pump-architecture.md` (RBAC model: Cancel authorisation)

### US-11 — Delete drafts from log/detail

As an authorised operator, I want to delete eligible draft rows, so that I can remove incomplete drafts from my queue.

Acceptance criteria:

- Draft delete is a normal `pump_message` delete action.
- Delete follows existing `delete:page.CommsLog` plus tenancy/author rules.
- Draft delete is not modelled as cancel/discard inside composer.

Source refs:

- `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02B contract)
- `docs/requirements/pump/pump-architecture.md` (RBAC model: Draft removal)

## Compose prerequisites: sender identity contract (platform-managed, non-standalone)

### US-12 — Read-only sender identity in PUMP

As a PUMP operator, I want sender identity shown as read-only operational context, so that I can send with approved organisational identity without editing identity settings in PUMP.

Acceptance criteria:

- PUMP has no sender-identity settings route/nav.
- Compose/send consume read-only resolved sender contract.
- This story is delivered through compose/send and Edge work, not as a standalone PUMP implementation ticket.

Source refs:

- `docs/requirements/pump/PU03-sender-identity-contract-requirements.md` (Overview, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (RBAC model, Contracts)

### US-13 — Server-resolved sender precedence

As the system, I want sender identity resolved server-side using the documented precedence chain, so that compose display and send validation are consistent.

Acceptance criteria:

- Resolution order: source context override -> org -> ancestor -> platform default.
- Same resolved values are used at compose time and send-time validation.
- Browser does not traverse raw hierarchy/settings tables for fallback logic.

Source refs:

- `docs/requirements/pump/PU03-sender-identity-contract-requirements.md` (Resolution rules, API / Contract)
- `docs/requirements/pump/pump-architecture.md` (RBAC model: Org settings precedence, effective sender contract)

### US-14 — Channel readiness enforcement

As an operator, I want send actions blocked when sender identity requirements are not met, so that invalid email/SMS sends are prevented.

Acceptance criteria:

- Email send blocked when `canSendEmail = false`.
- SMS send blocked when `canSendSms = false`.

Source refs:

- `docs/requirements/pump/PU03-sender-identity-contract-requirements.md` (Acceptance criteria, Resolution rules)

## Template library

### US-15 — Create and edit organisation templates

As a template manager, I want to create and edit organisation templates, so that reusable message content is available for compose flows.

Acceptance criteria:

- CRUD persists against `pump_organisation_templates` with organisation isolation.
- `created_by` is set from auth on create.

Source refs:

- `docs/requirements/pump/PU04-template-library-requirements.md` (Overview, Functional contract, Acceptance criteria)

### US-16 — Retire templates without hard delete

As a template manager, I want to retire templates instead of hard deleting them, so that historical template records are preserved.

Acceptance criteria:

- Retirement sets `is_active = false`.
- Hard delete is not used in v1 template lifecycle.

Source refs:

- `docs/requirements/pump/PU04-template-library-requirements.md` (Functional contract, Acceptance criteria, Do not)

### US-17 — Channel-specific template validation

As a template manager, I want validation to match message channel requirements, so that template content is structurally valid for email or SMS.

Acceptance criteria:

- Email template requires channel-appropriate email fields.
- SMS template requires channel-appropriate SMS field(s).

Source refs:

- `docs/requirements/pump/PU04-template-library-requirements.md` (Functional contract, Acceptance criteria)

### US-18 — Strict-mode template visibility

As a template manager, I want strict merge validation mode shown on templates, so that I can identify and manage stricter token validation behavior.

Acceptance criteria:

- `require_merge_field_validation` is visible in list and editor.
- Only authorised users can edit strict-mode field.

Source refs:

- `docs/requirements/pump/PU04-template-library-requirements.md` (Functional contract, Acceptance criteria)

### US-19 — Safe template preview

As a template manager, I want preview rendering to be safe even when HTML is authored, so that template authoring does not introduce unsafe rendering behavior.

Acceptance criteria:

- `body_html` authoring uses textarea in v1.
- Preview never injects unsanitized HTML.
- If shared safe renderer is not yet available, preview uses minimal inert/plain behavior rather than introducing a rich parallel renderer.

Source refs:

- `docs/requirements/pump/PU04-template-library-requirements.md` (Safe preview rendering, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (pace-core2 migration assumptions)

### US-20 — Template merge-token scope boundary

As a template manager, I want template editor checks limited to token syntax, so that pool-specific merge availability is evaluated only in compose where recipient context exists.

Acceptance criteria:

- Template CRUD performs basic token syntax checks only.
- Pool-specific merge-field availability checks are deferred to compose flow.
- Browser does not use ad hoc raw metadata table reads.

Source refs:

- `docs/requirements/pump/PU04-template-library-requirements.md` (Merge-field catalogue contract)
- `docs/requirements/pump/PU05-compose-send-requirements.md` (Merge-field contract)

## Compose and send

### US-21 — Compose page uses shared comms package

As a PUMP operator, I want `/comms/create` to use the shared `CommComposer`, so that compose behavior stays aligned with suite comms contracts.

Acceptance criteria:

- `/comms/create` mounts shared composer contract, not app-local substitute.
- Implementation is gated on availability of public `@solvera/pace-core/comms` export.

Source refs:

- `docs/requirements/pump/PU05-compose-send-requirements.md` (Overview, Implementation gate, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (Suite communications architecture, pace-core2 migration assumptions)

### US-22 — Compose access and send authority separation

As an authorised user, I want compose access separated from send authority, so that users can draft without automatically being able to send.

Acceptance criteria:

- Route access/draft authoring uses `create:page.CommsLog`.
- Send/schedule/test-send requires `update:page.CommsLog`.
- Edge case (implied): user can compose/save draft but cannot send/schedule/test-send without update grant.
- Authorization uses pace-core2 RBAC contracts only; no app-specific RBAC code is introduced.

Source refs:

- `docs/requirements/pump/PU05-compose-send-requirements.md` (Functional contract, API / Contract, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (RBAC model)

### US-23 — Resolve recipients via Edge contract

As an operator, I want recipient pool preview resolved server-side, so that recipient targeting and counts are derived from approved backend logic.

Acceptance criteria:

- Pool preview loads through `pump-resolve-pool`.
- Browser does not implement independent pool resolution logic.

Source refs:

- `docs/requirements/pump/PU05-compose-send-requirements.md` (Data/schema refs, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (Suite communications architecture invariants)

### US-24 — Send, schedule, and test-send through adapter and Edge

As an operator, I want send-now, schedule, and test-send actions to use approved adapter contracts, so that execution remains consistent and auditable.

Acceptance criteria:

- Send, schedule, and test-send actions execute through approved compose and PUMP Edge contracts.
- Calls route through authenticated app transport to PUMP Edge according to shared contract boundaries.
- Browser does not call provider SDKs directly.

Source refs:

- `docs/requirements/pump/PU05-compose-send-requirements.md` (API / Contract, Functional contract, Do not)
- `docs/requirements/pump/pump-architecture.md` (Design principles, Contracts)

### US-25 — Meaningful-save draft persistence

As an operator, I want drafts saved only after meaningful authoring progress, so that empty/placeholder draft noise is reduced.

Acceptance criteria:

- Draft is not persisted before first meaningful save threshold.
- Draft is persisted after meaningful save conditions are met.

Source refs:

- `docs/requirements/pump/PU05-compose-send-requirements.md` (Functional contract, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (RBAC model: Draft persistence recommendation)

### US-26 — Sender identity and merge fields from approved contracts

As an operator, I want compose to load sender identity and merge fields from approved server contracts, so that send behavior matches platform rules.

Acceptance criteria:

- Sender identity and merge fields are loaded through approved server contracts.
- Returned data aligns to the documented sender-resolution and merge-availability contracts.
- Browser does not invent alternate catalogues or raw-table traversal logic.

Source refs:

- `docs/requirements/pump/PU05-compose-send-requirements.md` (Sender identity contract, Merge-field contract)
- `docs/requirements/pump/pump-architecture.md` (Contracts)
- `docs/requirements/pump/pump-project-brief.md` (Intended rebuild target)

### US-27 — Warning visibility in compose results

As an operator, I want unresolved token and partial failure warnings surfaced in result UX, so that I can act on delivery and content quality issues.

Acceptance criteria:

- Warning states from send result contract are displayed clearly.

Source refs:

- `docs/requirements/pump/PU05-compose-send-requirements.md` (Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (Contracts: warning taxonomy)

## Webhooks and delivery pipeline (Edge)

### US-28 — Verified gateway webhook ingestion

As the PUMP backend, I want webhook endpoints for supported gateways with required signature verification, so that only authentic provider events are processed.

Acceptance criteria:

- `pump-webhook/{gateway}` supports `resend` and `twilio`.
- Invalid signatures return 401/403 and cause no DB writes.
- Malformed payload returns 400.

Source refs:

- `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Functional contract, API / Contract, Acceptance criteria)

### US-29 — Delivery-event persistence and recipient transition

As the PUMP backend, I want webhook events normalized into delivery events and applied to recipients with forward-only status transitions, so that message delivery history is reliable.

Acceptance criteria:

- Valid signed webhook inserts normalized `pump_delivery_event`.
- Recipient status transitions are monotonic (no regression).
- `pump-send` correlation contract includes `gateway_message_id` where provider returns it.

Source refs:

- `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Overview, Functional contract, Acceptance criteria, API / Contract)

### US-30 — DB-backed webhook idempotency

As the PUMP backend, I want replayed webhook events deduplicated by persisted keys, so that retries do not create duplicate side effects.

Acceptance criteria:

- Replayed webhook events are deduplicated by persisted keys and database uniqueness constraints.
- Replay does not create duplicate delivery-event rows or duplicate recipient updates.

Source refs:

- `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Data/schema refs, API / Contract, Acceptance criteria)
- `docs/requirements/pump/pump-architecture.md` (Handoff: delivery-event dedupe)

### US-31 — Webhook-driven suppression updates

As the PUMP backend, I want provider unsubscribe/opt-out signals to update suppression registry, so that future send-time suppression can skip unsuitable recipients.

Acceptance criteria:

- Applicable provider signals update `pump_suppression`.
- No operator suppression-management UI is introduced in PUMP v1.
- Edge case (implied): webhook suppression updates are distinct from send-time `suppression_skipped` outcomes.

Source refs:

- `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Functional contract, Acceptance criteria, Do not)
- `docs/requirements/pump/pump-architecture.md` (Send-time suppression vs user/operator unsubscribe)
- `docs/requirements/pump/pump-project-brief.md` (Known exclusions)
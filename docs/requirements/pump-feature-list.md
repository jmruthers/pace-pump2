# PUMP feature list (derived)

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

Only explicit or strongly implied rebuild features are listed.

## Cross-cutting constraints

- Page permissions and route guards follow pace-core2 RBAC standards and contracts; no app-specific RBAC model or permission code is introduced.
- Route-level and action-level permission rules are defined once in architecture/slices and reused by all modules below.

## Module A: App shell and information architecture

### A1. Authenticated PUMP shell bootstrap
- Description: Render authenticated users inside the PUMP app shell with organisation context.
- Atomic test: Authenticated user reaches shell; unauthenticated user is redirected to login/app-standard auth flow.
- Source refs:
  - `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (Overview, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (Implementation plan, Route ownership)

### A2. Canonical route registration and ownership
- Description: Register `/login`, `/`, `/comms/templates`, `/comms/create`, and `*` (NotFound) with slice ownership as defined in architecture.
- Atomic test: Each canonical route resolves to owned feature shell/page; no duplicate route ownership.
- Source refs:
  - `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (Information architecture, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (Implementation plan, Route ownership)

### A3. Explicit removal of `/comms` list route
- Description: Do not register `/comms`; home log is only on `/`.
- Atomic test: Direct request to `/comms` resolves NotFound.
- Source refs:
  - `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (Information architecture, Do not)
  - `docs/requirements/pump/pump-architecture.md` (Information architecture — home, Route ownership)
  - `docs/requirements/pump/pump-project-brief.md` (Known redesign areas: IA & routes)

### A4. Route gating via pace-core2 page RBAC
- Description: Gate canonical PUMP routes through pace-core2 page permissions for comms-log and comms-templates.
- Atomic test: User without required page grant is denied route access.
- Source refs:
  - `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (API / Contract)
  - `docs/requirements/pump/pump-architecture.md` (RBAC model, Route access mapping)

### A5. No PUMP v1 settings pages for sender identity or gateway config
- Description: Do not expose sender identity or gateway settings routes/UI in PUMP v1.
- Atomic test: No nav items/routes exist for sender/gateway settings.
- Source refs:
  - `docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md` (Information architecture, Do not)
  - `docs/requirements/pump/pump-project-brief.md` (Intended rebuild target, Known redesign areas)
  - `docs/requirements/pump/pump-architecture.md` (Suite communications architecture, Contracts)

## Module B: Communications log and delivery visibility (`/`)

### B1. Home page as canonical communications log
- Description: Use `/` as operator-first comms log over target message model.
- Atomic test: `/` renders comms log as primary surface with compose entry point.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (Overview, Rebuild delta)
  - `docs/requirements/pump/pump-architecture.md` (Information architecture — home)
  - `docs/requirements/pump/pump-project-brief.md` (Known redesign areas: IA & routes)

### B2. Draft visibility rule in log row-set
- Description: Show all non-draft rows for active org plus draft rows where `created_by = current_user` only.
- Atomic test: Draft by another user is not visible; own draft is visible.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02A contract, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (RBAC model: Draft visibility target)

### B3. Minimal v1 filters
- Description: Provide channel, status, and date-range filters only.
- Atomic test: Filter choices constrain log query accordingly.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02A contract, Acceptance criteria)

### B4. Cursor/keyset pagination stability
- Description: Use cursor/keyset pagination for log rows and document behavior under concurrent inserts.
- Atomic test: Paging remains stable with concurrent row creation.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (Acceptance criteria)

### B5. In-place drill-down on home route
- Description: Open recipient and delivery-event detail on `/` using URL query state; no separate detail route.
- Atomic test: Selected batch detail loads and persists through refresh/share state.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02A contract, API / Contract)
  - `docs/requirements/pump/pump-architecture.md` (Information architecture — home)

### B6. Scheduled-message cancellation action
- Description: Allow cancel of eligible scheduled rows via `pump-cancel` from log/detail.
- Atomic test: Eligible scheduled message transitions after cancel action; ineligible rows do not expose/allow cancel.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02B contract, API / Contract)
  - `docs/requirements/pump/pump-architecture.md` (RBAC model: Cancel authorisation)

### B7. Draft deletion action
- Description: Delete eligible draft rows as normal `pump_message` delete flow (not cancel/discard concept).
- Atomic test: Draft row is deleted per rules; non-draft history remains.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02B contract)
  - `docs/requirements/pump/pump-architecture.md` (RBAC model: Draft removal)

### B8. Compose CTA from log
- Description: Provide explicit Compose/New message action from home log to `/comms/create`.
- Atomic test: CTA navigates to `/comms/create`.
- Source refs:
  - `docs/requirements/pump/PU02-comms-log-home-requirements.md` (PUMP-02A contract)
  - `docs/requirements/pump/pump-architecture.md` (Information architecture — home)

## Module C: Organisation template library (`/comms/templates`)

### C1. Organisation template CRUD on target table
- Description: Create/read/update templates via `pump_organisation_templates`.
- Atomic test: Authorised user can create and edit templates within org scope.
- Source refs:
  - `docs/requirements/pump/PU04-template-library-requirements.md` (Overview, Functional contract, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (Bounded contexts: Templates)

### C2. Soft retirement only
- Description: Retire templates by setting `is_active = false`; no hard delete in v1.
- Atomic test: Retired template remains as inactive record.
- Source refs:
  - `docs/requirements/pump/PU04-template-library-requirements.md` (Functional contract, Acceptance criteria, Do not)

### C3. Channel-aware template validation
- Description: Enforce required fields by channel (email vs sms).
- Atomic test: Invalid channel-field combinations are blocked.
- Source refs:
  - `docs/requirements/pump/PU04-template-library-requirements.md` (Functional contract, Acceptance criteria)

### C4. Strict-mode flag visibility and edit
- Description: Expose `require_merge_field_validation` in template list/editor for authorised users.
- Atomic test: Strict-mode indicator appears and can be edited by permitted users.
- Source refs:
  - `docs/requirements/pump/PU04-template-library-requirements.md` (Functional contract, Acceptance criteria)

### C5. Basic merge-token syntax checks only
- Description: Validate merge-token shape in template editor; defer pool-specific availability checks to compose flow.
- Atomic test: Malformed token syntax is flagged; pool-specific availability is not evaluated in template CRUD.
- Source refs:
  - `docs/requirements/pump/PU04-template-library-requirements.md` (Merge-field catalogue contract)
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Merge-field contract)

### C6. Safe template preview behavior
- Description: Author `body_html` in textarea and ensure preview never injects unsanitized HTML; reuse shared safe renderer once available.
- Atomic test: Hostile HTML in `body_html` does not execute/inject unsafely.
- Source refs:
  - `docs/requirements/pump/PU04-template-library-requirements.md` (Safe preview rendering, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (pace-core2 migration assumptions)

## Module D: Compose and send (`/comms/create`)

### D0. PUMP-03 prerequisite contract (non-standalone)
- Description: Compose/send consumes the platform-managed sender identity contract; this is a prerequisite dependency and not a standalone implementation stream.
- Atomic test: No separate PUMP feature stream/ticket is required beyond compose/send and Edge consumption.
- Source refs:
  - `docs/requirements/pump/PU03-sender-identity-contract-requirements.md` (Status, Overview, Build execution rules)
  - `docs/requirements/pump/pump-architecture.md` (Implementation plan, Dependency rationale)

### D1. Shared composer mount (CR23-gated)
- Description: Mount shared `CommComposer` on `/comms/create`, not an app-local parallel composer.
- Atomic test: Route renders shared composer contract and package import path is from shared comms export when available.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Overview, Implementation gate, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (Suite communications architecture, pace-core2 migration assumptions)

### D2. Compose route and action authorization
- Description: Use pace-core2 page RBAC grants for route entry and protected send actions; do not add app-specific RBAC logic.
- Atomic test: User with route-level compose grant can draft; protected send actions require the higher page grant.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Functional contract, API / Contract, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (RBAC model, Route access mapping)

### D3. Adapter coverage for compose workflow
- Description: Implement the shared compose adapter contracts for resolve, template/merge loading, send, schedule, draft save, and test send.
- Atomic test: Compose actions execute through approved contracts and return contract-aligned outcomes.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (API / Contract, Functional contract)

### D4. Edge-based pool preview and send pipeline
- Description: Resolve recipients through `pump-resolve-pool`; execute send/schedule/test via PUMP Edge contracts.
- Atomic test: Pool preview loads through resolve endpoint and send/schedule/test invoke correct endpoints.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Data/schema refs, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (Contracts, Suite communications architecture)

### D5. Organisation scope in send/schedule payloads
- Description: Include `source_context_type` and `source_context_id` in send/schedule requests.
- Atomic test: Requests include required source context fields.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Functional contract)
  - `docs/requirements/pump/pump-architecture.md` (Suite communications architecture invariants)

### D6. Draft persistence threshold
- Description: Persist drafts only after first meaningful save.
- Atomic test: No row persisted before meaningful save; row persisted after template/recipients/content threshold met.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Functional contract, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (RBAC model: Draft persistence recommendation)

### D7. Sender identity and merge-field contract consumption
- Description: Load sender identity from `pump_get_effective_sender_identity(...)` and merge fields from `pump_list_merge_fields(...)` backed by `core_field_list.pump_merge_availability`.
- Atomic test: Compose uses approved server contracts and not browser raw-table traversal.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Sender identity contract, Merge-field contract)
  - `docs/requirements/pump/pump-architecture.md` (Contracts, RBAC model)
  - `docs/requirements/pump/pump-project-brief.md` (Intended rebuild target)

### D8. Warning surface for unresolved tokens and partial failures
- Description: Surface warning states from send result contracts.
- Atomic test: Warning payloads are visible to operator on compose/send result flow.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (Contracts: warning types)

### D9. Browser isolation from gateway SDKs
- Description: Browser must not call Resend/Twilio SDKs directly.
- Atomic test: No browser-side provider SDK calls in compose flow.
- Source refs:
  - `docs/requirements/pump/PU05-compose-send-requirements.md` (Functional contract, Do not)
  - `docs/requirements/pump/pump-architecture.md` (Design principles, Do-not rules)

## Module E: Webhooks and async delivery pipeline (Edge)

### E1. Gateway webhook ingress endpoints
- Description: Implement `pump-webhook/{gateway}` for v1 gateways (`resend`, `twilio`).
- Atomic test: Endpoint accepts valid payloads per gateway and routes correctly by gateway path.
- Source refs:
  - `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Overview, Functional contract, API / Contract)
  - `docs/requirements/pump/pump-architecture.md` (Contracts, Implementation plan)

### E2. Mandatory signature verification
- Description: Validate provider signatures/HMAC; reject invalid signatures with 401/403 and no writes.
- Atomic test: Invalid signature yields 4xx and no DB mutations.
- Source refs:
  - `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Functional contract, API / Contract, Acceptance criteria)

### E3. Normalized delivery-event persistence
- Description: Persist normalized `pump_delivery_event` records including provider event identity when available.
- Atomic test: Valid webhook creates normalized delivery-event row with required correlation fields.
- Source refs:
  - `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Overview, API / Contract)
  - `docs/requirements/pump/pump-architecture.md` (Contracts, Verification focus)

### E4. Monotonic recipient status transitions
- Description: Apply forward-only recipient status transitions on `pump_message_recipient`.
- Atomic test: Later state cannot regress to earlier state on replay/out-of-order events.
- Source refs:
  - `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Functional contract, Acceptance criteria)

### E5. DB-backed idempotency with dedupe key
- Description: Use persisted `dedupe_key` and unique `(gateway, dedupe_key)` to prevent duplicate event effects.
- Atomic test: Replayed event does not create duplicate `pump_delivery_event` row or duplicate status application.
- Source refs:
  - `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Data/schema refs, API / Contract, Acceptance criteria)
  - `docs/requirements/pump/pump-architecture.md` (Handoff: delivery-event dedupe)

### E6. Webhook-driven suppression side effects
- Description: Update `pump_suppression` for applicable provider signals; do not introduce suppression UI.
- Atomic test: Applicable provider signal writes suppression side effect; no operator UI path added.
- Source refs:
  - `docs/requirements/pump/PU06-webhooks-delivery-pipeline-requirements.md` (Functional contract, Acceptance criteria, Do not)
  - `docs/requirements/pump/pump-architecture.md` (Send-time suppression vs user/operator unsubscribe)
  - `docs/requirements/pump/pump-project-brief.md` (Known exclusions)

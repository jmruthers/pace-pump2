# PUMP-07 — Send Pipeline Edge Implementation

## §1 Slice metadata

```
Slice ID:          PUMP-07
Name:              Send Pipeline Edge Implementation
Status:            Draft — v1 scope: pump-resolve-pool, pump-send, pump-send-test.
                   Deferred to follow-up slice: pump-schedule, pump-cancel.
Sub-pass split:    PUMP-07A (pump-resolve-pool + dispatcher + error catalog)
                   PUMP-07B (pump-send + pump-send-test)
Tier estimate:     3 (Edge-only; gateway divergence; retry policy; pool resolution SQL)
Depends on:        PUMP-03 (pump_get_effective_sender_identity RPC contract)
                   PUMP-05 (consumer contract; drives pump-send / pump-send-test calls)
                   PUMP-06 (reads gateway_message_id written by this slice)
Backend impact:    Edge functions only; no new DDL. Tables consumed are in place.
Frontend impact:   Non-UI (Edge-only)
Routes owned:      None (Edge function paths: pump-resolve-pool, pump-send, pump-send-test)
QA pack:           docs/test-packs/PUMP-07-qa-pack.md
```

---

## §2 Purpose and scope

PUMP-07 is the outbound send pipeline. It owns the Edge function layer that resolves recipient pools, dispatches messages via gateway adapters, and returns structured results to callers. The slice defines the concrete `PumpRuntime` implementations for three Edge functions in v1 scope.

**What PUMP-07 owns:**

- `pump-resolve-pool` — recipient pool resolution without dispatch; returns `CommRecipientPreview` for composer-side display
- `pump-send` — full send pipeline: pool resolution, suppression check, merge token resolution, DB row creation, gateway dispatch, `gateway_message_id` writeback, and `CommSendResult` composition
- `pump-send-test` — single-recipient test send to the signed-in user; same gateway path as `pump-send`; suppression bypassed with advisory warning

**What PUMP-07 does not own:**

- SPA compose surface — owned by PUMP-05
- Webhook ingress and delivery pipeline — owned by PUMP-06
- Template CRUD — owned by PUMP-04
- Sender identity resolution logic (`pump_get_effective_sender_identity` RPC) — owned by PUMP-03
- Gateway credentials management UI — platform-managed; out of v1 scope
- `pump-schedule` and `pump-cancel` — deferred to a follow-up slice; see §4D and §16

**Why pump-schedule and pump-cancel are deferred:**

`pump-schedule` requires a scheduling execution mechanism — the mechanism that fires dispatch when `scheduled_at` arrives. The three candidate options (pg_cron, Supabase scheduled Edge, external scheduler) each carry different infrastructure dependencies. Kusi resolved (Q-1) to hide the Schedule CTA in v1 and defer the scheduling mechanism decision. Without scheduled messages, `pump-cancel` has no v1 value. Both functions are documented in §4D, §6D, and §16 as deferred.

---

## §3 User-facing surface

n/a — Edge-only slice. No SPA route, no rendering surface, no pace-core2 UI component imports. PUMP-07 functions are invoked by the adapter layer (PUMP-05 via `useCommSendAdapter`) and by system notification callers. No operator interacts directly with these endpoints.

---

## §4 Functional specification

PUMP-07 has no end-user features. The "features" of this slice are observable platform behaviours — outcomes a contract reviewer or QA tester can verify by issuing HTTP fixtures against the Edge functions, inspecting database state, or reading Edge logs.

### §4A — pump-resolve-pool (PUMP-07A)

**Purpose:** Preview the recipient count and sample names for a given `RecipientPoolDescriptor` without dispatching any message.

**Request:**

```
POST  /functions/v1/pump-resolve-pool

Body: {
  organisation_id: string    // UUID
  channel: 'email' | 'sms'
  pool: RecipientPoolDescriptor
}

Auth: Bearer <user JWT>
```

**Validation:**

1. The caller must hold `read:page.comms-log` for the supplied `organisation_id`. Failure returns `PUMP_RBAC_DENIED`.
2. The `pool` field must be one of the supported `RecipientPoolDescriptor` variants (`OrgMembersPool`, `EventParticipantsPool`, `ManualPool`). A `CustomFilterPool` variant returns `POOL_VARIANT_UNSUPPORTED` immediately without DB queries.
3. For `EventParticipantsPool`, the `event_id` must be scoped to the caller's `organisation_id`. Failure returns `INVALID_SOURCE_CONTEXT`.

**Side effects:** None — read-only resolution; no DB writes.

**Response:** `CommRecipientPreview`

```typescript
{
  estimated_count: number        // total resolved recipients including additional contacts
  sample_names: string[]         // up to 5 first names
  warnings: CommPoolWarning[]    // no_email | no_phone | suppressed | unknown
}
```

**Error conditions:** `PUMP_RBAC_DENIED`, `POOL_VARIANT_UNSUPPORTED`, `INVALID_SOURCE_CONTEXT`

---

### §4B — pump-send (PUMP-07B)

**Purpose:** Execute an immediate send — resolve pool, check suppression, resolve merge tokens per recipient, create DB rows, dispatch to gateway, write back `gateway_message_id`, return `CommSendResult`.

**Request:** `CommSendRequest` (serialised)

```
POST  /functions/v1/pump-send

Body: CommSendRequest
Auth: Bearer <user JWT>
```

Key fields: `organisation_id`, `channel`, `body_text`, `subject?`, `body_html?`, `pool` OR (`system_key` + `system_recipient`), `sender_name`, `sender_email?`, `sender_phone?`, `reply_to?`, `source_app`, `source_context_type?`, `source_context_id?`, `extra_merge_context?`, `template_id?`, `bypass_suppression?`.

**Validation (in order):**

1. `sender_name` non-empty; `sender_email` non-empty for email channel; `sender_phone` non-empty for SMS channel; `body_text` non-empty.
2. Exactly one of `pool` or (`system_key` + `system_recipient`) present.
3. RBAC: caller holds `update:page.comms-log` for `organisation_id`. Failure returns `PUMP_RBAC_DENIED`.
4. For `EventParticipantsPool` or system sends with `source_context_id`, validate the context is accessible to the caller's org scope. Failure returns `INVALID_SOURCE_CONTEXT`.
5. Call `pump_get_effective_sender_identity(organisation_id, source_context_type, source_context_id)`; verify `canSendEmail` (email channel) or `canSendSms` (SMS channel) is true. Failure returns `INSUFFICIENT_SENDER_IDENTITY`.
6. Read `pump_gateway_config WHERE channel = $channel AND is_active = true`. No active row returns `GATEWAY_CONFIG_MISSING`.
7. When `template_id` is supplied, check `pump_organisation_templates.require_merge_field_validation`. When true and any referenced token cannot be resolved across the loaded merge fields, return `MERGE_VALIDATION_FAILED` before any dispatch.
8. When pool resolves to zero recipients (and no `canonical_parent_contact` special case), return a `CommSendResult` with `total_recipients: 0` and a `gateway_partial_failure` warning; do not return an error code.

When pool resolution yields zero eligible recipients (after suppression filtering), `pump-send` returns `CommSendResult` with `total_recipients: 0`, `suppression_skipped` equal to the count of skipped addresses, and empty `warnings`. No error is returned — a zero-recipient send is a valid outcome (e.g. all recipients were suppressed).

**Side effects:**

1. Inserts `pump_message` row with `status = 'sending'`
2. For each resolved recipient: inserts `pump_message_recipient` row; dispatches to gateway; on success writes `gateway_message_id` to the recipient row
3. On completion: updates `pump_message.status` to `'sent'` if at least one recipient dispatched without terminal failure; updates to `'failed'` if every recipient failed

**Response:** `ApiResult<CommSendResult>`

```typescript
{
  message_id: string
  total_recipients: number      // all resolved recipients, including suppression-skipped
  suppression_skipped: number   // count of recipients skipped at suppression check
  warnings: CommTokenWarning[]  // unresolved_token | gateway_partial_failure entries
}
```

**Error conditions:** `PUMP_RBAC_DENIED`, `PUMP_SEND_VALIDATION`, `INSUFFICIENT_SENDER_IDENTITY`, `INVALID_SOURCE_CONTEXT`, `GATEWAY_CONFIG_MISSING`, `GATEWAY_REJECTED`, `MERGE_VALIDATION_FAILED`

- `PUMP_SEND_VALIDATION` (422) — request body fails basic validation: `body_text` is empty or `sender_name` is empty.

---

### §4C — pump-send-test (PUMP-07B)

**Purpose:** Send the current message content to the signed-in user only, for pre-send verification. Destination is always the caller's own address for the active channel; no pool, no system recipient.

**Request:** `CommSendTestRequest` (= `Omit<CommSendRequest, 'pool' | 'system_key' | 'system_recipient' | 'bypass_suppression'>`)

```
POST  /functions/v1/pump-send-test

Body: CommSendTestRequest
Auth: Bearer <user JWT>
```

**Validation (in order):**

1. Reject requests that include `pool`, `system_key`, or `system_recipient` fields. Returns `PUMP_SEND_TEST_INVALID_INPUT`.
2. `sender_name`, channel-specific sender field, `body_text` non-empty.
3. RBAC: caller holds `update:page.comms-log` for `organisation_id`. Failure returns `PUMP_RBAC_DENIED`.
4. Resolve the caller's destination via `runtime.resolveCurrentUserDestination(channel)`: for email channel, the user's auth email; for SMS channel, the user's primary phone number from `core_member` / `core_phone`. If no destination exists for the channel, return `PUMP_SEND_TEST_NO_DESTINATION`.
5. Suppression is bypassed: the Edge does not check `pump_suppression` for the caller's address. If the caller's address is in `pump_suppression`, the test send proceeds and an advisory `CommTokenWarning` with `type: 'unresolved_token'` and `message: "Your address is in the suppression registry; production sends would skip you."` is appended to the result.

**Side effects:**

1. Inserts `pump_message` row (audit trail)
2. Dispatches via the same gateway path as `pump-send`
3. Inserts `pump_message_recipient` row; writes `gateway_message_id` on success
4. Updates `pump_message.status` to `'sent'` on gateway success or `'failed'` on gateway failure

**Response:** `ApiResult<CommSendResult>` with `total_recipients: 1`

**Error conditions:** `PUMP_RBAC_DENIED`, `PUMP_SEND_TEST_VALIDATION`, `PUMP_SEND_TEST_NO_DESTINATION`, `PUMP_SEND_TEST_INVALID_INPUT`, `GATEWAY_REJECTED`

- `PUMP_SEND_TEST_VALIDATION` (422) — request body fails basic validation: `body_text` is empty or `sender_name` is empty.

---

### §4D — Deferred: pump-schedule and pump-cancel

**pump-schedule** and **pump-cancel** are out of PUMP-07 v1 scope.

**pump-schedule** is deferred because the scheduling execution mechanism — the component that fires dispatch when `scheduled_at` arrives — is not decided for v1. The candidate mechanisms (pg_cron, Supabase scheduled Edge function, external scheduler) each carry different infrastructure prerequisites. Without a decided and deployed execution mechanism, `pump-schedule` would create `pump_message` rows with `status = 'scheduled'` and `scheduled_at` that no component would ever act on. Shipping a half-pipe creates silent data state with no forward path. The follow-up slice documents all business rules and acceptance criteria when the execution mechanism decision is made.

**pump-cancel** is deferred because there are no scheduled messages in v1 (no `pump-schedule`), so no messages exist that can be cancelled. There is no v1 value. Business rules, error codes, and the `pumpCancel` OR-rule patch prerequisite are documented in §6D and §16 for completeness; the PUMP-02B Cancel row action is hidden in v1.

Business rules for these functions are collected in §6D for reference. Error codes for both functions are included in the §6 BR-ErrorCatalog-* set (they are stable and referenced by PUMP-02B even in deferred state).

---

## §5 Visual specification

n/a — Edge-only slice; no SPA route, no rendering surface, no pace-core2 UI component imports. The HTTP request/response contracts are documented in §7. Operator visibility into the sends produced by this slice is rendered by PUMP-02's drill-down surface.

---

## §6 Business rules

### BR-ResolvePool — Pool resolution rules

**BR-ResolvePool-RBAC** — Before any pool resolution, `pump-resolve-pool` verifies the caller holds `read:page.comms-log` for the request's `organisation_id` via `runtime.hasPermission`. Failure returns `PUMP_RBAC_DENIED`. The RBAC check runs before any DB query.

**BR-ResolvePool-OrgMembers** — For `OrgMembersPool`, the concrete `resolvePoolRecipients` implementation queries `core_member WHERE organisation_id = $org` filtered by optional `member_type_ids` (IN clause), `unit_ids` (IN clause), and `include_inactive` (when false, excludes members that are not active). The query joins `core_person` to populate merge data. Additional contacts with `'full'` or `'notify'` access are auto-included per BR-ResolvePool-AdditionalContacts.

**BR-ResolvePool-EventParticipants** — For `EventParticipantsPool`, the resolver queries `base_application WHERE event_id = $event_id` filtered by optional `registration_type_ids` (IN clause), `status` (values limited to the closed set `submitted | under_review | approved | rejected | withdrawn`), and `unit_ids` (IN clause). The resolver validates that the `event_id` is scoped to the caller's `organisation_id`; a mismatch returns `INVALID_SOURCE_CONTEXT`. The query joins to resolve addresses and merge data. Additional contacts with `'full'` or `'notify'` access are auto-included per BR-ResolvePool-AdditionalContacts.

**BR-ResolvePool-Manual** — For `ManualPool`, the resolver queries `core_member WHERE id IN ($member_ids) AND organisation_id = $org`. Member IDs supplied that are not found within the org's scope are surfaced as `CommPoolWarning` entries with `type: 'unknown'`. There is no additional contact auto-inclusion for `ManualPool` sends — the pool carries explicit IDs with no implicit expansion.

**BR-ResolvePool-CustomFilter** — `CustomFilterPool` is not supported in v1. When a `CustomFilterPool` descriptor is supplied, `pump-resolve-pool` (and `pump-send`) returns `POOL_VARIANT_UNSUPPORTED` without executing any DB query. The type guard `isCustomFilterPool` is called at descriptor dispatch time.

**BR-ResolvePool-AdditionalContacts** — For `OrgMembersPool` and `EventParticipantsPool` sends, the concrete `resolvePoolRecipients` implementation automatically includes contacts from `core_additional_contact` (or equivalent) where the access level is `'full'` or `'notify'`. These contacts are reflected in `CommRecipientPreview.estimated_count` and in the dispatch loop in `pump-send`. The build agent must verify the `core_additional_contact` table structure and access-level column names against dev-db before authoring the SQL join; the table is not documented in the platform snapshot (see §15 build gate).

**BR-ResolvePool-SuppressedWarnings** — When at least one resolved recipient's address is in `pump_suppression` for the `(organisation_id, channel)` pair, `pump-resolve-pool` includes a `CommPoolWarning { type: 'suppressed', count: N, message: '...' }` in the preview response. Suppressed recipients are still counted in `estimated_count` — suppression is a send-time action, not a preview-time filter.

**BR-ResolvePool-NoAddress** — When the channel is `email` and any resolved recipient has no usable email address, `pump-resolve-pool` includes a `CommPoolWarning { type: 'no_email', count: N, message: '...' }`. When the channel is `sms` and any resolved recipient has no usable phone number, a `CommPoolWarning { type: 'no_phone', count: N, message: '...' }` is included.

---

### BR-Dispatcher — Gateway dispatcher abstraction rules

**BR-Dispatcher-Interface** — The `PumpGateway` interface from `edge-service.ts` is the dispatcher contract. Its `send(input: PumpGatewaySendInput): Promise<ApiResult<{ gatewayMessageId: string }>>` signature is the sole surface PUMP-07's orchestration layer calls. PUMP-07 provides two concrete implementations: `ResendGateway` and `TwilioGateway`. The gateway type selects the concrete implementation at runtime by reading `pump_gateway_config.gateway_type`.

**BR-Dispatcher-ConfigMissing** — Before any send-time dispatch, the Edge reads `pump_gateway_config WHERE channel = $channel AND is_active = true` under the service-role client. When no active row exists, the Edge returns `GATEWAY_CONFIG_MISSING` before creating any `pump_message` or `pump_message_recipient` rows.

**BR-Dispatcher-TypeRoute** — `pump_gateway_config.gateway_type` selects the concrete adapter: `'resend'` routes to `ResendGateway`; `'twilio'` routes to `TwilioGateway`. An unknown `gateway_type` value is treated the same as a missing config and returns `GATEWAY_CONFIG_MISSING`.

---

### BR-Resend — Resend adapter rules

**BR-Resend-Request** — The `ResendGateway` adapter POSTs to `https://api.resend.com/emails` with JSON body: `from` formatted as `"<sender_name> <<sender_email>>"` when both fields are present (otherwise `<sender_email>` alone), `to` as a single-element array with the recipient's address, `subject` when present, `html` from `bodyHtml` when present, `text` from `bodyText`, `reply_to` from `replyTo` when present. The request uses `Authorization: Bearer <api_key>` where `api_key` is read from `pump_gateway_config[channel='email'].config.api_key`.

**BR-Resend-GatewayMessageId** — On HTTP 200 or 201, the adapter extracts `response.data.id` as `gatewayMessageId` and returns `{ ok: true, data: { gatewayMessageId } }`.

**BR-Resend-Transient** — HTTP 429 and HTTP 5xx responses from Resend are transient errors. The adapter returns `{ ok: false, error: { code: 'GATEWAY_TRANSIENT', message: <Resend error body> } }`. The retry loop (BR-Retry-Policy) handles re-attempt.

**BR-Resend-Permanent** — HTTP 4xx responses (excluding 429) are permanent failures. The adapter returns `{ ok: false, error: { code: 'GATEWAY_REJECTED', message: <Resend error body> } }`. No retry. The recipient is marked `failed` with `failure_reason` from the Resend error.

---

### BR-Twilio — Twilio adapter rules

**BR-Twilio-Request** — The `TwilioGateway` adapter POSTs to `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json` with form-encoded body: `To` (recipient phone in E.164 format), `Body` (`bodyText`), and either `MessagingServiceSid` (when `config.messaging_service_sid` is non-empty) or `From` (when `config.from_number` is non-empty). `MessagingServiceSid` takes precedence when both are present. The request uses HTTP Basic auth with `base64(account_sid:auth_token)`, where both values are read from `pump_gateway_config[channel='sms'].config`.

**BR-Twilio-GatewayMessageId** — On HTTP 2xx, the adapter extracts `response.sid` as `gatewayMessageId` and returns `{ ok: true, data: { gatewayMessageId } }`.

**BR-Twilio-Transient** — HTTP 429 and HTTP 5xx responses from Twilio are transient errors. The adapter returns `{ ok: false, error: { code: 'GATEWAY_TRANSIENT', message: <Twilio error body> } }`.

**BR-Twilio-Permanent** — HTTP 4xx responses (excluding 429) are permanent failures. The adapter returns `{ ok: false, error: { code: 'GATEWAY_REJECTED', message: <Twilio error body> } }`. The special case HTTP 400 with Twilio error code `21610` (recipient opt-out) is also a permanent failure — the adapter returns `GATEWAY_REJECTED` with `message: 'Recipient has opted out.'`; the `pump-send` caller creates the recipient row with `status = 'suppression_skipped'` and upserts a `pump_suppression` row with `reason = 'recipient_request'`.

---

### BR-Send — pump-send orchestration rules

**BR-Send-RBAC** — At Edge entry, `pump-send` verifies the caller holds `update:page.comms-log` for `organisation_id` via `runtime.hasPermission`. Failure returns `PUMP_RBAC_DENIED`. No further processing runs on denial.

**BR-Send-SourceContextValidation** — When the request carries `source_context_id` (EventParticipantsPool or system send with source context), the Edge validates that the source context is accessible within the caller's org scope. Failure returns `INVALID_SOURCE_CONTEXT`.

**BR-Send-SenderIdentity** — `pump-send` calls `pump_get_effective_sender_identity(organisation_id, source_context_type, source_context_id)` at send time. When `canSendEmail` is false for an email channel request, or `canSendSms` is false for an SMS channel request, the Edge returns `INSUFFICIENT_SENDER_IDENTITY` before any DB writes.

**BR-Send-SuppressedSkip** — When `bypass_suppression` is false (the default), `pump-send` calls `runtime.isSuppressed({ organisationId, channel, address })` for each recipient before dispatch. Matching recipients (a row exists in `pump_suppression` for the `(organisation_id, address, channel)` triple) are not dispatched. Instead, a `pump_message_recipient` row is created with `status = 'suppression_skipped'` and `failure_reason = 'suppressed'`. These recipients are counted in `CommSendResult.suppression_skipped`.

**BR-Send-BypassSuppression** — When `bypass_suppression` is true (set only by `sendSystemNotification()` from pace-core2; never set by `CommComposer`), the suppression check is skipped entirely for all recipients. Audit rows are still created for all dispatched recipients.

**BR-Send-MergeStrict** — When a `template_id` is supplied and `pump_organisation_templates.require_merge_field_validation` is true, `pump-send` validates all referenced merge tokens across `body_text`, `body_html`, and `subject` against the loaded merge field catalogue before any dispatch. When any token cannot be resolved, the Edge returns `MERGE_VALIDATION_FAILED` and writes no `pump_message` or `pump_message_recipient` rows.

**BR-Send-MergePermissive** — When `require_merge_field_validation` is false (the default), merge tokens are resolved per-recipient using `resolveMergeTokens(content, { ...recipient.mergeData, ...(request.extra_merge_context ?? {}) })`. Tokens that are not in the merge field catalogue remain as their literal form (`{{token_name}}`). Each unresolvable token produces a `CommTokenWarning` with `type: 'unresolved_token'` in `CommSendResult.warnings`.

**BR-Send-MessageStatus** — `pump-send` inserts the `pump_message` row with `status = 'sending'`. On completion, `pump_message.status` transitions to `'sent'` when at least one recipient was dispatched without terminal failure; transitions to `'failed'` when every recipient failed (either via gateway terminal error after retries, or all were suppression-skipped). Partial failure — some succeed, some fail — leaves the message `'sent'` and surfaces the failures as `CommTokenWarning` entries.

**BR-Send-RecipientInsert** — A `pump_message_recipient` row is created for every resolved recipient, including suppression-skipped recipients. For suppression-skipped recipients, the row is created with `status = 'suppression_skipped'` before dispatch is attempted. For dispatched recipients, the row is created after dispatch with `status = 'queued'` (success) or `status = 'failed'` (terminal failure after retries).

**BR-Send-GatewayWriteback** — After a successful gateway dispatch (the adapter returns `{ ok: true, data: { gatewayMessageId } }`), `pump-send` writes `gatewayMessageId` to `pump_message_recipient.gateway_message_id`. This writeback is PUMP-06's sole correlation path for webhook events. The `PumpStoreCreateRecipientInput` type is extended with `gatewayMessageId?: string`; the concrete store implementation writes the value to the DB column when present.

**BR-Send-PartialFailure** — Each recipient is dispatched independently. When a recipient fails after all retries, that recipient's row is marked `failed` with `failure_reason` from the last gateway error. Successful recipients are not rolled back. A `CommTokenWarning { type: 'gateway_partial_failure', count: 1, message: '...' }` is appended to `CommSendResult.warnings` for each failed recipient.

---

### BR-SendTest — pump-send-test rules

**BR-SendTest-RBAC** — `pump-send-test` verifies the caller holds `update:page.comms-log` for `organisation_id`. Failure returns `PUMP_RBAC_DENIED`.

**BR-SendTest-Destination** — The test destination is resolved exclusively from the signed-in user's data: for email channel, the user's `auth.users` email address; for SMS channel, the user's primary phone number from `core_member` joined to `core_phone`. When no address is available for the requested channel, the Edge returns `PUMP_SEND_TEST_NO_DESTINATION`.

**BR-SendTest-BypassSuppression** — The `pump-send-test` Edge handler queries `pump_suppression` for the caller's address before invoking the send orchestration. When a suppression row exists, the send proceeds regardless; the handler appends a `CommTokenWarning` with `type: 'unresolved_token'` and `message: 'Your address is in the suppression registry; production sends would skip you.'` to `CommSendResult.warnings`. The orchestration's `isSuppressed` runtime method is not involved in this path.

**BR-SendTest-NoPool** — `pump-send-test` rejects requests that include `pool`, `system_key`, `system_recipient`, or `bypass_suppression` fields. These fields are incompatible with a test send whose destination is always the signed-in user. Failure returns `PUMP_SEND_TEST_INVALID_INPUT`.

**BR-SendTest-SingleRecipient** — `CommSendResult` from `pump-send-test` always has `total_recipients: 1`. The single recipient is the caller's own address for the active channel.

---

### BR-Retry — Retry policy rules

**BR-Retry-Policy** — Transient gateway failures trigger a per-recipient retry sequence: up to 3 retries (4 total attempts). Delay between attempts uses exponential backoff with jitter: approximately 1 s, 3 s, and 9 s (each with ±50% random jitter). Transient conditions are HTTP 429, HTTP 5xx, and network timeout. The retry sequence applies per recipient, not per batch.

**BR-Retry-Permanent** — HTTP 4xx errors (excluding 429) from the gateway are permanent failures. No retry is attempted. The recipient row is marked `failed` immediately with `failure_reason` from the gateway error body.

**BR-Retry-Exhausted** — When all 3 retries are exhausted with no success, the recipient row is marked `failed` with `failure_reason` from the last error response. The `pump-send` loop continues to the next recipient.

---

### BR-Idempotency — Idempotency rules

**BR-Idempotency-SPA** — The SPA-side optimistic guard (PUMP-05 disables the Send CTA during any in-flight adapter call) is the v1 idempotency mechanism for `pump-send`. No server-side deduplication of duplicate `pump-send` calls is implemented in v1. A server-side idempotency key is documented as a follow-up in §17 for use if double-send incidents surface in production.

**BR-Idempotency-GatewayMessageId** — The partial unique index on `pump_message_recipient.gateway_message_id WHERE NOT NULL` (DB-408) prevents duplicate `gateway_message_id` values across recipient rows. If a gateway dispatch is retried and the gateway acknowledges with a new `gatewayMessageId`, the index does not conflate the two — they are distinct ids.

---

### BR-ErrorCatalog — Error code catalog

**BR-ErrorCatalog-ClosedSet** — Error codes for `pump-resolve-pool`, `pump-send`, and `pump-send-test` form a closed set defined in a shared `_shared/error-codes.ts` module inside the PUMP Edge function deployment. The SPA (PUMP-05) branches on specific codes; all codes are stable string literals. The catalog is a closed TypeScript `const` object, not an enum.

**BR-ErrorCatalog-Codes** — The canonical catalog for v1 (including deferred codes for future use):

| Code | HTTP status | Message template | Notes |
|---|---|---|---|
| `PUMP_RBAC_DENIED` | 403 | "Not permitted to perform this action." | Stable — referenced by PUMP-02 and PUMP-05 |
| `PUMP_SEND_VALIDATION` | 422 | "Send request is invalid: {field} must not be empty." | pump-send |
| `PUMP_SEND_TEST_VALIDATION` | 422 | "Send test request is invalid: {field} must not be empty." | pump-send-test |
| `INSUFFICIENT_SENDER_IDENTITY` | 422 | "Sender identity is insufficient for the requested channel." | pump-send |
| `INVALID_SOURCE_CONTEXT` | 422 | "The source context is not accessible to the caller." | pump-send, pump-resolve-pool |
| `GATEWAY_CONFIG_MISSING` | 500 | "No active gateway configuration found for channel {channel}." | pump-send |
| `GATEWAY_REJECTED` | 422 | "The gateway rejected the message: {reason}." | pump-send, pump-send-test |
| `PUMP_SEND_TEST_NO_DESTINATION` | 422 | "Your account has no {channel} address for test sends." | pump-send-test |
| `MERGE_VALIDATION_FAILED` | 422 | "Strict merge validation failed: {count} tokens could not be resolved." | pump-send (strict mode) |
| `POOL_VARIANT_UNSUPPORTED` | 422 | "CustomFilterPool is not supported in this version." | pump-resolve-pool, pump-send |
| `PUMP_SEND_TEST_INVALID_INPUT` | 422 | "Send test request must not include pool, system_key, system_recipient, or bypass_suppression." | pump-send-test |
| `PUMP_CANCEL_INVALID_STATUS` | 422 | "Only scheduled messages can be cancelled." | Deferred — pump-cancel follow-up; stable — referenced by PUMP-02B |
| `PUMP_CANCEL_OWNER_MISMATCH` | 403 | "Only the creator or an admin can cancel this message." | Deferred — pump-cancel follow-up; stable — referenced by PUMP-02B |

**BR-ErrorCatalog-Stability** — Codes referenced in PUMP-02 (`PUMP_CANCEL_INVALID_STATUS`, `PUMP_CANCEL_OWNER_MISMATCH`, `PUMP_RBAC_DENIED`) and PUMP-05 (`BR-EdgeErrorSurface`) are stable. Any change to these codes requires synchronised updates to PUMP-02 and PUMP-05 before merge.

---

### BR-Observability — Observability rules

**BR-Observability-StageLog** — `pump-send` emits structured JSON log entries to stdout (Supabase Edge logs) at each pipeline stage. Log shapes:
- `pump_send_started` — `{ event, message_id, organisation_id, channel, recipient_count, pool_type }`
- `pump_send_completed` — `{ event, message_id, total_recipients, suppression_skipped, gateway_failures, warning_count }`
- `pump_send_recipient_failed` — `{ event, message_id, recipient_id, gateway_error_code, gateway_error_message, attempt_number }`
- `pump_send_gateway_error` — `{ event, message_id, gateway_type, http_status, attempt_number }`
- `pump_resolve_pool_completed` — `{ event, organisation_id, channel, pool_type, resolved_count }`

**BR-Observability-PII** — Log entries must not include raw email addresses, phone numbers, or message body content. Recipient identification in logs uses `pump_message_recipient.id` (UUID) only. Address values are redacted from all log fields.

**BR-Observability-Retention** — Supabase Edge logs (stdout) are the v1 observability target. No external APM is required in v1. Persistent audit state is provided by `pump_message` and `pump_message_recipient` rows, which PUMP-02 reads for the operator drill-down.

---

### §6D — Deferred business rules (pump-schedule and pump-cancel)

The following business rules are out of PUMP-07 v1 scope. They are documented here for the follow-up slice.

**BR-Schedule-RBAC** — `pump-schedule` verifies the caller holds `update:page.comms-log` for `organisation_id`. Failure returns `PUMP_RBAC_DENIED`. *(Deferred — no v1 implementation.)*

**BR-Schedule-FutureTime** — `scheduled_at` must be at least 5 minutes in the future relative to the Edge invocation time. Earlier values return `SCHEDULE_TIME_PAST`. *(Deferred.)*

**BR-Schedule-PoolResolve** — `pump-schedule` resolves the pool at schedule time using the same logic as `pump-send`. Zero recipients returns `PUMP_SCHEDULE_NO_RECIPIENTS`. Recipients are not persisted to `pump_message_recipient` at schedule time — re-resolved at dispatch time. *(Deferred.)*

**BR-Schedule-Status** — `pump-schedule` creates `pump_message` with `status = 'scheduled'` and `scheduled_at` populated. No gateway dispatch. Returns `CommScheduleResult { message_id }`. *(Deferred.)*

**BR-Cancel-RBAC** — `pump-cancel` authorises via OR-rule: `isAuthor = (message.created_by === userId)` OR `isAdmin = hasPermission('update:page.comms-log', organisationId)`. When neither is true, returns `PUMP_CANCEL_OWNER_MISMATCH` (caller has the permission but is not the author) or `PUMP_RBAC_DENIED` (caller lacks the permission entirely). Note: the `pumpCancel` helper in `edge-service.ts` currently uses AND semantics — this must be patched to OR before the follow-up slice ships (see §9.2 and §17). *(Deferred.)*

**BR-Cancel-StatusCheck** — `pump-cancel` validates `message.status === 'scheduled'`. Any other status returns `PUMP_CANCEL_INVALID_STATUS`. The status check runs after the authorisation check so that an unauthorised caller cannot learn the message's status. *(Deferred.)*

**BR-Cancel-Transition** — On valid authorisation and valid status, `pump-cancel` sets `pump_message.status = 'cancelled'` and `updated_at = now()`. Returns `ApiResult<{ message_id: string }>`. *(Deferred.)*

---

## §7 Cross-slice handoffs

### PUMP-07 receives from

| Slice | Contract |
|---|---|
| **PUMP-05** (compose & send) | Calls `pump-resolve-pool` (pool preview), `pump-send` (immediate send), and `pump-send-test` via `CommSendAdapter`. The `CommSendRequest` shape is the SPA → Edge contract. `source_app === 'pump'`; `bypass_suppression` always omitted. |
| **PUMP-03** | `pump_get_effective_sender_identity(organisation_id, source_context_type, source_context_id)` RPC; PUMP-07 calls at send time to validate sender identity and resolve sender fields. |

### PUMP-07 produces for

| Slice | Contract |
|---|---|
| **PUMP-06** | `pump_message_recipient.gateway_message_id` — written by `pump-send` after each successful gateway acknowledgement. PUMP-06 reads this column to correlate webhook events. Without this writeback, PUMP-06 falls to `recipient_not_found` for every event. |
| **PUMP-02** | `pump_message` rows — written by `pump-send` and `pump-send-test`. PUMP-02 reads these via RLS-scoped SELECT for the comms log display. |

### PUMP-07 reads

| Table | Purpose |
|---|---|
| `pump_suppression` | Per-recipient suppression check at send time (pump-send reads; PUMP-06 writes) |
| `pump_gateway_config` | Gateway credentials and type selection |
| `pump_organisation_templates` | `require_merge_field_validation` flag for strict template mode |
| `core_member`, `core_person` | Merge data population for pool resolution |
| `base_application`, `core_events` | EventParticipantsPool resolution |
| `core_additional_contact` | Additional contact auto-inclusion (build agent must verify table structure) |

### Deferred cross-slice impacts

- **PUMP-05 Schedule CTA:** The Schedule CTA (`BR-Schedule`) is hidden in v1. When the PUMP-07 follow-up slice ships `pump-schedule`, PUMP-05 must un-hide the Schedule CTA and wire `adapter.schedule(...)` to the live Edge function.
- **PUMP-02B Cancel row action:** The Cancel row action is hidden in v1 (no scheduled messages exist). When the PUMP-07 follow-up slice ships `pump-cancel`, PUMP-02B must un-hide the Cancel row action and wire error-code handling for `PUMP_CANCEL_INVALID_STATUS` and `PUMP_CANCEL_OWNER_MISMATCH`.

---

## §8 Data model — read-only summary

PUMP-07 writes to `pump_message` and `pump_message_recipient`. All other table access is read-only. No new DDL is authored in this slice — the schema is in place per DB-404 through DB-411.

### Tables written

| Table | Columns written | Notes |
|---|---|---|
| `pump_message` | `id`, `organisation_id`, `channel`, `status`, `body_text`, `body_html?`, `subject?`, `sender_name`, `sender_email?`, `sender_phone?`, `reply_to_email?`, `source_app`, `source_context_type?`, `source_context_id?`, `extra_merge_context`, `bypass_suppression`, `template_id?`, `recipient_pool_descriptor?`, `created_by`, `created_at`, `updated_at` | Inserted by pump-send and pump-send-test; status updated on completion |
| `pump_message_recipient` | `id`, `message_id`, `organisation_id`, `member_id?`, `address`, `merge_data`, `status`, `failure_reason?`, `gateway_message_id?`, `created_at` | Inserted per recipient; `gateway_message_id` written after gateway ACK |

### Tables read

| Table | Use |
|---|---|
| `pump_gateway_config` | Gateway type + credentials; service-role read at send time |
| `pump_suppression` | Per-recipient suppression check (UNIQUE index on `organisation_id, address, channel`) |
| `pump_organisation_templates` | `require_merge_field_validation` flag |
| `core_member`, `core_person` | Merge data; org scope validation |
| `base_application` | EventParticipantsPool query |
| `core_events` | Event org-scope validation |
| `core_additional_contact` | Auto-include contacts with `'full'`/`'notify'` access (table structure to be verified — §15 build gate) |
| `core_field_list` | Merge field catalogue via `pump_list_merge_fields(...)` RPC |
| `auth.users` | `resolveCurrentUserDestination` for pump-send-test |

### Edge functions (this slice owns)

| Slug | Path | Status |
|---|---|---|
| `pump-resolve-pool` | `/functions/v1/pump-resolve-pool` | ABSENT from dev-db — build prerequisite |
| `pump-send` | `/functions/v1/pump-send` | ABSENT from dev-db — build prerequisite |
| `pump-send-test` | `/functions/v1/pump-send-test` | ABSENT from dev-db — build prerequisite |

---

## §9 pace-core2 dependency map

### §9.1 Symbols

**From `edge-service.ts` (relative path import within pace-core2 workspace — see §9.2):**

| Symbol | Role in PUMP-07 |
|---|---|
| `pumpResolvePool` | Orchestration function for the `pump-resolve-pool` Edge; PUMP-07 constructs a concrete `PumpRuntime` and calls this |
| `pumpSend` | Orchestration function for the `pump-send` Edge; PUMP-07 constructs a concrete `PumpRuntime` and calls this |
| `pumpSendTest` | Orchestration function for the `pump-send-test` Edge; PUMP-07 constructs a concrete `PumpRuntime` and calls this |
| `PumpRuntime` | Interface that PUMP-07's concrete runtime implements — Supabase DB queries + gateway HTTP calls |
| `PumpStore` | Sub-interface within `PumpRuntime`; DB side-effect operations (`createMessage`, `createRecipient`, `updateMessageStatus`, etc.) |
| `PumpGateway` | Sub-interface within `PumpRuntime`; `send(input)` is the dispatcher contract |
| `PumpResolvedRecipient` | Internal recipient shape returned by `resolvePoolRecipients`; carries `memberId`, `address`, `firstName?`, `mergeData`, `source`, `accessLevel?` |
| `PumpMessageRecord` | Minimal message row shape returned by `createMessage` |

**From `@solvera/pace-core/comms` (types only — Edge functions import types, not SPA hooks):**

| Symbol | Role |
|---|---|
| `CommSendRequest` | pump-send request shape |
| `CommSendTestRequest` | pump-send-test request shape (`Omit<CommSendRequest, 'pool' | 'system_key' | 'system_recipient' | 'bypass_suppression'>`) |
| `CommScheduleRequest` | pump-schedule request shape (deferred; referenced for catalog completeness) |
| `CommScheduleResult` | pump-schedule response shape (deferred) |
| `CommSendResult` | pump-send and pump-send-test response shape |
| `CommTokenWarning` | Warning entries in `CommSendResult.warnings` |
| `CommPoolWarning` | Warning entries in `CommRecipientPreview.warnings` |
| `CommRecipientPreview` | pump-resolve-pool response shape |
| `RecipientPoolDescriptor` | Pool descriptor discriminated union |
| `OrgMembersPool` | Pool variant — org members |
| `EventParticipantsPool` | Pool variant — event participants |
| `ManualPool` | Pool variant — explicit member IDs |
| `CustomFilterPool` | Pool variant — deferred in v1; imported for type-guard dispatch |
| `CommChannel` | Channel discriminant (`'email' \| 'sms'`) |
| `EffectivePumpSenderIdentity` | Sender identity shape returned by `pump_get_effective_sender_identity` |
| `SystemNotificationRecipientDescriptor` | System notification recipient mode |
| `isOrgMembersPool` | Type guard for resolver dispatch |
| `isEventParticipantsPool` | Type guard for resolver dispatch |
| `isManualPool` | Type guard for resolver dispatch |
| `isCustomFilterPool` | Type guard — detects `CustomFilterPool`; returns `POOL_VARIANT_UNSUPPORTED` in v1 |

### §9.2 Caveats

- **Relative path import for `edge-service.ts`.** The orchestration functions (`pumpResolvePool`, `pumpSend`, `pumpSendTest`) and the `PumpRuntime` / `PumpStore` / `PumpGateway` interfaces live in `edge-service.ts` as an internal module. PUMP-07's Edge functions import via relative path within the pace-core2 workspace (e.g. `../../src/comms/edge-service.ts`). This is the v1 approach — promote to a published package export as a platform follow-up (see §17).
- **`PumpStoreCreateRecipientInput` extension required.** The type in `edge-service.ts` does not include `gatewayMessageId`. PUMP-07's concrete store implementation extends this type with `gatewayMessageId?: string` and writes it to `pump_message_recipient.gateway_message_id` when present. This extension is required for PUMP-06 webhook correlation and must be applied before implementing the `pump-send` store.
- **`pumpCancel` AND-rule bug.** The `pumpCancel` function in `edge-service.ts` (line 572) checks `update:page.comms-log` permission first, then checks `input.createdBy !== runtime.userId` — producing AND semantics. The architecture (line 256) requires OR semantics (author OR admin). The `pumpCancel` helper must be patched to OR-rule before the PUMP-07 follow-up slice ships `pump-cancel`. PUMP-07 v1 does not call `pumpCancel`, so this bug does not block v1 delivery.
- **`CustomFilterPool` type guard only.** `isCustomFilterPool` is cited above because the Edge must detect and reject `CustomFilterPool` descriptors gracefully. The custom filter resolution logic itself is out of v1 scope.
- **pump-send-test suppression advisory warning.** `pumpSendTest` in `edge-service.ts` does not call `runtime.isSuppressed()` — test-send suppression bypass is not implemented in the shared orchestration layer. The concrete `pump-send-test` Edge handler must: (1) resolve the caller's destination address before invoking `pumpSendTest`, (2) query `pump_suppression` for `(organisation_id, address, channel)` directly using the service-role client, (3) if a suppression row exists, invoke `pumpSendTest` normally (send proceeds), then merge an advisory `CommTokenWarning` into the returned `CommSendResult.warnings` before responding. The `CommTokenWarning` shape: `{ type: 'unresolved_token', count: 1, message: 'Your address is in the suppression registry; production sends would skip you.' }`. The `isSuppressed` runtime method is not used for this path.
- **`pumpSend` / `pumpSendTest` gateway_message_id forwarding.** The `pumpSend` function in `edge-service.ts` does not currently forward the gateway-returned `gatewayMessageId` to `runtime.store.createRecipient()` on the success branch. Before PUMP-07B implementation begins, `pumpSend` (and `pumpSendTest`) must be patched in `edge-service.ts` to pass `gatewayMessageId` through to the store's `createRecipient` call. Without this patch, `pump_message_recipient.gateway_message_id` is NULL for every dispatched recipient and PUMP-06 webhook correlation fails entirely. This is a pre-implementation pace-core2 patch, not a PUMP-07 runtime concern.

---

## §10 Acceptance criteria

### §10A — pump-resolve-pool

**AC-07A-01 — OrgMembersPool happy path.**
Given an authenticated caller with `read:page.comms-log` and a valid `OrgMembersPool` descriptor for a non-empty org, when `pump-resolve-pool` is called, then the response is `{ ok: true, data: CommRecipientPreview }` with `estimated_count > 0`, `sample_names` containing up to 5 first names, and `warnings` reflecting any no-address or suppressed-address conditions. Suppressed recipients are still counted in `estimated_count`. (Traces BR-ResolvePool-RBAC, BR-ResolvePool-OrgMembers, BR-ResolvePool-SuppressedWarnings.)

**AC-07A-02 — EventParticipantsPool with status filter.**
Given a valid `EventParticipantsPool` with `filters.status = ['approved']` for an event with known participant counts, when `pump-resolve-pool` is called, then `estimated_count` matches only participants whose status is `'approved'`, not the total registration count. (Traces BR-ResolvePool-EventParticipants.)

**AC-07A-03 — ManualPool all valid.**
Given a `ManualPool` with `member_ids` all present in the org, when `pump-resolve-pool` is called, then `estimated_count` equals `member_ids.length`. Additional contacts are not auto-included for ManualPool (auto-inclusion applies to OrgMembersPool and EventParticipantsPool only). Any member ID not found in the org appears as a `CommPoolWarning` with `type: 'unknown'`. (Traces BR-ResolvePool-Manual.)

**AC-07A-04 — ManualPool with invalid IDs.**
Given a `ManualPool` with one `member_id` not in the org, when `pump-resolve-pool` is called, then the response is `{ ok: true, data: CommRecipientPreview }` with a `CommPoolWarning { type: 'unknown', count: 1 }` entry, and `estimated_count` reflects only the valid members. (Traces BR-ResolvePool-Manual.)

**AC-07A-05 — CustomFilterPool returns unsupported.**
Given a `CustomFilterPool` descriptor, when `pump-resolve-pool` is called, then the response is `{ ok: false, error: { code: 'POOL_VARIANT_UNSUPPORTED' } }` with no DB queries executed. (Traces BR-ResolvePool-CustomFilter.)

**AC-07A-06 — RBAC denied.**
Given an authenticated caller without `read:page.comms-log`, when `pump-resolve-pool` is called, then the response is `{ ok: false, error: { code: 'PUMP_RBAC_DENIED' } }`. (Traces BR-ResolvePool-RBAC.)

---

### §10B — pump-send

**AC-07B-01 — Happy path OrgMembersPool send.**
Given a valid `CommSendRequest` with `OrgMembersPool`, an authenticated caller with `update:page.comms-log`, active gateway config, and sufficient sender identity, when `pump-send` is called, then: one `pump_message` row is inserted with `status = 'sending'` transitioning to `'sent'`; one `pump_message_recipient` row is inserted per resolved recipient; `gateway_message_id` is populated on each recipient row after gateway ACK; `CommSendResult.total_recipients` equals the resolved count. (Traces BR-Send-RBAC, BR-Send-SenderIdentity, BR-Send-MessageStatus, BR-Send-RecipientInsert, BR-Send-GatewayWriteback.)

**AC-07B-02 — Suppression skip.**
Given one recipient whose address is in `pump_suppression` for the org/channel, when `pump-send` is called with `bypass_suppression` omitted, then that recipient's `pump_message_recipient.status = 'suppression_skipped'`; no gateway dispatch occurs for that recipient; `CommSendResult.suppression_skipped = 1`; the remaining recipients are dispatched normally. (Traces BR-Send-SuppressedSkip.)

**AC-07B-03 — Partial gateway failure.**
Given a batch where one recipient returns a transient error that exhausts all retries, when `pump-send` completes, then that recipient's `status = 'failed'`; `CommSendResult.warnings` contains a `gateway_partial_failure` entry; other recipients are unaffected; `pump_message.status = 'sent'` (not `'failed'`). (Traces BR-Send-PartialFailure, BR-Retry-Exhausted, BR-Send-MessageStatus.)

**AC-07B-04 — INSUFFICIENT_SENDER_IDENTITY.**
Given `pump_get_effective_sender_identity` returns `canSendEmail = false` for an email channel request, when `pump-send` is called, then the response is `{ ok: false, error: { code: 'INSUFFICIENT_SENDER_IDENTITY' } }` and no `pump_message` row is written. (Traces BR-Send-SenderIdentity.)

**AC-07B-05 — Strict merge validation failure.**
Given a template with `require_merge_field_validation = true` and a request body containing a token not in the merge field catalogue, when `pump-send` is called, then the response is `{ ok: false, error: { code: 'MERGE_VALIDATION_FAILED' } }` and no `pump_message` or `pump_message_recipient` rows are written. (Traces BR-Send-MergeStrict.)

---

### §10C — pump-send-test

**AC-07C-01 — Happy path.**
Given an authenticated caller with `update:page.comms-log`, an email address on their account, and an active Resend gateway config, when `pump-send-test` is called, then the test email is dispatched; `CommSendResult.total_recipients = 1`; `pump_message_recipient.gateway_message_id` is populated. (Traces BR-SendTest-RBAC, BR-SendTest-Destination, BR-SendTest-SingleRecipient.)

**AC-07C-02 — Suppressed caller address still delivers.**
Given the caller's email address is in `pump_suppression`, when `pump-send-test` is called, then the test send proceeds; `CommSendResult.warnings` contains an advisory `CommTokenWarning` with `type: 'unresolved_token'` and `message` referencing the suppression registry. (Traces BR-SendTest-BypassSuppression.)

**AC-07C-03 — No destination for channel.**
Given the caller has no phone number for the SMS channel, when `pump-send-test` is called with `channel: 'sms'`, then the response is `{ ok: false, error: { code: 'PUMP_SEND_TEST_NO_DESTINATION' } }`. (Traces BR-SendTest-Destination.)

**AC-07C-04 — RBAC denied.**
Given an authenticated caller without `update:page.comms-log`, when `pump-send-test` is called, then the response is `{ ok: false, error: { code: 'PUMP_RBAC_DENIED' } }`. (Traces BR-SendTest-RBAC.)

---

## §11 Test plan

**PUMP-07A — Pool resolution test suite:**

1. Per-pool-variant happy-path contract tests for `OrgMembersPool`, `EventParticipantsPool`, `ManualPool` — assert `estimated_count`, `sample_names` length, and warning types.
2. `CustomFilterPool` returns `POOL_VARIANT_UNSUPPORTED` with zero DB queries.
3. RBAC denial test — caller without `read:page.comms-log` receives `PUMP_RBAC_DENIED`.
4. `EventParticipantsPool` with an `event_id` outside the caller's org scope returns `INVALID_SOURCE_CONTEXT`.
5. Additional contact auto-inclusion test — seed an org member with an additional contact at `'full'` access; assert the contact appears in `estimated_count`.
6. Suppressed warning test — seed a suppression row for one member's address; assert `CommPoolWarning { type: 'suppressed', count: 1 }` in the preview and the member is still in `estimated_count`.

**PUMP-07B — pump-send test suite:**

1. Happy-path integration test — assert `pump_message` status transitions, `pump_message_recipient` inserts, and `gateway_message_id` population on a multi-recipient send.
2. Suppression skip — one suppressed address in the batch; assert `suppression_skipped = 1` and the address receives no gateway call.
3. `bypass_suppression = true` — assert the suppression check is skipped and all recipients are dispatched.
4. Retry exhaustion — mock gateway to return 503 four times for one recipient; assert `status = 'failed'` for that recipient and `gateway_partial_failure` warning in the result.
5. Strict merge validation — template with `require_merge_field_validation = true` + unresolvable token; assert `MERGE_VALIDATION_FAILED` with no DB rows written.
6. `INSUFFICIENT_SENDER_IDENTITY` — assert no DB writes on identity failure.
7. `GATEWAY_CONFIG_MISSING` — no active gateway config row; assert error before any DB writes.
8. `canonical_parent_contact` with zero recipients — assert `pump_message.status = 'failed'` and non-error `CommSendResult` with `total_recipients = 0`.

**PUMP-07B — pump-send-test test suite:**

1. Happy path — assert `total_recipients = 1` and `gateway_message_id` populated.
2. Suppressed caller — assert test send proceeds and advisory warning present.
3. No channel destination — assert `PUMP_SEND_TEST_NO_DESTINATION`.
4. Request includes `pool` — assert `PUMP_SEND_TEST_INVALID_INPUT`.
5. RBAC denial — assert `PUMP_RBAC_DENIED`.

**Retry and gateway adapter tests:**

1. `ResendGateway` — assert 200/201 extracts `data.id`; 429 returns `GATEWAY_TRANSIENT`; 400 returns `GATEWAY_REJECTED`.
2. `TwilioGateway` — assert 2xx extracts `sid`; `MessagingServiceSid` takes precedence over `from_number`; 400 with code `21610` returns `GATEWAY_REJECTED`.
3. Retry backoff timing — assert delay sequence approximates ~1 s / ~3 s / ~9 s (with tolerance for jitter).

---

## §12 Visual references

n/a — Edge-only slice; no SPA route, no rendering surface, no visual design artefacts. HTTP request/response shapes are documented in §7 of this slice.

---

## §13 Accessibility

n/a — Edge-only slice; no user-facing rendering surface. PUMP-07 produces no HTML, no ARIA attributes, and no interactive components.

---

## §14 Copy

n/a — Edge-only slice; no user-facing copy surface. Toast copy for send/schedule/send-test outcomes lives in PUMP-05 (BR-ErrorSurface, BR-Warnings). Error message templates are defined in §6 BR-ErrorCatalog-Codes and remain machine-readable codes at the Edge boundary.

---

## §15 Implementation readiness

**Build gated on:**

1. **CR23 PUMP Edge functions deployment to dev-db.** The Edge functions `pump-send`, `pump-resolve-pool`, and `pump-send-test` are absent from dev-db per `platform-snapshot-2026-05-07` lines 297–308. Implementation cannot be exercised until deployment lands.
2. **`pump_gateway_config` credential seeding.** Resend API key and Twilio AccountSid/AuthToken must be seeded in `pump_gateway_config` for happy-path test runs. Without this, all dispatch attempts return `GATEWAY_CONFIG_MISSING`.
3. **`core_additional_contact` table structure verification.** The `resolvePoolRecipients` implementation for `OrgMembersPool` and `EventParticipantsPool` must JOIN this table to include contacts with `'full'` or `'notify'` access. The platform snapshot does not document the table. The build agent must introspect the table against dev-db before authoring the SQL joins; the access-level column name is unverified.
4. **`PumpStoreCreateRecipientInput` extension.** The `edge-service.ts` type must be extended with `gatewayMessageId?: string` before implementing the `pump-send` store. See §9.2.
- **Build gated on:** `pumpSend` / `pumpSendTest` patched in `edge-service.ts` to forward `gatewayMessageId` from the gateway result to the store's `createRecipient` call. Without this patch, `pump_message_recipient.gateway_message_id` remains NULL and PUMP-06 webhook correlation fails.

**Not gated:**

- `pump-schedule` and `pump-cancel` — deferred to follow-up slice; not blocking v1 delivery.
- PUMP-06 deployment — PUMP-07 v1 can dispatch and write `gateway_message_id` independently; PUMP-06 reads the column at webhook time.

---

## §16 Anti-patterns and known deferrals

### Anti-patterns

- **Do not re-implement the orchestration logic from `edge-service.ts`.** Wire the `PumpRuntime` interface; do not copy-paste or shadow `pumpSend`, `pumpResolvePool`, or `pumpSendTest`. The orchestration functions in `edge-service.ts` are the authoritative implementations; PUMP-07 provides only the concrete runtime that satisfies the `PumpRuntime` contract.
- **Do not call `pump_org_settings` or `pump_get_effective_sender_identity` from the SPA.** Sender identity validation is Edge-only. The SPA reads the resolved identity for display only (PUMP-05 §4 A-04); the Edge re-validates on every send.
- **Do not enumerate recipient addresses in the SPA.** Pool resolution is Edge-only. `ManualPool.member_ids` is the sole exception (IDs only; no addresses or merge data cross the SPA boundary).
- **Do not hardcode gateway selection.** The `pump_gateway_config.gateway_type` column selects the concrete `PumpGateway` implementation at runtime. Do not branch on channel name alone.
- **Do not set `bypass_suppression = true` from `CommComposer`.** `bypass_suppression = true` is only valid for system notifications via `sendSystemNotification()`. PUMP-05 BR-NoBypassSuppression confirms this; PUMP-07 must not create a path that accepts the flag from compose-side callers.
- **Do not use the legacy `send-email` or `send-sms` Edge functions.** These are out of scope for the rebuild. All dispatch goes through `pump-send`.

### Known deferrals

- **`pump-schedule`** — out of v1 scope. The scheduling execution mechanism (pg_cron vs Supabase scheduled Edge vs external scheduler) is not decided. The PUMP-07 follow-up slice will implement `pump-schedule` once the execution mechanism is selected and deployed. Prerequisite: scheduling execution mechanism decision.
- **`pump-cancel`** — out of v1 scope alongside `pump-schedule`. No scheduled messages exist in v1; cancel has no value. The PUMP-07 follow-up slice will implement `pump-cancel` when `pump-schedule` ships. The `pumpCancel` OR-rule patch in `edge-service.ts` (see §9.2) must also land before the follow-up slice.
- **`CustomFilterPool` resolution** — out of v1 scope per S-1 resolution. `pump-resolve-pool` and `pump-send` return `POOL_VARIANT_UNSUPPORTED` when a `CustomFilterPool` descriptor is supplied.
- **`core_additional_contact` SQL joins** — the build agent must verify the table structure before implementing auto-include logic in `resolvePoolRecipients`.
- **Server-side idempotency key** — documented in §17 as a follow-up. v1 relies on the SPA optimistic guard.

---

## §17 References and outstanding gates

### Outstanding gates

1. **CR23 PUMP Edge functions deployment** (`pump-send`, `pump-resolve-pool`, `pump-send-test`) to dev-db — required before any runtime evidence can be captured. Edge function deployment is a platform-team action.
2. **`pump_gateway_config` credential seeding** — Resend API key and Twilio AccountSid/AuthToken required for happy-path runs on dev-db.
3. **`core_additional_contact` table structure verification** — build agent must introspect the table (columns, FK to `core_member`, access-level column name) on dev-db before authoring the OrgMembersPool and EventParticipantsPool SQL joins.
4. **`PumpStoreCreateRecipientInput` extension** — `gatewayMessageId?: string` must be added to the type in `edge-service.ts` and the concrete store implementation must write the value. Not blocking the spec; blocking the implementation.

### pace-core2 platform follow-ups

- **`edge-service.ts` orchestration layer promoted to published package export.** Currently imported via relative path only. Promote `PumpRuntime`, `PumpStore`, `PumpGateway`, and the orchestration functions to a published `@solvera/pace-core/comms` export in a future pace-core2 cleanup pass.
- **`pumpCancel` OR-rule patch.** The `pumpCancel` helper (line 572, `edge-service.ts`) implements AND semantics — admin permission check AND author check. Architecture line 256 requires OR semantics (author OR admin). Patch must ship before the PUMP-07 follow-up slice ships `pump-cancel`. Not blocking v1.
- **Server-side idempotency key for `pump-send`.** A client-supplied `idempotency_key` field on `CommSendRequest` and a corresponding column on `pump_message` would prevent double-send on forced page reload. Implement as a follow-up if double-send incidents surface in production.
- `pumpSend` and `pumpSendTest` in `edge-service.ts` patched to forward `gatewayMessageId` from gateway result to `runtime.store.createRecipient()`. Prerequisite before PUMP-07B implementation.

### Cross-slice follow-ups

- **PUMP-05: un-hide Schedule CTA.** When the PUMP-07 follow-up slice ships `pump-schedule`, PUMP-05 must un-hide the Schedule CTA (`BR-Schedule`) and wire `adapter.schedule(...)` to the live Edge function.
- **PUMP-02B: un-hide Cancel row action.** When the PUMP-07 follow-up slice ships `pump-cancel`, PUMP-02B must un-hide the Cancel row action and wire error-code handling for `PUMP_CANCEL_INVALID_STATUS` and `PUMP_CANCEL_OWNER_MISMATCH`. Both error codes are in the §6 catalog now; the PUMP-02B wire-up is deferred.

### Authoritative references

- [`pump-project-brief.md`](./pump-project-brief.md) — scope boundaries and exclusions.
- [`pump-architecture.md`](./pump-architecture.md) — suite comms architecture, Edge function contracts, slice dependencies.
- [`pump-feature-list.md`](./pump-feature-list.md) — derived feature inventory (traceability).
- [`pump-user-stories.md`](./pump-user-stories.md) — derived user stories (traceability).
- `../../../packages/core/src/comms/edge-service.ts` — `PumpRuntime` interface, `pumpResolvePool`, `pumpSend`, `pumpSendTest`, `pumpSchedule`, `pumpCancel` orchestration implementations.
- `../../../packages/core/src/comms/types.ts` — `CommSendRequest`, `CommSendTestRequest`, `CommScheduleRequest`, `CommSendResult`, `CommRecipientPreview`, `CommTokenWarning`, `CommPoolWarning`, `RecipientPoolDescriptor` and variants, `EffectivePumpSenderIdentity`.
- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — § "PUMP Edge Function contracts (normative)" lines 344–417; § "RBAC model"; § "Additional contacts" line 129.
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md) (verify live dev-db via Supabase MCP) — schema, RPC, RLS, Edge-function absence authority.
- `../../database/decisions/DB-change-decisions-p4.md` — DB-408 (`gateway_message_id` partial unique index); DB-411 FORCE RLS on `pump_*` tables.
- Sibling slices: [`PU02-comms-log-home-requirements.md`](./PU02-comms-log-home-requirements.md), [`PU05-compose-send-requirements.md`](./PU05-compose-send-requirements.md), [`PU06-webhooks-delivery-pipeline-requirements.md`](./PU06-webhooks-delivery-pipeline-requirements.md).

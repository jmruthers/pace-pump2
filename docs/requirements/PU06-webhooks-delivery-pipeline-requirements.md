# PUMP-06 — Webhooks & delivery pipeline (Edge-only)

## 1. Slice metadata

- Slice ID: PUMP-06
- Name: Webhooks & delivery pipeline (Edge-only)
- Status: Built (Edge v3 deployed `yihzsfcceciimdoiibif`; §12 signed fixtures blocked until gateway signing secrets + seeded `gateway_message_id`)
- Depends on: PUMP-05
- Backend impact: Schema in place; Edge runtime to be deployed (no schema work owned by this slice)
- Frontend impact: Non-UI (Edge-only)
- Routes owned: None (HTTP endpoint family `pump-webhook/{gateway}` is an Edge function path, not a SPA route)
- QA pack: `docs/test-packs/PUMP-06-qa-pack.md`

---

## 2. Overview

PUMP-06 owns the webhook ingress and delivery pipeline that turns provider callbacks into normalised platform state. It is Edge-only — no SPA route, no rendering surface, no `CommComposer` mount, no operator console. The slice runs as a single Edge function family (`pump-webhook/{gateway}`) that providers (Resend for email, Twilio for SMS) invoke when an outbound message changes state. Internally the function is authored in two phases — an ingress phase (signature verification, payload parsing, recipient correlation, deterministic dedupe-key derivation, INSERT into `pump_delivery_event`) and an apply phase (forward-only mutation of `pump_message_recipient` for status and engagement timestamps; channel-specific upsert of `pump_suppression` for negative terminal signals).

---

## 3. What this slice delivers

### Purpose

Convert provider webhook callbacks into platform-side delivery state. The slice produces three classes of side effect: a permanent audit row in `pump_delivery_event` for every accepted event, a forward-only status / timestamp update on the matching `pump_message_recipient` row, and an idempotent suppression upsert in `pump_suppression` for negative terminal signals (hard bounces, spam complaints, provider opt-outs). These three side effects are the platform's single source of truth for outbound delivery health and feed the operator drill-down owned by PUMP-02.

### Surfaces

This slice owns one Edge HTTP endpoint family and three table write paths:

- **`pump-webhook/{gateway}` Edge function** — one path per gateway (`pump-webhook/resend` and `pump-webhook/twilio` in v1). Provider-agnostic apply layer with thin per-gateway adapters (signature verifier, payload parser, dedupe-key extractor). Single Edge function; the A/B sub-pass split is an authoring marker, not a runtime split.
- **`pump_delivery_event` INSERT path** — every accepted event lands here as an audit row; UNIQUE `(gateway, dedupe_key)` enforces idempotency at the database layer.
- **`pump_message_recipient` UPDATE path** — recipient status and engagement timestamps mutate under a forward-only precedence rule (§6 BR-Precedence).
- **`pump_suppression` UPSERT path** — `(organisation_id, address, channel)` is the upsert key; `reason` is one of `hard_bounce | spam_complaint | recipient_request | manual` (§6 BR-Suppression).

The slice authors against the CR23 contract for `pump-webhook/{gateway}`. The Edge function is not yet deployed to dev-db; build is gated on that deployment (see §15 / §17).

#### PUMP-06A — Ingress sub-pass

Request entry; gateway-path routing; provider signature verification; payload parsing; recipient correlation by `gateway_message_id`; deterministic `dedupe_key` derivation; INSERT into `pump_delivery_event`. The DB-backed UNIQUE `(gateway, dedupe_key)` index is the idempotency boundary — duplicate inserts fail and the handler returns 200 with `{applied: false, reason: 'duplicate'}`.

#### PUMP-06B — Apply sub-pass

For newly-inserted events only, mutate `pump_message_recipient` (status, `delivered_at` / `opened_at` / `clicked_at` / `failed_at`, `failure_reason`) under the forward-only precedence rule, and upsert `pump_suppression` for negative terminal signals (hard bounce, spam complaint, provider opt-out / Twilio `ErrorCode = 21610`).

### Boundaries

This slice does **not** own:

- Any SPA UI — no PUMP route, no `pace-core2` UI component import, no `CommComposer` consumption, no operator console for replay or suppression management.
- User-facing unsubscribe pages or marketing-compliance journeys.
- Send-time suppression checking — that lives in PUMP-05's `pump-send` (which reads `pump_suppression` before each send). PUMP-06 only **writes** `pump_suppression` rows.
- Send-time `suppression_skipped` status setting — PUMP-05's `pump-send` sets that when an address is skipped at send time. PUMP-06 sets `suppression_skipped` only in response to the explicit Resend `email.suppressed` event.
- Population of `pump_message_recipient.gateway_message_id` — PUMP-05's `pump-send` writes that column at provider acknowledgement time; PUMP-06 reads it.
- The `gateway_message_id` partial unique index, the `pump_delivery_event` UNIQUE `(gateway, dedupe_key)` index, and FORCE RLS on the affected tables — these are p4 migrations already landed on dev-db.
- Rate-limiting or DDoS protection on the webhook endpoint — out of v1 scope; the deterministic dedupe key contract makes provider replay safe, and rate-limiting is a future concern.
- Multiple Resend or Twilio accounts per channel — `pump_gateway_config` PK is `channel`; one row per channel.
- Schema migrations against the affected tables — schema is in place.

### Architectural posture

- **Service-role execution.** All `pump_delivery_event` INSERTs, `pump_message_recipient` UPDATEs, and `pump_suppression` UPSERTs run under the service-role Supabase client. No authenticated user context. RLS does not gate writes — `pump_delivery_event` and `pump_message_recipient` have only service-role write policies, and `pump_suppression` has no authenticated policy at all.
- **Provider-agnostic apply layer with per-gateway adapters.** The signature verifier, payload parser, and dedupe-key extractor are gateway-specific (small adapters per gateway path). The apply-pass logic — recipient mutation, suppression upsert — is shared across both gateways and feeds the same normalised `event_type` set.
- **Idempotency is a database property, not an Edge-memory property.** The handler INSERTs into `pump_delivery_event` and treats UNIQUE-violation as the duplicate signal. Replays from the provider remain safe across deployments and across handler restarts because the DB UNIQUE `(gateway, dedupe_key)` enforces idempotency.
- **Single contract source.** The provider event → normalised `event_type` → recipient side effect → suppression side effect → dedupe source mapping is adopted from CR23 § "Webhook provider mapping (v1)" lines 396–417 verbatim. Any future CR23 mapping changes update this slice's §6 in lockstep.
- **No recipient correlation fallback.** When `gateway_message_id` from a payload does not match a `pump_message_recipient` row, the handler returns 200 with a `recipient_not_found` body and writes no row to any table; the unmatched payload lands in Edge logs only. There is no fuzzy-match fallback, no NULL-recipient audit row.

### Page-level guards and evaluation ordering

n/a — this slice owns no UI route. The webhook handler is an Edge function; signature verification is the auth boundary, not RBAC. Section 6 BR-V1 / BR-V2 covers verification ordering.

---

## 4. Functional specification

PUMP-06 has no end-user features. The "features" of this slice are observable platform-side behaviours — outcomes a contract reviewer or QA tester can verify by replaying provider fixtures, inspecting database state, or reading Edge logs.

Items are written from the standpoint of an integration reviewer running provider fixtures or replay scripts.

### PUMP-06A — Ingress sub-pass

**Endpoint and routing**

1. The Edge function family `pump-webhook/{gateway}` accepts POST requests on two paths in v1: `pump-webhook/resend` and `pump-webhook/twilio`. Any other path segment returns HTTP 404 with no body and no DB writes.
2. Each request's `{gateway}` path segment selects the gateway-specific adapter (signature verifier, payload parser, dedupe-key extractor). The provider-agnostic apply layer is invoked only after the adapter completes.
3. The handler executes under the service-role Supabase client. There is no authenticated user context and no caller-side RBAC check. Signature verification is the authentication boundary.

**Signature verification**

4. Every request runs gateway-specific signature verification before any payload semantics are processed. For the Resend gateway, the handler validates the Svix-format webhook signature using the `svix-id`, `svix-timestamp`, and `svix-signature` headers against the signing secret stored in `pump_gateway_config[channel='email'].config`. For the Twilio gateway, the handler computes HMAC-SHA1 of the full request URL plus the sorted form parameters, using the auth-token stored in `pump_gateway_config[channel='sms'].config`, and compares the result against the `X-Twilio-Signature` header.
5. When signature verification fails, the handler returns HTTP 401 with no body and writes nothing — no `pump_delivery_event` row, no `pump_message_recipient` mutation, no `pump_suppression` row. Verification failure is the same status code for both gateways.
6. When the request is well-formed but the gateway path segment is unknown (e.g. `pump-webhook/sendgrid`), the handler returns HTTP 404 with no body and writes nothing. Verification is not attempted on unknown gateways.
7. When the payload fails to parse — JSON syntax error for Resend, missing required form fields for Twilio, or an `event_type` not in the closed set defined by §6 BR-N1 — the handler returns HTTP 400 with no body and writes nothing.
8. When a downstream dependency fails mid-handler (database unavailable, transient timeout from a service-role client call), the handler returns HTTP 500 with no body. The provider's own delivery-retry contract handles re-delivery; the deterministic dedupe key makes re-delivery safe.

**Recipient correlation**

9. After verification and parsing, the handler resolves the `pump_message_recipient` row by querying on `gateway_message_id` — `data.email_id` for Resend, `MessageSid` for Twilio. The query uses the partial unique index on `gateway_message_id WHERE NOT NULL`.
10. When no `pump_message_recipient` row matches the supplied `gateway_message_id`, the handler returns HTTP 200 with body `{applied: false, reason: 'recipient_not_found'}`, writes the unmatched payload (gateway, headers, parsed body, derived `event_type` if any) to Edge logs, and writes **no row** to any table. The provider treats 200 as a successful acknowledgement and stops retrying.
11. The handler does not attempt fuzzy matching by address, by message id, or by any other field when `gateway_message_id` does not match.

**Dedupe-key derivation and idempotent insert**

12. The handler derives a deterministic `dedupe_key` per gateway. For Resend, the `svix-id` header value is the dedupe key. For Twilio classic SMS status callbacks, the dedupe key is the composite string `${MessageSid}:${MessageStatus}` with optional suffixes — `:${ErrorCode}` when present, `:${RawDlrDoneDate}` when present (per §6 BR-D1).
13. The handler INSERTs into `pump_delivery_event` with columns `(recipient_id, event_type, gateway, provider_event_id, dedupe_key, raw_payload, occurred_at)`. The DB sets `created_at` via its default. The `recipient_id` references the row resolved in item 9; `event_type` is the normalised value per §6 BR-N1; `gateway` is the path segment (`'resend'` or `'twilio'`); `provider_event_id` is the gateway's event id when supplied (Resend `svix-id`; Twilio classic null) per §6 BR-D2; `raw_payload` is the full provider webhook body verbatim as JSONB; `occurred_at` is the provider event time when supplied, otherwise the handler's request-start time per §6 BR-N2.
14. The UNIQUE `(gateway, dedupe_key)` index on `pump_delivery_event` decides idempotency. When the INSERT succeeds, the event is new and the apply-pass runs (item 16). When the INSERT fails with a unique-violation, the event is a duplicate and the handler returns HTTP 200 with body `{applied: false, reason: 'duplicate'}` — no error to the provider; the provider has already delivered this event successfully on a prior request. Any other INSERT error returns HTTP 500.
15. On successful INSERT, the handler returns HTTP 200 with body `{applied: true}` after the apply-pass completes (or returns the duplicate-shape body on dedupe collision per item 14).

### PUMP-06B — Apply sub-pass

**Apply guard**

16. The apply phase runs only when the `pump_delivery_event` INSERT in item 13 succeeded (returned a new row). On dedupe collision the apply phase does not run and no recipient or suppression mutation is attempted.
17. All apply-phase writes (recipient UPDATE, suppression UPSERT) execute via the service-role Supabase client.

**Recipient status and engagement-timestamp updates**

18. Recipient status transitions follow a forward-only lattice (§6 BR-Precedence). Once a recipient row reaches `delivered`, only `bounced`, `failed`, or engagement timestamps may follow. Once a recipient row reaches `failed` (or `bounced` or `suppression_skipped`), no further status transition is permitted; engagement timestamps may still record. The `queued` event never overwrites `delivered`, `bounced`, `failed`, or `suppression_skipped`. The `delivery_delayed` event never changes status.
19. For a `delivered` event (Resend `email.delivered`, Twilio `delivered`), the handler sets `pump_message_recipient.status = 'delivered'` and `delivered_at = pump_delivery_event.occurred_at`, subject to the precedence rule (don't regress `bounced`, `failed`, `suppression_skipped`).
20. For a `queued` event (Resend `email.sent`, Twilio `queued` / `sent` / `sending`), the handler sets `status = 'queued'` only when the current `status` is `pending`. Otherwise the recipient row is not mutated. The `pump_delivery_event` row is still written for audit.
21. For a `delivery_delayed` event (Resend `email.delivery_delayed`), the handler does not mutate the recipient row. The `pump_delivery_event` row is the only side effect.
22. For an `opened` event (Resend `email.opened`), the handler sets `opened_at = pump_delivery_event.occurred_at` only when `opened_at IS NULL`. Subsequent open events insert further `pump_delivery_event` rows (subject to dedupe) for richer engagement analytics, but do not overwrite `opened_at`. The recipient `status` is never changed by an open event.
23. For a `clicked` event (Resend `email.clicked`), the handler sets `clicked_at = pump_delivery_event.occurred_at` only when `clicked_at IS NULL`. Subsequent click events insert further `pump_delivery_event` rows but do not overwrite `clicked_at`. The recipient `status` is never changed by a click event.
24. For a `bounced` event (Resend `email.bounced`, Twilio `undelivered`), the handler sets `status = 'bounced'`, `failed_at = occurred_at`, and `failure_reason` from the provider payload (Resend bounce message; Twilio `ErrorCode`), subject to the precedence rule. A bounce may supersede `queued` or `delivered`.
25. For a `failed` event (Resend `email.failed`, Twilio `failed`), the handler sets `status = 'failed'`, `failed_at = occurred_at`, and `failure_reason` from the provider payload.
26. For a `spam_complaint` event (Resend `email.complained`), the handler sets `status = 'failed'`, `failed_at = occurred_at`, and `failure_reason = 'spam_complaint'`.
27. For a `suppressed` event (Resend `email.suppressed`), the handler sets `status = 'suppression_skipped'` and `failure_reason` from the provider payload. No `failed_at` is set — provider-side suppression is not a delivery failure on this side.
28. When a webhook arrives for an already-terminal recipient (e.g. a late-retry `email.delivered` after the row is already `delivered`, or a status regression attempt), the precedence rule blocks the status mutation. The `pump_delivery_event` row is still written (subject to dedupe) for audit; no exception is raised.

**Suppression upsert**

29. For a `bounced` event where the provider classifies the bounce as hard / permanent, the handler upserts `pump_suppression` on `(organisation_id, address, channel)` with `reason = 'hard_bounce'`. Hard-bounce identification is described in §6 BR-A12. Soft bounces do not write suppression rows.
30. For a `spam_complaint` event, the handler upserts `pump_suppression` with `reason = 'spam_complaint'`.
31. For a `suppressed` event, the handler upserts `pump_suppression` with `reason = 'manual'` when address and channel context is available. Provider details land verbatim in `pump_delivery_event.raw_payload`.
32. For a Twilio `undelivered` or `failed` event with `ErrorCode = '21610'` (recipient replied STOP), the handler upserts `pump_suppression` with `reason = 'recipient_request'`.
33. For every `pump_suppression` upsert, the handler derives `organisation_id` from the resolved `pump_message_recipient.organisation_id` (denormalised RLS anchor), `member_id` from `pump_message_recipient.member_id` (may be NULL for ad-hoc recipients), `address` from `pump_message_recipient.address`, `channel` from the gateway path (`'resend'` → `'email'`, `'twilio'` → `'sms'`), and `source_message_id` from `pump_message_recipient.message_id`.

### Cross-cutting

**Response shape**

34. The handler's success response body is JSON. On a new event applied successfully: `{applied: true}`. On a duplicate event detected at INSERT time: `{applied: false, reason: 'duplicate'}`. On a no-match (no recipient row found for the supplied `gateway_message_id`): `{applied: false, reason: 'recipient_not_found'}`.
35. Failure responses (4xx, 5xx) carry no body — the response status code alone communicates the failure.

**No SPA UI**

36. PUMP-06 surfaces no PUMP route, no `CommComposer` mount, no operator console. The HTTP request/response shape is documented in §7. Operator visibility into delivery events lives in PUMP-02's drill-down (which reads `pump_delivery_event` rows).

**Build prerequisite**

37. The `pump-webhook/{gateway}` Edge function family is not deployed on dev-db at slice authoring time. Implementation is gated on CR23 PUMP Edge functions deployment. The slice authors against the CR23 contract; §15 / §17 carry the deployment gate.

---

## 5. Visual specification

n/a — Edge-only slice; no SPA route, no rendering surface, no `pace-core2` UI component imports. The HTTP request/response shape is documented in §7. Operator visibility into the events written by this slice is rendered by PUMP-02's drill-down surface (which owns its own Visual Specification against `pump_delivery_event` rows).

---

## 6. Business rules

### BR-V1 — Provider signature verification

Every request runs gateway-specific signature verification before any payload semantics are processed.

| Gateway | Algorithm | Headers | Secret source |
|---|---|---|---|
| Resend | Svix-format webhook signature | `svix-id`, `svix-timestamp`, `svix-signature` | `pump_gateway_config[channel='email'].config` (Svix signing secret) |
| Twilio | HMAC-SHA1 of full URL + sorted form params | `X-Twilio-Signature` | `pump_gateway_config[channel='sms'].config` (auth token) |

Verification implementation follows each provider's published validation algorithm; PUMP does not invent a custom scheme. The handler reads the secret from `pump_gateway_config` once per request via the service-role client.

### BR-V2 — Verification failure → 401, no DB writes

When signature verification fails, the handler returns HTTP **401** with no body and writes nothing — no `pump_delivery_event` row, no `pump_message_recipient` mutation, no `pump_suppression` row. The 401 status applies to both gateways. HMAC verification failure is fundamentally an authentication problem, not a permission decision.

### BR-V3 — Malformed payload → 400, no DB writes

When the payload fails to parse, the handler returns HTTP **400** with no body and writes nothing. Malformed conditions include:

- JSON syntax error (Resend body).
- Missing required form fields for Twilio (`MessageSid`, `MessageStatus`).
- Missing required JSON fields for Resend (`type`, `data`, `data.email_id`).
- An `event_type` outside the closed set defined by BR-N1.

### BR-V4 — Retryable server error → 500

When a downstream dependency fails mid-handler (database unavailable, transient timeout), the handler returns HTTP **500** with no body. The provider's own delivery-retry contract handles re-delivery; the deterministic dedupe key (BR-D1) makes re-delivery safe.

### BR-V5 — Gateway path validation → 404 on unknown

The `{gateway}` path segment must match a recognised gateway. In v1 the recognised set is `{resend, twilio}`. Any other path segment returns HTTP **404** with no body. Path-segment mismatch is a routing failure, not a payload validation failure. Verification is not attempted on unknown gateways.

### BR-D1 — Dedupe key derivation

The handler derives a deterministic `dedupe_key` per gateway. The DB UNIQUE `(gateway, dedupe_key)` index is the idempotency boundary.

| Gateway | Source | Composition |
|---|---|---|
| Resend | `svix-id` header | The header value verbatim. Authoritative per Svix spec — provider-issued unique id per delivery attempt. |
| Twilio classic SMS status callback | Composite | `${MessageSid}:${MessageStatus}` with optional suffix `:${ErrorCode}` when present and optional suffix `:${RawDlrDoneDate}` when present. The composite suffix policy follows CR23 mapping rows 411–413 verbatim. |
| Twilio Event Streams (future) | CloudEvents id | `${id}` (or `${source}:${id}`) per CR23 line 417. Not in v1 deploy. |

### BR-D2 — `provider_event_id` persistence

Persist the gateway's event id when supplied. When the gateway does not natively supply an event id, store NULL.

| Gateway | Value |
|---|---|
| Resend | The `svix-id` header value (also serves as `dedupe_key`). |
| Twilio classic SMS status callback | NULL — no native event id. |
| Twilio Event Streams (future) | The CloudEvents `id`. |

### BR-D3 — Atomic INSERT-and-detect-collision

The handler INSERTs into `pump_delivery_event`. Three outcomes follow:

| Outcome | Handler action |
|---|---|
| INSERT succeeds (new event) | Run apply-pass per BR-A0. Return HTTP 200 with `{applied: true}`. |
| INSERT fails with UNIQUE-violation on `(gateway, dedupe_key)` | Skip apply-pass. Return HTTP 200 with `{applied: false, reason: 'duplicate'}`. No error to the provider — the provider has already delivered this event successfully on a prior request. |
| INSERT fails with any other error | Return HTTP 500 with no body. Apply-pass does not run. |

### BR-D-NoMatch (no-match handling for unmatched `gateway_message_id`)

When the resolved `recipient_id` would be null (no `pump_message_recipient` row matches the supplied `gateway_message_id`), the handler returns HTTP 200 with body `{applied: false, reason: 'recipient_not_found'}` and writes the unmatched payload to Edge logs only. **No row is written to `pump_delivery_event`** — the table's `recipient_id NOT NULL` constraint precludes audit-row insertion without the recipient. The provider treats 200 as terminal acknowledgement and stops retrying. This is a v1 trade-off; see §17 follow-up to migrate `pump_delivery_event.recipient_id` to nullable.

### BR-N1 — Event type normalisation (CR23 mapping)

The handler maps the provider-specific event/status to a closed set of normalised `event_type` values: `queued | delivered | delivery_delayed | opened | clicked | bounced | failed | spam_complaint | suppressed`. The provider-original event verb lands verbatim in `raw_payload`. The full mapping is adopted from CR23 § "Webhook provider mapping (v1)" lines 396–417 verbatim.

| Gateway | Provider event / status | Normalised `event_type` | Recipient side effect | Suppression side effect | Dedupe source |
|---|---|---|---|---|---|
| Resend | `email.sent` | `queued` | Set `status = 'queued'` only when current `status = 'pending'`. Correlate by `data.email_id = gateway_message_id`. | None | `svix-id` |
| Resend | `email.delivered` | `delivered` | Set `status = 'delivered'`; set `delivered_at` from `occurred_at`. Subject to precedence. | None | `svix-id` |
| Resend | `email.delivery_delayed` | `delivery_delayed` | Insert event only; do not change status; do not set timestamp. | None | `svix-id` |
| Resend | `email.opened` | `opened` | Set `opened_at` from `occurred_at` only when `opened_at IS NULL`. Do not change status. | None | `svix-id` |
| Resend | `email.clicked` | `clicked` | Set `clicked_at` from `occurred_at` only when `clicked_at IS NULL`. Do not change status. | None | `svix-id` |
| Resend | `email.bounced` | `bounced` | Set `status = 'bounced'`; set `failed_at`; set `failure_reason` from bounce payload. May supersede `queued` or `delivered`. | When `data.bounce.type === 'Permanent'` (hard / permanent), upsert `pump_suppression.reason = 'hard_bounce'`. | `svix-id` |
| Resend | `email.complained` | `spam_complaint` | Set `status = 'failed'`; set `failed_at`; set `failure_reason = 'spam_complaint'`. | Upsert `pump_suppression.reason = 'spam_complaint'`. | `svix-id` |
| Resend | `email.failed` | `failed` | Set `status = 'failed'`; set `failed_at`; set `failure_reason` from provider payload. | None unless provider also sends a bounce / complaint / suppression signal as a separate event. | `svix-id` |
| Resend | `email.suppressed` | `suppressed` | Set `status = 'suppression_skipped'`; set `failure_reason` from provider payload. No `failed_at`. | Ensure local suppression row exists when address / channel context is available; provider details land verbatim in `raw_payload`. Reason: `'manual'`. | `svix-id` |
| Twilio SMS status callback | `queued`, `sent` | `queued` | Set `status = 'queued'` only when current `status = 'pending'`. | None | `${MessageSid}:${MessageStatus}` |
| Twilio SMS status callback | `sending` | `queued` | Diagnostic event only; do not change status when already `queued` or later. | None | `${MessageSid}:${MessageStatus}` |
| Twilio SMS status callback | `delivered` | `delivered` | Set `status = 'delivered'`; set `delivered_at` from `occurred_at`. `RawDlrDoneDate` lands in `raw_payload` when supplied. | None | `${MessageSid}:${MessageStatus}` plus `:${RawDlrDoneDate}` when present |
| Twilio SMS status callback | `undelivered` | `bounced` | Set `status = 'bounced'`; set `failed_at`; set `failure_reason` from `ErrorCode` when present. | When `ErrorCode = '21610'`, upsert `pump_suppression.reason = 'recipient_request'`. | `${MessageSid}:${MessageStatus}` plus `:${ErrorCode}` plus `:${RawDlrDoneDate}` when present |
| Twilio SMS status callback | `failed` | `failed` | Set `status = 'failed'`; set `failed_at`; set `failure_reason` from `ErrorCode` when present. | When `ErrorCode = '21610'`, upsert `pump_suppression.reason = 'recipient_request'`. | `${MessageSid}:${MessageStatus}` plus `:${ErrorCode}` when present |

### BR-N2 — `occurred_at` derivation

| Provider supplies | Handler value |
|---|---|
| Resend top-level `created_at` | Use that timestamp. |
| Twilio classic callback with `RawDlrDoneDate` | Use that timestamp. |
| Twilio classic callback without `RawDlrDoneDate` | Use the handler's request-start time (`now()` evaluated at the start of request processing). |
| Provider supplies no timestamp (any gateway) | Use the handler's request-start time. Treated as a successful resolution. |

The handler does not reject payloads for missing timestamps. Receipt-time fallback is the canonical v1 behaviour for gateways that omit a provider-side event timestamp.

### BR-N3 — `raw_payload` audit

Store the full provider webhook body verbatim in `pump_delivery_event.raw_payload` (JSONB). No selective field stripping; no canonicalisation. Auditors and operators recover provider-side context from this column, including provider-original event verbs and any fields not surfaced through the normalised `event_type`.

### BR-N4 — `event_type` closed set

`pump_delivery_event.event_type` is a `text` column with no DB CHECK constraint. The handler writes only the closed-set values listed in BR-N1: `queued | delivered | delivery_delayed | opened | clicked | bounced | failed | spam_complaint | suppressed`. Adding a new gateway or new normalised value requires a CR23 amendment plus this rule's update.

### BR-A0 — Apply guard

Apply runs only when the `pump_delivery_event` INSERT succeeded (returned a new row). On dedupe collision (BR-D3), apply does not run; no recipient or suppression mutation occurs. On no-match (BR-D-NoMatch), apply does not run; no row exists to apply against.

### BR-Precedence — Forward-only recipient-status precedence

Recipient status transitions follow this lattice. Every apply-time mutation must check the current `pump_message_recipient.status` and either proceed (forward transition allowed) or no-op (forbidden transition; event row is logged but recipient row is not mutated). Engagement timestamps (`opened_at`, `clicked_at`) follow their own first-only rules in BR-A6 / BR-A7.

| From | To | Allowed? | Notes |
|---|---|---|---|
| `pending` | `queued` | Yes | BR-A3 |
| `pending` | `delivered` | Yes | Skips `queued` if a `delivered` event arrives first; legitimate. BR-A2 |
| `pending` | `bounced` / `failed` / `suppression_skipped` | Yes | Negative terminal supersedes pending. BR-A8 / BR-A9 / BR-A10 / BR-A11 |
| `queued` | `queued` | Yes (no-op) | Idempotent; second `queued` event leaves the row unchanged. |
| `queued` | `delivered` | Yes | BR-A2 |
| `queued` | `bounced` / `failed` / `suppression_skipped` | Yes | Negative terminal supersedes queued. |
| `delivered` | `bounced` / `failed` | Yes | Late negative-terminal events supersede delivered while `delivered_at` remains in its column. BR-A8 / BR-A9 |
| `delivered` | `queued` | **No** | Forbidden regression. Event row is logged; recipient row is not mutated. |
| `delivered` | `suppression_skipped` | **No** | Forbidden regression. Event row is logged; recipient row is not mutated. |
| `bounced` / `failed` / `suppression_skipped` | any other status | **No** | Terminal — no further status mutation. Engagement timestamps may still update per BR-A6 / BR-A7. Event row is logged. |

Webhooks for already-terminal recipients are recorded as `pump_delivery_event` rows (subject to dedupe) for audit visibility, but they do not mutate the recipient row when the precedence rule forbids the transition.

### BR-A2 — `delivered` apply

Set `pump_message_recipient.status = 'delivered'` and `delivered_at = pump_delivery_event.occurred_at`. Subject to BR-Precedence (don't regress `bounced`, `failed`, or `suppression_skipped`).

### BR-A3 — `queued` apply

Set `pump_message_recipient.status = 'queued'` only when the current `status = 'pending'`. Otherwise no-op. Twilio `sending` is also normalised to `queued` per BR-N1 and is treated as a diagnostic event with the same gating rule.

### BR-A4 — `delivery_delayed` apply

No recipient-row mutation. Event-only.

### BR-A5 — Engagement timestamps independent of status

`opened_at` and `clicked_at` updates are independent of status mutation. Even when a recipient is already `bounced` or `failed`, an open or click event still writes (or fails to overwrite — see BR-A6 / BR-A7) the engagement timestamp. The recipient `status` is never changed by an open or click event.

### BR-A6 — `opened` apply (first-only)

Set `pump_message_recipient.opened_at = pump_delivery_event.occurred_at` only when `opened_at IS NULL`. Subsequent open events insert further `pump_delivery_event` rows (subject to dedupe) for richer engagement analytics, but do not overwrite a previously-set `opened_at`. Recipient `status` is never changed.

### BR-A7 — `clicked` apply (first-only)

Set `pump_message_recipient.clicked_at = pump_delivery_event.occurred_at` only when `clicked_at IS NULL`. Subsequent click events insert further `pump_delivery_event` rows but do not overwrite a previously-set `clicked_at`. Recipient `status` is never changed.

### BR-A8 — `bounced` apply

Set `pump_message_recipient.status = 'bounced'`, `failed_at = pump_delivery_event.occurred_at`, `failure_reason = <provider payload reason>` — Resend bounce payload reason text or equivalent; Twilio `ErrorCode` (e.g. `'21610'`). Subject to BR-Precedence — may supersede `pending`, `queued`, or `delivered`. May not supersede an existing `failed` or `suppression_skipped`.

### BR-A9 — `failed` apply

Set `status = 'failed'`, `failed_at = occurred_at`, `failure_reason = <provider payload reason>`. Subject to BR-Precedence — may supersede `pending`, `queued`, or `delivered`.

### BR-A10 — `spam_complaint` apply

Set `status = 'failed'`, `failed_at = occurred_at`, `failure_reason = 'spam_complaint'`. Subject to BR-Precedence.

### BR-A11 — `suppressed` apply

Set `status = 'suppression_skipped'`, `failure_reason = <provider payload reason>`. **Do not set `failed_at`** — provider-side suppression is not a delivery failure on this side. Subject to BR-Precedence.

### BR-A12 — Hard-bounce identification (Resend)

A Resend `email.bounced` event is treated as a hard / permanent bounce when the parsed payload satisfies `data.bounce.type === 'Permanent'`. Only hard bounces upsert `pump_suppression`; soft bounces do not. The exact field name and value are verified by the build agent against Resend's published webhook documentation at implementation time; if Resend's contract changes, this rule is updated in lockstep.

### BR-Suppression — `pump_suppression` upsert contract

For every `pump_suppression` upsert path (BR-A12 hard bounce, BR-A10 spam complaint, BR-A11 provider suppression, Twilio `21610` recipient request), the handler upserts on UNIQUE `(organisation_id, address, channel)` with the following column derivation:

| Column | Source |
|---|---|
| `organisation_id` | `pump_message_recipient.organisation_id` (denormalised RLS anchor; populated by p4) |
| `member_id` | `pump_message_recipient.member_id` (may be NULL for ad-hoc recipients) |
| `address` | `pump_message_recipient.address` |
| `channel` | Derived from gateway path: `'resend'` → `'email'`, `'twilio'` → `'sms'`. |
| `reason` | One of the closed-set values below. |
| `source_message_id` | `pump_message_recipient.message_id` |

`reason` closed set for v1: `{hard_bounce, spam_complaint, recipient_request, manual}`. Source provider events:

| Reason | Source events |
|---|---|
| `hard_bounce` | Resend `email.bounced` with `data.bounce.type === 'Permanent'` |
| `spam_complaint` | Resend `email.complained` |
| `recipient_request` | Twilio `undelivered` or `failed` with `ErrorCode = '21610'` |
| `manual` | Resend `email.suppressed` (provider-side suppression; provider details in `raw_payload`) |

Existing dev-db rows may carry historical `reason` values outside this set (e.g. `'bounce'` from snapshot examples); PUMP-06 writes only the closed set. `pump_suppression.reason` remains a `text` column with no DB CHECK constraint; the closed-set is a code-side invariant.

### BR-X1 — Service-role only

All `pump_delivery_event` INSERTs, `pump_message_recipient` UPDATEs, and `pump_suppression` UPSERTs execute via the service-role Supabase client. There is no authenticated user context. RLS does not gate writes — `pump_delivery_event` and `pump_message_recipient` have only service-role write policies on dev-db; `pump_suppression` has no authenticated policy at all.

### BR-X2 — Recipient correlation by `gateway_message_id`

The handler resolves the `pump_message_recipient.id` via the partial unique index on `gateway_message_id WHERE NOT NULL`. PUMP-05's `pump-send` populates `gateway_message_id` after each provider acknowledgement; PUMP-06 reads only.

### BR-X3 — No fuzzy correlation

The handler does not attempt fuzzy matching by address, message id, or any other field when `gateway_message_id` does not match a recipient row. The single correlation path is the `gateway_message_id` lookup; on miss, BR-D-NoMatch applies.

---

## 7. API / Contract

### Public exports

PUMP-06 publishes no TypeScript exports. Its surface is one Edge HTTP endpoint family.

### Inbound HTTP contract

```
POST  /functions/v1/pump-webhook/{gateway}
       gateway ∈ {resend, twilio} (v1)

Headers (Resend):
  svix-id          required — webhook signature id (also serves as dedupe key)
  svix-timestamp   required — webhook timestamp
  svix-signature   required — Svix-format signature

Headers (Twilio):
  X-Twilio-Signature  required — HMAC-SHA1 signature

Body:
  Resend: application/json — provider-defined webhook envelope with
          fields including type, data, data.email_id, created_at,
          and event-specific fields (data.bounce.type for bounces, etc.)
  Twilio: application/x-www-form-urlencoded — fields including
          MessageSid, MessageStatus, ErrorCode (when present),
          RawDlrDoneDate (when present)
```

### Outbound HTTP responses

```
HTTP 200  Body: {applied: true}
          New event applied. Event row inserted; recipient row mutated
          subject to precedence; suppression upserted when applicable.

HTTP 200  Body: {applied: false, reason: "duplicate"}
          Idempotent replay detected via UNIQUE (gateway, dedupe_key)
          on pump_delivery_event. No mutation performed.

HTTP 200  Body: {applied: false, reason: "recipient_not_found"}
          gateway_message_id from payload did not match any
          pump_message_recipient row. No DB writes; payload logged
          to Edge logs only.

HTTP 400  No body.
          Malformed payload (JSON syntax error; missing required fields;
          unknown event_type outside the closed set).

HTTP 401  No body.
          Signature verification failed. No DB writes.

HTTP 404  No body.
          Unknown gateway path segment (not 'resend', not 'twilio').
          No DB writes; verification not attempted.

HTTP 500  No body.
          Retryable server error (database unavailable, transient
          downstream failure). The provider's retry policy will replay;
          the deterministic dedupe key makes replays safe.
```

### Database write contracts

**`pump_delivery_event` INSERT**

```
Columns written:
  recipient_id        FK to pump_message_recipient(id), NOT NULL
  event_type          text (closed set per BR-N1)
  gateway             text ('resend' | 'twilio')
  provider_event_id   text (per BR-D2; nullable)
  dedupe_key          text (per BR-D1; NOT NULL)
  raw_payload         jsonb (full provider body verbatim)
  occurred_at         timestamptz (per BR-N2)
Idempotency:
  UNIQUE (gateway, dedupe_key) — duplicate INSERT raises unique_violation;
  handler returns 200 with {applied: false, reason: 'duplicate'}.
```

**`pump_message_recipient` UPDATE**

```
Columns mutated (subject to BR-Precedence and BR-A* rules):
  status              pump_recipient_status
  delivered_at        timestamptz
  opened_at           timestamptz   (first-only per BR-A6)
  clicked_at          timestamptz   (first-only per BR-A7)
  failed_at           timestamptz
  failure_reason      text
Correlation key:
  WHERE gateway_message_id = <payload-supplied id>
```

**`pump_suppression` UPSERT**

```
Conflict target:
  ON CONFLICT (organisation_id, address, channel)
Columns written / updated on conflict:
  organisation_id     uuid       (from pump_message_recipient.organisation_id)
  member_id           uuid       (from pump_message_recipient.member_id; nullable)
  address             text       (from pump_message_recipient.address)
  channel             comm_channel ('email' | 'sms', derived from gateway)
  reason              text       (closed set: hard_bounce | spam_complaint
                                  | recipient_request | manual per BR-Suppression)
  source_message_id   uuid       (from pump_message_recipient.message_id)
```

### RLS / permission contracts

| Surface | Role | Access |
|---|---|---|
| `pump-webhook/{gateway}` Edge function | Service role | Required — handler runs under service-role Supabase client |
| `pump_delivery_event` INSERT | Service role | Allowed — `service_role_can_manage_all_pump_delivery_event` policy |
| `pump_message_recipient` UPDATE | Service role | Allowed — `service_role_can_manage_all_pump_message_recipient` policy |
| `pump_suppression` UPSERT | Service role | Allowed — service role only; no authenticated policy on the table |
| `pump_gateway_config` SELECT | Service role | Allowed — service role only; no authenticated policy on the table |

There is no authenticated user role for the handler. Signature verification is the auth boundary; RBAC does not apply.

### Cross-slice handoffs

| Slice | Direction | Contract |
|---|---|---|
| **PUMP-05** (compose & send) | Receives from PUMP-06 | None directly — PUMP-05's responsibility ends at provider acknowledgement. PUMP-05 populates `pump_message_recipient.gateway_message_id` at provider acknowledgement time per CR23; PUMP-06 reads that column for correlation. |
| **PUMP-05** (compose & send) | Provides to PUMP-06 | `pump_message_recipient.gateway_message_id` written by `pump-send` after each provider acknowledgement. Without this, PUMP-06's recipient correlation falls to BR-D-NoMatch. |
| **PUMP-02** (comms log + drill-down) | Reads from PUMP-06 outputs | Reads `pump_delivery_event` rows for the per-recipient timeline. The closed-set `event_type` values (BR-N1) are the contract for PUMP-02's filtering and labelling logic. |
| **PUMP-05** at send time | Reads `pump_suppression` | `pump-send` consults `pump_suppression` before each send and skips suppressed addresses. PUMP-06 writes the rows; PUMP-05 reads them. |

### ID contracts

`pump_message_recipient.id`, `pump_message_recipient.organisation_id`, `pump_message_recipient.member_id`, `pump_message_recipient.message_id`, `pump_suppression.id`, `pump_suppression.source_message_id`, `pump_delivery_event.id`, `pump_delivery_event.recipient_id` are all UUIDs. `gateway` and `event_type` are plain `text`; the closed-set values for `event_type` come from BR-N1.

---

## 8. Data and schema references

### Tables read

- `pump_message_recipient` — recipient correlation by `gateway_message_id`. Reads `id`, `organisation_id`, `member_id`, `message_id`, `address`, `status`, `delivered_at`, `opened_at`, `clicked_at`, `failed_at`, `failure_reason` for the apply-pass.
- `pump_gateway_config` — webhook signing secrets keyed by `channel` (`'email'` for Resend, `'sms'` for Twilio); reads the `config` JSONB.

### Tables written

- `pump_delivery_event` — INSERT path; UNIQUE `(gateway, dedupe_key)` is the idempotency contract.
- `pump_message_recipient` — UPDATE path; mutates `status`, `delivered_at`, `opened_at`, `clicked_at`, `failed_at`, `failure_reason` under BR-Precedence.
- `pump_suppression` — UPSERT path on UNIQUE `(organisation_id, address, channel)`.

### Edge functions

- `pump-webhook/{gateway}` — the Edge function family this slice owns. Not yet deployed on dev-db at slice authoring time; build is gated on CR23 PUMP Edge functions deployment per platform-snapshot-2026-05-07 lines 297–308.

### Verifications against dev-db

Verify against project `rkytnffgmwnnmewevqgp` (per global operating rules → Dev-db reference):

1. `pump_delivery_event` exists with the columns named in §7 and a UNIQUE index on `(gateway, dedupe_key)` (per platform-snapshot-2026-05-07 line 98).
2. `pump_message_recipient` has the partial unique index on `gateway_message_id WHERE NOT NULL` (per platform-snapshot-2026-05-07 line 82).
3. `pump_message_recipient.organisation_id` is NOT NULL with a FK to `core_organisations(id)` (denormalised RLS anchor; per platform-snapshot-2026-05-07 line 79).
4. `pump_suppression` has UNIQUE `(organisation_id, address, channel)` (per platform-snapshot-2026-05-07 line 165).
5. `pump_delivery_event` and `pump_message_recipient` carry only service-role write policies for the operations PUMP-06 performs (per platform-snapshot-2026-05-07 lines 246–258).
6. `pump_suppression` has no authenticated policy at all (per platform-snapshot-2026-05-07 line 261).
7. `pump_gateway_config` exists with PK `channel`, `gateway_type`, and `config` JSONB; only service-role policies (per platform-snapshot-2026-05-07 lines 100–110).

### Domain / decision references

- `../../../packages/core/docs/requirements/CR23-comms-platform.md` § "Webhook provider mapping (v1)" lines 396–417 — canonical provider mapping; adopted verbatim into BR-N1.
- `../../database/decisions/DB-change-decisions-p4.md` — DB-408 (`gateway_message_id` partial unique; `pump_delivery_event` UNIQUE `(gateway, dedupe_key)`); DB-411 FORCE RLS on `pump_*` tables.

---

## 9. pace-core2 imports

### 9.1 Imports table

| Symbol | Import path | One-line why |
|---|---|---|
| `CommRecipientStatus` | `@solvera/pace-core/comms` | Type contract for recipient status writes — Edge code references this enum when persisting `pump_message_recipient.status`. |
| `CommChannel` | `@solvera/pace-core/comms` | Type contract for channel selection — Edge derives `channel` from gateway path and uses this type when writing `pump_suppression.channel`. |

### 9.2 Slice-specific caveats

- **`CommRecipientStatus`:** type-only export. Values are `'pending' | 'queued' | 'delivered' | 'bounced' | 'failed' | 'suppression_skipped'`. The closed set excludes `'opened'` and `'clicked'` — engagement is tracked via the `opened_at` and `clicked_at` timestamp columns on `pump_message_recipient`, never via status transitions. Edge code that emits status mutations writes only values from this enum.
- **`CommChannel`:** type-only export. Values are `'email' | 'sms'`. Edge derives the channel from the gateway path segment (`'resend'` → `'email'`, `'twilio'` → `'sms'`) when writing `pump_suppression.channel`. Hardcoding `'email'` for both gateways (a defect found in an earlier draft of an unrelated platform helper) breaks the SMS path; channel must be derived from gateway per BR-Suppression.

This slice imports no runtime helpers from pace-core2. The webhook apply-pass logic is implemented directly in PUMP Edge against the CR23 contract per Q-PC1 (see §17 for the platform follow-up that removes the orphaned `pumpWebhookEvent` helper from pace-core2). The shared types are the only carry-forward.

---

## 10. Permission and access rules

### Edge function access

The `pump-webhook/{gateway}` Edge function runs under the service-role Supabase client. There is no authenticated user context. Caller-side authorisation is signature verification (BR-V1 / BR-V2), not RBAC. No `PagePermissionGuard`, `useCan`, or page-level guard applies — webhook handlers are not SPA routes.

### Role × action matrix

| Role | Invoke `pump-webhook/{gateway}` | Read `pump_delivery_event` | Write `pump_delivery_event` | Update `pump_message_recipient` | Upsert `pump_suppression` |
|---|---|---|---|---|---|
| Anonymous | Allowed (signature verification gates the call; verification failure → 401) | Forbidden | Forbidden | Forbidden | Forbidden |
| Authenticated user (no PUMP grants) | n/a — webhook handler is not a SPA route | Forbidden (RLS) | Forbidden (no auth policy) | Forbidden (no auth INSERT/UPDATE/DELETE policy) | Forbidden (no auth policy) |
| Authenticated user with `read:page.CommsLog` | n/a — webhook handler is not a SPA route | Allowed (PUMP-02 read path; not this slice's surface) | Forbidden | Forbidden | Forbidden |
| Service role | Allowed (handler runs as service role) | Allowed | Allowed | Allowed | Allowed |

### Provider verification

| Gateway | Verification | Failure → |
|---|---|---|
| Resend | Svix `svix-id` / `svix-timestamp` / `svix-signature` against secret in `pump_gateway_config[channel='email'].config` | HTTP 401, no body, no DB writes |
| Twilio | HMAC-SHA1 of full URL + sorted form params against auth-token in `pump_gateway_config[channel='sms'].config`, compared to `X-Twilio-Signature` | HTTP 401, no body, no DB writes |
| Unknown gateway path | Verification not attempted | HTTP 404, no body, no DB writes |

### Unsubscribe / opt-out posture

Provider unsubscribe / opt-out signals (Twilio `ErrorCode = 21610`, Resend `email.suppressed`) update `pump_suppression` per BR-Suppression. They do **not** masquerade as send-time `suppression_skipped` — the recipient row's `status = 'suppression_skipped'` is set only for the explicit Resend `email.suppressed` event (BR-A11). Send-time skips set by PUMP-05's `pump-send` are a separate write path, not authored by this slice.

---

## 11. Acceptance criteria

### PUMP-06A — Ingress sub-pass

1. **Given** a Resend webhook fixture for `email.delivered` carrying a valid Svix signature and a `data.email_id` that matches an existing `pump_message_recipient.gateway_message_id`, **when** the handler processes the request, **then** it inserts one `pump_delivery_event` row with `event_type = 'delivered'`, `gateway = 'resend'`, `provider_event_id = <svix-id header>`, `dedupe_key = <svix-id header>`, `raw_payload` equal to the full request body, and `occurred_at = data.created_at`; the apply-pass updates the recipient row; the response is HTTP 200 with body `{applied: true}`. (Traces §4 items 4, 13, 15, 19; §6 BR-V1, BR-D1, BR-D2, BR-D3, BR-N1, BR-N3, BR-A2.)
2. **Given** a Twilio classic SMS status callback with status `delivered`, a valid `X-Twilio-Signature`, and a `MessageSid` that matches an existing `pump_message_recipient.gateway_message_id`, **when** the handler processes the request, **then** it inserts one `pump_delivery_event` row with `event_type = 'delivered'`, `gateway = 'twilio'`, `provider_event_id = NULL`, `dedupe_key = '${MessageSid}:${MessageStatus}[:${RawDlrDoneDate}]'` (suffix included only when `RawDlrDoneDate` is supplied), and `occurred_at` per BR-N2; the response is HTTP 200 with body `{applied: true}`. (Traces §4 items 4, 13, 15; §6 BR-D1, BR-D2, BR-N1, BR-N2.)
3. **Given** the same valid signed webhook is replayed a second time within minutes (same `svix-id` for Resend, or same `(MessageSid, MessageStatus, ErrorCode, RawDlrDoneDate)` composite for Twilio), **when** the handler processes the second request, **then** the `pump_delivery_event` INSERT raises a unique-violation on `(gateway, dedupe_key)`, no second event row is inserted, no recipient mutation runs, no suppression upsert runs, and the response is HTTP 200 with body `{applied: false, reason: 'duplicate'}`. (Traces §4 item 14; §6 BR-D3.)
4. **Given** a webhook payload whose Svix or Twilio signature is invalid or missing, **when** the handler processes the request, **then** the response is HTTP 401 with no body and no rows are inserted, updated, or upserted in `pump_delivery_event`, `pump_message_recipient`, or `pump_suppression`. (Traces §4 item 5; §6 BR-V1, BR-V2.)
5. **Given** a request to `pump-webhook/sendgrid` (an unknown gateway path) carrying any payload, **when** the handler processes the request, **then** the response is HTTP 404 with no body, signature verification is not attempted, and no DB writes occur. (Traces §4 item 6; §6 BR-V5.)
6. **Given** a Resend webhook fixture with malformed JSON (e.g. truncated body) but a valid signature, **when** the handler processes the request, **then** the response is HTTP 400 with no body and no DB writes occur. (Traces §4 item 7; §6 BR-V3.)
7. **Given** a Resend webhook fixture for an `event_type` outside the closed set in §6 BR-N1 (e.g. an unrecognised provider event verb), **when** the handler processes the request, **then** the response is HTTP 400 with no body and no DB writes occur. (Traces §4 item 7; §6 BR-V3, BR-N1, BR-N4.)
8. **Given** a Resend webhook fixture for `email.delivered` with valid signature but a `data.email_id` that does not match any `pump_message_recipient.gateway_message_id` in the database, **when** the handler processes the request, **then** the response is HTTP 200 with body `{applied: false, reason: 'recipient_not_found'}`, no rows are inserted into `pump_delivery_event`, no rows are mutated in `pump_message_recipient`, no rows are upserted in `pump_suppression`, and the unmatched payload is written to Edge logs. (Traces §4 items 10, 11; §6 BR-D-NoMatch, BR-X3.)

### PUMP-06B — Apply sub-pass

9. **Given** a successful insert of an `event_type = 'delivered'` row for a recipient whose current `status = 'queued'`, **when** the apply-pass runs, **then** the recipient row is updated to `status = 'delivered'` with `delivered_at = pump_delivery_event.occurred_at`, the `failed_at` and `failure_reason` columns are unchanged, and engagement timestamp columns are unchanged. (Traces §4 item 19; §6 BR-A2, BR-Precedence.)
10. **Given** a successful insert of an `event_type = 'opened'` row for a recipient with `opened_at IS NULL`, **when** the apply-pass runs, **then** `opened_at` is set to `pump_delivery_event.occurred_at`, the recipient `status` is unchanged, and a subsequent `email.opened` event for the same recipient (with a different `svix-id`) inserts a further `pump_delivery_event` row but does not overwrite `opened_at`. (Traces §4 item 22; §6 BR-A6.)
11. **Given** a successful insert of an `event_type = 'bounced'` row for a recipient with `data.bounce.type === 'Permanent'` in the raw payload (Resend hard bounce), **when** the apply-pass runs, **then** the recipient row is updated to `status = 'bounced'` with `failed_at` and `failure_reason` set, and `pump_suppression` is upserted on `(organisation_id, address, channel)` with `reason = 'hard_bounce'`, `channel = 'email'`, and `source_message_id = pump_message_recipient.message_id`. (Traces §4 items 24, 29, 33; §6 BR-A8, BR-A12, BR-Suppression.)
12. **Given** a successful insert of an `event_type = 'bounced'` row for a recipient with `data.bounce.type !== 'Permanent'` (Resend soft bounce), **when** the apply-pass runs, **then** the recipient row is updated to `status = 'bounced'` and **no** `pump_suppression` row is inserted or updated. (Traces §4 items 24, 29; §6 BR-A8, BR-A12.)
13. **Given** a successful insert of an `event_type = 'spam_complaint'` row (Resend `email.complained`), **when** the apply-pass runs, **then** the recipient row is updated to `status = 'failed'` with `failed_at` set and `failure_reason = 'spam_complaint'`, and `pump_suppression` is upserted with `reason = 'spam_complaint'`, `channel = 'email'`. (Traces §4 items 26, 30; §6 BR-A10, BR-Suppression.)
14. **Given** a successful insert of an `event_type = 'bounced'` row for a Twilio `undelivered` callback with `ErrorCode = '21610'`, **when** the apply-pass runs, **then** the recipient row is updated to `status = 'bounced'` and `pump_suppression` is upserted with `reason = 'recipient_request'`, `channel = 'sms'`, `source_message_id = pump_message_recipient.message_id`. (Traces §4 items 24, 32, 33; §6 BR-A8, BR-Suppression.)
15. **Given** a recipient with `status = 'delivered'`, **when** a second `event_type = 'delivered'` (different `svix-id`) is processed and the apply-pass runs, **then** the recipient row's `status` and `delivered_at` are unchanged (idempotent forward transition); the `pump_delivery_event` row is recorded for audit. (Traces §4 item 28; §6 BR-A2, BR-Precedence.)
16. **Given** a recipient with `status = 'bounced'`, **when** a `event_type = 'queued'` arrives (an out-of-order or late-retry callback), **then** the apply-pass does not change `status` (forbidden regression); the `pump_delivery_event` row is recorded for audit. (Traces §4 item 28; §6 BR-Precedence.)
17. **Given** a recipient with `status = 'delivered'`, **when** a Resend `email.opened` event arrives with `opened_at` already non-null, **then** the apply-pass does not overwrite `opened_at`, the recipient `status` remains `delivered`, and the `pump_delivery_event` row is recorded for audit. (Traces §4 item 22; §6 BR-A6, BR-A5.)

### Cross-cutting

18. **Given** the handler's database connection fails partway through processing a valid signed webhook (e.g. transient connectivity error during the `pump_delivery_event` INSERT), **when** the handler returns to the provider, **then** the response is HTTP 500 with no body, no partial state is left in `pump_message_recipient` or `pump_suppression`, and the provider's retry causes the request to be reprocessed; the deterministic `dedupe_key` ensures the eventual successful insert does not produce duplicate rows. (Traces §4 item 8; §6 BR-V4, BR-D3.)
19. **Given** a webhook arrives carrying a valid signature and a `gateway_message_id` matching a recipient, **when** all three side-effect tables are inspected after the handler returns, **then** each side effect runs under the service-role client and no authenticated user context is required; verifying via dev-db introspection confirms RLS does not gate these writes. (Traces §4 items 3, 17; §6 BR-X1.)

---

## 12. Verification

PUMP-06 has no SPA-side demo flow. Verification scenarios for an integration reviewer running provider fixtures or replay scripts against dev-db (project `rkytnffgmwnnmewevqgp`):

### PUMP-06A — Ingress

1. **Resend valid `email.delivered` fixture:** POST a fixture with valid Svix signature and a `data.email_id` matching a seeded `pump_message_recipient.gateway_message_id`. Confirm response 200 `{applied: true}`; confirm one `pump_delivery_event` row inserted with all columns populated per §7 INSERT contract.
2. **Resend invalid signature:** POST the same fixture with a tampered `svix-signature`. Confirm response 401, no body, and no `pump_delivery_event` row inserted (compare row count before/after).
3. **Resend duplicate replay:** POST the same valid `email.delivered` fixture twice. Confirm both responses are 200; first body is `{applied: true}`, second is `{applied: false, reason: 'duplicate'}`. Confirm exactly one `pump_delivery_event` row exists for that `svix-id`.
4. **Twilio classic `delivered` callback:** POST a form-encoded callback with valid `X-Twilio-Signature`, `MessageSid` matching a seeded recipient, and `MessageStatus = 'delivered'`. Confirm 200 `{applied: true}` and a row with `event_type = 'delivered'`, `gateway = 'twilio'`, `provider_event_id IS NULL`, `dedupe_key = '${MessageSid}:delivered'` (or with `:${RawDlrDoneDate}` suffix when supplied).
5. **Twilio duplicate replay (`undelivered` with `ErrorCode = 21610`):** POST the same payload twice. Confirm second is `{applied: false, reason: 'duplicate'}` and that `pump_suppression` was upserted only once (single row for that `(organisation_id, address, channel)`).
6. **Unknown gateway path:** POST any payload to `pump-webhook/sendgrid`. Confirm 404, no body, no rows in any table.
7. **Malformed payload:** POST invalid JSON to `pump-webhook/resend` with valid signature headers (signature would not validate, but the malformed-body branch should fire). Confirm 400 (or 401 if signature failure precedes JSON parse — verify which path the handler takes; either is acceptable as long as no DB writes occur).
8. **No-match recipient correlation:** POST a Resend `email.delivered` fixture with a synthetic `data.email_id` not present in any `pump_message_recipient.gateway_message_id`. Confirm response 200 `{applied: false, reason: 'recipient_not_found'}`, the unmatched payload appears in Edge logs (operator-side), and no rows are inserted into `pump_delivery_event` (or any other table).

### PUMP-06B — Apply

9. **`delivered` from `queued`:** seed a recipient with `status = 'queued'` and a known `gateway_message_id`. POST a Resend `email.delivered`. Confirm recipient row is updated to `status = 'delivered'`, `delivered_at = data.created_at`.
10. **First-only `opened`:** seed a recipient with `status = 'delivered'`, `opened_at IS NULL`. POST a Resend `email.opened`. Confirm `opened_at` is set, `status` unchanged. POST a second `email.opened` with a different `svix-id`. Confirm `opened_at` is **unchanged** and a second `pump_delivery_event` row exists.
11. **Hard-bounce upsert:** seed a recipient with `status = 'queued'`. POST a Resend `email.bounced` with `data.bounce.type === 'Permanent'`. Confirm recipient is `status = 'bounced'` with `failed_at` and `failure_reason` set; confirm `pump_suppression` row exists with `reason = 'hard_bounce'`, `channel = 'email'`.
12. **Soft-bounce no suppression:** repeat 11 with `data.bounce.type` other than `'Permanent'`. Confirm recipient is `status = 'bounced'` but no `pump_suppression` row is created.
13. **Spam complaint upsert:** POST a Resend `email.complained`. Confirm recipient is `status = 'failed'`, `failure_reason = 'spam_complaint'`, and `pump_suppression` row with `reason = 'spam_complaint'`.
14. **Twilio `21610` recipient request upsert:** POST a Twilio `undelivered` callback with `ErrorCode = '21610'`. Confirm recipient is `status = 'bounced'` and `pump_suppression` row with `reason = 'recipient_request'`, `channel = 'sms'`.
15. **Forward-only precedence:** seed a recipient with `status = 'delivered'`. POST a Resend `email.sent` (normalised to `queued`). Confirm `pump_delivery_event` row recorded but recipient row unchanged.
16. **Status terminal:** seed a recipient with `status = 'failed'`. POST a Resend `email.delivered`. Confirm `pump_delivery_event` row recorded but recipient row unchanged.

### Cross-cutting

17. **Service-role enforcement:** invoke the handler with a request that would otherwise succeed but force the handler's downstream client to use the anon key (a configuration test). Confirm INSERTs fail (RLS would deny) and the handler returns 500 — proving service-role is required.
18. **Mapping conformance:** for every row in §6 BR-N1, replay a corresponding fixture and confirm the `event_type` column on the inserted `pump_delivery_event` row matches the normalised value in the table.

---

## 13. Testing requirements

Slice-unique automated test scenarios beyond the standard happy / validation / permission triplet:

1. **Provider mapping conformance suite.** A parameterised test for every row in §6 BR-N1: replay a representative fixture for each provider event/status, assert the `pump_delivery_event.event_type` column equals the normalised value, assert the `recipient` side effect (status / timestamp) per the table, assert the suppression side effect (or absence) per the table.
2. **Idempotency under provider replay.** A test that submits the same fixture three times back-to-back and asserts: one `pump_delivery_event` row exists, the second and third responses are `{applied: false, reason: 'duplicate'}`, no recipient mutation has run more than once, and no suppression upsert has run more than once.
3. **Concurrent replay race.** A test that submits two fixtures with the same dedupe key concurrently (worker-pool style) and asserts the DB UNIQUE constraint resolves the race — exactly one event row is inserted, exactly one `applied: true` response is returned, the other response is the duplicate body.
4. **Forward-only precedence regression suite.** A parameterised test covering every (current_status, incoming_event_type) pair in §6 BR-Precedence, asserting the recipient mutation occurs (or doesn't) per the lattice.
5. **First-only engagement timestamp regression.** Tests covering second / third opens and clicks, asserting `opened_at` and `clicked_at` are not overwritten.
6. **Suppression channel derivation.** Tests covering Resend `email.bounced` with hard bounce → `pump_suppression.channel = 'email'`, and Twilio `undelivered` with `ErrorCode = 21610` → `pump_suppression.channel = 'sms'`. Confirms the channel is derived from the gateway path, not hardcoded.
7. **No-match no-write.** A test that submits a valid signed payload with an unmatched `gateway_message_id` and asserts: response 200 `{applied: false, reason: 'recipient_not_found'}`, zero `pump_delivery_event` rows inserted, zero recipient mutations, zero suppression upserts.
8. **Signature-failure no-write.** A test that submits a payload with a tampered signature and asserts: response 401, zero rows in any table changed.
9. **Edge-log capture for no-match.** A test that submits a no-match payload and asserts the handler emits a structured log entry containing the gateway, the unresolved `gateway_message_id`, and the parsed `event_type` (best-effort) for operator forensics.

---

## 14. Build execution rules

- Implementation is gated on CR23 PUMP Edge functions deployment to dev-db (see §15 / §17). Until `pump-webhook/{gateway}` is deployed, the slice carries the contract specification only.
- Webhook ingestion is PUMP-only by architecture. Do not import a runtime helper for webhook apply logic from pace-core2 — implement against the CR23 mapping in PUMP Edge directly per §16. The shared types (`CommRecipientStatus`, `CommChannel`) are the only carry-forward.
- The handler is one Edge function family (single function, two paths), not two separate functions. The A/B sub-pass split is an authoring marker, not a runtime split.
- Provider-specific logic (signature verification, payload parsing, dedupe-key extraction) lives in small per-gateway adapters; the apply layer is provider-agnostic.

---

## 15. Done criteria

- All §11 acceptance criteria pass against deployed `pump-webhook/{gateway}` Edge function on dev-db, with provider-fixture replay scripts (Resend and Twilio) producing the documented responses and DB side effects.
- All §13 testing-requirements suites pass on CI.
- §6 BR-N1 mapping is implemented as a single source of truth in handler code; any deviation from the CR23 row-by-row mapping is a defect.
- Implementation is gated on **CR23 PUMP Edge functions deployment to dev-db.** `pump-webhook/{gateway}` must be deployed before this slice's runtime evidence can be captured. Until then, contract-shape verification per §12 (1, 2, 4, 6 — the request/response shape) can be partially exercised against a local Edge runtime; full verification against dev-db is gated on the deployment.

---

## 16. Do not

- Do not import `pumpWebhookEvent` from `@solvera/pace-core/comms` or any deeper pace-core2 path — the helper at `../../../packages/core/src/comms/edge-service.ts` lines 595–651 is incomplete (missing `queued` / `opened` / `clicked` / `delivery_delayed` handling; hardcodes `channel: 'email'` for suppression upsert which is broken on the SMS path); the helper is not exported from the comms barrel; pace-core2 will REMOVE it (see §17).
- Do not vendor a copy of the orphaned helper into PUMP. Implement the apply-pass against the CR23 mapping in PUMP Edge directly.
- Do not hardcode `channel: 'email'` for any `pump_suppression` upsert. Channel is derived from the gateway path per BR-Suppression.
- Do not write a `pump_delivery_event` row when `gateway_message_id` does not match any `pump_message_recipient`. The handler returns 200 with `{applied: false, reason: 'recipient_not_found'}`; the table's `recipient_id NOT NULL` constraint forbids the audit row in this case (see §17 follow-up to migrate the column to nullable).
- Do not overwrite `opened_at` or `clicked_at` once set. Engagement timestamps are first-only per BR-A6 / BR-A7. Subsequent open / click events insert further `pump_delivery_event` rows for richer analytics; they do not mutate the recipient row's timestamp columns.
- Do not mutate the recipient row when the precedence rule forbids the transition. Out-of-order or late-retry events (e.g. `queued` arriving after `delivered`, or `delivered` arriving after `bounced`) are recorded as `pump_delivery_event` rows for audit; the recipient row is left alone.
- Do not implement webhook logic in the SPA — webhook handlers are not SPA routes.
- Do not introduce a route guard for the webhook handler. Edge functions are not SPA routes; signature verification (BR-V1) is the auth boundary.
- Do not expose service-role keys to the client. The handler runs server-side only.
- Do not introduce a fuzzy-match fallback (by address, by message id, or by any field other than `gateway_message_id`) when correlation misses. The single correlation path is the `gateway_message_id` lookup; on miss, BR-D-NoMatch applies.
- Do not introduce an operator-facing suppression management UI to satisfy the webhook-driven suppression behaviour. `pump_suppression` writes are Edge-only in v1; no PUMP route consumes the table directly.
- Do not invent rate-limiting on the webhook endpoint in v1. The deterministic dedupe-key contract makes provider replay safe; rate-limiting is a future concern.
- Do not write `'opened'` or `'clicked'` to `pump_message_recipient.status` — the column's enum (`pump_recipient_status`) does not include those values; engagement is the timestamp columns.
- Do not write `pump_suppression.reason` values outside the closed set `{hard_bounce, spam_complaint, recipient_request, manual}` per BR-Suppression. Existing rows on dev-db may carry historical values; PUMP-06 writes only the closed set.

---

## 17. References

- [`pump-project-brief.md`](./pump-project-brief.md) — PUMP project brief; § Known exclusions confirms no operator unsubscribe console and no marketing-compliance UI in v1.
- [`pump-architecture.md`](./pump-architecture.md) — § Suite communications architecture; § PUMP Edge Functions; § Webhook provider mapping; § Status precedence. Architecture is the canonical statement of webhook-only-in-Edge and the active-build-gate at the line on Resend/Twilio mapping documentation.
- [`pump-feature-list.md`](./pump-feature-list.md) — derived feature inventory (traceability).
- [`pump-user-stories.md`](./pump-user-stories.md) — derived user stories (traceability).
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md) (verify live dev-db via Supabase MCP) — schema / RPC / RLS / Edge-function authority for this rollout. `pump_delivery_event` shape and UNIQUE index on lines 84–98; `pump_message_recipient` partial unique on `gateway_message_id` line 82; `pump_suppression` UNIQUE `(organisation_id, address, channel)` line 165; service-role-only RLS on `pump_delivery_event` / `pump_message_recipient` writes lines 246–258; service-role-only `pump_suppression` and `pump_gateway_config` lines 100–110, 261. Edge-functions absence note lines 297–308.
- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — § "Webhook provider mapping (v1)" lines 396–417; § "Status precedence" line 415; § "Twilio Event Streams note" line 417. Mapping adopted verbatim into BR-N1.
- `../../database/decisions/DB-change-decisions-p4.md` — DB-408 (`gateway_message_id` partial unique index; `pump_delivery_event` UNIQUE `(gateway, dedupe_key)`); DB-411 FORCE RLS on `pump_*` tables.

### Sibling slices

- **PUMP-02** (comms log + drill-down) — reads `pump_delivery_event` rows for the per-recipient timeline. PUMP-06's audit trail feeds PUMP-02's operator visibility surface.
- **PUMP-05** (compose & send) — populates `pump_message_recipient.gateway_message_id` at provider acknowledgement time; consults `pump_suppression` at send time. PUMP-06 reads `gateway_message_id`, writes `pump_suppression`.
- **PUMP-03** (sender identity contract) — does not consume PUMP-06 outputs; recipient-row updates do not re-resolve sender identity.

### Outstanding follow-ups

1. **Build prerequisite — CR23 PUMP Edge functions deployment to dev-db.** Per platform-snapshot-2026-05-07 lines 297–308, `pump-webhook/{gateway}` is not deployed. PUMP-06 implementation cannot be exercised on dev-db until the deployment lands. Tracked here per cross-app-decisions.md 2026-05-04 — Deferred-section authoring pattern.
2. **Platform follow-up — pace-core2 should REMOVE the orphaned `pumpWebhookEvent` helper.** The helper at `../../../packages/core/src/comms/edge-service.ts` lines 595–651 is incomplete (missing `queued` / `opened` / `clicked` / `delivery_delayed` event handling; hardcodes `channel: 'email'` for suppression upsert which is broken on the SMS path) and is not exported from the comms barrel, so removal is a non-breaking change for any consumer. Webhook ingestion is PUMP-only by architecture (CR23 § "PUMP Edge Functions"); pace-core2 carries only the shared types (`CommRecipientStatus`, `CommChannel`, etc.) — the contract surface, not the runtime. Consolidating all webhook apply logic inside pace-pump avoids dual-source drift.
3. **Platform follow-up — migrate `pump_delivery_event.recipient_id` to nullable.** Today's `recipient_id NOT NULL` FK precludes audit-row insertion when a webhook arrives whose `gateway_message_id` does not match any `pump_message_recipient`. The v1 trade-off accepts rare-case audit loss in exchange for not requiring a schema migration in this slice's scope; rare-case audits live in Edge logs only per BR-D-NoMatch. Reconsider after operator feedback or after a no-match incident requires post-hoc forensics.
4. **Mapping authority — CR23 lockstep.** The mapping in §6 BR-N1 is adopted from CR23 § "Webhook provider mapping (v1)" lines 396–417 verbatim. Any future CR23 mapping change must be reflected here in lockstep — updating only one source produces dual-source drift. The authority chain is CR23 (source of truth) → PUMP-06 §6 BR-N1 (port) → PUMP Edge handler code (implementation).
5. **Resend hard-bounce identification field name.** §6 BR-A12 specifies `data.bounce.type === 'Permanent'`. The build agent verifies the exact field name and value against Resend's published webhook documentation at implementation time; if Resend's contract has shifted (e.g. field renamed, value enum extended), BR-A12 is updated in lockstep. Tracked here so the verification step is not lost.

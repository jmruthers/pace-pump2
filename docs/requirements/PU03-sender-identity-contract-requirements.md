# PUMP-03 — Platform-managed sender identity contract

## 1. Slice metadata

- Slice ID: PUMP-03
- Name: Platform-managed sender identity contract
- Status: Complete (SPA contract — contract-only slice)
- Depends on: PUMP-01
- Backend impact: Read contract only
- Frontend impact: Non-UI (consumed by PUMP-05 and by PUMP Edge)
- Routes owned: None
- QA pack: n/a — no PUMP-owned UI; contract-shape verification rolls into PUMP-05 and PUMP Edge QA packs

---

## 2. Overview

PUMP-03 defines the single server-resolved sender-identity contract used across PUMP. It owns no PUMP route, no PUMP UI, and no standalone implementation stream — its product is a stable contract for two consumers: the PUMP-05 compose surface (read-only display at compose time) and PUMP Edge (`pump-send`, `pump-send-test`, `pump-schedule`, and pool-resolution code that needs source-context-aware sender resolution at send time). The contract is exposed through one Postgres RPC (`pump_get_effective_sender_identity`) and one TypeScript shape (`EffectivePumpSenderIdentity` in `@solvera/pace-core/comms`); both consumers destructure RPC rows directly into the type because the SQL column aliases match the camelCase TypeScript field names. PUMP-03's acceptance is contract-shape, not user-action — its "users" are downstream code, not operators.

---

## 3. What this slice delivers

### Purpose

Provide a single canonical contract that resolves "what sender identity should this organisation send under, optionally for a given source-context override" so PUMP-05 and PUMP Edge consume identical values without duplicating fallback logic in two places. The contract names which org's settings supplied each value (audit) and which channels are ready to send (`canSendEmail`, `canSendSms`).

### Surfaces

This slice owns no UI route and no SPA component. Its surface is:

- The Postgres RPC `pump_get_effective_sender_identity(organisation_id uuid, source_context_type text DEFAULT NULL, source_context_id uuid DEFAULT NULL)` — STABLE, SECURITY DEFINER, returns a single tabular row.
- The TypeScript shape `EffectivePumpSenderIdentity` re-exported from `@solvera/pace-core/comms`. Direct destructuring of an RPC row yields a value of this type without translation.

### Boundaries

- **No `/comms/settings` route, no PUMP settings page, no PUMP UI for editing sender identity.** Sender identity is platform-managed in v1; all writes to `pump_org_settings` happen outside PUMP.
- **No operator sender override at compose time.** Compose-time display of the resolved identity is read-only; PUMP-05 does not render any input that lets the operator pick or override sender name, from address, reply-to, or SMS phone.
- **No SPA reads of `pump_org_settings`** or any org-ancestor / hierarchy table. The only sender-identity entry point from the PUMP SPA is the RPC.
- **No gateway credentials.** Provider keys live on `pump_gateway_config` and are loaded by Edge under service role; that table is out of scope for PUMP-03.
- **No email-shell HTML.** Legacy `email_header_html`, `email_footer_html`, `sms_messaging_service_sid`, and `sms_opt_out_footer` fields on `pump_org_settings` are not part of the v1 sender-identity contract; the platform-owned email shell is sourced separately.
- **No ancestor / parent-org resolution implemented in browser code.** The RPC walks the hierarchy server-side; consumers receive the final answer only.
- **No suppression behaviour.** Send-time suppression lives in `pump_suppression` and is consulted by `pump-send` separately; sender identity does not encode it.

### Architectural posture

- Mutation contract: **none owned by this slice.** PUMP-03 is read-only from PUMP's perspective. Updates to `pump_org_settings` are platform-managed.
- Read contract: a single SECURITY DEFINER RPC returning the canonical sender-identity row. Consumers must not reconstruct the fallback chain themselves.
- Caller authorisation: the RPC does not enforce caller-side RBAC (see §6 BR-CallerAuthorisation). The consuming surface is responsible for page-level access — PUMP-05's `/comms/create` route is wrapped by `PagePermissionGuard` (`pageName='CommsLog'`, `operation='create'`) per PDLC's RBAC API usage contract; PUMP Edge invokes the RPC under the service-role client.
- Single-contract rule: compose-time display (PUMP-05) and send-time validation (PUMP Edge `pump-send` / `pump-send-test` / `pump-schedule`) call the same RPC and consume identical `EffectivePumpSenderIdentity` rows. Send-time validation re-resolves; the SPA's compose-time row is not trusted as input to validation.

### Page-level guards and evaluation ordering

n/a — this slice owns no UI route. Guard ordering for the consuming `/comms/create` route belongs to PUMP-05.

---

## 4. Functional specification

PUMP-03 has no end-user features. The "features" of this slice are contract obligations imposed on consumers and contract guarantees the platform side honours. Items are written as observable contract behaviours a contract test (or an integration reviewer) can verify.

### Contract surface and invocation

1. The contract is exposed exclusively through the Postgres RPC `pump_get_effective_sender_identity(organisation_id uuid, source_context_type text DEFAULT NULL, source_context_id uuid DEFAULT NULL)`. There is no other SPA-callable or Edge-callable entry point for resolving sender identity in v1.
2. Calling the RPC with a valid `organisation_id` returns exactly one row; the row's columns map 1:1 onto the `EffectivePumpSenderIdentity` TypeScript shape with no further transformation.
3. The RPC is `STABLE` and `SECURITY DEFINER`. It is callable both by the authenticated SPA (via the secure Supabase client, e.g. from PUMP-05) and by service-role Edge code.
4. The RPC does not gate the caller on RBAC. Page-level authorisation is the responsibility of the consuming surface (PUMP-05's `PagePermissionGuard` covering `/comms/create`; service-role Edge invocations).
5. The RPC accepts source-context arguments leniently — both arguments null, both arguments populated, only one argument populated, or an unrecognised `source_context_type` value all produce a successful row. Resolution falls back through the chain when the source-context input cannot be honoured (see §6 BR-PartialSourceContext).

### Result fields and field semantics

6. Every row contains the eleven fields listed in §6 BR-FieldShape. The set, order, names, and types of returned columns are stable contract — adding, removing, renaming, or retyping any field is a breaking change to the contract that requires lockstep migration of PUMP-05 and PUMP Edge.
7. `organisationId` is the organisation under whose scope the resolution was performed (the caller's `organisation_id` argument). It is not necessarily the org whose `pump_org_settings` supplied the values — that's `resolvedOrganisationId`.
8. `sourceContextType` and `sourceContextId` are literal echoes of the caller's input arguments. When the caller passes `NULL` for either argument, the corresponding response field is `null`. These fields are not tier discriminators (see §6 BR-SourceContextEcho).
9. `senderName`, `fromAddress`, `replyToAddress`, and `senderPhone` are nullable text. A null value means "no value resolved at any tier of the fallback chain." Consumers must treat null as "missing", not as a configured empty string.
10. `resolvedFrom` is a string literal value drawn from `'source_context' | 'organisation' | 'ancestor' | 'platform_default'`. It identifies which tier of the fallback chain produced the row's identity.
11. `resolvedOrganisationId` is the UUID of the organisation whose `pump_org_settings` row supplied the resolution, or `null` when `resolvedFrom = 'platform_default'`.
12. `canSendEmail` is a boolean derived from the resolved `senderName` and `fromAddress` values per §6 BR-CanSendEmail.
13. `canSendSms` is a boolean derived from the resolved `senderPhone` value per §6 BR-CanSendSms.

### Resolution semantics

14. The RPC resolves identity through the four-tier fallback chain described in §6 BR-ResolutionOrder, evaluated in order, terminating at the first tier that supplies the requested identity.
15. When the caller passes both `source_context_type` and `source_context_id` and the pair resolves to a real organisation scope (event → owning organisation, or organisation → that organisation), the source-context tier wins if its mapped organisation has settings. If the resolved organisation has no settings, the chain falls through to subsequent tiers; `resolvedFrom` records whichever tier ultimately supplied the row.
16. When the caller passes a partial pair, an unrecognised `source_context_type`, or no source-context input at all, the source-context tier produces no match and the chain falls through. The function does not raise.
17. The hierarchy walk performed by the RPC's `'ancestor'` tier traverses parent organisations recursively from the active organisation's parent toward the root. Browser code never observes intermediate steps — only the final row.

### Persistence guarantees on consumers

18. PUMP Edge writes the resolved sender values onto `pump_message` rows (`sender_name`, `sender_email`, `sender_phone`, `reply_to_email`) at send time using values from the same RPC invocation that produced the send-time validation result. Persisted sender fields therefore reflect the same contract used to validate sendability, not SPA-supplied state.
19. `pump_message.sender_name` is NOT NULL on dev-db; sends with `senderName = null` at the resolved row are blocked at the send-time gate (see §6 BR-ChannelGate) before any insert is attempted.

### Cross-channel readiness

20. Email send is blocked when `canSendEmail = false`. SMS send is blocked when `canSendSms = false`. The block surfaces from PUMP Edge as a structured failure to the calling adapter; PUMP-05 reflects readiness flags at compose time so operators see the failure mode before pressing send.

### Non-features

21. No PUMP route exposes settings authoring. No navigation item in the PUMP shell links to a sender-identity settings page in v1.
22. No operator-facing input in PUMP-05 lets an operator override sender name, from address, reply-to, or SMS sender phone. The displayed identity is read-only.

---

## 5. Visual specification

n/a — this slice owns no PUMP UI. The compose-time display of the resolved sender identity is owned by PUMP-05's compose surface and described in PUMP-05's §5; PUMP-03's contract specifies what data PUMP-05 receives (the eleven fields of `EffectivePumpSenderIdentity`) and what operator interactions are forbidden against it (read-only — no editor controls, no override input).

---

## 6. Business rules

### BR-FieldShape — the row shape returned by the RPC

The RPC returns one row with exactly these columns, in this order, with these types and nullabilities. The TypeScript `EffectivePumpSenderIdentity` interface is the canonical mirror; SQL column aliases match the TypeScript field names exactly.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `organisationId` | uuid | NO | Caller's `organisation_id` argument |
| `sourceContextType` | text | YES | Echoes caller's `source_context_type` argument; TypeScript narrows to `'event' \| 'organisation'` but SQL column is plain text |
| `sourceContextId` | uuid | YES | Echoes caller's `source_context_id` argument |
| `senderName` | text | YES | Resolved sender name; null when no tier supplies one |
| `fromAddress` | text | YES | Resolved from address (email); null when no tier supplies one |
| `replyToAddress` | text | YES | Resolved reply-to address (email); always optional |
| `senderPhone` | text | YES | Resolved SMS sender phone; null when no tier supplies one |
| `resolvedFrom` | text | NO | One of `'source_context' \| 'organisation' \| 'ancestor' \| 'platform_default'` |
| `resolvedOrganisationId` | uuid | YES | Org whose `pump_org_settings` supplied resolution; null when `resolvedFrom = 'platform_default'` |
| `canSendEmail` | boolean | NO | Derived per BR-CanSendEmail |
| `canSendSms` | boolean | NO | Derived per BR-CanSendSms |

### BR-ResolutionOrder — fallback resolution chain

Effective sender identity resolves through this precedence chain, evaluated in order. The first tier that supplies an identity wins; `resolvedFrom` records that tier.

1. **`source_context`** — when the caller passes a valid `source_context_type` + `source_context_id` pair that maps to a real organisation scope (`type='event'` resolves to `core_events.organisation_id` for the event row; `type='organisation'` uses `source_context_id` directly as the organisation id) **and** that organisation has `pump_org_settings` row data, the row's sender fields drive the response. `resolvedFrom = 'source_context'`; `resolvedOrganisationId` is the resolved source-context organisation.
2. **`organisation`** — `pump_org_settings` for the active organisation passed as `organisation_id`. `resolvedFrom = 'organisation'`; `resolvedOrganisationId = organisation_id` argument.
3. **`ancestor`** — parent organisations walked recursively via server-side hierarchy helpers, starting from the active organisation's parent and proceeding toward the root. The first ancestor with `pump_org_settings` row data supplies the values. `resolvedFrom = 'ancestor'`; `resolvedOrganisationId` is the supplying ancestor.
4. **`platform_default`** — a `pump_org_settings` row holding non-null sender fields, supplied by the platform. `resolvedFrom = 'platform_default'`; `resolvedOrganisationId = null`.

A consumer must not reimplement this chain on the browser side or in non-PUMP code paths. The RPC is the single resolver.

### BR-CanSendEmail — email channel readiness flag

`canSendEmail` is `true` if and only if both:

- the resolved `senderName` is non-null, **and**
- the resolved `fromAddress` is non-null.

Otherwise `canSendEmail` is `false`. The flag does not consider `replyToAddress` (see BR-ReplyToOptional).

### BR-CanSendSms — SMS channel readiness flag

`canSendSms` is `true` if and only if the resolved `senderPhone` is non-null. Otherwise `canSendSms` is `false`.

### BR-ReplyToOptional — reply-to is optional

`replyToAddress` is optional. Its absence does not affect `canSendEmail`. PUMP Edge populates `pump_message.reply_to_email` from this field when present at send time, otherwise leaves the column null.

### BR-ResolvedFromAudit — `resolvedFrom` audit semantics

`resolvedFrom` is set to the literal corresponding to the tier that supplied the identity. It is an operational audit field — operators may see it through PUMP-05's compose surface but cannot edit it. A value of `'source_context'` is a positive confirmation that the caller-supplied source-context input was honoured; any other value indicates that the source-context input either was not supplied, was partial, was unrecognised, or mapped to an organisation with no settings.

### BR-ResolvedOrgAudit — `resolvedOrganisationId` audit semantics

`resolvedOrganisationId` is set to the organisation whose `pump_org_settings` supplied the resolution. It is `null` only when `resolvedFrom = 'platform_default'`. For `resolvedFrom = 'source_context'`, the value is the organisation that the source-context input mapped to (which may differ from the caller's `organisation_id` argument when the caller passed an event whose owning organisation differs from the active organisation).

### BR-PartialSourceContext — lenient source-context handling

Partial or unrecognised source-context input is treated as no override. The RPC does not raise. Specifically:

- `source_context_type` populated, `source_context_id` null → source-context tier produces no match; chain falls through.
- `source_context_type` null, `source_context_id` populated → source-context tier produces no match; chain falls through.
- `source_context_type` outside the recognised values `'event'` and `'organisation'` (any other text or null) → source-context tier produces no match; chain falls through.
- Both `source_context_type` and `source_context_id` null (i.e. caller did not request a source-context override) → chain begins at the `organisation` tier; `resolvedFrom` is one of `'organisation' | 'ancestor' | 'platform_default'`.

Consumers detect a non-honoured source-context input by reading `resolvedFrom` — when the input was honoured the value is `'source_context'`; when it was not, the value is one of `'organisation' | 'ancestor' | 'platform_default'`.

### BR-CallerAuthorisation — RPC does not gate caller-side RBAC

The RPC does not enforce caller-side RBAC. It is `SECURITY DEFINER STABLE` with no permission checks in its body. Any authenticated caller passing any `organisation_id` receives a result.

Authorisation is the responsibility of the consuming surface:

- **PUMP-05** (the `/comms/create` route) gates access via `PagePermissionGuard` per the PDLC RBAC API usage contract (`pageName='CommsLog'`, `operation='create'`). Operators without `create:page.CommsLog` never reach the compose surface and therefore never invoke the RPC from PUMP.
- **PUMP Edge** (`pump-send`, `pump-send-test`, `pump-schedule`, `pump-resolve-pool` and related functions) invokes the RPC under the service-role client; service-role calls bypass RLS by design. Edge separately validates the caller's `source_context_id` and other pool / send-time inputs before performing the RPC call.
- Any other consuming SPA surface (a future PUMP page or another suite app reading the contract directly) must apply its own page-level guard before calling the RPC.

### BR-SourceContextEcho — `sourceContextType` and `sourceContextId` are literal echoes

The `sourceContextType` and `sourceContextId` response fields are literal echoes of the caller's input arguments. The RPC's final SELECT carries the input values through unchanged. Consequences:

- When the caller passes `NULL` for `source_context_type`, `sourceContextType` is `null` in the response — regardless of which tier ultimately supplied the identity. Same applies to `source_context_id`.
- These fields are **not** discriminators for which resolution tier applied. `resolvedFrom` carries that role. A row with `resolvedFrom = 'organisation'` and a non-null echoed `sourceContextType` simply means the caller asked for a source-context override and the RPC could not honour it (e.g. partial input, unrecognised type, source-context organisation has no settings).
- A row with `resolvedFrom = 'source_context'` confirms the source-context input was honoured; in that case `sourceContextType` and `sourceContextId` echo the honoured input.

### BR-NoBrowserHierarchyWalk — no browser-side hierarchy walk

PUMP SPA code must not query `pump_org_settings`, any organisation-ancestor table or function, or `core_organisations` parent chains directly to reconstruct sender identity. The only sender-identity entry point from the PUMP SPA is `pump_get_effective_sender_identity(...)`. Any non-PUMP suite code that needs PUMP's resolved sender identity must call the same RPC rather than reading `pump_org_settings` directly.

### BR-SingleContract — one contract, two consumers

Compose-time display (PUMP-05) and send-time validation (PUMP Edge) call the same RPC and consume identical `EffectivePumpSenderIdentity` rows. Send-time validation re-resolves rather than trusting the SPA-supplied state from compose. Two implications:

- The contract may not be silently changed in one consumer without lockstep update of the other.
- An operator who sees `canSendEmail = true` at compose time and then loses (e.g.) `fromAddress` between compose and send (because platform changed `pump_org_settings` mid-compose) will encounter a send-time block; that is by design.

### BR-PersistedSenderMatchesContract — persisted values come from the contract

When PUMP Edge writes `pump_message.sender_name`, `sender_email`, `sender_phone`, and `reply_to_email`, those values come from the same `EffectivePumpSenderIdentity` resolution used for the send-time gate, not from any SPA-supplied override. Operators cannot inject sender fields by mutating compose state.

### BR-ChannelGate — channel-readiness blocks at send time

Email send is blocked when `canSendEmail = false`. SMS send is blocked when `canSendSms = false`. The block surfaces at PUMP Edge as a structured failure to the SPA caller, allowing PUMP-05 to render an actionable error. PUMP-05 also reflects the readiness flags at compose time so operators see the failure mode before pressing send. The block is enforced server-side; SPA-side suppression of the send button is convenience only, not the security boundary.

### BR-NoOperatorOverride — sender identity is read-only at compose

The PUMP SPA does not provide an operator-facing input for overriding sender name, from address, reply-to, or SMS sender phone. The displayed sender identity is read-only.

---

## 7. API / Contract

### Public exports (consumed by other slices)

PUMP-03 publishes one consumer-facing contract:

- **TypeScript shape:** `EffectivePumpSenderIdentity` from `@solvera/pace-core/comms`. Used by PUMP-05 for compose-time display state and by the PUMP Edge `CommSendAdapter` plumbing for send-time validation.
- **RPC name:** `pump_get_effective_sender_identity`. Used identically by PUMP-05 (via the secure Supabase client) and PUMP Edge (via the service-role client).

### Read contract

```
RPC name:        pump_get_effective_sender_identity
Volatility:      STABLE
Security:        SECURITY DEFINER
Search path:     SET search_path TO 'public'
Arguments:       organisation_id uuid               (required)
                 source_context_type text DEFAULT NULL  (optional)
                 source_context_id uuid DEFAULT NULL    (optional)
Return:          TABLE (one row) with columns:
                   "organisationId" uuid
                   "sourceContextType" text
                   "sourceContextId" uuid
                   "senderName" text
                   "fromAddress" text
                   "replyToAddress" text
                   "senderPhone" text
                   "resolvedFrom" text
                   "resolvedOrganisationId" uuid
                   "canSendEmail" boolean
                   "canSendSms" boolean
RBAC gating:     None at the RPC. Caller-side authorisation is the
                 responsibility of the consuming surface (see §6
                 BR-CallerAuthorisation).
```

Caller invocation patterns:

- **From PUMP-05 (browser, authenticated SPA):**
  ```
  secureSupabase.rpc('pump_get_effective_sender_identity', {
    organisation_id,           // required
    source_context_type?,      // omit or pass null when not source-scoped
    source_context_id?,
  }) → returns EffectivePumpSenderIdentity[] (one row expected)
  ```
- **From PUMP Edge (service role):** identical signature, invoked with the service-role Supabase client.

The RPC always returns exactly one row when the call succeeds; consumers may assert the array length is 1 or destructure the first element.

### Write contract

n/a — PUMP-03 owns no write path. The `pump_org_settings` table backing the resolution is mutated only by platform-managed tooling outside PUMP. PUMP SPA has no authenticated write path to `pump_org_settings` in v1.

### RLS / permission contracts

- **RPC-side:** none — RPC body contains no RBAC checks.
- **Underlying table (`pump_org_settings`):** RLS-enabled (with row-level policies present per platform-snapshot-2026-05-07 §RLS), but the SECURITY DEFINER RPC bypasses RLS for read purposes. PUMP SPA does not query the table directly under any circumstance.
- **Caller-side gating:** lives at the consuming surface. PUMP-05 wraps `/comms/create` with `PagePermissionGuard` (`pageName='CommsLog'`, `operation='create'`); Edge invocations are service-role.

### Cross-slice handoffs

| Hand to | What is delivered | How consumed |
|---|---|---|
| **PUMP-05** (compose surface, `/comms/create`) | A single `EffectivePumpSenderIdentity` row for the active organisation (and optional source-context input), used to render read-only sender display and to drive `canSendEmail` / `canSendSms` flag UX | PUMP-05 invokes the RPC via `secureSupabase.rpc(...)` at compose mount and on relevant context changes; renders the resolved fields and the channel-readiness state; never mutates the values or surfaces an editor. PUMP-05's own §10 carries the `PagePermissionGuard` test for the page route |
| **PUMP Edge `pump-send` / `pump-send-test` / `pump-schedule`** (and any pool-resolution code that needs source-context-aware sender resolution) | The same row shape, fetched fresh at send-time under service role | Edge invokes the RPC as the first step of validation; rejects the send when `canSendEmail = false` (email channel) or `canSendSms = false` (SMS channel); writes the resolved values onto the resulting `pump_message` row's `sender_name`, `sender_email`, `sender_phone`, `reply_to_email` columns |
| **Other PACE apps using the suite comms platform via `CommSendAdapter`** | The same RPC, called the same way | Adapter implementations defer all sender resolution to this RPC; do not roll their own fallback chain |

### ID contracts

`organisation_id` and `source_context_id` are typed UUIDs. `source_context_type` is plain `text`; valid values are `'event'` and `'organisation'` (any other value is treated as no override per BR-PartialSourceContext). `resolvedFrom` is text valued from the four-element literal union per BR-FieldShape.

---

## 8. Data and schema references

### Tables

- `pump_org_settings` — per-organisation sender identity defaults; columns relevant to this contract: `organisation_id`, `default_sender_name`, `default_from_address`, `default_reply_to_address`, `sms_from_number`. The legacy fields `email_header_html`, `email_footer_html`, `sms_messaging_service_sid`, `sms_opt_out_footer` are present on the table but are out of scope for this contract — they are not surfaced through the RPC return shape.
- `core_organisations` — org hierarchy (parent links). Used by the RPC's ancestor walk; not queried directly by any PUMP consumer.
- `core_events` — used by the RPC's `'event'` source-context branch to map event id → owning organisation id. Not queried directly by PUMP consumers.

### RPCs

- `pump_get_effective_sender_identity(organisation_id uuid, source_context_type text DEFAULT NULL, source_context_id uuid DEFAULT NULL)` — STABLE, SECURITY DEFINER. The single contract entry point. See §7 read contract for signature; see §6 for behavioural rules.

### Edge functions

n/a directly. The contract is consumed by PUMP Edge's `pump-send`, `pump-send-test`, `pump-schedule`, and pool-resolution code (per CR23) under service role; those Edge functions belong to PUMP-05 / PUMP-06 and are gated on CR23 PUMP Edge deployment per platform-snapshot-2026-05-07.

### Verifications against dev-db

Verify against project `rkytnffgmwnnmewevqgp` (per global operating rules → Dev-db reference):

1. RPC `pump_get_effective_sender_identity` exists with the signature in §7 (per platform-snapshot-2026-05-07 line 215).
2. The RPC's return columns match the eleven camelCase aliases in §6 BR-FieldShape, in order, with the listed types.
3. The RPC is `STABLE` and `SECURITY DEFINER`.
4. `pump_org_settings` exists with at least the columns relevant to the contract (`organisation_id`, `default_sender_name`, `default_from_address`, `default_reply_to_address`, `sms_from_number`).
5. The TypeScript signature in pace-core2 generated types confirms the RPC's `Args` and `Returns` shapes match the camelCase column aliases.

### Domain / decision references

- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — comms-platform contract; defines `EffectivePumpSenderIdentity` semantics and the single-contract rule.
- `../../database/decisions/DB-change-decisions-p4.md` — DB-411 `FORCE ROW LEVEL SECURITY` on `pump_*` (relevant context for §17 follow-up below).

---

## 9. pace-core2 imports

### 9.1 Imports table

| Symbol | Import path | One-line why |
|---|---|---|
| `EffectivePumpSenderIdentity` | `@solvera/pace-core/comms` | TypeScript shape mirroring the RPC return row; consumed by PUMP-05 and the PUMP Edge `CommSendAdapter` for compose-time display state and send-time validation |

### 9.2 Slice-specific caveats

- **`EffectivePumpSenderIdentity`:** type-only export (no runtime value). RPC column aliases on `pump_get_effective_sender_identity` match the TypeScript field names exactly, so consumers may destructure RPC rows directly into the type without a translation layer. The RPC's `sourceContextType` SQL column is broader (plain `text`) than the TypeScript narrowing (`'event' | 'organisation'`); consumers that pass an unrecognised `source_context_type` argument are outside the contract and the RPC treats the input as no override per §6 BR-PartialSourceContext.

---

## 10. Permission and access rules

### RPC-level access

The RPC `pump_get_effective_sender_identity` is `SECURITY DEFINER STABLE` with no embedded RBAC checks. Any authenticated caller passing any `organisation_id` receives a result. Service-role callers (Edge) are equally unrestricted at the RPC body. This is by design — caller-side authorisation is the responsibility of the consuming surface.

### Page-level / route-level access (consumed by sibling slices)

| Surface that calls the RPC | Required gating | Owner of the gate |
|---|---|---|
| `/comms/create` (compose surface) | `PagePermissionGuard` with `pageName='CommsLog'`, `operation='create'` per the PDLC RBAC API usage contract | PUMP-05 (this slice does not own the page route). PUMP-05's own §10 carries the route-guard test |
| PUMP Edge `pump-send`, `pump-send-test`, `pump-schedule`, pool resolution | Service role; Edge separately validates `source_context_id` and pool inputs against the caller's scope | PUMP Edge (PUMP-05 / PUMP-06) |
| Any other suite consumer | Page-level guard appropriate to that surface, applied before RPC invocation | The consuming app / slice |

### PUMP-03 owns no role × action matrix of its own

There are no operator-facing actions on this slice. The matrix below records the contract's posture for completeness:

| Role | RPC read | Underlying `pump_org_settings` write |
|---|---|---|
| Authenticated user (no PUMP grants) | Allowed by the RPC; intended access depends on consuming surface's gate | Forbidden — no PUMP UI provides a write path; underlying table writes are platform-managed |
| Authenticated user with `read:page.CommsLog` (PUMP-02 / PUMP-05 viewer) | Allowed | Forbidden — same as above |
| Authenticated user with `create:page.CommsLog` (PUMP-05 composer) | Allowed via `/comms/create` route | Forbidden — same as above |
| Service role (Edge) | Allowed (`pump-send` / `pump-send-test` / `pump-schedule` / pool resolution) | Allowed at the table level, but PUMP Edge has no write path to `pump_org_settings` in v1 — that table is platform-managed outside PUMP |

### Compose-time display posture

At compose time, the resolved sender identity is presented **read-only** in PUMP-05's UI. There is no operator input that lets an operator change sender name, from address, reply-to, or SMS phone. This is BR-NoOperatorOverride.

---

## 11. Acceptance criteria

PUMP-03's acceptance is contract-shape, not user-action. Each criterion is verifiable by a contract test or by an integration reviewer running the RPC against dev-db.

**SPA trace (2026-05-20):** [`docs/delivery/PUMP-03-acceptance-trace.md`](../delivery/PUMP-03-acceptance-trace.md). **Open gaps:** [`docs/delivery/PUMP-03-remediation-plan.md`](../delivery/PUMP-03-remediation-plan.md).

- [x] **AC-1** — **Given** the RPC `pump_get_effective_sender_identity` exists on dev-db, **when** introspecting its function definition (`pg_get_functiondef`), **then** its argument signature is `(organisation_id uuid, source_context_type text DEFAULT NULL, source_context_id uuid DEFAULT NULL)`, its volatility is `STABLE`, its security is `SECURITY DEFINER`, and its return shape is the eleven-column tabular shape in §6 BR-FieldShape with the camelCase column aliases listed there. (Traces §4 items 1, 3, 6.) — *Backend-ready PASS; migration markers + integration `(1)` smoke. **Partial:** no in-repo `pg_get_functiondef` automation — manual §12.*
- [x] **AC-2** — **Given** an organisation has a `pump_org_settings` row with `default_sender_name`, `default_from_address`, and `sms_from_number` populated, **when** the RPC is called with that `organisation_id` and no source-context arguments, **then** the result's `senderName`, `fromAddress`, `senderPhone` reflect the row's values, `resolvedFrom = 'organisation'`, `resolvedOrganisationId = organisation_id`, `canSendEmail = true`, and `canSendSms = true`. (Traces §4 items 7, 9–13; §6 BR-ResolutionOrder, BR-CanSendEmail, BR-CanSendSms.) — *Integration `(2a)` when live env + service-role fixtures (field + readiness assertions).*
- [x] **AC-3** — **Given** an organisation has no `pump_org_settings` row but a parent organisation in its hierarchy does, **when** the RPC is called with the child's `organisation_id` and no source-context arguments, **then** the result's sender fields reflect the ancestor's row, `resolvedFrom = 'ancestor'`, and `resolvedOrganisationId` is the supplying ancestor's id. (Traces §4 items 14, 17; §6 BR-ResolutionOrder.) — *Integration `(2b)` when fixture exists.*
- [x] **AC-4** — **Given** the RPC is called with `organisation_id` for an org that has `default_sender_name` populated but no `default_from_address`, **when** the call returns, **then** `canSendEmail = false` even though `senderName` is non-null, while `canSendSms` is determined independently by the `senderPhone` value. (Traces §4 item 12; §6 BR-CanSendEmail, BR-ReplyToOptional.) — *Integration `(5)`.*
- [x] **AC-5** — **Given** the RPC is called with `source_context_type = 'event'` and a valid `source_context_id` referencing an event whose owning organisation has its own `pump_org_settings` row, **when** the call returns, **then** `resolvedFrom = 'source_context'`, `resolvedOrganisationId` is the event's owning organisation id (which may differ from the caller's `organisation_id` argument), and `sourceContextType` / `sourceContextId` echo the input arguments. (Traces §4 items 8, 15; §6 BR-ResolutionOrder, BR-SourceContextEcho.) — *Integration `(2c)`.*
- [x] **AC-6** — **Given** the RPC is called with `source_context_type = 'organisation'` and `source_context_id = NULL` (a partial pair), **when** the call returns, **then** the call succeeds without raising, `resolvedFrom` is one of `'organisation' | 'ancestor' | 'platform_default'` (never `'source_context'`), and the response's `sourceContextType` field echoes the literal input `'organisation'` while `sourceContextId` is `null`. (Traces §4 item 16; §6 BR-PartialSourceContext, BR-SourceContextEcho.) — *Integration `(3)`.*
- [x] **AC-7** — **Given** the RPC is called by an authenticated user with **no** PUMP RBAC grants whatsoever (no `read:page.CommsLog`, no `create:page.CommsLog`), **when** the call is made directly against the database with a valid `organisation_id`, **then** the call succeeds and returns a sender-identity row. (Traces §4 item 4; §6 BR-CallerAuthorisation. Caller-side gating is verified separately at consuming surfaces — PUMP-05's own §10 carries the `/comms/create` route-guard denial test.) — *Integration `(4)` when `PUMP_CONTRACT_TEST_EMAIL` / `PASSWORD` set per [`PUMP-03-contract-test-user.md`](../delivery/PUMP-03-contract-test-user.md); env-gated (skipped in CI).*
- [x] **AC-8** — **Given** the RPC is called with `source_context_type = NULL` and `source_context_id = NULL`, **when** the call returns, **then** the response's `sourceContextType` and `sourceContextId` fields are both `null`, regardless of which tier supplies the resolution. (Traces §4 item 8; §6 BR-SourceContextEcho.) — *Integration `(3)` + `(2a)`.*
- [x] **AC-9** — **Given** every tier of the resolution chain has settings rows but none has `default_sender_name`, **when** the RPC is called for any in-suite organisation, **then** `senderName` is `null`, `canSendEmail` is `false`, and the row still returns successfully (no error raised) — i.e. "no value resolved at any tier" is a valid result. (Traces §4 item 9; §6 BR-FieldShape, BR-CanSendEmail.) — *Integration `(9)` when RPC probe finds org with `senderName = null`.*
- [ ] **AC-10** — **Given** PUMP Edge has just resolved a row with `canSendEmail = true` for an email send, **when** the resulting `pump_message` row is inspected, **then** its `sender_name`, `sender_email`, and (if applicable) `reply_to_email` columns equal the values returned by that RPC invocation, not any SPA-supplied state. (Traces §4 items 18, 19; §6 BR-PersistedSenderMatchesContract.) — ***Sibling:** PUMP-07 / pace-core2 Edge.*
- [ ] **AC-11** — **Given** PUMP Edge `pump-send` is invoked for an email send and the RPC returns `canSendEmail = false`, **when** the validation phase runs, **then** the send is blocked, no `pump_message` row is inserted (or the row is not transitioned to `'sending'`), and the calling adapter receives a structured failure surfacing the readiness flag. (Traces §4 item 20; §6 BR-ChannelGate.) — ***Sibling:** PUMP-07.*

---

## 12. Verification

PUMP-03 has no PUMP-owned demo flow. Verification scenarios against dev-db (project `rkytnffgmwnnmewevqgp`) that an integration reviewer can run independently:

1. **RPC introspection:** `SELECT pg_get_functiondef('pump_get_effective_sender_identity'::regproc::oid);` — confirm signature, volatility, security, and return-column shape match §6 BR-FieldShape and §7 read contract.
2. **Direct-org resolution:** call `SELECT * FROM pump_get_effective_sender_identity('<org-with-direct-settings>'::uuid);` — confirm `resolvedFrom = 'organisation'` and `resolvedOrganisationId` matches the input.
3. **Ancestor resolution:** call `SELECT * FROM pump_get_effective_sender_identity('<child-org-with-no-settings-but-parent-has-them>'::uuid);` — confirm `resolvedFrom = 'ancestor'` and `resolvedOrganisationId` is the supplying ancestor.
4. **Source-context override:** call `SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid, 'event', '<event-id>'::uuid);` for an event whose owning organisation has its own settings — confirm `resolvedFrom = 'source_context'` and `resolvedOrganisationId` is the event's owning organisation.
5. **Partial-pair tolerance:** call `SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid, 'organisation', NULL);` — confirm the call succeeds, `resolvedFrom ≠ 'source_context'`, `sourceContextType = 'organisation'` (literal echo), `sourceContextId = null`.
6. **Channel-readiness flags:** for an organisation whose `pump_org_settings` has `default_sender_name` but no `default_from_address`, confirm `canSendEmail = false` and `canSendSms` reflects the `sms_from_number` value independently.
7. **Echo property when null:** call `SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid);` (no source-context args) — confirm `sourceContextType` and `sourceContextId` are both null.

PUMP-05 and PUMP Edge build queues carry the integration-side verifications (compose-time display correctness, send-time gate behaviour, persisted-sender-matches-contract).

---

## 13. Testing requirements

PUMP-03 is a contract-only slice. Automated test coverage owned by this slice:

- [x] **§13-1 RPC contract test (signature):** asserts `pg_get_functiondef` output matches the §7 read contract — argument types, defaults, return-column ordering, types, security, volatility. — *Unit: `EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS`; integration `(1)`. **Partial** on live `pg_get_functiondef` — manual §12.*
- [x] **§13-2 RPC contract test (return shape):** for at least one organisation per resolution tier (direct, ancestor, source-context override, platform-default fallback), asserts the eleven returned columns are populated per §6 BR-FieldShape with the expected `resolvedFrom` and `resolvedOrganisationId` values. — *Integration `(2a)`, `(2b)`, `(2c)`, `(2d)` when live env + fixtures.*
- [x] **§13-3 RPC contract test (lenient input):** asserts that the RPC succeeds (no error) when called with each of: `(org_id, NULL, NULL)`, `(org_id, 'organisation', NULL)`, `(org_id, NULL, '<some-uuid>'::uuid)`, `(org_id, 'unknown_type', NULL)`. In each case asserts `resolvedFrom ≠ 'source_context'` and confirms the echo property of `sourceContextType` and `sourceContextId`. — *Integration `(3)`.*
- [x] **§13-4 RPC contract test (no caller RBAC gate):** asserts an authenticated user with no PUMP RBAC grants who calls the RPC with a valid `organisation_id` receives a successful result. — *Integration `(4)` when contract-test credentials configured (env-gated).*
- [x] **§13-5 RPC contract test (channel readiness derivation):** asserts the boolean derivation rules in §6 BR-CanSendEmail and BR-CanSendSms hold across the matrix of (`senderName` populated/null) × (`fromAddress` populated/null) × (`senderPhone` populated/null). — *Unit derivation matrix; integration `(5)`.*

Send-time integration tests covering BR-ChannelGate and BR-PersistedSenderMatchesContract are owned by PUMP-05 / PUMP Edge (the consumers writing the persisted values). PUMP-03's responsibility is to define the contract those tests assert against; the assertions live in the consuming slices' test packs.

---

## 14. Build execution rules

- This slice authors the contract specification only — it has no implementation to merge. The RPC and TypeScript shape are already live on dev-db / pace-core2 per platform-snapshot-2026-05-07 lines 213–226 and pace-core2 `comms/types.ts` lines 191–203.
- Any contract-shape change (RPC signature, return columns, resolution tier semantics, channel-readiness derivation, RBAC posture, source-context echo property) requires lockstep migration of PUMP-05 and PUMP Edge. Author the contract change here, then implement in both consumers in the same merge train. Do not change the contract for one consumer alone.

---

## 15. Done criteria

n/a — PDLC's "Slice done" definition does not strictly apply to a contract-only slice with no standalone build ticket. The contract is verified against dev-db per §12 verification steps; consuming-slice acceptance (PUMP-05, PUMP Edge) carries the runtime evidence.

---

## 16. Do not

- Do not register `/comms/settings` (or any sibling route) as a PUMP route in v1; sender-identity settings are platform-managed outside PUMP.
- Do not introduce a PUMP UI for editing `pump_org_settings`; the underlying table is platform-managed.
- Do not let operators pick or override sender identity at compose time; the displayed identity is read-only per BR-NoOperatorOverride.
- Do not query `pump_org_settings`, `org_ancestors`, `core_organisations` parent chains, or any other source of org hierarchy directly from the PUMP SPA to reconstruct sender identity. The RPC is the single resolver per BR-NoBrowserHierarchyWalk.
- Do not duplicate the resolution chain in JavaScript / TypeScript on the SPA side. Compose-time display reads the RPC result; send-time validation re-invokes the same RPC under service role.
- Do not smuggle legacy email-shell HTML (`email_header_html`, `email_footer_html`, `sms_messaging_service_sid`, `sms_opt_out_footer`) back into the sender-identity contract; the platform-owned email shell is sourced separately and is out of scope here.
- Do not change the contract (RPC signature, return shape, resolution order, echo property, channel-readiness rules, RBAC posture) without a coordinated migration of PUMP-05 and PUMP Edge in the same merge.
- Do not adopt the dev-db `CommsSettings` page key as a v1 PUMP route — it persists in `rbac_app_pages` for platform / future use only.
- Do not invent a fallback path for the SPA to read `pump_org_settings` directly when the RPC returns `null` sender fields — "no value resolved at any tier" is a valid contract result and surfaces as `canSendEmail = false` / `canSendSms = false`, not as an error condition the SPA can repair.

---

## 17. References

- [`pump-project-brief.md`](./pump-project-brief.md) — PUMP project brief; § Known redesign areas and § Known exclusions confirm sender-identity is platform-managed in v1.
- [`pump-architecture.md`](./pump-architecture.md) — § RBAC model § Org settings precedence; § Effective sender identity contract; § Contracts (Sender identity contract). Architecture is the canonical statement of single-contract-two-consumers.
- [`pump-feature-list.md`](./pump-feature-list.md) — derived feature inventory (traceability).
- [`pump-user-stories.md`](./pump-user-stories.md) — derived user stories (traceability).
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md) (verify live dev-db via Supabase MCP) — schema/RPC authority for this rollout. RPC signature on line 215; `pump_org_settings` shape on lines 169–186 (including FORCE-RLS drift note); `EffectivePumpSenderIdentity` confirmation in pace-core2 export map.
- `../../../packages/core/docs/requirements/CR23-comms-platform.md` — CR23 comms platform contract; defines `EffectivePumpSenderIdentity` semantics and the "single resolved contract for both compose and send" rule.
- `../../database/decisions/DB-change-decisions-p4.md` — DB-411 `FORCE ROW LEVEL SECURITY` on `pump_*` (relevant to the §17 follow-up below).
- **Sibling slices:**
  - **PUMP-05** (compose & send) — primary consumer of the contract for compose-time read-only display and send-time validation; owns the `/comms/create` route guard that constitutes the caller-side authorisation surface for SPA invocations of the RPC.
  - **PUMP-06** (webhooks & delivery) — does not consume the contract directly; recipient-row updates do not re-resolve sender identity.
  - **PUMP-01** (app shell & IA) — the `/comms` route is removed and `/comms/settings` is not registered, per architecture; this slice's "no PUMP route" guarantee depends on PUMP-01 not creating a settings route.

### Outstanding platform follow-ups

These are flagged for the platform / DB team. They do not block the PUMP-03 contract spec, but they should be tracked.

1. **`pump_org_settings` not FORCE RLS.** Per platform-snapshot-2026-05-07 lines 184 and 366, `pump_org_settings` is RLS-enabled but not FORCE RLS on dev-db — the only `pump_*` table without FORCE per architecture's DB-411 intent. PUMP-03 is not materially affected (SPA reads the contract through the SECURITY DEFINER RPC; SPA does not query the table directly), but the table-level setting should be aligned with sibling `pump_*` tables.
2. **`platform_default` tier non-determinism.** The RPC's `platform_default` CTE selects any `pump_org_settings` row with non-null sender fields via `ORDER BY organisation_id ASC LIMIT 1`. On a multi-org deployment this resolves to whichever organisation happens to sort first by UUID, not a designated platform-defaults row. Architecture text intends "root/platform default" suggesting designated-row semantics. Designate the `platform_default` tier explicitly — for example via a sentinel organisation flag, a separate platform-defaults row, or a stable ordering rule — so the platform-default identity is reproducible across multi-org dev-db state.
3. **`core_events.event_id` type vs `source_context_id` (uuid).** The RPC's `type='event'` branch joins `core_events e WHERE e.event_id = source_context_id` (where `source_context_id` is `uuid`). If `core_events.event_id` is text (BASE convention where events carry human-readable text identifiers), the comparison may fail at runtime due to type mismatch or rely on implicit coercion. Verify the column type and confirm the `type='event'` lookup resolves correctly. If `core_events.event_id` is text, the RPC's `WHERE e.event_id = source_context_id` needs a type-aligning fix, or the lookup must use `core_events.id` (uuid PK) instead.
4. **CR23 PUMP Edge functions absent from dev-db.** Per platform-snapshot-2026-05-07 lines 297–308, `pump-send`, `pump-resolve-pool`, `pump-schedule`, `pump-cancel`, `pump-send-test`, and `pump-webhook/{gateway}` are not yet deployed. PUMP-03's contract is consumed by these functions; their absence does not affect PUMP-03's documentation but does gate PUMP-05 / PUMP-06 implementation. Tracked under those slices' build prerequisites.

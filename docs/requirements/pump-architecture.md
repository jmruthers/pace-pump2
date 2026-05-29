# [pace-pump] Architecture

**Purpose:** Canonical technical and orchestration document for the documentation-first rebuild.
**Implementation authority:** [pump-project-brief.md](./pump-project-brief.md), [CR23-comms-platform.md](../../../packages/core/docs/requirements/CR23-comms-platform.md), and the slice requirement files in this folder (`PU01-*` through `PU07-*-requirements.md`). Derived traceability: [pump-feature-list.md](./pump-feature-list.md), [pump-user-stories.md](./pump-user-stories.md). **CR23** is the intended comms design. **Legacy pace-pump code is observational only.**

---

## Orchestration metadata (canonical)


| Field                       | Value                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Repository**              | `pace-pump`                                                                                                                                                                                                                                                                                                                    |
| **Product / module**        | PUMP — Personalised Updates, Messaging & Publications (`PUMP`)                                                                                                                                                                                                                                                                 |
| **Comms design CR**         | **CR23** — `~/Documents/GitHub/pace-core2/packages/core/docs/requirements/CR23-comms-platform.md`                                                                                                                                                                                                                              |
| **DB design decisions**     | `**docs/database/decisions/DB-change-decisions-p4.md`** (pace-core2) — **DB-404`–`DB-411** (incl. **DB-407** pre-migration, **DB-405** reporting view)                                                                                                                                                                        |
| **Design vs build**         | **Slice requirements / design:** may proceed using **CR23** + **DB-change-decisions-p4** as contracts. **Application & Edge code:** merge only when the **p4 target** is present on **dev-db** (MCP verification).                                                                                                                     |
| **pace-core2 consumption**  | **Now:** local `**~/Documents/GitHub/pace-core2`** (workspace / link) for current scoped entrypoints. **Later:** published `**@solvera/pace-core`** (or equivalent) — plan an import/bundling migration. The shared comms entrypoint is a **CR23 dependency** and is not yet a live package export in this repo state.                                                                                                                                                      |
| **RBAC**                    | **PACE page model** — `**comms-log`**, `**comms-templates`**, and `**comms-settings`** (catalogue only; no v1 route for settings) in the PUMP app (see § RBAC model (PUMP management app)). `**CommRbacContext**` booleans are **derived** from those grants. Edge validates `**source_context_id`**. **Send-time suppression** (`**pump_suppression`** skips at `**pump-send`**) — **yes** (CR23/p4 target). **User / operator unsubscribe management** (subscribers or staff managing marketing opt-outs in PUMP) — **not in v1** (see § Send-time suppression vs user/operator unsubscribe). |
| **Shared foundation**       | **pace-core2** — local path above until publish. Legacy: `**solvera/pace-core`**, `**@jmruthers/pace-core`**. Current app wiring consumes scoped entrypoints such as `**@solvera/pace-core/components`**, `**/providers`**, `**/hooks`**, and `**/rbac`**. Shared composer work consumes `**@solvera/pace-core/comms**` **after CR23 lands**.                                                                                                                                       |
| **Slice requirements path** | `docs/requirements/pump/<PU><NN>-<brief-description>-requirements.md` (e.g. `PU07-send-pipeline-edge-requirements.md`; slice IDs **PUMP-01**–**PUMP-07** in doc metadata)                                                                                                                                       |
| **DB verification**         | Supabase MCP **dev-db only** (required before **build**, not before **slice doc authoring**)                                                                                                                                                                                                                                   |
| **Gateways (v1 deploy)**    | **Resend** (email), **Twilio** (SMS) — **platform-wide** credentials in **`pump_gateway_config`** (one row per channel); **Edge** reads them. **Per-org** sender identity uses **`pump_org_settings`** and **`pump_message`** sender fields; email shell branding comes from a separate platform-managed branding source. SPA stays provider-agnostic.                                                                                                           |


**Orchestration rules**

1. Slice order, dependencies, route ownership, and split recommendations live **only** here (until reflected in slice requirements).
2. Satellite apps: `**CommComposer` + `CommSendAdapter`** only; **PUMP** owns `**pump-send`**, gateways, `**pump-webhook/{gateway}`**. **No user/operator unsubscribe management** in PUMP v1 UI; **send-time skips** via registry are **Edge-only** (CR23).
3. Update **route ownership** when IA changes.
4. Persistent unknowns → **Open questions** in the relevant `*_requirements.md`.

---

## Context

Suite **outbound comms** (deliberate, sender-initiated; **transactional / operational**, not marketing list sends). **CR23** splits **pace-core2** UI from **PUMP Edge** execution. This repo is the **PUMP management app** (templates, comms log / delivery visibility, compose/send) plus **same composer** as other apps. **Provider API keys** and **org comms defaults / sender identity** are **platform-managed** in v1; see § Contracts.

---

## Suite communications architecture (CR23)


| Layer                                       | Responsibility                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pace-core2** (`@solvera/pace-core/comms` after CR23 lands) | `CommComposer`, previews, merge toolbar, `MessagePreview`, `**CommSendAdapter`**, `**RecipientPoolDescriptor`** — no gateway SDKs / Edge imports in package                 |
| **PUMP Edge Functions**                     | `pump-send`, `pump-resolve-pool`, `pump-schedule`, `pump-cancel`, `pump-send-test`, `pump-webhook/{gateway}` — load **platform** `**pump_gateway_config`**; no per-org credential UI in v1 SPA |
| **PUMP management app**                     | Templates, logs / delivery visibility, compose/send; **CommComposer** with org-wide pools where designed — **no** subscriber unsub journeys, **no** operator marketing opt-out consoles, and **no** settings screen for org sender identity in v1; suppression stays **under Edge** |
| **Other PACE apps**                         | Pool + `CommRbacContext` + adapter → Edge                                                                                                                                   |


**Invariants:** Server-side pool resolution; `**recipient_pool_descriptor*`* on `**pump_message`**; `**source_app**` / `**source_context_***`; `**pump_comms_log**` only as **view/alias** if needed for reporting — **not** a new base table (CR23). Until CR23 lands as a real package surface, the rebuild does **not** create an app-local substitute for the shared composer.

### Send-time suppression vs user/operator unsubscribe (v1)

Matches **CR23** § **Send-time suppression vs user/operator unsubscribe**.

| In scope | Out of scope (this repo / v1 product) |
| --- | --- |
| **`pump-send`** consults **`pump_suppression`** and **skips** suppressed addresses; results may show **`suppression_skipped`** / related warnings | **End-user** “unsubscribe from marketing” **pages or flows** hosted in PUMP |
| **`pump-webhook/{gateway}`** may write suppression rows from bounces, spam complaints, provider signals | **Operator screens** to manage subscriber opt-out lists as a **marketing compliance** product |
| Registry rows are **Edge-maintained**; no RBAC page for “unsubscribe admin” in v1 | **List-unsubscribe** or bulk promo compliance features unless product expands scope later |

---

## Prerequisites & phasing


| Phase                                  | Allowed                                                                                                                 | Depends on                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Slice requirements (design / docs)** | Author `docs/requirements/pump/PU*-requirements.md` against **CR23** + `**DB-change-decisions-p4`** (**DB-404`–`DB-411**)   | Readable copies of those artefacts (pace-core2 repo)                                                                    |
| **Application & Edge code (build)**    | Implement and merge features                                                                                            | **p4 target** landed and **dev-db** MCP-verified against the same CR23 / p4 intent; local **pace-core2** (until publish switch) |


---

## Implementation readiness (dev-db)

**Before merging implementation** for a slice: **MCP against dev-db** — tables, enums, RLS match **CR23** § schema and **DB-change-decisions-p4**. The **logical contract** remains **CR23**; **physical** table/column names on dev-db may lag until the **p4** migrations land — see **§ Dev-db verification snapshot (pace-pump)** below.

---

## Dev-db verification snapshot (pace-pump)

### Target state vs legacy (pace-core2 — 2026-04-20)

Updated **[CR23](~/Documents/GitHub/pace-core2/packages/core/docs/requirements/CR23-comms-platform.md)** and `**DB-change-decisions-p4.md`** (**DB-404`–`DB-411**) define how **dev-db should look after** the staged PUMP migrations:


| Item                                    | Resolution in p4 / CR23                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy `**pump_comms_*`** vs CR23 names | `**DB-407`** drops legacy tables/enums; `**DB-404**` creates `**pump_message**`, `**pump_message_recipient**`, **platform** `**pump_gateway_config**` (PK `**channel**`), `**pump_delivery_event**`, etc., with `**comm_channel**`, `**pump_message_status**` (includes `**cancelled**`), `**pump_recipient_status**` aligned to CR23 |
| Merge tokens                            | **`core_field_list.pump_merge_availability`** — no `**pump_merge_field**` table (see pace-core2 `**docs/database/domains/pump.md**`)                                                                                                                                                                                                                                  |
| Reporting `**pump_comms_log**`          | `**DB-405**` — `**CREATE VIEW pump_comms_log` over `pump_message**` (CR22 / CR23 audit line)                                                                                                                                                                                                          |
| Webhook correlation + idempotency       | `**DB-408**` — unique partial index on recipient `**gateway_message_id**` plus `**organisation_id**` RLS anchor; `**DB-404**` delivery events carry a provider event id where available and a unique `**(gateway, dedupe_key)**` contract for replay safety                                                                                 |
| Draft owner + RLS                       | `**DB-409**` — authenticated policies on message + recipient; **DB-410** — templates + delivery events; **DB-411** — `**FORCE ROW LEVEL SECURITY**` on `**pump_*`**                                                                                                                                                                                                       |
| CR23 prerequisite text                  | CR23 Overview now states **DB-407 before DB-404**                                                                                                                                                                                                                                                     |


**After those migrations are applied on dev-db,** treat **CR23 + p4** as authoritative and **re-verify with MCP**. The **pre-migration audit** table below is **historical** (legacy physical names).

### Active build gates (pace-core2 — track in p4 / CR23)


| Item                           | Owner                         | Action                                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **p4 target on dev-db**        | DB-404 to DB-411 (DB-407 first) | Apply and MCP-verify the staged PUMP schema, RLS, reporting view, delivery-event dedupe contract, and FORCE RLS before feature code merges.                                                                                                                |
| **CR23 comms export**          | CR23 (pace-core2)             | `**@solvera/pace-core/comms**` must exist as a real public package subpath before PUMP-05 implementation starts; no private source imports or app-local composer substitute.                                                                                |
| **Webhook provider mapping**   | PUMP-06 / Edge                | Document Resend and Twilio event-to-recipient-status mapping and status precedence before PUMP-06 implementation.                                                                                                                                            |


**Decided (no further product debate in pace-pump):**

- **comms-log admins** with `**update:page.comms-log`** are **not** constrained like draft authors — they **may** UPDATE any in-org row (including `**status`**) by design.
- **Draft persistence:** keep **DB-404** NOT NULL targets; **PUMP-05** keeps draft state **local until first meaningful save**, then persists a draft row with the minimum required defaults (see **§ RBAC model**).
- **Gateway types:** `**pump_gateway_config.gateway_type**` includes `**resend**` and `**twilio**` in v1.
- **RBAC:** CR23 uses clean page RBAC for `**comms-log**` and `**comms-templates**`.
- **Merge catalogue:** CR23 uses `**core_field_list.pump_merge_availability**`, not a PUMP-local merge table.
- **Legacy `CreateComms`:** dev-db may still contain the old page key before p4 cleanup, but the rebuild ignores it and derives compose access from `**comms-log**`.

### Pre-migration audit (historical — before DB-407)

**Verified against:** Supabase project `**rkytnffgmwnnmewevqgp`** · last migration referenced in audit: `**20260419164000`** (`fix_medi_condition_insert_rls`).

**CR23 logical name → dev-db physical name (legacy only)**


| CR23 (spec)                        | Dev-db (physical)                            | Notes                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pump_message`                     | `**pump_comms_log`**                         | Batch / envelope table                                                                                                                                                    |
| `pump_message_status`              | `**pump_comms_status`** enum                 | Values: `draft`, `scheduled`, `sending`, `sent`, `failed` — `**cancelled` absent** (add `ALTER TYPE … ADD VALUE` if `**pump-cancel`** / schedule-cancel is required)      |
| `comm_channel` (CR23)              | `**pump_comms_channel`**                     | `email`, `sms`                                                                                                                                                            |
| `pump_message_recipient`           | `**pump_comms_recipient**`                   | Per-recipient rows                                                                                                                                                        |
| `pump_recipient_status` (CR23 set) | `**pump_recipient_status**` enum             | Dev-db: `pending`, `delivered`, `opened`, `clicked`, `bounced`, `failed` — **reconcile with CR23** (`queued`, `suppression_skipped`, etc.) in migrations or Edge mapping |
| `gateway_message_id`               | `**provider_message_id`**                    | `text` nullable; partial btree index **not unique** — **recommend** unique partial index for webhook idempotency                                                          |
| `pump_organisation_templates`      | `**pump_comms_template`** *(legacy physical table before DB-404/DB-407)* | Target organisation template library contract in the rebuild / p4                                                                                                          |
| `pump_gateway_config`              | **missing**                                  | **No table** — full DDL + RLS required for DB-404/405                                                                                                                     |
| `pump_delivery_event`              | *not confirmed in audit*                     | Confirm existence / name on dev-db before PUMP-06 build                                                                                                                   |


`**pump_comms_log` — draft & shape (audit)**

- `**status`:** `pump_comms_status`, NOT NULL, default `**draft*`* — ✅ supports draft rows.
- **Blocking NOT NULLs for minimal draft:** `organisation_id`, `**type`** (channel), `**body`**, `**sender_id**` (→ `rbac_user_profiles`) — “empty body” draft is **invalid**; use placeholder body or relax via migration if product requires true empty draft.
- `**created_by`:** nullable — **risk** for draft ownership / “my drafts”; recommend set on insert (`auth.uid()` / effective user) and consider NOT NULL + tighter UPDATE policy.

**RLS on `pump_comms_log` (audit)**

- Policies use **page-scoped RBAC** (e.g. `**read:page.comms-log`**, `**create:page.comms-log`**, `**update:page.comms-log**`, `**delete:page.comms-log**`) with `check_rbac_permission_with_context`, not legacy product-only strings in SQL.
- **Tenant isolation:** INSERT/UPDATE/SELECT scoped by `**organisation_id`** — cross-org leak **not** indicated.
- **Gaps:** UPDATE is **not** limited to `status = 'draft' AND created_by = caller` — any user with org update rights can mutate **any** row; **no DB guard** stopping SPA from setting `status = 'sent'` without Edge. **Recommendation:** narrow UPDATE for SPA drafts + **enforce send/schedule transitions in Edge** (service role); align with PUMP-05/PUMP-06 contracts.

**Log vs drafts (historical pre-migration note)**

- Legacy dev-db exposed all drafts to all log readers. **Target (post–DB-409 revision):** RLS + **§ RBAC model** — verify through **§ Active build gates** before implementation merges.

**Gateway (historical)**

- Pre–DB-404, `**pump_gateway_config`** was absent. Post–DB-404, **platform-wide** credential rows (`**channel**` PK); **per-org** sender identity defaults stay in **`pump_org_settings`** / **`pump_message`**. The master email shell is sourced separately from platform-managed branding data.

**Legacy checklist (pre–DB-407)** — **Superseded** by **`DB-404`–`DB-411`** in **`DB-change-decisions-p4.md`**. Anything still open should appear only under **§ Active build gates** above.

---

## Information architecture — home (`/`)

**Intent:** For **transactional** comms, the **home page is operator-first**: land on **what was sent** and **status**, not an empty dashboard.

**Recommended content on `/` (owned by PUMP-02):**

- **Primary:** **Communications log** — table (or equivalent) of `**pump_message`** batches: channel, subject/preview, status, scheduled/sent time, recipient count, `**source_app`** if useful, link to **batch / recipient drill-down**.
- **Primary action:** prominent **“New message”** (or **Compose**) → `**/comms/create`** (or the chosen compose path).
- **Secondary navigation:** shell nav to **Templates** only. Org comms defaults are platform-managed in v1 and are not a PUMP navigation item.
- **Optional (lightweight):** small **summary** row or badges (e.g. count **failed**, **scheduled**) if cheap to query — avoid a heavy “dashboard” v1 unless needed.

**Routing:** **Single canonical log URL:** `**/`** holds the log. **Do not** register a `**/comms`** list route — the app was not launched publicly, so **remove `/comms` entirely** (no redirect). **Slice ownership:** log UI = **PUMP-02**; router cleanup = **PUMP-01**.

*Alternative considered:* dashboard-first (cards + shortcuts). **Rejected for v1** in favour of log-first, to match transactional “check what went out” workflows; a dashboard can be added later if product wants it.

---

## Bounded contexts


| Bounded context               | Legacy baseline (observational)          | Intended rebuild target (CR23)                                                                                                           |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform shell**            | Legacy pace-core providers, layout, RBAC | pace-core2 auth, layout, **page RBAC** (**§ RBAC model**)                                                                                |
| **Shared comms UI**           | *None in legacy*                         | `**@solvera/pace-core/comms`** — **CommComposer** stack                                                                                  |
| **Log & analytics**           | List + JSON recipients, weak drill-down  | `**pump_message`** batches, `**pump_message_recipient`** detail, `**pump_delivery_event**`; `**read:page.comms-log**`                     |
| **Templates**                 | Slug-oriented CRUD                       | `**pump_organisation_templates`** (+ `**require_merge_field_validation`**, `**created_by**` per agreed contract); `**comms-templates`**   |
| **Gateway + sender identity** | Mixed / ad hoc org fields               | **Platform** `**pump_gateway_config`** (credentials); **per-org** `**pump_org_settings`** + message sender fields for sender identity only; separate platform-managed branding source for the master email shell; no PUMP settings UI in v1       |
| **Compose & send**            | Client-side send loops                   | **CommComposer** + adapter → `**pump-resolve-pool`**, `**pump-send`**, `**pump-schedule**`                                               |
| **Webhooks & async delivery** | Partial / missing Edge coverage          | `**pump-webhook/{gateway}`** → recipients + `**pump_delivery_event`** (provider-agnostic ingress; **v1:** Resend + Twilio behind config) |


---

## Design principles

1. **CR23-first** for schema, Edge names, adapter contracts.
2. **pace-core2 UI** — no parallel composer.
3. **Gateways only in Edge** — no provider SDKs in SPA.
4. **Per-recipient + events** — `**pump_message_recipient`** + `**pump_delivery_event`**.
5. **Edge = security backstop** for scope (CR23).

---

## Contracts (summary)

**Edge:** `pump-send`, `pump-resolve-pool`, `pump-schedule`, `pump-cancel`, `pump-send-test`, `pump-webhook/{gateway}` — full behaviour in CR23; reads **platform** `**pump_gateway_config**` by `**channel**` and consumes the shared effective-sender contract before persisting sender fields. Credential writes **and org comms defaults / sender identity writes** are **platform ops** (SQL / migration / future super-admin), **not** PUMP screens in v1.

**Tables (PUMP v1 app concern):** `pump_message`, `pump_message_recipient`, `pump_organisation_templates`, `pump_system_templates`, `pump_delivery_event`, `pump_gateway_config` (**platform**), `pump_org_settings` (**per-org** sender identity defaults only). **`pump_suppression`** (CR23/p4 target) — **send-time suppression** only; **no** PUMP v1 **UI** for browsing or editing suppression as an operator “user unsub” tool.

**Merge field catalogue:** **`core_field_list`** where **`pump_merge_availability = true`** (pace-core2 CORE domain; no `pump_merge_field` table), exposed to app code through `**pump_list_merge_fields(...)`**.

**Sender identity contract:** consume the shared effective sender shape through `**pump_get_effective_sender_identity(...)`**; browser code must not reconstruct fallback logic from raw org tables.

**Warnings:** `CommSendResult.warnings` / `**CommTokenWarning`**: `unresolved_token` | `gateway_partial_failure` (fields per CR23).

**Permissions:** See **§ RBAC model (PUMP management app)** — **page-scoped** keys per [Standard 03](~/Documents/GitHub/pace-core2/packages/core/docs/standards/3-security-rbac-standards.md) and **CR23 § RBAC**; **`pump_message` / recipient** in **DB-409**; **templates + delivery events** in **DB-410**. **Suppression** at send time is **not** an RBAC page — it is **Edge + `pump_suppression`** (see § Send-time suppression vs user/operator unsubscribe).

---

## RBAC model (PUMP management app)

**Canonical model:** PACE **page** RBAC per [3-security-rbac-standards.md](~/Documents/GitHub/pace-core2/packages/core/docs/standards/3-security-rbac-standards.md) (`{operation}:page.{PageName}`, `check_rbac_permission_with_context`, `get_app_id('PUMP')`, `PagePermissionGuard` / hooks in SPA, `isPermitted` in Edge). Matches **`DB-409`**, **`DB-410`**, **CR23 § RBAC**, and template policies. **Do not** use a legacy `**pump:*`** or `**pump:view_logs`** namespace for new work.


| Page (context key)   | Typical actions                                                      | Slice / surface                                                                                          |
| -------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `**comms-log`**       | `**read**`, `**create**`, `**update**`, `**delete**` | `**/**` log, drill-down, `**pump_message**` INSERT (draft) / UPDATE; `**pump_message_recipient**` + `**pump_delivery_event**` SELECT (DB-409 / DB-410) |
| `**comms-templates**` | `**read**`, `**create**`, `**update**`, `**delete**` | `**/comms/templates**` — `**pump_organisation_templates**` (DB-410)                                      |
| `**comms-settings**` | `**read**`, `**create**`, `**update**`, `**delete**` | Sender identity / communication settings (catalogue + grants seeded; **no v1 SPA route** — see PU03)     |


`**CommRbacContext` (pace-core2 / PUMP-05)** — derive from **effective** page grants, e.g.:


| Prop          | Suggested source (v1)                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| `canCompose`  | `**create:page.comms-log`**                                                            |
| `canSend`     | `**update:page.comms-log`** (send/schedule flows require elevated row mutation + Edge) |
| `canSchedule` | `**update:page.comms-log**`                                                            |


**Legacy dev-db mismatch:** `**rbac_app_pages`** currently still includes `**CreateComms`**. The rebuild does **not** adopt that page key. Compose UX derives from `**comms-log`** to stay aligned with pace-core2 and CR23.

**Route access mapping (v1):**

- `**/**` requires `**read:page.comms-log`**.
- `**/comms/create`** requires `**create:page.comms-log`**.
- `**/comms/templates`** requires `**read:page.comms-templates`**.
- Send, schedule, and test-send actions on `**/comms/create`** require `**update:page.comms-log`** through the existing pace-core2 RBAC model; do **not** add route-specific custom permission code.

**comms-log admin UPDATE:** Users with `**update:page.comms-log`** may UPDATE **any** in-org `**pump_message`** row (including `**status`**), unlike **draft-only** author policies — **intentional** for operators/admins.

**Cancel authorisation (v1):** `**pump-cancel`** is available for **scheduled** messages when the caller is in the same org **and** is either the original author (`**created_by`**) **or** holds `**update:page.comms-log`**. This is **separate** from `**CommRbacContext`** unless pace-core2 later adds an explicit cancel boolean.

**Draft visibility (target):** At DB or app: visible `**draft`** rows = `**created_by = current user`** only; **all users** with `**read:page.comms-log`** see **non-draft** org traffic. Implement via **split RLS SELECT policies** or equivalent (see handoff below).

**Draft removal (v1):** deleting a draft is a normal `**pump_message`** delete action governed by the existing `**delete:page.comms-log`** page permission plus tenancy / author rules. It is **not** modelled as “cancel” or “discard draft”.

**Draft persistence (recommendation — `DB-404` NOT NULLs):** Keep `**body_text`**, `**sender_name`**, `**source_app**`, `**recipient_pool_descriptor**` NOT NULL. PUMP-05 keeps draft state **local until first meaningful save**. A meaningful save means the operator has selected a template, chosen recipients, or entered non-whitespace message content. At that point `**saveDraft**` persists the row with the minimum required defaults: `**body_text`** minimal placeholder if still empty, `**sender_name`** from the effective sender fallback chain, `**source_app**` `'pump'`, and `**recipient_pool_descriptor**` for the selected pool.

**Org settings precedence (v1):** effective sender identity resolves in this order: source-context/event override supplied by the source app → `**pump_org_settings`** for the active org → parent org recursively via **server-side hierarchy helpers** → root/platform default. `**reply_to`** is optional. Email sends require an effective sender name and from address. SMS sender number may resolve from the org or any ancestor/root platform default. In the PUMP app, sender identity is **read-only** and operators do **not** supply arbitrary sender overrides.

**Effective sender identity contract (shared):** PUMP app code and PUMP Edge code use **one server-resolved sender contract**. The browser must **not** walk `**pump_org_settings`** or `**org_ancestors`** directly to rebuild fallback logic on its own.

```ts
interface EffectivePumpSenderIdentity {
  organisationId: string;
  sourceContextType?: 'event' | 'organisation';
  sourceContextId?: string;
  senderName: string | null;
  fromAddress: string | null;
  replyToAddress: string | null;
  senderPhone: string | null;
  resolvedFrom: 'source_context' | 'organisation' | 'ancestor' | 'platform_default';
  resolvedOrganisationId: string | null;
  canSendEmail: boolean;
  canSendSms: boolean;
}
```

**Contract rules**

- Resolution order is exactly the precedence chain above.
- The same contract is used for compose-time display and send-time validation.
- `canSendEmail` requires an effective `senderName` and `fromAddress`.
- `canSendSms` requires an effective `senderPhone`.
- `resolvedFrom` and `resolvedOrganisationId` are operational audit fields so operators can see where the identity came from without gaining edit control.
- Concrete read contract: `**pump_get_effective_sender_identity(organisation_id uuid, source_context_type text default null, source_context_id uuid default null)`** returns the shared sender-identity shape for the caller's permitted scope. PUMP-05 and the Edge pipeline must consume this single contract rather than duplicating logic in two places.

**Email presentation shell (v1):** use a platform-owned master email layout. Org logo / org name / colours come from platform-managed branding data, not arbitrary HTML stored in `**pump_org_settings`**. This avoids per-org HTML injection and keeps email rendering consistent.

**System notifications (v1 split):** distinguish **message copy** from **chrome**. Platform-owned system notification copy lives in `**pump_system_templates`**, is addressed by immutable `**system_key`**, and is **not** managed through normal PUMP template CRUD. Branding/chrome still resolves through the same event → org → ancestor → root fallback chain. Event-level overrides are an **external prerequisite** provided by the source context, not a PUMP-managed screen. This model should be used for **all platform-owned system messages** across the suite; source apps such as BASE should call into it rather than own their own copy strings.

---

## pace-core2 migration assumptions

**Current:** consume from **local** `**~/Documents/GitHub/pace-core2`** (workspace / npm link — team choice) using the package surfaces that exist today. **Future:** switch to **published** `@solvera/pace-core` and update Vite/bundler config. Legacy `**@jmruthers/pace-core`** not targeted for new work. Shared compose/send implementation is **gated on CR23** landing as a real `**@solvera/pace-core/comms**` export; until then, the rebuild does **not** create an app-local comms package or parallel composer implementation. Template preview and message preview must reuse the shared comms preview / safe-rendering surface once that export lands; do **not** build a richer parallel PUMP-only HTML preview path.

---

## Testing expectations (for slice authors)

**Every slice** `*_requirements.md` **must** inherit and restate:


| Expectation                       | Minimum bar                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Happy path**                    | One end-to-end success for the slice’s primary user action(s).                                                                                                              |
| **Validation failure**            | One case where invalid input or preconditions produce a clear, user-visible outcome (no silent failure).                                                                    |
| **Auth / permission failure**     | One case where **page RBAC** (e.g. missing `**read:page.comms-log`**) or **wrong org** denies the action; **Edge** denial if the slice invokes Edge.                         |
| **RLS / tenancy**                 | Where the slice reads/writes tenant data, at least one test or documented MCP check that **wrong org** cannot access rows (or cite Edge-only path with service role rules). |
| **Unit tests**                    | Pure helpers (mappers, formatters, small state machines) introduced in the slice.                                                                                           |
| **Integration / component tests** | Critical UI paths for the slice (tables, forms, composer wiring) where the repo already uses Vitest/RTL — **match existing patterns**.                                      |


**Edge-only slices (e.g. PUMP-06):** contract tests or integration tests against **webhook payloads** and **idempotent** recipient updates; **no** “happy path” only at HTTP layer without asserting DB side-effects.

**Before merge:** lint + typecheck pass; slice-specific tests green.

**dev-db:** Schema alignment check (MCP) when the slice first touches new tables or policies.

---

## Verification & testing (by slice — high level)


| Slice       | Focus                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **PUMP-01** | Shell renders; current pace-core2 scoped entrypoints resolve; auth + **page RBAC** wiring smoke test                                            |
| **PUMP-02** | **A:** list + drill-down; `**read:page.comms-log`** denied path; others’ **drafts** invisible. **B:** scheduled cancel + draft delete stay in log/detail |
| **PUMP-03** | Platform-managed sender identity resolution contract (**prerequisite only; no standalone build ticket**)                             |
| **PUMP-04** | Template CRUD + `**require_merge_field_validation`** surfaced; `**comms-templates`** denied path                                          |
| **PUMP-05** | Adapter calls; `**pump-resolve-pool`** preview; `**pump-send`** / `**pump-send-test`** / `**pump-schedule**` success + warning payload; `**source_app: 'pump'**` |
| **PUMP-06** | Webhook → `**pump_delivery_event`** + recipient status; replay / idempotency                                                              |


---

## Slice sizing — likely too large; split before authoring


| Slice                  | Risk                                                                                         | Recommended split (same route ownership; **sequence** within slice docs or separate prompts)                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PUMP-05**            | Composer + adapter + resolve + send + schedule + test-send + warning UX + RBAC is **multi-day** | **(A)** Route + **CommComposer** mount + `**CommSendAdapter`** skeleton + `**pump-resolve-pool`** + preview/RBAC/`blockSendOnUnresolvedTokens`. **(B)** `**pump-send`** + `**pump-schedule`** + `**pump-send-test`** + result UI + `**CommSendResult.warnings**`. Author **A then B** as separate implementation passes. |
| **PUMP-06**            | Multiple gateways, auth modes, idempotency                                                   | **(A)** Ingress: verify provider signature / routing, persist `**pump_delivery_event`**. (B) Apply events to `**pump_message_recipient`** (status / timestamps). Optionally **one pass per gateway family** (e.g. email vs SMS) if payloads diverge. **Keep handler provider-agnostic** where possible.               |
| **PUMP-02**            | List + detail + filters + row actions mix read and write concerns                              | **(A)** Batch list + navigation + recipient/detail timeline read path. **(B)** Scheduled cancel + draft delete actions. Same slice ID and route owner; author as two implementation passes.                                                                                                                           |


**Slice ID count** in the plan below remains **six**; splits are **authoring guidance**, not new route owners.

---

## Do-not rules

1. No **production** DB for spec validation.
2. No legacy repo as authority.
3. No new `**pump_comms_log`** base table — view/alias only if required.
4. No gateway sends outside **Edge** + `**CommSendAdapter`**.
5. Planning artefacts in this folder: `pump-project-brief.md`, `pump-architecture.md`, derived `pump-feature-list.md` / `pump-user-stories.md`, and `PU*-requirements.md` slices.

---

## References

- [pump-project-brief.md](./pump-project-brief.md)
- [pump-feature-list.md](./pump-feature-list.md)
- [pump-user-stories.md](./pump-user-stories.md)
- **CR23** — [CR23-comms-platform.md](../../packages/core/docs/requirements/CR23-comms-platform.md)
- **DB decisions** — [DB-change-decisions-p4.md](../../database/decisions/DB-change-decisions-p4.md) (**DB-404`–`DB-411**)
- Legacy pace-pump `src/` — observational only

---

## Implementation plan

### Slice overview


| Slice ID    | Name                  | Bounded context(s)        | Routes owned                    | Depends on                | Summary                                                                                                                                                                                         |
| ----------- | --------------------- | ------------------------- | ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PUMP-01** | App shell & IA        | Platform shell            | `/login`, `*` *(NotFound)*      | —                         | pace-core2 integration; **page RBAC** shell; **do not register `/comms`** (removed; log only on `**/**`)                                                                                        |
| **PUMP-02** | Comms log & analytics | Log & analytics           | `**/`** *(home = log)*          | PUMP-01                   | **A:** `**pump_message*`* list, optional summary, recipient drill-down, `**read:page.comms-log`** denied path, and **others’ drafts hidden**. **B:** scheduled cancel / draft delete row actions. **Compose** CTA remains on `/`. |
| **PUMP-03** | Platform-managed sender identity | Sender identity defaults  | *No PUMP route*                 | PUMP-01                   | Numbered **prerequisite contract only** for the shared effective-sender contract; **no standalone build ticket**; settings are **platform-managed** in v1 and **not** edited through PUMP                                                                             |
| **PUMP-04** | Template library      | Templates                 | `/comms/templates`              | PUMP-01                   | `**pump_organisation_templates`** CRUD; `**comms-templates`**; strict-mode indicator via `**require_merge_field_validation`**                                                                  |
| **PUMP-05** | Compose & send        | Shared comms UI + compose | `/comms/create`                 | PUMP-01, PUMP-03 prerequisite, PUMP-04 | **CommComposer**; **CommSendAdapter** (merge fields from **`core_field_list.pump_merge_availability`** through `**pump_list_merge_fields(...)`**); `**pump-resolve-pool`**, `**pump-send`**, `**pump-schedule`**, `**pump-send-test**`; `source_app: 'pump'` — **author in sub-passes** (see **Slice sizing**) |
| **PUMP-06** | Webhooks & delivery   | Webhooks & async delivery | *Edge HTTP only (no SPA route)* | PUMP-05 *(behavioural)*   | `**pump-webhook/{gateway}`**; `**pump_delivery_event`**; recipient updates — **author in sub-passes** (see **Slice sizing**)                                                                    |


**Each feature route** appears in **exactly one** owning slice. PUMP-01 may create shell route slots or placeholders for navigation, but final feature guards, loaders, and components belong to the listed owner. `**/`** = **comms log (home)** → **PUMP-02**. The `**/comms`** path is **not** part of the rebuild router (removed); there is **no** second list view.

### Dependency rationale

- **PUMP-01** is the **hard prerequisite**: pace-core2 providers, routing, RBAC surface, and comms package import must work before any feature slice.
- **PUMP-03** is retained for traceability only: it names the shared sender-identity prerequisite contract but does **not** create a standalone implementation stream or build ticket. **PUMP-04** (templates) remains an implementation slice that supplies **PUMP-05**.
- **PUMP-02** (log) depends only on **PUMP-01**; it is ordered **before PUMP-05** in the implementation sequence to **validate read paths and RLS early** on `**pump_message` / recipients** without waiting for send UX.
- **PUMP-02** is implemented in two passes: **A** read-only log/detail first; **B** scheduled-message cancel and v1 draft deletion. Both actions stay in PUMP-02 because they operate on existing `**pump_message`** rows in the log/detail flow rather than initial composition.
- **PUMP-05** depends on **PUMP-01**, the **PUMP-03 prerequisite contract**, and **PUMP-04** so `**CommSendAdapter`** can load templates and resolved org defaults through `**pump_get_effective_sender_identity(...)`** and `**pump_list_merge_fields(...)`**; **Edge** assumes **platform** `**pump_gateway_config**` is populated for happy-path sends.
- **PUMP-06** depends on **PUMP-05** **behaviourally**: webhooks update rows that `**pump-send`** creates; it can be developed in parallel only once `**pump-send`** contract and recipient row shape are stable.

### Implementation order

1. **PUMP-01** — Shell, IA, RBAC, comms package path.
2. **PUMP-04** — Templates.
3. **PUMP-02A** — Log and drill-down read path.
4. **PUMP-02B** — Scheduled cancel and draft-delete row actions.
5. **PUMP-05** — Compose / adapter / send / schedule (**split into sub-passes**) after the **PUMP-03** sender-identity prerequisite and CR23 comms export are verified.
6. **PUMP-06** — Webhooks and delivery pipeline (**split into sub-passes**) after provider event/status mapping is documented.

### High-risk slices


| Slice       | Primary risk                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **PUMP-01** | pace-core2 API drift; **page RBAC** / `**CommRbacContext`** derivation; future `**@solvera/pace-core/comms`** export stability             |
| **PUMP-05** | `**CommSendAdapter`** ↔ Edge payload parity; pool JSON; `**source_context_*`** vs Edge validation; `**CommSendResult.warnings**` UX |
| **PUMP-06** | Provider verification, idempotency, service-role abuse surface, multi-gateway divergence                                            |


### Route ownership


| Route              | Owner                                                        |
| ------------------ | ------------------------------------------------------------ |
| `/login`           | PUMP-01                                                      |
| `/`                | PUMP-02 *(comms log home)*                                   |
| `/comms`           | *Removed* *(PUMP-01 — do not register; log is `**/**` only)* |
| `/comms/templates` | PUMP-04                                                      |
| `/comms/create`    | PUMP-05                                                      |
| `*` (NotFound)     | PUMP-01                                                      |
| Webhook paths      | PUMP-06                                                      |


---

## Handoff — database agent (pace-core2)

Build gates and verification tasks for **CR23** and **`docs/database/decisions/DB-change-decisions-p4.md`**:

1. **p4 rollout** — apply the PUMP p4 target on dev-db (**DB-407** pre-migration before **DB-404**, then **DB-405** / **DB-408** / **DB-409** / **DB-410** / **DB-411**) and MCP-verify the target PUMP tables, enums, policies, reporting view, and FORCE RLS before feature code merges.
2. **Platform gateway + org defaults ownership** — verify Edge loads `**pump_gateway_config**` by **`channel`**, resolves sender identity through `**pump_get_effective_sender_identity(...)**`, and keeps platform-owned email shell/branding outside PUMP screens.
3. **Policy rollout** — verify **DB-409** / **DB-410** / **DB-411** policy counts after apply.
4. **Delivery-event dedupe** — `**pump_delivery_event**` must persist a provider event id when available plus a deterministic `**dedupe_key**`; enforce uniqueness on `**(gateway, dedupe_key)**` so webhook replay is DB-backed idempotent.
5. **Provider event/status mapping** — document Resend and Twilio webhook event mapping and recipient-status precedence before PUMP-06 build.
6. **System notification split** — verify platform-owned `**system_key**` copy remains separate from event/org chrome fallback so PUMP template CRUD does not become the runtime contract for system messages.
7. **Tester-only send path** — verify `**pump-send-test**` remains the dedicated “send to current tester only” contract, separate from normal pool resolution and normal batch logging.

---

## Orchestration metadata (repeat in every `*_requirements.md`)

- **Architecture:** [pump-architecture.md](./pump-architecture.md)
- **CR23:** `~/Documents/GitHub/pace-core2/packages/core/docs/requirements/CR23-comms-platform.md`  
- **DB:** `docs/database/decisions/DB-change-decisions-p4.md` — **DB-404`–`DB-411** (see quick index in p4)  
- **RBAC:** **§ RBAC model (PUMP management app)** + **CR23 § RBAC** + [Standard 03](~/Documents/GitHub/pace-core2/packages/core/docs/standards/3-security-rbac-standards.md) — page keys only (clean redesign)  
- **pace-core2:** local workspace now → published package later  
- **Order:** PUMP-01 → PUMP-04 → PUMP-02A → PUMP-02B → PUMP-05 (after PUMP-03 prerequisite + CR23 comms export) → PUMP-06
- **Testing:** Inherit **§ Testing expectations (for slice authors)**  
- **dev-db only** for schema checks

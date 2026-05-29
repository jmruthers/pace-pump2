# PUMP Backend Ready Report

> **Path:** `docs/delivery/pump-backend-ready-report.md`  
> **Verification date:** 2026-05-20  
> **Owner:** PUMP backend track  
> **Target project:** `yihzsfcceciimdoiibif` (`https://yihzsfcceciimdoiibif.supabase.co`)  
> **Inspection method:** Supabase MCP (`list_migrations`, `execute_sql`, `list_edge_functions`, `get_project_url`)  
> **Execution authority:** [`docs/requirements/pump/PU01-app-shell-information-architecture-requirements.md`](../requirements/pump/PU01-app-shell-information-architecture-requirements.md) through [`PU07-send-pipeline-edge-requirements.md`](../requirements/pump/PU07-send-pipeline-edge-requirements.md), [`pump-architecture.md`](../requirements/pump/pump-architecture.md), [`pump-project-brief.md`](../requirements/pump/pump-project-brief.md), [`pump-feature-list.md`](../requirements/pump/pump-feature-list.md).

**Project ref note:** Several slice docs cite dev-db project `rkytnffgmwnnmewevqgp` in §8 verification sections. This report’s evidence is from the **MCP-linked canonical target** `yihzsfcceciimdoiibif` (same project as TEAM/Portal backend-ready reports). Apply the same migration + Edge deploy lineage to any alternate PUMP app target before frontend execution there.

---

## Run Readiness Summary

- **Backend-ready report:** this document (**Gate status: PASS**).
- **Backend freeze status:** **Frozen for this run** — PU01–PU07 schema/RPC/RLS/seed/Edge contracts satisfied on target (`yihzsfcceciimdoiibif`); Phase 2 frontend execution may proceed per lifecycle.
- **Unresolved contract blockers:** **0**.
- **Frontend queue execution:** **GO** for PUMP Phase 2 per [`docs/product-delivery-lifecycle.md`](../product-delivery-lifecycle.md) (slice §15 UI/integration behaviour remains frontend-owned).
- **Closed this run:** **DB-PUMP-001** (`pump_org_settings` FORCE RLS), **PUMP-EDGE-001** (`pump-cancel`, `pump-webhook` **ACTIVE**), **PUMP-CODE-001** (`pumpCancel` / `handleCancel` author OR admin OR-rule in repo).

**Phase 2 handoff:** When [`docs/delivery/pump-build-queue.md`](pump-build-queue.md) or `docs/delivery/pump-run-summary-[YYYY-MM-DD].md` is generated, set **Backend freeze: Yes** and link to this report. No pump delivery queue file exists yet at verification time.

---

## Slice coverage

| Slice | Requirement doc | Primary DB track | Backend-owned delta (this run) |
| --- | --- | --- | --- |
| PU01 | PU01-app-shell-information-architecture | RBAC catalogue + org grants (`comms-log`, `comms-templates`) | None (p4 + `team_batch8`) |
| PU02 | PU02-comms-log-home | `pump_message` / `pump_message_recipient` / `pump_delivery_event` read + draft DELETE; **`pump-cancel`** Edge | **PUMP-EDGE-001**, **PUMP-CODE-001** |
| PU03 | PU03-sender-identity-contract | `pump_get_effective_sender_identity`; `pump_org_settings` FORCE RLS | **DB-PUMP-001** |
| PU04 | PU04-template-library | `pump_organisation_templates` authenticated RLS | None (DB-410) |
| PU05 | PU05-compose-send | Draft INSERT/UPDATE `pump_message`; six send-path Edge slugs | None (DB-409 + prior Edge deploy); `pump-schedule` deployed, UX deferred per PU07 |
| PU06 | PU06-webhooks-delivery-pipeline | `pump-webhook`; dedupe indexes; service-role writes | **PUMP-EDGE-001** |
| PU07 | PU07-send-pipeline-edge | `pump-resolve-pool`, `pump-send`, `pump-send-test` | None (Edge only; no DDL) |

Governance: [`pump-architecture.md`](../requirements/pump/pump-architecture.md), [`pump-project-brief.md`](../requirements/pump/pump-project-brief.md) (no extra DDL beyond tracked batches).

Package / implementation gates (not DB blockers): PU07 §15 `core_additional_contact` structure verification at Edge pool-SQL implementation time; slice §8/§15 “Edge ABSENT” text is stale vs MCP (see **Doc drift** below).

---

## Discovered existing state (MCP)

MCP pass 2026-05-20: CR23 `pump_*` foundation applied; **eight** `pump-*` Edge slugs **ACTIVE**; org-scoped PUMP page permissions present; runtime seeds non-zero.

### Migrations (PUMP-relevant)

Applied on target (`list_migrations`), including:

- `20260426083941` … `p4_batch03_pump_premigration` (DB-407)
- `20260426084000` … `p4_batch04_pump_schema_foundation` (DB-404, DB-405)
- `20260426084100` … `p4_batch05_pump_recipient_hardening` (DB-408)
- `20260426084200` … `p4_batch06_pump_authenticated_rls` (DB-409)
- `20260426084300` … `p4_batch07_pump_authenticated_rls_remainder` (DB-410)
- `20260426084400` … `p4_batch08_pump_force_rls` (DB-411 — seven base tables)
- `20260426084500` … `cr23_pump_system_template_seeds`
- `20260426190500` … `cr23_sender_identity_and_edge_indexes` (DB-421)
- `20260507133830` … `team_batch4_batch5_batch6_rpc_reporting_pump_readiness` (gateway, org_settings, org template seeds)
- `20260517025307` … `team_batch8_org_scoped_rbac_reseed` (PUMP `comms-log` / `comms-templates` grants)
- `20260520105941` … **`pump_org_settings_force_rls`** (**DB-PUMP-001**)

Related: `20260426211000` … `base_pump_comms_log_security_invoker` (view hardening).

### Tables, view, enums

| Object | Evidence | Result |
| --- | --- | --- |
| CR23 base tables (8) | `pg_tables` + FORCE RLS on all `pump_*` listed in domain doc | PASS |
| `pump_comms_log` | `to_regclass('public.pump_comms_log')` | PASS |
| `comm_channel` | `email`, `sms` | PASS |
| `pump_message_status` | `draft`, `scheduled`, `sending`, `sent`, `cancelled`, `failed` | PASS |
| `pump_recipient_status` | six values (`pending` … `suppression_skipped`; no legacy `opened`/`clicked` as status) | PASS |
| `pump_message.recipient_pool_descriptor` | `is_nullable = YES` | PASS (PU05 authors against nullable) |

### RPCs

| RPC | Signature (live) | Volatility / security | Result |
| --- | --- | --- | --- |
| `pump_get_effective_sender_identity` | `(organisation_id uuid, source_context_type text, source_context_id uuid)` | STABLE, SECURITY DEFINER; 11 camelCase return columns per PU03 | PASS |
| `pump_list_merge_fields` | `(organisation_id uuid, channel comm_channel, recipient_pool jsonb, …)` | Present for `pump-load-merge-fields` adapter path | PASS |

**Canonical RPC args:** Use `organisation_id` (no `p_` prefix) per PU03 and live Postgres; PU05 §8 `p_organisation_id` wording is doc drift only.

### RLS policies (spot-check)

| Table | Policies |
| --- | --- |
| `pump_message` | `service_role_can_manage_all_pump_message`, `rbac_select_nondraft_pump_message`, `rbac_select_own_drafts_pump_message`, `rbac_insert_pump_message`, `rbac_draft_owner_update_pump_message`, `rbac_update_pump_message`, `rbac_delete_pump_message` |
| `pump_message_recipient` | `service_role_can_manage_all_pump_message_recipient`, `rbac_select_pump_message_recipient` |
| `pump_delivery_event` | `service_role_can_manage_all_pump_delivery_event`, `rbac_select_pump_delivery_event` |
| `pump_organisation_templates` | `service_role_*`, `rbac_insert/select/update/delete_pump_organisation_templates` |

All authenticated policies resolve via `check_rbac_permission_with_context(..., get_app_id('PUMP'))` per slice contracts.

### Indexes (PU06 webhook correlation)

- `pump_delivery_event_gateway_dedupe_unique`
- `pump_message_recipient_gateway_message_id_uidx`
- `pump_delivery_event_gateway_occured_idx`

### Triggers (pump domain)

- `pump_org_settings`: `handle_pump_org_settings_audit_fields`, `update_pump_org_settings_updated_at` only (no send-path triggers on message tables).

### Edge functions (eight `pump-*` slugs)

MCP `list_edge_functions` — all **ACTIVE** on `yihzsfcceciimdoiibif`:

| Slug | `verify_jwt` | Slice |
| --- | --- | --- |
| `pump-resolve-pool` | true | PU05, PU07 |
| `pump-send` | true | PU05, PU07 |
| `pump-schedule` | true | PU05 (deployed; PU07 v1 UX defers schedule) |
| `pump-send-test` | true | PU05, PU07 |
| `pump-load-templates` | true | PU05 |
| `pump-load-merge-fields` | true | PU05 |
| `pump-cancel` | true | PU02B |
| `pump-webhook` | false | PU06 |

Deploy source: [`packages/core/supabase/functions/`](../../packages/core/supabase/functions/) (`pump-*` entrypoints + [`_shared/pump-edge.ts`](../../packages/core/supabase/functions/_shared/pump-edge.ts)).

### RBAC and seed state

| Area | Evidence | Result |
| --- | --- | --- |
| PUMP app | `rbac_apps.name = 'PUMP'`, `is_active = true` | PASS |
| PUMP pages | `comms-log`, `comms-templates`, `comms-settings` (+ legacy `CreateComms` — not consumed by PU01) | PASS |
| Org-scoped grants | comms-log: read/create/update/delete across orgs; comms-templates: CRUD where seeded | PASS |
| `pump_gateway_config` (active) | 2 rows | PASS |
| `pump_org_settings` | 4 rows | PASS |
| `pump_organisation_templates` | 8 rows | PASS |
| `pump_system_templates` | 10 rows | PASS |

### Code contract (PU02 cancel OR-rule)

[`packages/core/src/comms/edge-service.ts`](../../packages/core/src/comms/edge-service.ts) `pumpCancel`: denies only when `!isAuthor && !canUpdate` (author **OR** `update:page.comms-log`). [`pump-edge.ts`](../../packages/core/supabase/functions/_shared/pump-edge.ts) `handleCancel` matches. **PUMP-CODE-001** — PASS.

---

## Applied deltas

| Delta | Migration / action | Notes |
| --- | --- | --- |
| **DB-PUMP-001** | [`20260520105941_pump_org_settings_force_rls.sql`](../../packages/core/supabase/migrations/20260520105941_pump_org_settings_force_rls.sql) | **Applied on target** — `pump_org_settings` FORCE RLS parity with DB-411 family |
| **PUMP-EDGE-001** | Deploy `pump-cancel`, `pump-webhook` to `yihzsfcceciimdoiibif` | **Applied** — MCP `list_edge_functions` 2026-05-20; JWT flags match PU02/PU06 |
| **PUMP-CODE-001** | `pumpCancel` / `handleCancel` OR authorisation | **Resolved in repo** — no migration; Edge deploy carries handler |

Prior foundation (no recreation this run): p4 batches DB-404–DB-421, `team_batch6` runtime seeds, `team_batch8` PUMP page grants — see [`DB-change-decisions-pump.md`](../database/decisions/DB-change-decisions-pump.md).

---

## Contract verification by slice (schema / RPC / RLS / seed / Edge only)

| Slice | Verdict | Notes |
| --- | --- | --- |
| PU01 | PASS | RBAC catalogue + org-scoped `comms-log` / `comms-templates` grants; no PUMP-domain DDL |
| PU02 | PASS | Read tables + RLS; draft DELETE; **`pump-cancel`** ACTIVE; cancel OR-rule in code |
| PU03 | PASS | Sender RPC + FORCE RLS on `pump_org_settings` |
| PU04 | PASS | `pump_organisation_templates` CRUD policies |
| PU05 | PASS | Draft message RLS; six send-path Edge slugs ACTIVE (+ `pump-schedule` deployed) |
| PU06 | PASS | `pump-webhook` ACTIVE (`verify_jwt: false`); dedupe indexes |
| PU07 | PASS | `pump-resolve-pool`, `pump-send`, `pump-send-test` ACTIVE; no new DDL |
| Architecture / brief | PASS | No extra DDL beyond tracked batches |

---

## Blockers (exact missing evidence)

**None.**

Previously tracked prerequisites (now closed on target):

- **PU02B / PU06:** `pump-cancel` and `pump-webhook` deployed and **ACTIVE** (PUMP-EDGE-001).
- **PU03:** `pump_org_settings` FORCE RLS (DB-PUMP-001).
- **PU02 cancel semantics:** `pumpCancel` author OR admin (PUMP-CODE-001).

---

## Doc drift (non-blocking)

Slice §8/§15 still reference platform-snapshot-2026-05-07 “Edge ABSENT” / `pump-cancel` not deployed. **MCP contradicts** — optional hygiene to refresh PU02, PU05, PU06, PU07 verification sections; does not block backend-ready gate.

---

## Decisions and domain links

- [`DB-change-decisions-pump.md`](../database/decisions/DB-change-decisions-pump.md) — **DB-PUMP-001**, **PUMP-EDGE-001**, **PUMP-CODE-001**; slice traceability PU01–PU07
- [`pump.md`](../database/domains/pump.md) — current state, Edge table, RLS posture (verified 2026-05-20)
- [`DB-change-decisions-p4.md`](../database/decisions/DB-change-decisions-p4.md) — CR23 foundation DB-404–DB-421
- [`DB-change-decisions-team.md`](../database/decisions/DB-change-decisions-team.md) — TEAM-DB-012 runtime seeds; batch8 PUMP grants
- [`rbac.md`](../database/domains/rbac.md) — page permission model
- [`core.md`](../database/domains/core.md) — `core_member`, `core_events`, merge catalogue (`core_field_list`)

Comms platform authority: [`packages/core/docs/requirements/CR23-comms-platform.md`](../../packages/core/docs/requirements/CR23-comms-platform.md).

---

## Backend-ready gate (lifecycle)

Per [`docs/product-delivery-lifecycle.md`](../product-delivery-lifecycle.md) Phase 1:

| Criterion | Status |
| --- | --- |
| Required backend contracts exist | **Yes** — PU01–PU07 schema/RPC/RLS/seed/Edge on target |
| Backend-ready report exists | **Yes** (this file) |
| Decision chunk and domain docs current and linked | **Yes** |
| No unresolved contract blockers | **Yes** |

**Gate:** **PASS**  
**Freeze for this run:** **Yes** (per lifecycle Phase 1 complete for verification date 2026-05-20)

---

## Verification snippets (regression checks)

```sql
-- PUMP app active
select name, is_active from public.rbac_apps where name = 'PUMP';

-- PUMP pages consumed by PU01
select ap.page_name
from public.rbac_app_pages ap
join public.rbac_apps a on a.id = ap.app_id
where a.name = 'PUMP'
  and ap.page_name in ('comms-log', 'comms-templates')
order by ap.page_name;

-- FORCE RLS on all pump base tables
select c.relname as tablename, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'pump_%'
  and c.relkind = 'r'
order by c.relname;

-- Sender identity RPC present
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'pump_get_effective_sender_identity';

-- Runtime seed sanity
select
  (select count(*) from public.pump_gateway_config where is_active) as gateway_active,
  (select count(*) from public.pump_org_settings) as org_settings,
  (select count(*) from public.pump_organisation_templates) as org_templates;
```

Re-run MCP `list_edge_functions` after any PUMP Edge change. Proceed with Phase 2 [`pump-build-queue.md`](pump-build-queue.md) generation while gate remains **PASS** and backend stays **frozen** for this run.

# PUMP Build Queue

## Run Readiness Summary

- Backend-ready report: [`docs/delivery/pump-backend-ready-report.md`](pump-backend-ready-report.md) (`Gate status: PASS`; verification date 2026-05-20; target project `yihzsfcceciimdoiibif`)
- Backend freeze status: `Frozen for this run` — PU01–PU07 schema/RPC/RLS/seed/Edge contracts satisfied on target (per backend-ready report Run Readiness + Slice coverage)
- Unresolved blockers: `0` (`none`) — report § Blockers: None; closed **DB-PUMP-001**, **PUMP-EDGE-001**, **PUMP-CODE-001**
- Execution mode: `full run`

**Preflight caveat:** MCP regression checks use verified-contract project **`yihzsfcceciimdoiibif`** even if local `.env` / `SUPABASE_PROJECT_REF` points elsewhere (per backend-ready report project-ref note).

## Dependency handling for this run

- Source authority for slice identity/title/dependencies: `docs/requirements/PU*.md`
- `.contract` dependencies (requirement prose, e.g. PUMP-05 → PUMP-03 sender-identity RPC; PUMP-07 → PUMP-03) are treated as backend-pre-satisfied for runtime sequencing when the backend-ready report is `PASS` and backend is frozen for this run
- Runtime `depends_on` values in the queue table include executable build-order prerequisites only; authority contract edges are preserved in **Evidence** below

## Queue

| slice_id | depends_on | status | blocker_reason |
| --- | --- | --- | --- |
| PUMP-01 — App shell & information architecture | - | done | CommRbac: inline `src/components/comms/CommRbacContextProvider.tsx` (2026-05-20) |
| PUMP-04 — Template library | PUMP-01 |  |  |
| PUMP-02 — Communications log home | PUMP-01 |  |  |
| PUMP-03 — Platform-managed sender identity contract | PUMP-01 | done | SPA contract + AC trace 2026-05-20; AC-7 env-gated; AC-10/11 → PUMP-07 |
| PUMP-05 — Compose & send | PUMP-01, PUMP-04 |  |  |
| PUMP-06 — Webhooks & delivery pipeline (Edge-only) | PUMP-05 |  |  |
| PUMP-07 — Send Pipeline Edge Implementation | PUMP-05, PUMP-06 |  |  |

## Evidence

### PUMP-01 — App shell & information architecture

- authority: [`docs/requirements/PU01-app-shell-information-architecture-requirements.md`](../requirements/PU01-app-shell-information-architecture-requirements.md)
- backend freeze: PU01 PASS per [`pump-backend-ready-report.md`](pump-backend-ready-report.md) — RBAC catalogue + org grants (`CommsLog`, `CommsTemplates`); no PUMP-domain DDL
- CommRbacContext: inline provider in `src/components/comms/CommRbacContextProvider.tsx` (2026-05-20); nav permissions via `useCan` pre-filter (NavigationMenu has no guard slots)
- QA pack: [`docs/test-packs/PUMP-01-qa-pack.md`](../test-packs/PUMP-01-qa-pack.md)

### PUMP-04 — Template library

- authority: [`docs/requirements/PU04-template-library-requirements.md`](../requirements/PU04-template-library-requirements.md)
- backend freeze: PU04 PASS per [`pump-backend-ready-report.md`](pump-backend-ready-report.md) — `pump_organisation_templates` authenticated RLS (DB-410)
- sequencing: [`pump-architecture.md`](../requirements/pump-architecture.md) § Implementation order — templates before comms log read-path validation

### PUMP-02 — Communications log home

- authority: [`docs/requirements/PU02-comms-log-home-requirements.md`](../requirements/PU02-comms-log-home-requirements.md)
- backend freeze: PU02 PASS per [`pump-backend-ready-report.md`](pump-backend-ready-report.md) — read tables + RLS; draft DELETE; **`pump-cancel`** ACTIVE (**PUMP-EDGE-001**); cancel OR-rule (**PUMP-CODE-001**)
- sub-passes (authority only): PUMP-02A read path, then PUMP-02B row actions — not separate queue rows

### PUMP-03 — Platform-managed sender identity contract

- authority: [`docs/requirements/PU03-sender-identity-contract-requirements.md`](../requirements/PU03-sender-identity-contract-requirements.md)
- backend freeze: PU03 PASS per [`pump-backend-ready-report.md`](pump-backend-ready-report.md) — `pump_get_effective_sender_identity` RPC; **`pump_org_settings` FORCE RLS** (**DB-PUMP-001**)
- acceptance trace: [`PUMP-03-acceptance-trace.md`](PUMP-03-acceptance-trace.md) — AC-1..9 SPA-complete (conditional on live env); AC-10/11 deferred to PUMP-07
- remediation: [`PUMP-03-remediation-plan.md`](PUMP-03-remediation-plan.md) — closed for SPA; AC-7 optional credentials per [`PUMP-03-contract-test-user.md`](PUMP-03-contract-test-user.md)
- SPA contract: `useEffectivePumpSenderIdentity` + `src/lib/comms/senderIdentityContract*` (24 unit + 9 integration tests; integration skipped in CI without live env)
- contract-only UI: no compose banner — PUMP-05 consumes the hook; Edge send-time validation in pace-core2 (PUMP-07)

### PUMP-05 — Compose & send

- authority: [`docs/requirements/PU05-compose-send-requirements.md`](../requirements/PU05-compose-send-requirements.md)
- backend freeze: PU05 PASS per [`pump-backend-ready-report.md`](pump-backend-ready-report.md) — draft `pump_message` RLS; six send-path Edge slugs ACTIVE (`pump-resolve-pool`, `pump-send`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields`); schedule UX deferred per PU07
- authority contract (Evidence): PUMP-03 sender-identity RPC — frozen PASS; omitted from runtime `depends_on`
- operational gates (non-blocking at init): PU05 §15 pace-core2 `@solvera/pace-core/comms` export, CommComposer Save Draft, typeahead — implementation/QA obligations while backend gate PASS
- sub-passes (authority only): PUMP-05A composer mount + draft path; PUMP-05B send / schedule / send-test — not separate queue rows

### PUMP-06 — Webhooks & delivery pipeline (Edge-only)

- authority: [`docs/requirements/PU06-webhooks-delivery-pipeline-requirements.md`](../requirements/PU06-webhooks-delivery-pipeline-requirements.md)
- backend freeze: PU06 PASS per [`pump-backend-ready-report.md`](pump-backend-ready-report.md) — **`pump-webhook`** ACTIVE (`verify_jwt: false`, **PUMP-EDGE-001**); dedupe indexes
- implementation lane: pace-core2 Edge — `packages/core/supabase/functions/pump-webhook` (per backend report); no SPA route
- doc drift (non-blocking): PU06 §8/§15 “Edge ABSENT” text stale vs MCP 2026-05-20

### PUMP-07 — Send Pipeline Edge Implementation

- authority: [`docs/requirements/PU07-send-pipeline-edge-requirements.md`](../requirements/PU07-send-pipeline-edge-requirements.md)
- backend freeze: PU07 PASS per [`pump-backend-ready-report.md`](pump-backend-ready-report.md) — `pump-resolve-pool`, `pump-send`, `pump-send-test` ACTIVE; no new DDL
- authority contract (Evidence): PUMP-03 `pump_get_effective_sender_identity` RPC — frozen PASS; omitted from runtime `depends_on`
- implementation lane: pace-core2 Edge — `packages/core/supabase/functions/pump-resolve-pool`, `pump-send`, `pump-send-test` (per backend report)
- sequencing: after PUMP-06 for `gateway_message_id` webhook correlation handoff per PU07 §15 / PU05 §15
- package gates (non-blocking at init): PU07 §15 `core_additional_contact` structure verification; `PumpStoreCreateRecipientInput` / `gatewayMessageId` forwarding in `edge-service.ts` — per backend report package/implementation gates, Edge slugs ACTIVE on target
- doc drift (non-blocking): PU07 §8/§15 “Edge ABSENT” text stale vs MCP 2026-05-20

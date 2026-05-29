# PUMP-07 acceptance status

Authority: [PU07-send-pipeline-edge-requirements.md](../requirements/PU07-send-pipeline-edge-requirements.md)

Delivery:

- pace-core2 Edge: `pump-edge-http.ts`, `pump-runtime-bootstrap.ts`, `src/comms/pump-gateway.ts`, `src/comms/pump-pool-resolution.ts`, `edge-service.ts` orchestration
- Entrypoints: `pump-resolve-pool`, `pump-send`, `pump-send-test` → `pump-edge-http` (legacy `send-email` / `send-sms` handlers removed from active path)

Legend: **Auto** = Vitest in CI; **Code** = implemented, not live-verified on dev-db; **Manual** = §12 HTTP/DB replay pending.

## §10 Acceptance criteria — pump-resolve-pool (PUMP-07A)

| ID | Status | Evidence |
| --- | --- | --- |
| AC-07A-01 | Partial (Auto + Manual) | `toPoolWarnings` (`no_email`/`no_phone`), `buildPoolPreviewWarnings` (`suppressed`); org + additional-contact pool test. Live multi-member org preview: Manual §12.1 |
| AC-07A-02 | Partial (Auto + Manual) | Event pool SQL + `filters.status`; `pump-pool-resolution.test.ts` event happy path. Live approved-only count: Manual §12.2 |
| AC-07A-03 | Partial (Auto) | Manual pool code path; mocked `pumpResolvePool` count. No additional contacts on manual: code |
| AC-07A-04 | **Auto** | `pump-pool-resolution.test.ts` — `unknown` warning |
| AC-07A-05 | **Auto** | `edge-service.test.ts` + pool test — `POOL_VARIANT_UNSUPPORTED`, zero DB |
| AC-07A-06 | **Auto** | `edge-service.test.ts` — `PUMP_RBAC_DENIED` on resolve |

## §10 Acceptance criteria — pump-send (PUMP-07B)

| ID | Status | Evidence |
| --- | --- | --- |
| AC-07B-01 | Code + Manual | `edge-service.test.ts` — `gatewayMessageId` writeback. Live Resend/Twilio + DB rows: Manual §12.3 (blocked until redeploy + gateway seed) |
| AC-07B-02 | **Auto** | `edge-service.test.ts` — suppression skip |
| AC-07B-03 | Partial (Auto) | Partial failure in `edge-service.test.ts`; retry exhaustion in `pump-gateway.test.ts` (503×4) |
| AC-07B-04 | **Auto** | `INSUFFICIENT_SENDER_IDENTITY`, no `createMessage` |
| AC-07B-05 | **Auto** | `MERGE_VALIDATION_FAILED`, no store writes |

## §10 Acceptance criteria — pump-send-test (PUMP-07B)

| ID | Status | Evidence |
| --- | --- | --- |
| AC-07C-01 | Partial (Auto + Manual) | `pumpSendTest` + `gatewayMessageId` unit test. Live dispatch: Manual §12.4 |
| AC-07C-02 | Code + Manual | `pump-edge-http.ts` suppression advisory query. Live warning in response: Manual §12.5 |
| AC-07C-03 | **Auto** | `edge-service.test.ts` — `PUMP_SEND_TEST_NO_DESTINATION` |
| AC-07C-04 | **Auto** | `edge-service.test.ts` — send-test `PUMP_RBAC_DENIED` |

**Automated summary (§10 logic):** 10/14 fully automated at unit layer; 4 partial (live gateway/DB or multi-recipient integration).

**Live §10 on deployed Edge:** Pending redeploy of send-path functions + `pump_gateway_config` seed.

## §11 Test plan

| PU07 §11 item | Status | Test file |
| --- | --- | --- |
| Pool variants (org/event/manual) | Partial | `pump-pool-resolution.test.ts`, mocked `edge-service.test.ts` |
| CustomFilter zero queries | Complete | `edge-service.test.ts`, `pump-pool-resolution.test.ts` |
| RBAC deny resolve | Complete | `edge-service.test.ts` |
| Event out-of-org | Complete | `pump-pool-resolution.test.ts` |
| Additional contact in count | Complete | `pump-pool-resolution.test.ts` (org_members + `resolveAdditionalContacts`) |
| Suppressed preview warning | Complete | `pump-pool-resolution.test.ts` |
| Send happy path + gateway_message_id | Partial | `edge-service.test.ts` (mock store) |
| Suppression skip | Complete | `edge-service.test.ts` |
| bypass_suppression | Complete | `edge-service.test.ts` |
| Retry exhaustion 503 | Complete | `pump-gateway.test.ts` |
| Strict merge / sender identity / zero recipients | Complete | `edge-service.test.ts` |
| GATEWAY_CONFIG_MISSING before DB | Complete | `edge-service.test.ts` |
| canonical_parent zero recipients | Complete | `edge-service.test.ts` |
| Send-test suite (5 items) | Complete | `edge-service.test.ts` |
| Resend/Twilio/backoff | Complete | `pump-gateway.test.ts` |
| HTTP error mapping (optional) | Complete | `pump-edge-http.test.ts` |

**CI:** `npm run validate` PASS in pace-core2 `packages/core` (2026-05-21).

## §15 Done criteria / build gates

| Gate | Status |
| --- | --- |
| Edge slugs ACTIVE on dev-db | PASS per [pump-backend-ready-report.md](pump-backend-ready-report.md) — redeploy required after this code drop |
| `pump_gateway_config` seeded | Pending — blocks live happy-path |
| Additional contacts table | Implemented against `core_contact.permission_type` (`full`/`notify`); PU07 doc drift noted |
| `gatewayMessageId` in edge-service | Complete |
| Resolve-pool without gateway config | Complete — `registerPumpResolveRuntime` |

## §12 Manual verification

Target dev-db: `yihzsfcceciimdoiibif`

| Step | Result | Notes |
| --- | --- | --- |
| 1 OrgMembersPool preview | Pending | Redeploy `pump-resolve-pool`; JWT + `read:page.comms-log` |
| 2 EventParticipants status filter | Pending | |
| 3 pump-send happy path + gateway_message_id | Blocked | Gateway credentials + redeploy `pump-send` |
| 4 pump-send-test happy path | Blocked | Same |
| 5 Send-test suppression advisory | Pending | Seed `pump_suppression` for caller address |
| 6 INSUFFICIENT_SENDER_IDENTITY | Pending | |
| 7 MERGE_VALIDATION_FAILED | Pending | |
| 8 Zero-recipient send | Pending | |

See [PUMP-07-qa-pack.md](../test-packs/PUMP-07-qa-pack.md).

## Remediation closed in code (2026-05-21)

- Split `registerPumpResolveRuntime` / `registerPumpSendRuntime` (resolve-pool no gateway dependency)
- HTTP `GATEWAY_CONFIG_MISSING` / `INVALID_SOURCE_CONTEXT` mapping in `pump-edge-http.ts`
- Stage logs: `pump_send_started` (with `message_id`, `recipient_count`), `pump_send_recipient_failed`, `pump_send_completed` in `edge-service.ts`
- Removed legacy `handleResolvePool` / `handleSend` / `handleSendTest` + `send-email`/`send-sms` from `pump-edge.ts`

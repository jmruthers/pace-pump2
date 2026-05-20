# PUMP-07 remediation plan

Authority: [PU07-send-pipeline-edge-requirements.md](../requirements/PU07-send-pipeline-edge-requirements.md)

Tracking: [PUMP-07-acceptance-status.md](PUMP-07-acceptance-status.md)

## Closed in this delivery (code)

- Thin HTTP layer: `pump-edge-http.ts` → `pumpResolvePool` / `pumpSend` / `pumpSendTest`
- Concrete runtime: `pump-runtime-bootstrap.ts`, `pump-gateway.ts`, `pump-pool-resolution.ts`
- `registerPumpResolveRuntime` — pool preview without `pump_gateway_config`
- `registerPumpSendRuntime` — send paths with Resend/Twilio + retry
- Error catalog: `pump-error-codes.ts`; HTTP mapping for `GATEWAY_CONFIG_MISSING`, `INVALID_SOURCE_CONTEXT`
- Observability stage logs in `edge-service.ts` (PII-safe)
- Legacy inline send handlers removed from `pump-edge.ts`
- Vitest: `edge-service.test.ts`, `pump-gateway.test.ts`, `pump-pool-resolution.test.ts`, `pump-edge-http.test.ts`
- `npm run validate` PASS (pace-core2 `packages/core`)

## Open gaps (ordered)

### G1 — Redeploy send-path Edge functions (blocks §12 / live §10)

**Requirement:** §15, §12, AC-07B-01, AC-07C-01.

**Attempt (2026-05-21):** `supabase functions deploy pump-resolve-pool pump-send pump-send-test --project-ref yihzsfcceciimdoiibif` — **FAILED**. Bundler cannot resolve `src/comms/*.js` / `src/types/api-result.js` imports inside `edge-service.ts` (Node-style `.js` specifiers; no emitted `.js` beside sources). `pump-resolve-pool` upload progressed; `pump-send` bundle error.

**Remediation:**

1. Platform: add Deno-compatible import map or pre-bundle `edge-service` + deps for Edge deploy (same gap affects `base-notification-dispatch` src imports).
2. Redeploy all three slugs after bundle path is fixed.
3. Confirm `list_edge_functions` version bump on `yihzsfcceciimdoiibif`.
4. Record deploy version in this file when done.

**Owner:** Platform / pace-core2 deploy lane.

### G2 — `pump_gateway_config` credential seeding (blocks happy-path)

**Requirement:** §15, BR-Dispatcher-ConfigMissing.

**Remediation:**

1. Seed `email` row: `gateway_type=resend`, `config.api_key`, `is_active=true`.
2. Seed `sms` row: `gateway_type=twilio`, `account_sid`, `auth_token`, `messaging_service_sid` or `from_number`.
3. Re-run [PUMP-07-qa-pack.md](../test-packs/PUMP-07-qa-pack.md) steps 3–4.

**Owner:** Platform / operator.

### G3 — §12 manual QA execution — PENDING

**Requirement:** §12 in acceptance status.

**Remediation:** Execute [PUMP-07-qa-pack.md](../test-packs/PUMP-07-qa-pack.md); update §12 table in acceptance status.

**Owner:** Operator / integration reviewer.

### G4 — PU07 doc drift (non-blocking)

- §8/§15 “Edge ABSENT” text vs backend-ready ACTIVE report.
- `core_additional_contact` → live implementation uses `core_contact.permission_type`.

**Remediation:** Update PU07 metadata + table names when QA confirms schema.

### G5 — PUMP-06 correlation (dependency)

Webhook §12 blocked until `pump-send` writes `gateway_message_id` on dev-db (G1 + G2). Unblocks PUMP-06 manual steps that need seeded recipient rows.

## Out of scope (follow-up slice)

- `pump-schedule` execution mechanism
- `pump-cancel` OR-rule in `edge-service.ts`
- `CustomFilterPool` resolution
- Server-side idempotency key

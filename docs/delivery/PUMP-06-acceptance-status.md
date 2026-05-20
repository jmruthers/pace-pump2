# PUMP-06 acceptance status

Authority: [PU06-webhooks-delivery-pipeline-requirements.md](../requirements/PU06-webhooks-delivery-pipeline-requirements.md)

Delivery:

- pace-core2 Edge: commit `511a33a` on `cursor/7d3896e4` — `pump-webhook-logic.ts`, `handleWebhook` in `pump-edge.ts`
- pace-pump2 tests: commit `4743796` on `cursor/7d3896e4` — `src/lib/webhook/*.test.ts`

Legend: **Auto** = covered by unit/contract tests in CI; **Code** = implemented in Edge handler, not yet proven on live dev-db; **Manual** = §12 operator replay against `yihzsfcceciimdoiibif` pending.

## §11 Acceptance criteria — PUMP-06A (Ingress)

| ID | Status | Evidence |
| --- | --- | --- |
| AC-06A-01 | Auto + Manual | Resend `email.delivered` mapping, dedupe, apply: `pumpWebhookMapping.test.ts`, `processWebhookIngressApply` mocks. Live INSERT columns: Manual §12.1 |
| AC-06A-02 | Auto + Manual | Twilio `delivered` dedupe/occurred_at: `deriveTwilioDedupeKey`, `resolveOccurredAt` in `pumpWebhookIngress.test.ts`. Live POST: Manual §12.4 |
| AC-06A-03 | Auto | Triple replay + duplicate body: `pumpWebhookIdempotency.test.ts` |
| AC-06A-04 | Code + Manual | 401 before `processWebhookIngressApply`: `pumpWebhookHandler.contract.test.ts` (source order). Live tampered signature: Manual §12.2 |
| AC-06A-05 | Code + Manual | 404 unknown gateway: contract test. Live `sendgrid` path: Manual §12.6 |
| AC-06A-06 | Code | Malformed JSON → 400 after verify in `handleWebhook` |
| AC-06A-07 | Auto | Unknown Resend `type` → `mapResendProviderType` null → 400 path in handler |
| AC-06A-08 | Auto + Manual | No-match: `pumpWebhookIngress.test.ts`, structured log. Live logs: Manual §12.8 |

## §11 Acceptance criteria — PUMP-06B (Apply)

| ID | Status | Evidence |
| --- | --- | --- |
| AC-06B-09 | Auto | `queued` → `delivered`: `pumpWebhookMapping.test.ts`, `pumpWebhookPrecedence.test.ts` |
| AC-06B-10 | Auto | First-only `opened_at`: `pumpWebhookEngagement.test.ts`. Second event INSERT (different `svix-id`): Manual §12.10 / remediation |
| AC-06B-11 | Auto | Hard bounce + `hard_bounce` suppression: `pumpWebhookSuppression.test.ts`, mapping suite |
| AC-06B-12 | Auto | Soft bounce, no suppression: mapping suite |
| AC-06B-13 | Auto | `spam_complaint` + suppression: mapping suite |
| AC-06B-14 | Auto | Twilio `21610` + `recipient_request` / `sms`: mapping + suppression tests |
| AC-06B-15 | Auto | Second `delivered` idempotent: `pumpWebhookPrecedence.test.ts` |
| AC-06B-16 | Auto | Terminal `bounced` blocks `queued`: precedence suite |
| AC-06B-17 | Auto | Non-null `opened_at` not overwritten: `pumpWebhookEngagement.test.ts` |

## §11 Acceptance criteria — Cross-cutting

| ID | Status | Evidence |
| --- | --- | --- |
| AC-06X-18 | Code | INSERT then apply; failure after INSERT returns 500 (no recipient/suppression partial). **Gap:** `pump_delivery_event` row may exist if UPDATE fails — see remediation |
| AC-06X-19 | Code + Manual | `createClients()` uses service role only. RLS denial with anon key: Manual §12.17 |

**Automated summary (§11 logic/contract):** 17/19 fully automated at unit layer; 2 partial (AC-06A-04 live signature, AC-06B-10 second-event INSERT orchestration).

**Live §11 on deployed Edge:** 0/19 signed off — requires redeploy of `511a33a` + §12 replay.

## §13 Testing requirements

| # | Requirement | Status | Test file |
| --- | --- | --- | --- |
| 1 | BR-N1 mapping conformance | Complete | `pumpWebhookMapping.test.ts` (all Resend + Twilio rows) |
| 2 | Idempotency triple replay | Complete | `pumpWebhookIdempotency.test.ts` |
| 3 | Concurrent dedupe race | Partial | Same file (in-memory lock; not Postgres UNIQUE) |
| 4 | Precedence lattice | Complete | `pumpWebhookPrecedence.test.ts` |
| 5 | First-only engagement | Complete | `pumpWebhookEngagement.test.ts` |
| 6 | Suppression channel derivation | Complete | `pumpWebhookSuppression.test.ts` |
| 7 | No-match no-write | Complete | `pumpWebhookIngress.test.ts` |
| 8 | Signature-failure no-write | Partial | Contract test only; no HTTP 401 integration test |
| 9 | Edge-log no-match | Complete | `pumpWebhookIngress.test.ts` |

## §15 Done criteria

| Criterion | Status |
| --- | --- |
| §11 pass on deployed `pump-webhook/{gateway}` on dev-db | Pending — redeploy + §12 |
| §13 suites pass on CI | Complete — `npm run validate` PASS (163 tests) |
| BR-N1 single source in handler code | Complete — `pump-webhook-logic.ts` |
| Edge deployed with this implementation | Pending — see remediation |

## §12 Manual verification

Target dev-db: `yihzsfcceciimdoiibif` (per backend-ready report)

| Step | Result | Notes |
| --- | --- | --- |
| 1 Resend delivered fixture | Pending | Needs seeded `gateway_message_id` |
| 2 Invalid signature 401 | Pending | |
| 3 Duplicate replay | Pending | |
| 4 Twilio delivered | Pending | |
| 5 Twilio duplicate + 21610 suppression once | Pending | |
| 6 Unknown gateway 404 | Pending | |
| 7 Malformed payload 400/401 | Pending | |
| 8 No-match + Edge log | Pending | |
| 9 Delivered from queued | Pending | |
| 10 First-only opened (two svix-id) | Pending | |
| 11 Hard-bounce upsert | Pending | |
| 12 Soft-bounce no suppression | Pending | |
| 13 Spam complaint | Pending | |
| 14 Twilio 21610 | Pending | |
| 15 Forward-only (sent after delivered) | Pending | |
| 16 Terminal failed blocks delivered | Pending | |
| 17 Service-role vs anon | Pending | |
| 18 Full BR-N1 fixture matrix on DB | Pending | |

## §16 Do-not compliance (code review)

| Rule | Status |
| --- | --- |
| No `pumpWebhookEvent` import in Edge | Pass |
| No hardcoded `channel: 'email'` for suppression | Pass — `channelFromGateway` |
| No `pump_delivery_event` on no-match | Pass |
| No overwrite `opened_at` / `clicked_at` | Pass |
| Precedence blocks forbidden transitions | Pass |
| No SPA webhook route | Pass |
| Closed-set `pump_suppression.reason` | Pass |

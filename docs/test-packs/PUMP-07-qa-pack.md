# PUMP-07 QA pack — Send pipeline Edge

Authority: [PU07-send-pipeline-edge-requirements.md](../requirements/PU07-send-pipeline-edge-requirements.md)

Delivery:

- Edge: pace-core2 `pump-edge-http.ts`, `pump-runtime-bootstrap.ts`, `src/comms/edge-service.ts`
- Tests: pace-core2 `src/comms/*.test.ts`

Target dev-db: `yihzsfcceciimdoiibif`

## Automated traceability — §11

| # | Status | Automated test |
| --- | --- | --- |
| 1 | Partial | `pump-pool-resolution.test.ts` (org/event/manual) |
| 2 | Complete | `pump-pool-resolution.test.ts`, `edge-service.test.ts` |
| 3 | Complete | `edge-service.test.ts` |
| 4 | Complete | `pump-pool-resolution.test.ts` |
| 5 | Complete | `pump-pool-resolution.test.ts` |
| 6 | Complete | `pump-pool-resolution.test.ts` |
| 7 | Partial | `edge-service.test.ts` |
| 8 | Complete | `edge-service.test.ts` |
| 9 | Complete | `edge-service.test.ts` |
| 10 | Complete | `pump-gateway.test.ts` |
| 11–14 | Complete | `edge-service.test.ts` |
| 15–18 | Complete | `edge-service.test.ts` |
| Send-test 1–5 | Complete | `edge-service.test.ts` |
| Gateway adapters | Complete | `pump-gateway.test.ts` |
| HTTP errors | Complete | `pump-edge-http.test.ts` |

## Prerequisites

- `pump-resolve-pool`, `pump-send`, `pump-send-test` deployed with PUMP-07 code (see [PUMP-07-remediation-plan.md](../delivery/PUMP-07-remediation-plan.md) G1)
- `pump_gateway_config` active rows for `email` (resend) and `sms` (twilio) (G2)
- Test user JWT with `read:page.CommsLog` and `update:page.CommsLog` for target org
- `pump_get_effective_sender_identity` returns `canSendEmail` / `canSendSms` true for test org

## Manual traceability — §12 / §10

| Step | §10 AC | Action | Pass criteria |
| --- | --- | --- | --- |
| 1 | 07A-01 | POST `…/pump-resolve-pool` with `OrgMembersPool` + user JWT | 200 `{ ok:true, data: CommRecipientPreview }`; `estimated_count > 0`; warnings if no_email/suppressed |
| 2 | 07A-02 | Same with `EventParticipantsPool` + `filters.status: ['approved']` | `estimated_count` matches approved applications only |
| 3 | 07B-01 | POST `…/pump-send` valid `CommSendRequest` + small manual pool | 200 `CommSendResult`; `pump_message.status=sent`; recipients have `gateway_message_id` |
| 4 | 07C-01 | POST `…/pump-send-test` email body | 200; `total_recipients=1`; recipient `gateway_message_id` set |
| 5 | 07C-02 | Send-test with caller address in `pump_suppression` | 200; advisory `unresolved_token` warning in `warnings` |
| 6 | 07B-04 | Send with identity RPC returning `canSendEmail=false` | 422 `INSUFFICIENT_SENDER_IDENTITY`; no `pump_message` row |
| 7 | 07B-05 | Strict template + unresolved token | 422 `MERGE_VALIDATION_FAILED`; no message/recipient rows |
| 8 | 07B-01 / §4B #8 | Send pool resolving to zero recipients (non-canonical) | 200; `total_recipients=0`; `gateway_partial_failure` warning |

## Resolve-pool without gateway (regression)

POST `pump-resolve-pool` when `pump_gateway_config` is empty or missing for channel must still return 200 preview (or RBAC/validation errors) — must **not** return `GATEWAY_CONFIG_MISSING`.

## CI command

```bash
cd pace-core2/packages/core && npm run validate
cd pace-pump2 && npm run validate
```

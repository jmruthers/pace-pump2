# PUMP-06 QA pack — Webhooks & delivery pipeline

Authority: [PU06-webhooks-delivery-pipeline-requirements.md](../requirements/PU06-webhooks-delivery-pipeline-requirements.md)

Delivery:

- Edge: pace-core2 `511a33a` (`pump-webhook` → `handleWebhook`)
- Tests: pace-pump2 `4743796` (`src/lib/webhook/`)

Target dev-db: `yihzsfcceciimdoiibif`

## Automated traceability — §13

| # | Status | Automated test |
| --- | --- | --- |
| 1 | Complete | `pumpWebhookMapping.test.ts` |
| 2 | Complete | `pumpWebhookIdempotency.test.ts` (triple replay) |
| 3 | Partial | Same file (in-memory concurrent; not Postgres) |
| 4 | Complete | `pumpWebhookPrecedence.test.ts` |
| 5 | Complete | `pumpWebhookEngagement.test.ts` |
| 6 | Complete | `pumpWebhookSuppression.test.ts` |
| 7 | Complete | `pumpWebhookIngress.test.ts` |
| 8 | Partial | `pumpWebhookHandler.contract.test.ts` (401 ordering only) |
| 9 | Complete | `pumpWebhookIngress.test.ts` (structured log) |

## Manual traceability — §12 / §11

Prerequisites:

- `pump-webhook` deployed with PUMP-06 logic (see [PUMP-06-remediation-plan.md](../delivery/PUMP-06-remediation-plan.md) G1)
- `pump_gateway_config` rows for `email` and `sms` with valid signing secrets
- At least one `pump_message_recipient` with known `gateway_message_id` (from `pump-send`)

| §12 | §11 AC | Action | Pass criteria |
| --- | --- | --- | --- |
| 1 | 06A-01 | POST `…/pump-webhook/resend` Resend `email.delivered` + valid Svix + matching `data.email_id` | 200 `{applied:true}`; one `pump_delivery_event`; recipient `delivered` |
| 2 | 06A-04 | Same fixture, tampered `svix-signature` | 401 empty body; row count unchanged |
| 3 | 06A-03 | Repeat step 1 | Second 200 `{applied:false,reason:'duplicate'}`; one event row |
| 4 | 06A-02 | POST `…/pump-webhook/twilio` `MessageStatus=delivered` + valid signature + `MessageSid` | 200 `{applied:true}`; `provider_event_id` null; dedupe `SID:delivered` (+ DLR suffix if sent) |
| 5 | 06A-03, 06B-14 | Twilio `undelivered` + `ErrorCode=21610` twice | One suppression row; second response duplicate |
| 6 | 06A-05 | POST `…/pump-webhook/sendgrid` | 404; no DB writes |
| 7 | 06A-06 | Invalid JSON to resend path | 400 or 401; no DB writes |
| 8 | 06A-08 | Resend delivered with unknown `email_id` | 200 `recipient_not_found`; log line in Edge logs; no DB rows |
| 9 | 06B-09 | Recipient `status=queued`, Resend delivered | `status=delivered`, `delivered_at` set |
| 10 | 06B-10 | Delivered recipient; two `email.opened` different `svix-id` | `opened_at` set once; two event rows |
| 11 | 06B-11 | Resend `email.bounced` `data.bounce.type=Permanent` | Recipient `bounced`; suppression `hard_bounce` email |
| 12 | 06B-12 | Bounced non-Permanent | Recipient `bounced`; no suppression row |
| 13 | 06B-13 | Resend `email.complained` | Recipient `failed`, `failure_reason=spam_complaint`; suppression row |
| 14 | 06B-14 | Twilio undelivered `21610` | Recipient `bounced`; suppression `recipient_request` sms |
| 15 | 06B-16 | Delivered recipient; Resend `email.sent` | Event row exists; recipient unchanged |
| 16 | — | Failed recipient; Resend delivered | Event row exists; recipient unchanged |
| 17 | 06X-19 | Attempt handler with anon key (config test) | 500 or RLS failure; no successful writes |
| 18 | §13.1 | One fixture per BR-N1 row | `event_type` column matches mapping table |

## CI command

```bash
npm run validate
```

Expect webhook unit tests under `src/lib/webhook/` and pace-core audit PASS.

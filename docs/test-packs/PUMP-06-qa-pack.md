# PUMP-06 QA Pack

## Slice metadata

- slice_id: PUMP-06
- app: PUMP
- requirement_path: docs/requirements/PU06-webhooks-delivery-pipeline-requirements.md

## Manual frontend scenarios

| scenario_id | requirement_ref | route_or_screen | steps | expected_result | result | notes |
|---|---|---|---|---|---|---|
| S-01 | §12-06A-1 | `POST …/pump-webhook/resend` | POST a fixture with valid Svix signature and a `data.email_id` matching a seeded `pump_message_recipient.gateway_message_id`. | Response 200 `{applied: true}`; one `pump_delivery_event` row inserted with all columns populated per §7 INSERT contract. | - | |
| S-02 | §12-06A-2 | `POST …/pump-webhook/resend` | POST the same fixture with a tampered `svix-signature`. | Response 401, no body, and no `pump_delivery_event` row inserted (compare row count before/after). | - | |
| S-03 | §12-06A-3 | `POST …/pump-webhook/resend` | POST the same valid `email.delivered` fixture twice. | Both responses are 200; first body is `{applied: true}`, second is `{applied: false, reason: 'duplicate'}`; exactly one `pump_delivery_event` row exists for that `svix-id`. | - | |
| S-04 | §12-06A-4 | `POST …/pump-webhook/twilio` | POST a form-encoded callback with valid `X-Twilio-Signature`, `MessageSid` matching a seeded recipient, and `MessageStatus = 'delivered'`. | 200 `{applied: true}`; row with `event_type = 'delivered'`, `gateway = 'twilio'`, `provider_event_id IS NULL`, `dedupe_key = '${MessageSid}:delivered'` (or with `:${RawDlrDoneDate}` suffix when supplied). | - | |
| S-05 | §12-06A-5 | `POST …/pump-webhook/twilio` | POST the same `undelivered` payload with `ErrorCode = 21610` twice. | Second is `{applied: false, reason: 'duplicate'}`; `pump_suppression` was upserted only once (single row for that `(organisation_id, address, channel)`). | - | |
| S-06 | §12-06A-6 | `POST …/pump-webhook/sendgrid` | POST any payload to `pump-webhook/sendgrid`. | 404, no body, no rows in any table. | - | |
| S-07 | §12-06A-7 | `POST …/pump-webhook/resend` | POST invalid JSON to `pump-webhook/resend` with valid signature headers. | 400 (or 401 if signature failure precedes JSON parse); no DB writes occur. | - | |
| S-08 | §12-06A-8 | `POST …/pump-webhook/resend` | POST a Resend `email.delivered` fixture with a synthetic `data.email_id` not present in any `pump_message_recipient.gateway_message_id`. | Response 200 `{applied: false, reason: 'recipient_not_found'}`; unmatched payload appears in Edge logs; no rows inserted into `pump_delivery_event` (or any other table). | - | |
| S-09 | §12-06B-9 | `POST …/pump-webhook/resend` | Seed a recipient with `status = 'queued'` and a known `gateway_message_id`. POST a Resend `email.delivered`. | Recipient row is updated to `status = 'delivered'`, `delivered_at = data.created_at`. | - | |
| S-10 | §12-06B-10 | `POST …/pump-webhook/resend` | Seed a recipient with `status = 'delivered'`, `opened_at IS NULL`. POST a Resend `email.opened`. POST a second `email.opened` with a different `svix-id`. | First open sets `opened_at`, `status` unchanged; second open leaves `opened_at` unchanged and a second `pump_delivery_event` row exists. | - | |
| S-11 | §12-06B-11 | `POST …/pump-webhook/resend` | Seed a recipient with `status = 'queued'`. POST a Resend `email.bounced` with `data.bounce.type === 'Permanent'`. | Recipient is `status = 'bounced'` with `failed_at` and `failure_reason` set; `pump_suppression` row exists with `reason = 'hard_bounce'`, `channel = 'email'`. | - | |
| S-12 | §12-06B-12 | `POST …/pump-webhook/resend` | Repeat scenario 11 with `data.bounce.type` other than `'Permanent'`. | Recipient is `status = 'bounced'` but no `pump_suppression` row is created. | - | |
| S-13 | §12-06B-13 | `POST …/pump-webhook/resend` | POST a Resend `email.complained`. | Recipient is `status = 'failed'`, `failure_reason = 'spam_complaint'`, and `pump_suppression` row with `reason = 'spam_complaint'`. | - | |
| S-14 | §12-06B-14 | `POST …/pump-webhook/twilio` | POST a Twilio `undelivered` callback with `ErrorCode = '21610'`. | Recipient is `status = 'bounced'` and `pump_suppression` row with `reason = 'recipient_request'`, `channel = 'sms'`. | - | |
| S-15 | §12-06B-15 | `POST …/pump-webhook/resend` | Seed a recipient with `status = 'delivered'`. POST a Resend `email.sent` (normalised to `queued`). | `pump_delivery_event` row recorded but recipient row unchanged. | - | |
| S-16 | §12-06B-16 | `POST …/pump-webhook/resend` | Seed a recipient with `status = 'failed'`. POST a Resend `email.delivered`. | `pump_delivery_event` row recorded but recipient row unchanged. | - | |
| S-17 | §12-17 | `pump-webhook` (configuration test) | Invoke the handler with a request that would otherwise succeed but force the handler's downstream client to use the anon key. | INSERTs fail (RLS would deny) and the handler returns 500 — proving service-role is required. | - | |
| S-18 | §12-18 | `POST …/pump-webhook/{gateway}` | For every row in §6 BR-N1, replay a corresponding fixture. | `event_type` column on the inserted `pump_delivery_event` row matches the normalised value in the table. | - | |

## Test run summary

- overall result: Pending
- failed scenarios: -
- defect links: N/A
- retest needed: Yes

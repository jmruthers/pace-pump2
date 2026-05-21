# PUMP-05 QA Pack

## Slice metadata

- slice_id: PUMP-05
- app: PUMP
- requirement_path: docs/requirements/PU05-compose-send-requirements.md

## Manual frontend scenarios

| scenario_id | requirement_ref | route_or_screen | steps | expected_result | result | notes |
|---|---|---|---|---|---|---|
| S-A-01 | §12-05A-1 | dev-db — `pump_get_effective_sender_identity` | Against dev-db (`rkytnffgmwnnmewevqgp`), call the RPC with a known org id and `null` source context. | Return columns match `EffectivePumpSenderIdentity` aliases. | - | |
| S-A-02 | §12-05A-2 | dev-db — `pump_message` | Confirm the six policies named under §10 exist on `pump_message`. | All six RLS policies are present. | - | |
| S-A-03 | §12-05A-3 | dev-db — `pump_message` | Verify `pump_message.recipient_pool_descriptor` column metadata. | Column is nullable. | - | |
| S-A-04 | §12-05A-4 | dev-db — `core_member` | Run `SELECT id FROM core_member m INNER JOIN core_person p ON … WHERE m.organisation_id = :orgId LIMIT 5` for the demo org. | At least one row returned for the demo org. | - | |
| S-A-05 | §12-05A-5 | dev-db | Confirm `core_membership_type` and `core_unit` return rows for the demo org. | Rows exist for the demo org. | - | |
| S-A-06 | §12-05A-6 | `/comms/create` | Sign in as a PUMP org-admin with `create:page.CommsLog`. Visit `/comms/create`. | Heading "Compose", subtitle, breadcrumb, back link, sender-identity banner, recipient-mode card with default `'org_members'`, and composer render. | - | |
| S-A-07 | §12-05A-7 | `/comms/create` | Switch to "Event participants" → pick an event → switch to "Manual". | Event single-select renders; filter chips render after event pick; inline multi-select renders in Manual mode. | - | |
| S-A-08 | §12-05A-8 | `/comms/create`, dev-db | Type a body with channel email and sender_name pre-filled. Click "Save draft" twice with new content between clicks. | Success toast; row exists in `pump_message` with `status='draft'`; second save updates the same row (no second row created). | - | |
| S-A-09 | §12-05A-9 | `/comms/create` | Type body content. Click "Cancel". Click "Keep editing". Click "Discard" on a second attempt. | Discard dialog opens; "Keep editing" keeps operator on `/comms/create`; "Discard" navigates to `/`. | - | |
| S-B-01 | §12-05B-1 | dev-db — Edge functions | Run `list_edge_functions` and confirm deployment of `pump-resolve-pool`, `pump-send`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields`. | All listed functions are deployed. | - | |
| S-B-02 | §12-05B-2 | dev-db — `pump_gateway_config` | Confirm gateway config for the dev environment. | At least one row per channel. | - | |
| S-B-03 | §12-05B-3 | dev-db — `pump_organisation_templates` | Confirm fixture templates for the demo org. | At least one fixture row per channel for the demo org. | - | |
| S-B-04 | §12-05B-4 | `/comms/create` | With a valid draft and non-empty pool, click "Send now". | Success toast carries the recipient count; composer light-resets. | - | |
| S-B-05 | §12-05B-5 | `/comms/create` | Pick a future datetime, click "Confirm schedule". | Success toast and light reset. | - | |
| S-B-06 | §12-05B-6 | `/comms/create` | With a valid draft, click "Send test". | Channel-aware success toast. | - | |
| S-B-07 | §12-05B-7 | `/comms/create` | Seed a strict template. Select it. Type an unknown token. Click "Send now". | Destructive toast. | - | |
| S-B-08 | §12-05B-8 | `/comms/create` | Without a template, type an unknown token. Attempt "Send now". | "Send now" is disabled by the composer's gate; click forces the destructive toast. | - | |
| S-B-09 | §12-05B-9 | `/comms/create` | Test the demo org with `canSendEmail === false`. Click Send / Schedule / Send test. Switch to SMS when `canSendSms === true`. | Destructive Alert renders above the composer; clicks produce destructive toasts from Edge gateway-config-missing errors; switching to SMS removes the Alert when `canSendSms === true`. | - | |
| S-B-10 | §12-05B-10 | `/comms/create` | Build a pool that resolves to `estimated_count === 0`. Click "Send now". | Composer zero-recipient warning copy renders inline; destructive toast titled "Send failed" with Edge `EMPTY_POOL` error message. | - | |
| S-B-11 | §12-05B-11 | `/comms/create` | Pick a past datetime, click "Confirm schedule". | Destructive toast titled "Schedule failed" with the Edge schedule-time error message. | - | |
| S-B-12 | §12-05B-12 | dev-db — `pump_message_recipient` | After a successful send, query `pump_message_recipient` for the resulting `message_id`. | `gateway_message_id` is populated by Edge. | - | |

## Test run summary

- overall result: Pending
- failed scenarios: -
- defect links: N/A
- retest needed: Yes

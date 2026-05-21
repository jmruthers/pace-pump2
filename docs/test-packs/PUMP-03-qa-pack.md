# PUMP-03 QA Pack

## Slice metadata

- slice_id: PUMP-03
- app: PUMP
- requirement_path: docs/requirements/PU03-sender-identity-contract-requirements.md

## Manual frontend scenarios

| scenario_id | requirement_ref | route_or_screen | steps | expected_result | result | notes |
|---|---|---|---|---|---|---|
| S-01 | §12-1 | dev-db — `pump_get_effective_sender_identity` | Run `SELECT pg_get_functiondef('pump_get_effective_sender_identity'::regproc::oid);`. | Signature, volatility, security, and return-column shape match §6 BR-FieldShape and §7 read contract. | - | |
| S-02 | §12-2 | dev-db — `pump_get_effective_sender_identity` | Call `SELECT * FROM pump_get_effective_sender_identity('<org-with-direct-settings>'::uuid);`. | `resolvedFrom = 'organisation'` and `resolvedOrganisationId` matches the input. | - | |
| S-03 | §12-3 | dev-db — `pump_get_effective_sender_identity` | Call `SELECT * FROM pump_get_effective_sender_identity('<child-org-with-no-settings-but-parent-has-them>'::uuid);`. | `resolvedFrom = 'ancestor'` and `resolvedOrganisationId` is the supplying ancestor. | - | |
| S-04 | §12-4 | dev-db — `pump_get_effective_sender_identity` | Call `SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid, 'event', '<event-id>'::uuid);` for an event whose owning organisation has its own settings. | `resolvedFrom = 'source_context'` and `resolvedOrganisationId` is the event's owning organisation. | - | |
| S-05 | §12-5 | dev-db — `pump_get_effective_sender_identity` | Call `SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid, 'organisation', NULL);`. | Call succeeds; `resolvedFrom ≠ 'source_context'`; `sourceContextType = 'organisation'` (literal echo); `sourceContextId = null`. | - | |
| S-06 | §12-6 | dev-db — `pump_get_effective_sender_identity` | For an organisation whose `pump_org_settings` has `default_sender_name` but no `default_from_address`, call the RPC. | `canSendEmail = false` and `canSendSms` reflects the `sms_from_number` value independently. | - | |
| S-07 | §12-7 | dev-db — `pump_get_effective_sender_identity` | Call `SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid);` (no source-context args). | `sourceContextType` and `sourceContextId` are both null. | - | |

## Test run summary

- overall result: Pending
- failed scenarios: -
- defect links: N/A
- retest needed: Yes

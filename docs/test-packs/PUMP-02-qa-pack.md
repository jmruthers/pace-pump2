# PUMP-02 QA Pack

## Slice metadata

- slice_id: PUMP-02
- app: PUMP
- requirement_path: docs/requirements/PU02-comms-log-home-requirements.md

## Manual frontend scenarios

| scenario_id | requirement_ref | route_or_screen | steps | expected_result | result | notes |
|---|---|---|---|---|---|---|
| S-01 | §12-1 | `/` | As an authenticated operator with `read:page.comms-log`, query `SELECT count(*) FROM pump_message WHERE organisation_id = '<their-org>'::uuid AND status = 'sent'` directly via `useSecureSupabase()`. | Count matches the count of `sent` rows in dev-db for that org. | - | |
| S-02 | §12-2 | `/`, dev-db (service role) | As operator A, INSERT a draft row authored by operator B (via service role). As operator A, query `SELECT count(*) FROM pump_message WHERE organisation_id = '<their-org>'::uuid AND status = 'draft'`. | Operator B's draft is NOT included in the count. | - | |
| S-03 | §12-3 | `/` | As an operator in org X, query `pump_message` filtered by `organisation_id = '<other-org>'::uuid`. | Zero rows returned regardless of actual row count in the other org. | - | |
| S-04 | §12-4 | `/`, dev-db | Insert two messages within the same millisecond `created_at`. View the list. | List returns them in stable `id` ASC order under the same `(sent_at NULLS LAST, created_at, id)` DESC sort. | - | |
| S-05 | §12-5 | `/` | Filter the list with `from = 2026-04-01, to = 2026-04-30`. | Result includes rows where `sent_at` falls in April, rows where `scheduled_at` falls in April (no `sent_at`), and rows where `created_at` falls in April (no `sent_at`, no `scheduled_at`). | - | |
| S-06 | §12-6 | `/` | Apply Channel = "Email", Status = "Scheduled,Failed", From = "2026-04-01", To = "2026-05-01", PageIndex = 2. Reload the page. | URL query state seeds the same filters and the second page renders. | - | |
| S-07 | §12-7 | `/` (drill-down) | Open a drill-down on a message with five recipients. | Recipients section shows five rows ordered by address ASC; Delivery events section shows `pump_delivery_event` rows for those recipients ordered by `occurred_at` ASC. | - | |
| S-08 | §12-8 | `/` (drill-down) | Open a drill-down on an email message whose recipients include `opened_at` and `clicked_at`. | Engagement column shows "Opened <time>" and "Clicked <time>"; Status badge does NOT show `Opened` or `Clicked`. | - | |
| S-09 | §12-9 | `/?message=abc` | Set `?message=abc` in the URL. | Dialog opens and renders "Message not found or not visible."; no console error appears. | - | |
| S-10 | §12-10 | `/` | With the list mounted, click Refresh. | List query refetches (network tab shows a new request) without changing the URL state. | - | |
| S-11 | §12-11 | `/` | As the author of a scheduled message, click Cancel and confirm. Inspect dev-db. | Row `status` is `cancelled`; success toast appeared. | - | |
| S-12 | §12-12 | `/` | As an admin (not the author), click Cancel on a scheduled message authored by another operator in the same org. | Edge succeeds and the row's status becomes `cancelled`. | - | |
| S-13 | §12-13 | `/`, dev-db (service role) | Manually flip the row's `status` from `scheduled` to `sending` (via service role) between opening the confirm dialog and clicking "Cancel message". | Edge returns `PUMP_CANCEL_INVALID_STATUS`, destructive toast surfaces, list refetches showing `sending` status. | - | |
| S-14 | §12-14 | `/` | As the author of a draft, click Delete and confirm. Inspect dev-db. | Row is gone; success toast appeared. | - | |
| S-15 | §12-15 | `/`, dev-db (service role) | Manually delete the draft in dev-db (via service role) between opening the confirm dialog and clicking "Delete draft". | SPA DELETE returns 0 rows; neutral toast "Draft already removed." appears; list refetches. | - | |
| S-16 | §12-16 | `/` | As an admin (`update:page.comms-log` + `delete:page.comms-log`), inspect row actions for rows authored by another operator. | Delete action does not appear on any row authored by another operator. | - | |

## Test run summary

- overall result: Pending
- failed scenarios: -
- defect links: N/A
- retest needed: Yes

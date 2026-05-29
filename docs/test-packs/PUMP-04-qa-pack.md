# PUMP-04 QA Pack

## Slice metadata

- slice_id: PUMP-04
- app: PUMP
- requirement_path: docs/requirements/PU04-template-library-requirements.md

## Manual frontend scenarios

| scenario_id | requirement_ref | route_or_screen | steps | expected_result | result | notes |
|---|---|---|---|---|---|---|
| S-01 | §12-1 | `/comms/templates`, dev-db | As an authenticated operator without any PUMP grants, query `SELECT COUNT(*) FROM pump_organisation_templates WHERE organisation_id = '<their-org>'::uuid;` directly via the secure Supabase client. | Zero rows returned regardless of actual row count. | - | |
| S-02 | §12-2 | `/comms/templates`, dev-db | Save an email template with `body_html = '<p>Hello <strong>{{first_name}}</strong>!</p>'`. Inspect the persisted row in dev-db. | `body_text = 'Hello {{first_name}}!'` (or with single space between collapsed runs of whitespace). | - | |
| S-03 | §12-3 | `/comms/templates`, dev-db | Save a template with body `<p>Hi {{first_name}} — {{first_name}} is great. {{org_name}} welcomes you.</p>`. Inspect the persisted row. | `merge_fields_used = ['{{first_name}}', '{{org_name}}']` with two entries, not three. | - | |
| S-04 | §12-4 | `/comms/templates` | As an operator with `read:page.comms-templates` only, open the Preview dialog. Attempt to open the editor in Edit mode. | Edit action is hidden in the row's Actions cell. | - | |
| S-05 | §12-5 | `/comms/templates`, dev-db | Retire a template; confirm directly in dev-db. | Row is still present with `is_active = false`; no DELETE statement is logged in the Postgres query log for this slice. | - | |
| S-06 | §12-6 | `/comms/templates`, dev-db | With "Show retired" on, click Activate on a retired row. | Row's `is_active = true` in dev-db; "Inactive" badge disappears immediately. | - | |
| S-07 | §12-7 | `/comms/templates` | Create two templates: A with name "Welcome", description "First contact". B with name "Reminder", description "Reminder welcome wagon". Type "welcome" in search. | Both rows match (A by name, B by description). | - | |
| S-08 | §12-8 | `/comms/templates` | Attempt to save with body `Hello {{first_name`. | Save is blocked with the inline copy and destructive toast; no INSERT statement reaches the database. | - | |
| S-09 | §12-9 | `/comms/templates` (Preview) | Open Preview for any template containing a merge token. | `MessagePreview`'s "Unresolved merge tokens" Alert lists every token in the template. | - | |

## Test run summary

- overall result: Pending
- failed scenarios: -
- defect links: N/A
- retest needed: Yes

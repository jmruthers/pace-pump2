# PUMP-02 QA pack — Communications log home

Authority: [`PU02-comms-log-home-requirements.md`](../requirements/PU02-comms-log-home-requirements.md) §12.

Target dev-db: `yihzsfcceciimdoiibif` (per [`pump-backend-ready-report.md`](../delivery/pump-backend-ready-report.md)).

AC tracking: [`PUMP-02-ac-status.md`](../delivery/PUMP-02-ac-status.md).

## Automated coverage (2026-05-20)

| Area | Status | Evidence |
| --- | --- | --- |
| URL param parse/serialize | Pass | `commsLogSearchParams.test.ts`, `useCommsLogSearchParams.test.tsx` |
| List query filters/sort | Pass | `pumpMessageQuery.test.ts` |
| Cancel error mapping + list refresh callback | Pass | `useCancelPumpMessage.test.tsx` |
| Delete race/failure + list refresh callback | Pass | `useDeletePumpDraft.test.tsx` |
| Page empty/error/compose/drill-down malformed | Pass | `CommsLogPage.test.tsx` |
| Toolbar refresh remounts table | Pass | `CommsLogHome.test.tsx` |
| Full validate pipeline | Pass | `npm run validate` after remediation |

## §12 Manual verification checklist

Run signed-in against dev-db with `read:page.CommsLog` (and optional create/update/delete grants for row actions).

### A. Read path

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | Non-draft rows visible; default sort newest-first | | |
| 2 | Other operators' drafts not listed | | RLS split |
| 3 | Foreign `organisation_id` filter returns zero rows | | |
| 4 | Same-ms `created_at` ties broken by `id` | | |
| 5 | Date filter hits `sent_at`, `scheduled_at`, or `created_at` | | |
| 6 | URL round-trip (channel, status, dates, pageIndex) | | |
| 7 | Drill-down: recipients by address ASC; events by `occurred_at` ASC | | |
| 8 | Email engagement columns; no opened/clicked recipient-status badges | | |
| 9 | `?message=abc` → inline error; no console error | | |
| 10 | Refresh refetches list (network tab) without URL change | | |

### B. Row actions

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 11 | Author cancel scheduled → `cancelled` in DB + success toast | | `pump-cancel` |
| 12 | Admin cancel others' scheduled in same org | | |
| 13 | Cancel race `scheduled` → `sending` → `PUMP_CANCEL_INVALID_STATUS` | | service role |
| 14 | Author delete draft → row gone in DB | | |
| 15 | Delete already-removed draft → neutral toast | | |
| 16 | Admin does not see Delete on others' drafts | | |

## Sign-off

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| Builder | | | Automated + code review |
| QA | | | §12 manual rows above |

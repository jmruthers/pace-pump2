# PUMP-02 — Acceptance criteria status

Authority: [`PU02-comms-log-home-requirements.md`](../requirements/PU02-comms-log-home-requirements.md) §11.

Implementation: branch `cursor/8d67b09c`, commit `b9051cd` + remediation on same branch.

Legend: `[x]` complete · `[~]` partial (automated or code-only) · `[ ]` open

## A. Read path

| AC | Status | Notes |
| --- | --- | --- |
| 1 | [x] | Six-column server-side `DataTable`; sort `(sent_at NULLS LAST, created_at, id)` |
| 2 | [x] | Empty-state copy + optional Compose CTA |
| 3 | [x] | Compose navigates to `/comms/create` when `canCompose` |
| 4 | [x] | `PagePermissionGuard` on `/` in `App.tsx` (PUMP-01) |
| 5 | [x] | Channel filter → URL + query; `pageIndex` reset |
| 6 | [x] | Date range `coalesce` PostgREST `.or()` filters |
| 7 | [x] | Pagination URL + offset; page sizes 25 \| 50 |
| 8 | [x] | Date column sort toggles `sortDir` in URL |
| 9 | [~] | `?message=` open/close via URL; Escape/overlay assumed (pace-core `Dialog`) |
| 10 | [x] | Deep link `?message=<uuid>` opens drill-down |
| 11 | [x] | Malformed / missing id → inline error; no toast |
| 12 | [x] | List error panel + Retry + destructive toast |
| 13 | [x] | No SPA draft visibility predicates (RLS only) |
| 14 | [x] | Draft badge, date, recipients `—` + aria-label |
| 15 | [~] | Drill-down recipients/events implemented; live data in §12 QA pack |
| 16 | [x] | Refresh bumps `listRefreshKey` + invalidates drill-down queries |

## B. Row actions

| AC | Status | Notes |
| --- | --- | --- |
| 17 | [x] | Cancel row action + confirmation dialog |
| 18 | [x] | Admin cancel on others' scheduled rows |
| 19 | [x] | Cancel success → toast + `onListRefresh` remounts table |
| 20 | [x] | `PUMP_CANCEL_INVALID_STATUS` → toast + list refresh |
| 21 | [x] | Network cancel failure toast |
| 22 | [x] | Delete own draft + confirmation |
| 23 | [x] | No delete on others' drafts |
| 24 | [x] | Delete success → toast + list refresh |
| 25 | [x] | Zero-row delete → neutral toast + refresh |
| 26 | [x] | Delete failure → destructive toast; no list refresh |

## §15 Done criteria (supplement)

| Item | Status |
| --- | --- |
| 26 AC on dev-db | [~] | Automated + `npm run validate` green; §12 live rows in [`PUMP-02-qa-pack.md`](../test-packs/PUMP-02-qa-pack.md) await operator sign-off |
| Six columns + mobile subject | [x] | `hidden sm:block` on body preview line |
| Drill-down URL + close paths | [~] | URL via `setSearchParams`; overlay/Escape in QA pack |
| Confirm dialog default focus | [x] | `autoFocus` on dismiss buttons |
| Badge variants | [x] | `commsLogBadges.tsx` |

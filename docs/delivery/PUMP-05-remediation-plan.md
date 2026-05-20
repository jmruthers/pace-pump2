# PUMP-05 remediation plan

Authority: [PU05-compose-send-requirements.md](../requirements/PU05-compose-send-requirements.md)

Baseline delivery: commit `05ac85a` on `cursor/e1a4c702`. Tracking: [PUMP-05-acceptance-status.md](PUMP-05-acceptance-status.md).

## Completed (remediation pass)

- **P0:** pace-core2 `npm run build`; Save draft in linked `@solvera/pace-core` `dist/`.
- **P1:** `filters: {}` on empty org/event pools; `SenderIdentityBanner` uses RPC `canSendEmail` / `canSendSms` for channel-unavailable (fixes AC-A-03 when RPC flags disagree with derived address presence).
- **P2:** Tests added — `ComposePageChrome.test.tsx`, `SenderIdentityBanner.test.tsx`, extended `ComposePage.test.tsx` and `usePumpCommSendAdapter.test.tsx`, `include_inactive` descriptor test.
- **P3 (MCP):** Edge slugs, gateway config, RPC, templates, nullable column verified on `yihzsfcceciimdoiibif` (2026-05-20).

## Remaining (operator §12)

| Item | Owner |
| --- | --- |
| In-app flows (save draft UI, send, schedule, send-test, strict/block gates) | QA on dev with org-admin session |
| `gateway_message_id` handoff after live send | QA query `pump_message_recipient` |
| AC-A-06 manual typeahead UX | In-app only |
| AC-B-09 / AC-B-10 composer gates | In-app only (pace-core `CommComposer`) |

## Closed when

- [x] Linked pace-core dist includes Save draft.
- [x] `npm run validate` PASS (90 tests).
- [x] Acceptance-status checkboxes updated (24/29 automated).
- [ ] Manual §12 in-app sign-off recorded in acceptance-status.

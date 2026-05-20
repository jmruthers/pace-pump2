# PUMP-03 remediation plan

**Status:** SPA contract closed (2026-05-20 remediation).  
**Trace:** [`PUMP-03-acceptance-trace.md`](PUMP-03-acceptance-trace.md)

## Completed in this remediation

1. Strengthened integration `(2a)` for AC-2 — asserts `senderName`, `fromAddress`, `senderPhone`, readiness flags against `pump_org_settings` row.
2. Added integration `(2d)` — `platform_default` tier with RPC probe during fixture discovery.
3. Added integration `(9)` — AC-9 org probed where RPC returns `senderName = null`.
4. Added `expectSingleSenderIdentityRow` — §4 exactly-one-row contract.
5. Created acceptance trace, contract-test-user doc, updated PU03 checkboxes and build queue.

## Open (non-blocking for PUMP-03 SPA done)

| Gap | Owner | Action |
| --- | --- | --- |
| AC-7 / §13-4 without env | Local QA | Set `PUMP_CONTRACT_TEST_EMAIL` / `PASSWORD` per [`PUMP-03-contract-test-user.md`](PUMP-03-contract-test-user.md) and re-run `npm test` |
| AC-1 live `pg_get_functiondef` | Optional | Manual §12 SQL on dev-db; or add Management API introspection later |
| AC-10 persisted sender | PUMP-07 | Edge integration tests in pace-core2 |
| AC-11 send-time channel gate | PUMP-07 | `pump-send` validation tests |
| Compose read-only banner | PUMP-05 | `/comms/create` consumes `useEffectivePumpSenderIdentity` |

## Sibling handoffs

- **PUMP-05:** Import hook; render read-only sender banner; `PagePermissionGuard` for AC-7 caller-side gating on `/comms/create`.
- **PUMP-07:** Assert `pump_message` sender columns match RPC row; `INSUFFICIENT_SENDER_IDENTITY` when `canSendEmail = false`.

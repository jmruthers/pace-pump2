# PUMP-03 acceptance trace

**Slice:** Platform-managed sender identity contract  
**Authority:** [`PU03-sender-identity-contract-requirements.md`](../requirements/PU03-sender-identity-contract-requirements.md)  
**Verification date:** 2026-05-20 (remediation)  
**Backend target:** `yihzsfcceciimdoiibif` per [`pump-backend-ready-report.md`](pump-backend-ready-report.md)  
**SPA artifacts:** `src/hooks/useEffectivePumpSenderIdentity.ts`, `src/lib/comms/senderIdentityContract*`

## Automated test summary

| Command | CI (placeholder env) | This worktree (2026-05-20) |
| --- | --- | --- |
| `npm test` | 24 unit pass; 9 integration **skipped** | Same — `.env` has no active `VITE_SUPABASE_URL` |
| `npm run validate` | PASS (6/6) | PASS (6/6) — audit `202605202202` |

With live `.env` + `SUPABASE_SERVICE_ROLE_KEY`, integration runs 9 cases: `(1)`, `(2a–2d)`, `(3)`, `(4)` if credentials set, `(5)`, `(9)`.

Integration suite: [`senderIdentityContract.integration.test.ts`](../../src/lib/comms/senderIdentityContract.integration.test.ts). Fixture discovery requires `SUPABASE_SERVICE_ROLE_KEY`.

## Acceptance criteria (§11)

| AC | Status | Test / evidence |
| --- | --- | --- |
| AC-1 | Partial | Unit: `EXPECTED_SENDER_IDENTITY_FUNCTION_DEF_MARKERS`; integration `(1)` smoke. Backend-ready RPC introspection. No in-repo `pg_get_functiondef` automation. |
| AC-2 | Complete (conditional) | Integration `(2a)` — field values + `canSendEmail` / `canSendSms` when SMS seeded |
| AC-3 | Complete (conditional) | Integration `(2b)` — ancestor tier + field echo from supplier row |
| AC-4 | Complete (conditional) | Integration `(5)` |
| AC-5 | Complete (conditional) | Integration `(2c)` |
| AC-6 | Complete (conditional) | Integration `(3)` |
| AC-7 | Env-gated | Integration `(4)` when `PUMP_CONTRACT_TEST_EMAIL` / `PASSWORD` set — see [`PUMP-03-contract-test-user.md`](PUMP-03-contract-test-user.md) |
| AC-8 | Complete (conditional) | Integration `(3)` + `(2a)` |
| AC-9 | Complete (conditional) | Integration `(9)` — org probed where RPC returns `senderName = null` |
| AC-10 | Deferred (sibling) | PUMP-07 / pace-core2 `pump-send` |
| AC-11 | Deferred (sibling) | PUMP-07 |

## Testing requirements (§13)

| Item | Status | Test |
| --- | --- | --- |
| §13-1 | Partial | Same as AC-1 |
| §13-2 | Complete (conditional) | `(2a)` organisation, `(2b)` ancestor, `(2c)` source_context, `(2d)` platform_default |
| §13-3 | Complete (conditional) | `(3)` |
| §13-4 | Env-gated | `(4)` — same as AC-7 |
| §13-5 | Complete | Unit derivation matrix + `(5)` |

## §4 functional spec (SPA-owned)

| Items | Status |
| --- | --- |
| 1–5 | Complete — hook + `expectSingleSenderIdentityRow` |
| 6–13 | Complete — `assertEffectivePumpSenderIdentityShape` |
| 14–17 | Complete (conditional) — integration tiers `(2a–2d)`, `(9)` |
| 18–20 | Sibling — Edge |
| 21–22 | Complete — no settings route; compose UI deferred to PUMP-05 |

## §16 guardrails

| Rule | Status |
| --- | --- |
| No `/comms/settings` | Pass — [`navItems.ts`](../../src/config/navItems.ts) |
| No SPA `pump_org_settings` reads | Pass in runtime `src/`; integration `discoverFixtures` only (test harness) |
| Single RPC resolver | Pass — `useEffectivePumpSenderIdentity` |
| No TS fallback chain | Pass — `deriveChannelReadiness` is assertion-only |

## §12 manual verification (dev-db)

Run against active `VITE_SUPABASE_URL` project:

```sql
SELECT pg_get_functiondef('pump_get_effective_sender_identity'::regproc::oid);

SELECT * FROM pump_get_effective_sender_identity('<org-with-direct-settings>'::uuid);

SELECT * FROM pump_get_effective_sender_identity('<child-org>'::uuid);

SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid, 'event', '<event-id>'::uuid);

SELECT * FROM pump_get_effective_sender_identity('<org-id>'::uuid, 'organisation', NULL);
```

## Remaining gaps

See [`PUMP-03-remediation-plan.md`](PUMP-03-remediation-plan.md) — AC-7 credentials for local/CI optional run; AC-10/11 owned by PUMP-07.

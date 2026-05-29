# PUMP-05 acceptance status

Authority: [PU05-compose-send-requirements.md](../requirements/PU05-compose-send-requirements.md)

Delivery: commit `05ac85a` on branch `cursor/e1a4c702` (remediation on same branch)

## §11 Acceptance criteria — PUMP-05A

- [x] **AC-A-01** — Page entry: heading, breadcrumb, back link, recipients card, composer
- [x] **AC-A-02** — Sender-identity banner copy and RPC re-run on event context
- [x] **AC-A-03** — Channel-unavailable destructive Alert (uses RPC `canSendEmail` / `canSendSms`)
- [x] **AC-A-04** — Default org_members descriptor with `filters: {}` and undefined source context
- [x] **AC-A-05** — Event-participants mode remounts adapter with event source context
- [ ] **AC-A-06** — Manual mode typeahead append (app-local `ManualMemberPicker`; §17 typeahead waived; in-app §12 pending)
- [x] **AC-A-07** — Membership-type filter casts ids to strings in descriptor
- [x] **AC-A-08** — Include-inactive switch adds `include_inactive: true` to descriptor
- [x] **AC-A-09** — Save draft happy path (adapter upsert + pace-core Save draft button in dist)
- [x] **AC-A-10** — Save draft idempotency (same `pump_message.id` on second save)
- [x] **AC-A-11** — Save draft failure returns error from adapter override
- [x] **AC-A-12** — Cancel with clean draft navigates to `/` immediately
- [x] **AC-A-13** — Cancel with dirty draft opens discard dialog; Discard / Keep editing
- [x] **AC-A-14** — Read permission denied shows AccessDenied
- [x] **AC-A-15** — Read-only send (`canSend` false) shows composer read-only footer

## §11 Acceptance criteria — PUMP-05B

- [x] **AC-B-01** — Send now success toast and light reset; stay on `/comms/create`
- [x] **AC-B-02** — Send success toast appends suppression and warnings
- [x] **AC-B-03** — Schedule success toast and light reset
- [x] **AC-B-04** — Schedule failure destructive toast title mapping
- [x] **AC-B-05** — Send test success toast (email)
- [x] **AC-B-06** — Send test success toast (SMS)
- [ ] **AC-B-07** — Send test failure when gateway config missing (in-app §12 pending)
- [x] **AC-B-08** — Send failure toast leaves draft intact
- [ ] **AC-B-09** — Strict template blocks send without adapter call (composer-internal; §12 pending)
- [ ] **AC-B-10** — Block-on-unresolved blocks send without adapter call (composer-internal; §12 pending)
- [x] **AC-B-11** — Empty pool error surfaces as Send failed toast (handler wired)
- [x] **AC-B-12** — Send adapter mount invariants for org_members mode
- [x] **AC-B-13** — Send adapter mount invariants for event_participants mode
- [x] **AC-B-14** — Send adapter mount invariants for manual mode

**Automated summary:** 24/29 complete; 5 require in-app §12 sign-off (A-06, B-07, B-09, B-10, plus gateway handoff).

## §15 Done criteria

- [x] Each AC mapped in [PUMP-05-qa-pack.md](../test-packs/PUMP-05-qa-pack.md) with automated or manual trace
- [x] Edge functions ACTIVE on dev (`yihzsfcceciimdoiibif`) — MCP 2026-05-20
- [x] `pump_gateway_config` — email + sms rows present (MCP)
- [x] `pump_organisation_templates` — non-zero rows (MCP)
- [x] pace-core2 CommComposer Save Draft in linked `dist/`
- [x] Manual member search — app-local `ManualMemberPicker` (accepted deviation)
- [x] `pump_get_effective_sender_identity` RPC present; `recipient_pool_descriptor` nullable (MCP)
- [ ] Org-admin comms-log grants — assumed per backend-ready report; confirm in §12 login
- [ ] `gateway_message_id` populated after send (§12 in-app)
- [ ] Send payload invariants inspected on live Edge invoke (§12 in-app)

## §12 Manual verification

Target dev-db: `yihzsfcceciimdoiibif`

### MCP / backend (2026-05-20)

| Check | Result |
| --- | --- |
| `pump-resolve-pool`, `pump-send`, `pump-schedule`, `pump-send-test`, `pump-load-templates`, `pump-load-merge-fields` ACTIVE | Pass |
| `pump_gateway_config` per channel | Pass (email: 1, sms: 1) |
| `pump_get_effective_sender_identity` RPC | Pass |
| `pump_message.recipient_pool_descriptor` nullable | Pass |

### In-app (operator sign-off pending)

| Step | Result | Notes |
| --- | --- | --- |
| Page entry and identity banner | Pending | Requires org-admin session |
| Recipient-mode swap | Pending | |
| Save draft (twice, same row) | Pending | |
| Cancel dirty dialog | Pending | |
| Happy-path send | Pending | |
| Schedule | Pending | |
| Send test | Pending | |
| Strict / block-on-unresolved gates | Pending | |
| Channel unavailable / empty pool | Pending | |
| gateway_message_id handoff | Pending | |

Remediation tracking: [PUMP-05-remediation-plan.md](PUMP-05-remediation-plan.md)

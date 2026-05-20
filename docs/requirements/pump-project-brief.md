# [pace-pump] Project brief

**Module:** PUMP — Personalised Updates, Messaging & Publications  
**App key:** `PUMP`  
**Document status:** Draft — implementation authority: this file, [pump-architecture.md](./pump-architecture.md), and the slice requirement files in this folder (`PU01-*` through `PU07-*-requirements.md`).
**Intended design (comms platform):** **`CR23-comms-platform.md`** in pace-core2 (`~/Documents/GitHub/pace-core2/packages/core/docs/requirements/CR23-comms-platform.md`). Not vendored in this repo.

---

## Document map (read this first)

| Dimension | Where it lives |
|-----------|----------------|
| **Legacy baseline** (what exists today) | § **Current legacy baseline** below + architecture **Bounded contexts** (legacy column) |
| **Intended rebuild target** | § **Intended rebuild target** below + architecture **Bounded contexts** (CR23 column) + **CR23** |
| **Known exclusions** | § **Known exclusions** below + architecture **Do-not rules** |
| **Known redesign areas** | § **Known redesign areas** below |
| **Orchestration** (slices, routes, order, risk) | [pump-architecture.md](./pump-architecture.md) only (canonical) |

---

## Purpose

Deliver a **documentation-first** rebuild of pace-pump so AI-assisted implementation can proceed slice-by-slice with clear boundaries, contracts, and quality gates.

PUMP is PACE’s **outbound communications service**: **sender-initiated** email and SMS with **tracking, templating, and scheduling** — **not** a general notification system. Other apps send **through PUMP** via **pace-core2** (`CommComposer`, pool descriptors, `CommSendAdapter`) and **PUMP Edge Functions** (**CR23**).

---

## Current legacy baseline (observational — not authoritative)

The **existing pace-pump repo** (pre-rebuild) roughly includes:

- **Stack:** Vite, React, React Router, TanStack Query, legacy **`@jmruthers/pace-core`** / **`solvera/pace-core`** patterns.
- **Routes (illustrative):** `/login`, `/`, `/comms/create`, `/comms/templates`, catch-all **404** (legacy may have had **`/comms`** and `/comms/settings` — not carried forward).
- **Data (illustrative):** older **`pump_*`** shapes (e.g. comms log with JSON recipients, template slug patterns) **not** aligned with **CR23** **`pump_message`** / **`pump_message_recipient`** model.
- **Send path:** client-side loops invoking legacy Edge names; **no** **`RecipientPoolDescriptor`** / **`CommSendAdapter`** contract.
- **Completeness:** app was **unfinished**; many flows likely incomplete or broken.

**Use legacy only** to infer rough feature intent and gaps. **Do not** treat it as the rebuild spec.

---

## Intended rebuild target (authoritative)

- **CR23** schema and behaviours (see also **`DB-change-decisions-p4.md`** in pace-core2, **DB-404`–`DB-411**): core PUMP tables include **`pump_message`**, **`pump_message_recipient`**, **`pump_organisation_templates`**, **`pump_system_templates`**, **`pump_delivery_event`**, **platform** **`pump_gateway_config`** (PK **`channel`**), **`pump_org_settings`** (per-org sender identity defaults only), **`pump_suppression`**. **Merge fields** come from **`core_field_list`** where **`pump_merge_availability = true`** — **no** **`pump_merge_field`** table. Edge **`pump-send`**, **`pump-resolve-pool`**, **`pump-schedule`**, **`pump-cancel`**, **`pump-webhook/{gateway}`**, **`pump-send-test`**. **`pump_suppression`** supports **send-time suppression** — **not** a v1 **user/operator unsubscribe management** product (see **Known exclusions** and architecture § Send-time suppression vs user/operator unsubscribe).
- **pace-core2** shell + current scoped entrypoints (`@solvera/pace-core/components`, `@solvera/pace-core/providers`, `@solvera/pace-core/hooks`, `@solvera/pace-core/rbac`) for app wiring now; future shared comms entrypoint **`@solvera/pace-core/comms`** once **CR23** lands. **PACE page RBAC** (**`CommsLog`**, **`CommsTemplates`** — see [pump-architecture.md](./pump-architecture.md) § RBAC model) drives **`CommRbacContext`**; Edge enforces **`source_context_id`**.
- **PUMP management app (this repo):** templates, comms log / delivery visibility, and the same shared compose UX as other suite apps once **CR23** lands. **Provider API keys** and **org comms defaults / sender identity** are **platform-managed** outside PUMP in v1.
- **Providers (v1 deployment):** **Resend** (email) and **Twilio** (SMS) — **application and Edge code remain gateway-agnostic** (Edge reads **platform** **`pump_gateway_config`**; avoid hard-coding provider-specific logic in the SPA).
- **pace-core2 consumption:** **now** — local workspace **`~/Documents/GitHub/pace-core2`** (monorepo / file / npm link per team setup) for existing scoped entrypoints; **later** — switch to **published** `@solvera/pace-core` (or equivalent). The shared comms entrypoint is a **CR23 dependency** and must land before PUMP implements compose/send rather than introducing an app-local substitute.
- **Phasing:** **Slice requirements (design)** may proceed using **CR23** + **`DB-change-decisions-p4`** as the intended contract. **Application / Edge code (build)** depends on the **p4 target** landing on **dev-db** (**Supabase MCP, dev-db only**) — see [pump-architecture.md](./pump-architecture.md) § Prerequisites & phasing.

---

## Known exclusions (explicit)

These are **out of scope** for the rebuild **unless** product explicitly expands scope later:

| Exclusion | Rationale |
|-----------|-----------|
| **Inbound** mail/SMS reply handling | CR23 / suite scope — outbound only |
| **Gateway SDKs or direct provider HTTP** from SPA or non-PUMP satellite apps | CR23 — only Edge + adapter |
| **pace-core2 persisting sends or resolving merge data in-browser** | CR23 — Edge + adapter boundary |
| **New base table `pump_comms_log`** | CR23 — reporting may use **view/alias** over message/recipient data |
| **Implementing the pace-core2 comms package itself** | Owned in pace-core2 per CR23; pace-pump **consumes** it |
| **Production DB** for spec validation | **dev-db only** |
| **User / operator unsubscribe management** | **No** subscriber-facing opt-out journeys, **no** operator consoles to manage marketing opt-out lists in PUMP v1. **`pump_suppression`** is for **send-time skips** and provider-driven suppression only (CR23 + architecture § Send-time suppression vs user/operator unsubscribe) |
| **Marketing-style compliance** (bulk consent, promo footers, etc.) | Out of scope unless product explicitly expands |

**Deferred / post-MVP** items follow **CR23** and product owner (e.g. reporting explore registration, future channels); not listed exhaustively here.

---

## Known redesign areas (intentional change from legacy)

| Area | Redesign |
|------|----------|
| **IA & routes** | Canonical map in architecture; **home (`/`)** = comms log + compose CTA (see architecture § Information architecture — home); **`/comms` list route removed** (app was not launched; log only on **`/`**) |
| **Data model** | **CR23** tables and enums; abandon legacy `pump_comms_*` row shapes unless dev-db still exposes compatibility views only |
| **Compose & send** | **`CommComposer`** + **`CommSendAdapter`** + pool preview via **`pump-resolve-pool`** — no ad-hoc recipient JSON in browser |
| **Templates** | **`pump_organisation_templates`** with **`require_merge_field_validation`**, **`body_html` / `body_text`**, etc., plus separate **`pump_system_templates`** for platform-owned system copy |
| **Settings** | **Platform** **`pump_gateway_config`** (credentials) + **per-org** **`pump_org_settings`** (sender identity defaults only); both are **platform-managed** in v1 and **not** exposed as PUMP screens |
| **RBAC** | **Page** permissions (**`CommsLog`**, **`CommsTemplates`**) + **`CommRbacContext`** derived in app from those page grants; Edge is security backstop |
| **Visual / UX** | Refresh within **pace-core2** components and CR23 composer layout guidance |

---

## Goals

1. **Target pace-core2** — `~/Documents/GitHub/pace-core2`. Legacy npm **`@jmruthers/pace-core`** / **`solvera/pace-core`** are **not** the rebuild foundation. Existing work uses current scoped entrypoints; compose/send implementation is gated on **CR23** delivering **`@solvera/pace-core/comms`**.
2. **Implement against CR23** — PUMP owns gateways, send pipeline, and webhooks; shared UI from pace-core2. **Transactional-only** — **send-time suppression** yes; **user/operator unsub management** product surface no (see exclusions).
3. **Clear domain boundaries** — See architecture **Bounded contexts** and **Implementation plan**.
4. **Ambiguity reduction** — Do not start a slice while **blocking** ambiguities remain (chat or slice **Open questions**).
5. **Safe multi-tenant access** — RLS; validate on **dev-db only** (MCP).
6. **Observable quality** — Lint, typecheck, tests per **architecture § Testing expectations (for slice authors)**.

---

## Non-goals

- Legacy codebase as specification.
- Default preservation of legacy behaviour, UX, or routes.
- Pixel-perfect parity with legacy UI.
- Owning CR23 implementation **inside** pace-core2 (consume only).

---

## Assumptions

1. **pace-core2** — **Local** repo **`~/Documents/GitHub/pace-core2`** during initial build; **migration to published package** planned later (imports / bundling updated when that happens).
2. **Supabase** + RLS; structural intent in **CR23** and **`docs/database/decisions/DB-change-decisions-p4.md`** (**DB-404`–`DB-411**). **Slice design** can proceed from those documents; **merging application code** assumes **dev-db** has the corresponding migrations applied.
3. **Deployables:** this SPA + PUMP Edge Functions co-evolve.
4. **Gateways:** **Resend** + **Twilio** for first production paths; **code stays configuration-driven** so additional providers can be added without rewriting the SPA.

---

## Constraints

- **CR23** is the comms **design authority**; external narrative docs do not override it.
- **Orchestration** (slice order, routes, dependencies) is **canonical in** [pump-architecture.md](./pump-architecture.md) **and echoed in** the `PU*-requirements.md` slice files in this folder.

---

## Dependency assumptions

| Dependency | Expectation |
|------------|-------------|
| pace-core2 | Auth, layout, **page RBAC**, current scoped entrypoints, future **`@solvera/pace-core/comms`** once **CR23** lands |
| CR23 | Types, adapter contract, Edge names, schema, **RBAC** (**page** model — **CR23 § RBAC** + Standard 03) |
| **`DB-change-decisions-p4.md`** (pace-core2) | **DB-404`–`DB-411** — DDL and RLS traceability; design-time dependency for slice authors |
| Edge Functions | `pump-send`, `pump-resolve-pool`, `pump-schedule`, `pump-cancel`, `pump-send-test`, `pump-webhook/{gateway}` |

---

## Quality gates

| Gate | Expectation |
|------|-------------|
| Lint / typecheck | Project ESLint + `tsc` (or repo standard). |
| Tests | Per **architecture § Testing expectations** — each slice inherits minimum bar. |
| Security | No tenant bypass; secrets not in client; service role only in Edge/webhooks. |
| RBAC | UI **page** grants (**Standard 03**, [pump-architecture.md](./pump-architecture.md) § RBAC model, **CR23 § RBAC**); Edge **`isPermitted`** + scope (CR23). |

---

## Relationship to legacy code

**Informative only.** Do not preserve pre-CR23 bugs or assumptions.

---

## References

- [pump-architecture.md](./pump-architecture.md) — orchestration, bounded contexts, home IA, testing expectations, slice sizing.
- [pump-feature-list.md](./pump-feature-list.md) — derived feature inventory (traceability).
- [pump-user-stories.md](./pump-user-stories.md) — derived user stories (traceability).
- Slice requirements — `PU01-*` through `PU07-*-requirements.md` in this folder.
- **CR23** — `packages/core/docs/requirements/CR23-comms-platform.md`.
- **DB decisions** — `docs/database/decisions/DB-change-decisions-p4.md` (**DB-404`–`DB-411**).

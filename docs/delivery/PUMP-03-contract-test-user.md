# PUMP-03 contract test user (AC-7 / §13-4)

Integration test `(4)` in [`senderIdentityContract.integration.test.ts`](../../src/lib/comms/senderIdentityContract.integration.test.ts) verifies that an **authenticated** user **without** PUMP `comms-log` page grants can still call `pump_get_effective_sender_identity` successfully (BR-CallerAuthorisation).

## Required environment variables

Add to `.env` (never commit real passwords):

```bash
PUMP_CONTRACT_TEST_EMAIL=<user@example.com>
PUMP_CONTRACT_TEST_PASSWORD=<password>
```

Also required for fixture discovery:

```bash
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
VITE_SUPABASE_URL=<dev-project-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-or-publishable-key>
```

## Provisioning on dev-db

1. Create or pick a Supabase Auth user that is a member of an organisation with pump fixtures but **does not** hold any of:
   - `read:page.comms-log`
   - `create:page.comms-log`
   - `update:page.comms-log`
   - `delete:page.comms-log`
2. Confirm in `rbac_user_permissions` / org role grants that the user has no PUMP `comms-log` grants for the test org.
3. Set the email and password in `.env` and run:

```bash
npm test -- src/lib/comms/senderIdentityContract.integration.test.ts
```

## CI behaviour

GitHub Actions uses placeholder Supabase URLs — the entire integration `describe` is **skipped**. AC-7 is **env-gated**, not a CI failure.

When credentials are missing locally, test `(4)` logs a warning and returns early (deferred), not a false pass on assertions.

## Caller-side gating (out of scope here)

Denial without `create:page.comms-log` on `/comms/create` is verified in **PUMP-05** §10, not this slice.

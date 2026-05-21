# PUMP-01 QA Pack

## Slice metadata

- slice_id: PUMP-01
- app: PUMP
- requirement_path: docs/requirements/PU01-app-shell-information-architecture-requirements.md

## Manual frontend scenarios

| scenario_id | requirement_ref | route_or_screen | steps | expected_result | result | notes |
|---|---|---|---|---|---|---|
| S-01 | §12-1 | `src/main.tsx` | Confirm `setupRBAC(supabaseClient, { appName: APP_NAME })` appears at module level in `main.tsx`. | Call is not inside a component, hook, or effect. | - | |
| S-02 | §12-2 | `src/App.tsx`, `src/main.tsx` | Confirm `APP_NAME` is exported from `src/App.tsx` and imported (not redeclared) in `main.tsx`. Confirm `src/config/appConfig.ts` does not exist (or, if removed, the change is committed). | `APP_NAME` has a single declaration; no stray `appConfig.ts`. | - | |
| S-03 | §12-3 | `src/main.tsx` (`AppProviders`) | Confirm `<AppProviders>` bridge calls `useUnifiedAuthContext()` and passes `user` and `session` to `<OrganisationServiceProvider>` as explicit props. | Organisation provider receives explicit `user` and `session`. | - | |
| S-04 | §12-4 | `src/components/layout/AuthenticatedShell.tsx` | Confirm `<AuthenticatedShell>` is implemented as a React Router layout route (renders `<Outlet />`). | Layout route renders `<Outlet />` at the cited path. | - | |
| S-05 | §12-5 | `AuthenticatedShell` | Confirm `<AuthenticatedShell>` checks `isLoading` first (renders `<LoadingSpinner />`), then checks `selectedOrganisation === null` (renders no-organisation message), before rendering `<PaceAppLayout>`. | Loading, no-org, and normal branches occur in that order. | - | |
| S-06 | §12-6 | `AuthenticatedShell` | Confirm `<ToastProvider>` is the outermost element returned by `<AuthenticatedShell>` and wraps all three branches. | Toast provider wraps loading, no-org, and layout branches. | - | |
| S-07 | §12-7 | `AuthenticatedShell` | Confirm `<CommRbacContextProvider>` is mounted inside the normal `<PaceAppLayout>` branch only. | Comm RBAC provider is not mounted on loading or no-org branches. | - | |
| S-08 | §12-8 | `AuthenticatedShell` | Confirm change-password dialog is defined inside `<AuthenticatedShell>` and wired to `onUserMenuChangePassword`. | Dialog opens from user menu change-password action. | - | |
| S-09 | §12-9 | Provider stack | Confirm `<EventServiceProvider>` is absent from the provider stack. | No `EventServiceProvider` in the stack. | - | |
| S-10 | §12-10 | NavigationMenu dropdown | Confirm the three nav items appear in this order: Comms log, Compose, Templates. Each is wrapped in `<NavigationGuard>` with the correct permission string. | Order and permission strings match requirement. | - | |
| S-11 | §12-11 | Router (`/comms`, `/comms/settings`) | Confirm `/comms` and `/comms/settings` are not registered anywhere in the router; navigate to either as an authenticated user. | Both paths fall through to `*` (NotFound). | - | |
| S-12 | §12-12 | `/public/logos/pump_logo_square.svg` | Confirm `/logos/pump_logo_square.svg` exists in the `/public/logos/` directory. | File exists, or note as known asset gap per requirement (do not block build). | - | |
| S-13 | AC-02 | `/login` | Sign in and inspect `<PaceLoginPage>`. | Page renders PUMP logo, "Sign in to PUMP" heading, email + password fields, and Sign-in button. | - | |
| S-14 | AC-18 | Authenticated shell — user menu | Sign out via the user menu. | Redirect to `/login`. | - | |
| S-15 | AC-19 | Change-password dialog | Open the change-password dialog from the user menu, submit, and observe behaviour. | Dialog-close behaviour matches requirement (success closes dialog; no toast or redirect on success). | - | |
| S-16 | AC-14 | Authenticated shell (idle) | Trigger inactivity by simulated idle until the 28-minute mark. | `<InactivityWarningModal>` appears. | - | |
| S-17 | §12-17 | dev-db (`rkytnffgmwnnmewevqgp`) | Against dev-db: confirm `rbac_apps` row `name = 'PUMP'`, `is_active = true`; confirm `rbac_app_pages` rows for `(app = 'PUMP', page_name IN ('CommsLog', 'CommsTemplates'))`. | RBAC catalogue rows present as specified. | - | |

## Test run summary

- overall result: Pending
- failed scenarios: -
- defect links: N/A
- retest needed: Yes

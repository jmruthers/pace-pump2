# PUMP-01 — App shell & information architecture

## §1 Slice metadata

```
Slice ID:        PUMP-01
Name:            App shell & information architecture
Status:          Draft
Depends on:      None
Backend impact:  None
Frontend impact: UI
Routes owned:    /login; *
QA pack:         docs/test-packs/PUMP-01-qa-pack.md
```

PUMP-01 also wires the route table for the authenticated routes `/`, `/comms/create`, and `/comms/templates`, and mounts the page-level `<PagePermissionGuard>` on each route slot. The page content rendered inside each guard is owned by PUMP-02, PUMP-04, and PUMP-05 respectively.

---

## §2 Overview

PUMP-01 establishes the PUMP application shell. It bootstraps the provider stack (Supabase auth, organisation context, RBAC), mounts the authenticated chrome (`<PaceAppLayout>` header, content area, footer), wires the React Router route table, mounts page-level RBAC guards on every authenticated feature route, and renders both the `/login` page and the catch-all NotFound page. PUMP-01 also publishes the `CommRbacContext` (`{ canCompose, canSend, canSchedule }`) that PUMP-05's compose surface consumes. No feature-domain data is fetched in this slice.

---

## §3 What this slice delivers

### Purpose

PUMP-01 gives authenticated operators a stable, organisation-aware shell to operate PUMP from. It protects every authenticated route from unauthenticated access, establishes organisation context for every feature query that follows, mounts the navigation scaffold reachable from the header, and publishes a single `CommRbacContext` derivation downstream consumers re-use rather than re-derive.

### Surfaces

| Surface | Route | Notes |
|---------|-------|-------|
| Login page | `/login` | Unauthenticated; outside the authenticated shell |
| Authenticated shell (chrome) | All authenticated routes | `<PaceAppLayout>` wrapper around `<Outlet />` |
| Communications log route slot | `/` | Guard wired here; placeholder content until PUMP-02 ships |
| Compose route slot | `/comms/create` | Guard wired here; placeholder content until PUMP-05 ships |
| Templates route slot | `/comms/templates` | Guard wired here; placeholder content until PUMP-04 ships |
| NotFound page | `*` | Catch-all inside the authenticated shell |
| Inactivity warning modal | (overlay) | Rendered via `<UnifiedAuthProvider>` `renderInactivityWarning` callback |
| Toast notifications | (overlay) | Rendered by `<Toaster />` inside `<ToastProvider>` mounted by `<AuthenticatedShell>` |
| Change-password dialog | (overlay) | Hosted by `<AuthenticatedShell>` |
| `CommRbacContext` | (provider) | `<CommRbacContextProvider>` mounted inside `<AuthenticatedShell>` |

### Boundaries

PUMP-01 does **not** own:

- Communications log content at `/` (PUMP-02 replaces the placeholder).
- Templates CRUD content at `/comms/templates` (PUMP-04 replaces the placeholder).
- Compose / send content at `/comms/create` (PUMP-05 replaces the placeholder).
- Sender-identity, gateway, or org-comms-defaults UI (no PUMP screen in v1).
- The `/comms` list route (explicitly not registered; lands in `*` NotFound).
- The `/comms/settings` route (not registered; lands in `*` NotFound).
- Webhook ingestion or Edge function deployment (PUMP-06).
- Any feature-domain data queries (member lists, message rows, template rows, delivery events).

### Architectural posture

**`APP_NAME` constant.** `APP_NAME = 'PUMP'` is declared as a named export in `src/App.tsx` and imported (not redeclared) into `main.tsx`. Both `setupRBAC` and `<UnifiedAuthProvider>` receive the imported value.

**`setupRBAC` call ordering.** `setupRBAC(supabaseClient, { appName: APP_NAME })` is called at module level in `main.tsx`, before `createRoot(...)`. It must not be called inside a component, hook, or effect.

**Provider stack.**

```
ErrorBoundaryProvider                                  // outermost — catches uncaught render errors below
  QueryClientProvider                                  // TanStack Query client
    BrowserRouter                                      // router context
      UnifiedAuthProvider (supabaseClient, appName, idle config, renderInactivityWarning, onIdleLogout)
        AppProviders (bridge component — see below)
          OrganisationServiceProvider (supabaseClient, user, session)
            App (router + routes — feature routes wrapped per the route table below)
```

`<ErrorBoundaryProvider>` is the outermost context provider, wrapping `<QueryClientProvider>` (not nested inside it). This pins the boundary above `<BrowserRouter>` so router-thrown errors are caught while query-client context stays available to the error fallback UI. `<EventServiceProvider>` is **not** part of the stack — PUMP is organisation-scoped.

**`AppProviders` bridge.** `<OrganisationServiceProvider>` requires `user` and `session` as explicit props. An internal bridge component named `AppProviders`, defined inline in `main.tsx`, calls `useUnifiedAuthContext()` and forwards the returned `user` and `session` as props to `<OrganisationServiceProvider>`. `AppProviders` is not exported and has no other responsibility.

**TanStack Query defaults.** `<QueryClientProvider>` is configured with `defaultOptions.queries.staleTime = 5 * 60 * 1000`, `gcTime = 10 * 60 * 1000`, `refetchOnWindowFocus = false`, `retry = 1`.

**Inactivity logout.** `<UnifiedAuthProvider>` is configured with:

- `idleTimeoutMs = 30 * 60 * 1000` (30 minutes)
- `warnBeforeMs = 2 * 60 * 1000` (2 minutes)
- `onIdleLogout` invokes `supabaseClient.auth.signOut()` directly (module-level, no hook context available)
- `renderInactivityWarning` returns `<InactivityWarningModal isOpen timeRemaining={timeRemaining} onStaySignedIn={onStaySignedIn} onSignOutNow={onSignOutNow} />`

**`<AuthenticatedShell>` component.** All authenticated routes mount inside a layout-route component at `src/components/layout/AuthenticatedShell.tsx`. `<AuthenticatedShell>` is the single owner of:

1. Auth-loading guard — renders `<LoadingSpinner />` (full-viewport) while `useUnifiedAuth().isLoading === true`.
2. No-organisation guard — renders the no-organisation empty state inside PaceMain when `selectedOrganisation === null` after loading completes.
3. `<PaceAppLayout>` chrome render around `<Outlet />` for the normal authenticated path.
4. Change-password dialog hosting (triggered from the user menu).
5. `<ToastProvider>` mount (outermost wrapper around all three render branches above) so any descendant route may call the module-level `toast(...)` from `@solvera/pace-core/components`.
6. `<CommRbacContextProvider>` mount (inside the `<ToastProvider>`, around the normal `<PaceAppLayout>` branch) so descendants of the chrome can call `useCommRbacContext()`.

`<AuthenticatedShell>` reads `isLoading`, `user`, `selectedOrganisation`, `signOut`, and `updatePassword` from `useUnifiedAuth()`. Display values:

- `userFullName`: `user?.user_metadata?.full_name` if it is a non-empty string; otherwise `user?.email`; otherwise `'Authenticated user'`.
- `userEmail`: `user?.email ?? 'No email available'`.

**`<CommRbacContextProvider>` derivation contract.** The provider derives `{ canCompose, canSend, canSchedule }` once per session inside the authenticated shell, where the RBAC engine and organisation context are fully resolved. Mapping:

- `canCompose` ← `create:page.CommsLog`
- `canSend` ← `update:page.CommsLog`
- `canSchedule` ← `update:page.CommsLog`

Downstream PUMP-05 reads the values via `useCommRbacContext()`. Downstream slices do not re-derive these booleans from raw `useCan(...)` calls. If `@solvera/pace-core/comms` has not yet published the provider component at PUMP-01 build time, PUMP-01 implements the provider inline against `useCan(permission, scope)` from `@solvera/pace-core/rbac`, exposing the same `CommRbacContext` type from `@solvera/pace-core/comms` and the same `useCommRbacContext()` hook signature so the downstream consumption pattern is unchanged when pace-core2 promotes the provider.

**Route-guard ownership boundary.** PUMP-01 owns the full guard mount surface for every authenticated feature route. PUMP-01 mounts `<PagePermissionGuard pageName operation>` at every authenticated route slot from day 1, with placeholder content. Owner slices (PUMP-02 / PUMP-04 / PUMP-05) replace placeholder content but do not re-mount guards. The architecture's "Route access mapping (v1)" is therefore satisfied as soon as PUMP-01 ships.

**Route table (v1).**

| Route | Wrapper | Content owner |
|---|---|---|
| `/login` | (none — outside `<ProtectedRoute>`, `<SessionRestorationLoader>`, and `<AuthenticatedShell>`) | PUMP-01 (renders `<PaceLoginPage appName="PUMP">`) |
| `/` | `<ProtectedRoute>` → `<SessionRestorationLoader>` → `<AuthenticatedShell>` (layout route) → `<PagePermissionGuard pageName="CommsLog" operation="read">` | PUMP-02 replaces placeholder |
| `/comms/create` | `<ProtectedRoute>` → `<SessionRestorationLoader>` → `<AuthenticatedShell>` → `<PagePermissionGuard pageName="CommsLog" operation="create">` | PUMP-05 replaces placeholder |
| `/comms/templates` | `<ProtectedRoute>` → `<SessionRestorationLoader>` → `<AuthenticatedShell>` → `<PagePermissionGuard pageName="CommsTemplates" operation="read">` | PUMP-04 replaces placeholder |
| `*` | `<ProtectedRoute>` → `<SessionRestorationLoader>` → `<AuthenticatedShell>` | PUMP-01 (renders NotFound) |

The paths `/comms` and `/comms/settings` are **not registered** anywhere in the router. Authenticated users hitting either fall through to `*` NotFound. There is no redirect.

**Lazy loading.** Feature route components for `/`, `/comms/create`, and `/comms/templates` are loaded via `React.lazy(...)`. PUMP-01 wraps each lazy component in `<Suspense fallback={<LoadingSpinner />}>` so the chunk-fetch state is visible. PUMP-01's own pages (`/login`, NotFound) are not lazy.

**App-level error boundary.** `<ErrorBoundaryProvider>` from `@solvera/pace-core/components` is the outermost context provider in the stack — it wraps `<QueryClientProvider>` (and therefore everything below it: `<BrowserRouter>`, `<UnifiedAuthProvider>`, `<AppProviders>`, `<OrganisationServiceProvider>`, `<App>`). Uncaught render errors from any descendant — including router-thrown errors — are caught and logged through the structured logger.

**Session restoration.** `<SessionRestorationLoader>` is mounted as a direct child of `<ProtectedRoute>` and the parent of `<AuthenticatedShell>` in the wrapper chain for every authenticated route. While `sessionRestoration.isRestoring === true && !hasTimedOut`, the loader renders its own loading UI (centred spinner with sr-only "Restoring session…") and the `<AuthenticatedShell>` subtree is **not yet mounted**. After session restoration completes (`isRestoring === false`) or times out (10,000 ms default), the loader unmounts its loading UI and mounts its children — at which point the `<AuthenticatedShell>` subtree mounts. On timeout, content renders with whatever auth state has resolved; restoration is not retried.

### Page-level guards and evaluation ordering

For every authenticated feature route in PUMP-01's table, the evaluation order when context is partially or fully absent is:

1. **Session restoration.** `<SessionRestorationLoader>` blocks all content until `sessionRestoration.isRestoring === false` or restoration times out at 10,000 ms. Nothing renders before this resolves.
2. **Authentication check.** `<ProtectedRoute>` fires before any organisation context or guard. An unauthenticated user is redirected to `/login` (replace) immediately and never reaches the organisation check or the page guard. This applies to `*` (NotFound) too — an unauthenticated user navigating to `/some/random/path` is redirected to `/login`, not to NotFound.
3. **Auth-loading guard.** `<AuthenticatedShell>` renders `<LoadingSpinner />` (full-viewport) while `useUnifiedAuth().isLoading === true`. No `<PaceAppLayout>`, no `<Outlet />`, no guard evaluation.
4. **No-organisation guard.** When loading completes with `selectedOrganisation === null`, `<AuthenticatedShell>` renders the no-organisation empty state inside PaceMain. Header and footer remain visible; no `<Outlet />`; no `<PagePermissionGuard>` evaluation; no feature query fires; no `<CommRbacContextProvider>` derivation runs (the provider is mounted inside the `<PaceAppLayout>` branch only, so it does not exist on the no-org branch — descendants requiring `useCommRbacContext()` are unreachable on that branch).
5. **Page permission guard.** `<PagePermissionGuard pageName operation>` fires with organisation scope fully resolved. Scope is resolved internally by the guard from `<OrganisationServiceProvider>` context — no `scope` prop is passed. While the RBAC check is in flight (`isLoading === true`), the guard returns `null` (no `loading` prop is supplied). On allow, it renders its `children`. On deny, it renders the default `<AccessDenied />`.

If `selectedOrganisation` becomes null between step 4 and step 5 (race), the RBAC engine evaluates with `organisationId: undefined` and the check is pending; the guard returns `null`. Under normal conditions step 4 prevents this path from being reached.

The catch-all `*` route follows the same chain through step 4 (it lives inside `<AuthenticatedShell>`); step 5 does not apply because no `<PagePermissionGuard>` is mounted on `*`. Authenticated users hitting an unknown path see the NotFound page rendered inside the chrome.

---

## §4 Functional specification

### Page entry

**Login page (`/login`).**

- Renders unconditionally — no auth check, no guard, no organisation check.
- Shows the PUMP square logo, the heading "Sign in to PUMP", a description line, an email field, a password field, a Sign-in button, and an inline error area below the form.
- On successful authentication, redirects to `/` (default `onSuccessRedirectPath`).
- An already-authenticated user navigating to `/login` is redirected to `/` by `<PaceLoginPage>` internally.
- The `<ToastProvider>` is not mounted on this route; toasts are unavailable on `/login`.

**Authenticated shell (all authenticated routes).**

- `<ProtectedRoute>` wraps the authenticated subtree. An unauthenticated user is redirected to `/login` with no content flash.
- `<SessionRestorationLoader>` renders a centred spinner with sr-only "Restoring session…" until restoration completes or times out (10,000 ms).
- Once authenticated, `<OrganisationServiceProvider>` resolves organisation memberships. While resolving, `<AuthenticatedShell>` renders a full-viewport `<LoadingSpinner />`.
- If `selectedOrganisation === null` after loading, `<AuthenticatedShell>` renders the no-organisation empty state inside the `<PaceAppLayout>` chrome's content area. No feature content renders.
- All normal authenticated routes are wrapped in `<PaceAppLayout>`, which renders the header (logo, NavigationMenu trigger, organisation context selector, user menu), the PaceMain content area, and the footer.
- `<ToastProvider>` is mounted by `<AuthenticatedShell>` as the outermost wrapper around all three render branches (loading, no-organisation, normal). Any descendant component on any branch can call `toast({ title?, description?, variant?, duration? })`.
- `<CommRbacContextProvider>` is mounted inside the normal `<PaceAppLayout>` branch only; descendants of the chrome can call `useCommRbacContext()`.

**Communications log route slot (`/`).**

- Requires authentication (step 2).
- Requires organisation context (no-organisation check at step 4 fires before the page guard).
- Requires `read:page.CommsLog` (page guard at step 5).
- PUMP-01 renders a placeholder block inside the guard. The placeholder is a centred message: "Communications log — coming in PUMP-02." There is no feature query, no list, no action button.
- PUMP-02 replaces the placeholder content; the route registration and guard mount stay with PUMP-01.

**Compose route slot (`/comms/create`).**

- Requires authentication, organisation context, and `create:page.CommsLog`.
- PUMP-01 renders a placeholder block: "Compose — coming in PUMP-05." No feature query.
- PUMP-05 replaces the placeholder content.

**Templates route slot (`/comms/templates`).**

- Requires authentication, organisation context, and `read:page.CommsTemplates`.
- PUMP-01 renders a placeholder block: "Templates — coming in PUMP-04." No feature query.
- PUMP-04 replaces the placeholder content.

**NotFound page (`*`).**

- Renders inside `<AuthenticatedShell>` (chrome remains visible) for authenticated users hitting any unmatched path.
- Shows a centred 404 heading, the body line "The page you're looking for doesn't exist.", and a "Go to home" link to `/`.
- Logs the unmatched path via `console.error('[PUMP] Unmatched route:', pathname)`.
- An unauthenticated user hitting an unmatched path is redirected to `/login` first by `<ProtectedRoute>`.

### Loading states

- **Session restoring.** `<SessionRestorationLoader>` renders a centred spinner with sr-only "Restoring session…" copy. Covers the full viewport. Visible while `isRestoring && !hasTimedOut`.
- **Auth / organisation resolving.** `<AuthenticatedShell>` renders `<LoadingSpinner />` (full-viewport centred spinner) while `useUnifiedAuth().isLoading === true`. The PaceAppLayout chrome is not rendered yet.
- **RBAC check in flight.** `<PagePermissionGuard>` returns `null` while the RBAC permission check is loading. A brief blank in the PaceMain content area; the chrome (header, footer) remains visible.
- **Lazy chunk fetching.** Each lazy-loaded feature route is wrapped in `<Suspense fallback={<LoadingSpinner />}>`. While the chunk fetches, the centred full-viewport spinner is shown inside the PaceMain content area.

### Empty states

- **No organisation assigned.** User is authenticated but `selectedOrganisation === null` after organisation loading completes. `<AuthenticatedShell>` renders the message **"No organisation assigned. Please contact your administrator."** as a centred block inside the PaceAppLayout content area. Header and footer remain visible. No CTA. No redirect. No feature content. No further checks fire.
- **NotFound.** User navigates to an unmatched path inside the authenticated shell. The NotFound page renders inside the chrome with a 404 heading, the "doesn't exist" body line, and a "Go to home" link.

### Error states

- **Login — invalid credentials.** `<PaceLoginPage>` renders an inline `<Alert>` below the form with the sign-in error message. The form remains interactive; the user can retry.
- **Login — network or server error.** `<PaceLoginPage>` renders an inline `<Alert>` below the form. No redirect.
- **Permission denied on a feature route.** `<PagePermissionGuard>` renders the default `<AccessDenied />` content inside the PaceMain content area. The shell chrome (header with NavigationMenu / organisation selector / user menu, and the footer) remains visible. The body of `<AccessDenied />` is "You do not have permission to view this page."
- **Inactivity warning.** `<InactivityWarningModal>` renders as a full-viewport overlay 28 minutes (30 min idle - 2 min warn) after the most recent activity. Body shows a countdown in seconds. Two actions: "Stay signed in" (primary) and "Sign out" (secondary).
- **Idle logout.** If the user takes no action for 2 minutes after the warning modal appears, `onIdleLogout` fires; `supabaseClient.auth.signOut()` is invoked; `<ProtectedRoute>` re-evaluates and redirects the now-unauthenticated user to `/login`.
- **Session restoration timeout.** When restoration exceeds 10,000 ms, `<SessionRestorationLoader>` releases content. Whatever auth state has resolved is used; restoration is not retried. If the user ends up unauthenticated, `<ProtectedRoute>` redirects to `/login`.
- **Top-level render error.** `<ErrorBoundaryProvider>` catches the error, logs it via the structured logger, and renders the default error fallback inside the PaceMain content area.

### Primary content — login

- PUMP square logo (resolved by `<PaceLoginPage>` from `/logos/pump_logo_square.svg`).
- Heading: "Sign in to PUMP".
- Description: copy provided by `<PaceLoginPage>` defaults.
- Email field, password field, Sign-in button.

### Primary content — authenticated shell chrome

- **Header.** PUMP logo (left), NavigationMenu trigger (centre/left), organisation context selector (right of nav), user menu (far right).
- **Footer.** Standard `<PaceFooter>` rendered by `<PaceAppLayout>`.

### Primary content — route placeholders

- Communications log placeholder: centred message "Communications log — coming in PUMP-02." inside PaceMain.
- Compose placeholder: centred message "Compose — coming in PUMP-05." inside PaceMain.
- Templates placeholder: centred message "Templates — coming in PUMP-04." inside PaceMain.

### Primary content — NotFound

- Centred 404 heading.
- Body line: "The page you're looking for doesn't exist."
- "Go to home" link pointing to `/`.

### Primary actions

- **Sign in (login form).** Submit button on `/login`. On submit, `<PaceLoginPage>` calls Supabase auth. On success: redirect to `/`. On failure: inline error alert; form remains interactive.
- **Navigation menu trigger (header).** Opens the navigation dropdown panel. Renders the three nav items in this order:
  1. **Comms log** — `href="/"`, icon `Mail`, gated `read:page.CommsLog`.
  2. **Compose** — `href="/comms/create"`, icon `MessageSquare`, gated `create:page.CommsLog`.
  3. **Templates** — `href="/comms/templates"`, icon `FileText`, gated `read:page.CommsTemplates`.
- **Nav item click.** Navigates to the item's `href`. The dropdown closes. Items the user lacks permission for are not rendered (see Permission-conditional rendering below).
- **Organisation context selector.** Renders the user's organisation memberships and allows switching context. Supplied by `<PaceAppLayout showOrganisations={true}>`.
- **User menu — Sign out.** Calls `signOut()` from `useUnifiedAuth()`, then `navigate('/login', { replace: true })`. The Supabase session is cleared. No toast.
- **User menu — Change password.** Sets local `passwordDialogOpen` state to `true`, opening the change-password dialog modal hosted by `<AuthenticatedShell>`. The dialog body is `<PasswordChangeForm>`.
  - On submit: `updatePassword(newPassword)` from `useUnifiedAuth()` is called. The form blocks (loading state on the submit button) during the call. If the result has a non-null `error`, the form displays the error message inline; the dialog stays open. On success: the dialog closes; no toast; no redirect.
  - On cancel: the dialog closes; no state change.
- **Inactivity modal — Stay signed in.** Calls `onStaySignedIn`. Modal unmounts; idle timer resets to zero elapsed; session continues.
- **Inactivity modal — Sign out.** Calls `onSignOutNow`. Supabase session is cleared; `<ProtectedRoute>` redirects to `/login`.
- **NotFound — Go to home.** Link navigates to `/`.

### Secondary actions

N/A — no filters, sorts, search, pagination, exports, or keyboard shortcuts owned by PUMP-01.

### Permission-conditional rendering

| Condition | Header chrome | Nav items shown | Route slot content |
|---|---|---|---|
| Not authenticated, navigating to any `/login`-distinct path | Not shown — redirect to `/login` | n/a | n/a |
| Authenticated, no organisation | Shown (header + footer) | All nav items hidden (no organisation in scope, page-grant evaluations have no scope) | No-organisation empty state |
| Authenticated, has organisation, missing all PUMP page grants | Shown | None visible (each `<NavigationGuard>` hides its item) | `<AccessDenied />` on whichever route the user navigates to |
| Authenticated, has `read:page.CommsLog` only | Shown | Comms log only | `/`: placeholder; `/comms/create`: `<AccessDenied />`; `/comms/templates`: `<AccessDenied />` |
| Authenticated, has `read:page.CommsLog` + `read:page.CommsTemplates` | Shown | Comms log + Templates | `/comms/templates`: placeholder; `/comms/create`: `<AccessDenied />` |
| Authenticated, has `read:page.CommsLog` + `create:page.CommsLog` | Shown | Comms log + Compose | `/comms/create`: placeholder; `/comms/templates`: `<AccessDenied />` |
| Authenticated, has all three grants | Shown | All three nav items | All route slots render their placeholder (or owner-slice content once landed) |

Behaviour is identical for `update:page.CommsLog` only inside `<CommRbacContextProvider>`'s derivation: it sets `canSend` and `canSchedule` to `true` for downstream PUMP-05 consumption. `update:page.CommsLog` does not gate any nav item or route in PUMP-01.

### Navigation

- Unauthenticated user on any protected route → `/login` (`<ProtectedRoute>`).
- Successful sign-in → `/` (`<PaceLoginPage>` default redirect).
- Nav item click → respective `href`.
- Unmatched path → `*` NotFound (authenticated) or `/login` (unauthenticated, redirected before reaching `*`).
- Sign out (user menu) → `/login` (replace).
- Idle logout → `/login` (`<ProtectedRoute>` re-evaluates after sign-out).
- NotFound "Go to home" link → `/`.
- Successful change-password submission: dialog closes; user remains on the current route; no redirect.

### Edge cases and constraints

- **Session restoration timeout.** Default 10,000 ms. On timeout, content renders with whatever auth state exists; `<SessionRestorationLoader>` releases. If unauthenticated, `<ProtectedRoute>` redirects to `/login`. Restoration is not retried.
- **Multiple organisation memberships.** First organisation membership is auto-selected on load; the organisation context selector in the header allows switching.
- **Switching organisation.** When the active organisation changes, `<CommRbacContextProvider>` re-derives `{ canCompose, canSend, canSchedule }` against the new organisation's grants; downstream PUMP-05 receives the updated values via `useCommRbacContext()`.
- **Unbuilt feature slice.** Navigating to a route whose owner slice has not yet replaced the placeholder shows the placeholder block (e.g. "Communications log — coming in PUMP-02."). No unhandled error.
- **Inactivity dismiss + remain idle.** If the user dismisses the inactivity modal manually and remains idle, the modal re-appears on the next idle tick cycle.
- **Missing Supabase environment variables.** If `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing or empty at module load, `src/lib/supabase.ts` throws the error `'Missing Supabase environment variables. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set in your .env file.'` and the app does not boot.
- **Already-authenticated user lands on `/login`.** `<PaceLoginPage>` redirects to `/` internally — `/login` is never visible for authenticated users.
- **`/comms` direct request.** Authenticated user → falls through to `*` → NotFound page. There is no redirect. Unauthenticated user → redirected to `/login`.
- **`/comms/settings` direct request.** Same behaviour as `/comms` — falls through to `*` NotFound; not registered.
- **Toast call from `/login`.** The `<ToastProvider>` is not mounted there. Calls to `toast(...)` from any code reachable on `/login` will throw a "must be called within a ToastProvider" error. PUMP-01's login surface does not call `toast(...)`.

---

## §5 Visual specification

### Layout

**Login page (`/login`).** Full-page centred card layout supplied by `<PaceLoginPage>`. The PUMP square logo sits above the form. The heading "Sign in to PUMP" is the form's `<CardHeader>` title. A description line follows the heading. A `<Form>` body stacks two `<FormField>` controls (email then password) followed by the Sign-in button. An error `<Alert>` area sits below the button. There is no header, footer, or NavigationMenu on this page.

**Authenticated shell (every authenticated route).** Three vertical layers rendered by `<PaceAppLayout>`:

1. **`<PaceHeader>`** — full-width top bar. Left: PUMP logo. Centre/left: NavigationMenu dropdown trigger. Right: organisation context selector. Far right: user menu trigger (avatar/initials).
2. **`<PaceMain>`** — content area with `max-w-(--app-width)` and `p-4` padding by default. Children render here. PUMP-01 does not override the default width or padding.
3. **`<PaceFooter>`** — full-width bottom bar.

When `<AuthenticatedShell>` is in its loading branch, `<LoadingSpinner />` renders full-viewport instead of the three-layer chrome. When in its no-organisation branch, the three-layer chrome renders, and the no-organisation message renders inside `<PaceMain>` (centred, single block). When in its normal branch, the three-layer chrome renders with `<Outlet />` inside `<PaceMain>`.

**Route slot placeholders (inside `<PaceMain>`).** Each placeholder is a centred message block with a single line of text:

- `/`: "Communications log — coming in PUMP-02."
- `/comms/create`: "Compose — coming in PUMP-05."
- `/comms/templates`: "Templates — coming in PUMP-04."

There is no illustration, no CTA, no card border. Text uses pace-core2's body text style.

**NotFound page (inside `<PaceMain>`).** Centred content block with three elements stacked vertically:

1. "404" heading (h1-equivalent style).
2. Body line: "The page you're looking for doesn't exist." (one line, body text size).
3. "Go to home" link (text link pointing to `/`).

**Inactivity warning modal.** Full-viewport overlay; centred dialog supplied by `<InactivityWarningModal>`. Dialog header carries the modal title **"You are about to be signed out"** (pace-core2 default; PUMP-01 does not override the `title` prop — future custom copy can be passed via the `title` prop without further slice changes). Dialog description shows **"You have been inactive. Stay signed in or sign out now."** followed by an `aria-live="polite"` countdown line of the form "Time remaining: {n} seconds." (or "1 second" when one). Dialog footer contains two buttons: "Stay signed in" (primary) and "Sign out" (secondary / destructive). Background content is inert while the modal is open.

**Change-password dialog.** Modal overlay; centred dialog using `<Dialog>` / `<DialogContent>` from `@solvera/pace-core/components`. Dialog header: `<DialogTitle>` text "Change password". Dialog body wraps `<PasswordChangeForm>`. Background content is inert while open. The dialog closes on cancel, on successful submit, or on Escape (per `<Dialog>` defaults).

### Components

**`<PaceLoginPage>`** — login surface.

- `appName="PUMP"` — drives the logo path (`/logos/pump_logo_square.svg`) and the "Sign in to PUMP" heading.
- `onSuccessRedirectPath` left at default (`'/'`).
- Renders: PUMP square logo above a `<Card>` containing a `<CardHeader>` (title "Sign in to PUMP" + description), a `<Form>` body (email `<FormField>`, password `<FormField>`, Sign-in button), and an error `<Alert>` area below the button.

**`<PaceAppLayout>`** — authenticated chrome.

- `appName={APP_NAME}` (i.e. `"PUMP"`).
- `navItems` is a 3-item array (defined in PUMP-01's `App.tsx`):

```ts
const navItems: NavigationItem[] = [
  { id: 'comms-log',  label: 'Comms log', href: '/',                 icon: 'Mail' },
  { id: 'compose',    label: 'Compose',   href: '/comms/create',     icon: 'MessageSquare' },
  { id: 'templates',  label: 'Templates', href: '/comms/templates',  icon: 'FileText' },
];
```

- `showOrganisations={true}` (default) — renders the organisation context selector in the header.
- `showEvents={false}` (default) — PUMP is not event-scoped.
- `enforcePermissions={false}` — per-route `<PagePermissionGuard>` is the canonical mechanism; `<PaceAppLayout>` does not enforce.
- `userFullName` — derived per §3 from `useUnifiedAuth().user`.
- `userEmail` — derived per §3.
- `onUserMenuSignOut` — calls `signOut()` from `useUnifiedAuth()`, then `navigate('/login', { replace: true })`.
- `onUserMenuChangePassword` — sets local `passwordDialogOpen` state to `true`.
- Renders: `<PaceHeader>` (logo, NavigationMenu dropdown trigger, organisation context selector, user menu) + `<PaceMain>` (content area for children) + `<PaceFooter>`.

**`<NavigationMenu>` (inside `<PaceHeader>`).** Renders the three `navItems` as a single dropdown trigger per CR05c — the header does not display nav links inline. Each item shows its icon + label inside the dropdown panel.

**`<NavigationGuard>` wrappers (each nav item).** Each `<NavigationItem>` rendered inside the dropdown is wrapped in `<NavigationGuard permission="...">` so the link is hidden when permission is denied:

- Comms log: `<NavigationGuard permission="read:page.CommsLog">` — hides if user lacks the grant.
- Compose: `<NavigationGuard permission="create:page.CommsLog">` — hides if user lacks the grant.
- Templates: `<NavigationGuard permission="read:page.CommsTemplates">` — hides if user lacks the grant.

`hideWhenDenied` defaults to `true`, which is the desired behaviour. No `disableWhenDenied` is set.

**`<SessionRestorationLoader>`** — full-viewport centred spinner with sr-only text "Restoring session…". Visible while `isRestoring && !hasTimedOut`. PUMP-01 mounts it as a direct child of `<ProtectedRoute>` and the parent of `<AuthenticatedShell>` in the wrapper chain for every authenticated route. While restoration is in flight, the loader renders its own loading UI and the `<AuthenticatedShell>` subtree is not yet mounted; after restoration completes (or times out at 10,000 ms), the loader unmounts its loading UI and mounts its children, at which point `<AuthenticatedShell>` mounts.

**`<LoadingSpinner>`** — full-viewport centred spinner. Used by `<AuthenticatedShell>` while `isLoading === true`, and as the `<Suspense>` fallback for lazy-loaded feature routes.

**`<InactivityWarningModal>`** — full-viewport overlay; centred dialog. Props: `isOpen` (always `true` when rendered — the provider mounts/unmounts the modal by calling/not calling the render function), `timeRemaining` (seconds, supplied by the provider), `onStaySignedIn`, `onSignOutNow`. The `title` prop is left at its pace-core2 default (**"You are about to be signed out"**); the description prop is left at its pace-core2 default (**"You have been inactive. Stay signed in or sign out now."**). Body shows the countdown in seconds via the description's `aria-live="polite"` region. Footer carries two buttons: primary "Stay signed in", secondary "Sign out".

**`<ToastProvider>` (with internal `<Toaster />`).**

- Mounted by `<AuthenticatedShell>` as the outermost wrapper around all three render branches (loading, no-organisation, normal).
- Props: `children: ReactNode`. No further configuration.
- `<ToastProvider>` renders `<Toaster />` internally; `<AuthenticatedShell>` does not mount `<Toaster />` directly.
- Establishes the toast context so any descendant on any branch may call the module-level `toast({ title?, description?, variant?, action?, duration? })` from `@solvera/pace-core/components`.
- Notifications appear as an `<aside role="region" aria-label="Notifications">` overlay portalled to `document.body`, anchored bottom-right. Each toast auto-dismisses after `duration` ms (default 5000) and is dismissible via its close button.
- Allowed `variant` values: `'default'`, `'destructive'`, `'success'`. There is no `'warning'` or `'info'` variant.

**`<CommRbacContextProvider>`.**

- Mounted by `<AuthenticatedShell>` inside the normal `<PaceAppLayout>` branch (around `<Outlet />`). Not mounted on the loading or no-organisation branches.
- Derives `{ canCompose: boolean, canSend: boolean, canSchedule: boolean }` from page grants once per session and re-derives when the active organisation changes:
  - `canCompose ← create:page.CommsLog`
  - `canSend ← update:page.CommsLog`
  - `canSchedule ← update:page.CommsLog`
- Exposes the value through `useCommRbacContext()` for descendant slices (PUMP-05).
- If pace-core2 has not yet published the provider component at PUMP-01 build time, PUMP-01 implements the provider inline using `useCan(permission, scope)` from `@solvera/pace-core/rbac`, exposing the same `CommRbacContext` type from `@solvera/pace-core/comms` and the same `useCommRbacContext()` hook signature.

**Change-password dialog.**

- Trigger: `onUserMenuChangePassword` from the user menu in `<PaceAppLayout>`.
- Container: `<Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>` with `<DialogContent>` containing `<DialogHeader>` (with `<DialogTitle>` "Change password") and `<DialogBody>`.
- Body: `<PasswordChangeForm>` from `@solvera/pace-core/components`. Form fields:
  - **New password** — type `password`, required.
  - **Confirm new password** — type `password`, required.
  - Validation copy is supplied by `<PasswordChangeForm>` (e.g. "Passwords must match", minimum length).
  - Submit button label: "Change password" (or as supplied by the component).
  - Cancel button.
- `onSubmit`: calls `updatePassword(newPassword)` from `useUnifiedAuth()`; the result `{ error?: AuthError }` is returned to the form. If `result.error != null`, the form displays the error inline within the dialog (dialog stays open). On success: `setPasswordDialogOpen(false)` closes the dialog. No toast. No redirect.
- `onCancel`: `setPasswordDialogOpen(false)` closes the dialog. No state change.
- Background content is inert while the dialog is open.

**Route placeholder block.** Plain centred content inside `<PaceMain>` containing a single line of body text. No card border, no icon, no CTA. Text colour and weight default to pace-core2's body style.

**NotFound block.** Centred content inside `<PaceMain>` with three stacked elements: a 404 heading (h1-equivalent), a single body line ("The page you're looking for doesn't exist."), and a "Go to home" text link routed to `/`.

**`<ErrorBoundaryProvider>`.** The outermost context provider in PUMP-01's stack — it wraps `<QueryClientProvider>` (and therefore everything below it, including `<BrowserRouter>` and the rendered application). Catches uncaught render errors; renders the default error fallback. PUMP-01 supplies `componentName="PumpApp"`.

### States

**Login.**

- **Loading.** Sign-in button disabled with spinner while the auth request is in flight. Form fields remain visible; no other change.
- **Error.** Inline `<Alert>` below the form with the error message. Form remains interactive.
- **Success.** Redirect to `/`.

**Session restoring.** Full-viewport `<SessionRestorationLoader>` spinner with sr-only "Restoring session…" copy.

**Auth / organisation loading.** `<AuthenticatedShell>` renders `<LoadingSpinner />` full-viewport — visually identical to session restoration's spinner.

**Lazy chunk loading.** `<Suspense>` boundary inside the route slot renders `<LoadingSpinner />` full-viewport while the chunk fetches. Header and footer remain visible (the boundary is inside `<PaceMain>`, scoped to the chunk).

**No organisation.** Three-layer chrome rendered. Inside `<PaceMain>`, a centred single-block message: "No organisation assigned. Please contact your administrator." No illustration. No CTA.

**Permission denied (any feature route).** Three-layer chrome rendered. Inside `<PaceMain>`, `<AccessDenied />` renders its default message: "You do not have permission to view this page."

**Inactivity warning.** Full-viewport overlay `<InactivityWarningModal>`. Countdown visible. Primary action "Stay signed in"; secondary "Sign out".

**Change-password dialog open.** Modal overlay above the chrome. Background content inert.

**Top-level render error.** `<ErrorBoundaryProvider>` renders its default error fallback inside `<PaceMain>`. The chrome remains visible.

### Interactions

**Login form.** On submit: button enters loading state (disabled, spinner). On success: redirect to `/`. On failure: button returns to default; inline error `<Alert>` shown.

**Navigation dropdown.** Click the trigger to open the dropdown panel. The panel lists the three `<NavigationGuard>`-wrapped items the current user is permitted to see. Click an item to navigate to its `href` (React Router `<Link>` behaviour) and close the dropdown.

**Organisation context selector.** Provided by `<PaceAppLayout>`. Click to open the org list; choose an organisation to switch context. `<OrganisationServiceProvider>` updates `selectedOrganisation`; `<CommRbacContextProvider>` re-derives.

**User menu — Sign out.** Click "Sign out" in the user menu. `<PaceAppLayout>` invokes `onUserMenuSignOut`, which calls `signOut()` from `useUnifiedAuth()` and then `navigate('/login', { replace: true })`.

**User menu — Change password.** Click "Change password". `<PaceAppLayout>` invokes `onUserMenuChangePassword`, which sets local `passwordDialogOpen` state to `true`. The change-password dialog opens. Form interactions:

- Type into "New password" and "Confirm new password".
- Submit — submit button shows loading state (disabled, spinner) while `updatePassword(newPassword)` is in flight.
  - On success — dialog closes; no toast; no redirect.
  - On error — submit button returns to default; inline error inside the dialog.
- Cancel — dialog closes immediately; no state change.
- Escape key — dialog closes (per `<Dialog>` default).

**Inactivity modal.** "Stay signed in": calls `onStaySignedIn`; modal unmounts; idle timer resets. "Sign out": calls `onSignOutNow`; signs out immediately; `<ProtectedRoute>` re-evaluates and redirects to `/login`. If the modal is shown for the full warn window with no user action, `onIdleLogout` fires automatically.

**NotFound — Go to home.** Click the link → React Router navigation to `/`.

### Permission-conditional rendering

| Condition | Header chrome | Nav item visibility | Route slot content |
|---|---|---|---|
| Not authenticated | Not shown — redirect to `/login` | n/a | n/a |
| Authenticated, no organisation | Shown | All three nav items hidden | No-organisation message |
| Authenticated, has organisation, lacks `read:page.CommsLog` | Shown | Comms log hidden | `/`: `<AccessDenied />` |
| Authenticated, has organisation, lacks `create:page.CommsLog` | Shown | Compose hidden | `/comms/create`: `<AccessDenied />` |
| Authenticated, has organisation, lacks `read:page.CommsTemplates` | Shown | Templates hidden | `/comms/templates`: `<AccessDenied />` |
| Authenticated with all three grants | Shown | All three nav items visible | All route slots render their placeholder (or owner-slice content once landed) |

`update:page.CommsLog` does not gate any nav item or route in PUMP-01; it influences only the `canSend` / `canSchedule` booleans inside `<CommRbacContextProvider>`.

---

## §6 Business rules

**BR-A — Provider stack composition.** The provider order is non-negotiable: `<ErrorBoundaryProvider>` (outermost) → `<QueryClientProvider>` → `<BrowserRouter>` → `<UnifiedAuthProvider>` (configured with `appName=APP_NAME`, `idleTimeoutMs = 30 * 60 * 1000`, `warnBeforeMs = 2 * 60 * 1000`, `onIdleLogout`, `renderInactivityWarning`) → `<AppProviders>` (bridge that resolves `user`/`session`) → `<OrganisationServiceProvider>` → `<App>`. `<ErrorBoundaryProvider>` wraps `<QueryClientProvider>` (not nested inside it) so router-thrown errors below `<BrowserRouter>` are caught while query-client context remains available to the error fallback. `<EventServiceProvider>` is absent.

**BR-B — `APP_NAME = 'PUMP'`.** Single source of truth, declared as `export const APP_NAME = 'PUMP'` in `src/App.tsx`. Imported by `main.tsx` and used by `setupRBAC` and `<UnifiedAuthProvider>`. `<PaceLoginPage>` receives the literal `appName="PUMP"` (not redeclared).

**BR-C — `setupRBAC` ordering.** `setupRBAC(supabaseClient, { appName: APP_NAME })` is invoked at module level in `main.tsx`, before `createRoot(...)`. Not inside a component, hook, or effect. The RBAC engine is initialised before any `<PagePermissionGuard>` evaluates.

**BR-D — Base Supabase client provenance.** Created via `createBaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)` from `@solvera/pace-core`, using `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`. The resulting client is exported from `src/lib/supabase.ts` and consumed by both `<UnifiedAuthProvider>` and `setupRBAC(...)`.

**BR-E — Missing-env fail-fast.** If either `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing or empty at module load, `src/lib/supabase.ts` throws the error: `'Missing Supabase environment variables. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set in your .env file.'` and the app does not boot.

**BR-F — Module-level idle-logout uses raw `auth.signOut()`.** `onIdleLogout` is a module-level callback in `main.tsx`. It cannot use `useUnifiedAuth()` because no hook context is available there. The callback invokes `supabaseClient.auth.signOut()` directly (as a void-wrapped Promise). After sign-out, `<ProtectedRoute>` re-evaluates and redirects the user to `/login`.

**BR-G — `renderInactivityWarning` callback contract.** `<UnifiedAuthProvider>` invokes `renderInactivityWarning({ timeRemaining, onStaySignedIn, onSignOutNow })`. PUMP-01's callback returns `<InactivityWarningModal isOpen timeRemaining={timeRemaining} onStaySignedIn={onStaySignedIn} onSignOutNow={onSignOutNow} />`. `isOpen` is always `true` when the render function is called (the provider mounts/unmounts the modal by calling/not calling the function).

**BR-H — `<ToastProvider>` mount.** `<AuthenticatedShell>` wraps its three render branches (loading, no-organisation, normal) in `<ToastProvider>`. `<Toaster />` is rendered internally by `<ToastProvider>`. `<AuthenticatedShell>` does not mount `<Toaster />` directly. Allowed `variant` values: `'default' | 'destructive' | 'success'`. Default duration 5000 ms. The `/login` route is unauthenticated and outside the provider; toasts are unavailable on `/login`.

**BR-I — `<AuthenticatedShell>` responsibilities (single owner).** All of the following live in `src/components/layout/AuthenticatedShell.tsx` and nowhere else: the `isLoading` spinner check, the no-organisation empty state check, the `<PaceAppLayout>` render with `<Outlet />`, the change-password dialog mount, the `<ToastProvider>` mount, and the `<CommRbacContextProvider>` mount. They are not scattered across `App.tsx`, page components, or `main.tsx`.

**BR-J — Auth-loading branch.** While `useUnifiedAuth().isLoading === true`, `<AuthenticatedShell>` renders `<LoadingSpinner />` covering the full viewport. No other content (no chrome, no `<Outlet />`, no provider, no guard) renders on this branch.

**BR-K — No-organisation branch.** When loading completes with `selectedOrganisation === null`, `<AuthenticatedShell>` renders the message "No organisation assigned. Please contact your administrator." inside `<PaceMain>`. The `<PaceAppLayout>` chrome (header + footer) renders. No `<Outlet />`. No `<PagePermissionGuard>` evaluation. No `<CommRbacContextProvider>` mount. No feature query.

**BR-L — Sign-out flow (user menu).** User menu → `onUserMenuSignOut` → `signOut()` from `useUnifiedAuth()` → `navigate('/login', { replace: true })`. Differs from BR-F (the module-level idle-logout path).

**BR-M — Change-password flow.** User menu → `onUserMenuChangePassword` → `setPasswordDialogOpen(true)`. Dialog renders `<PasswordChangeForm>`. On submit: `updatePassword(newPassword)` from `useUnifiedAuth()` is called; the full result is returned to the form. If `result.error != null`: error displayed inline within the form; dialog stays open. On success: `setPasswordDialogOpen(false)`; no toast; no redirect. On cancel or Escape: `setPasswordDialogOpen(false)`; no state change.

**BR-N — Login page.** `/login` renders `<PaceLoginPage appName="PUMP">`. Default `onSuccessRedirectPath="/"`. `requireAppAccess` not enabled in v1 (no `checkAppAccess` callback). The page renders outside `<AuthenticatedShell>`, `<ProtectedRoute>`, `<ToastProvider>`, and `<CommRbacContextProvider>`.

**BR-O — Auth-then-render gate.** `<ProtectedRoute>` from `@solvera/pace-core/components` wraps the authenticated subtree. While the session is restoring or auth is loading, the route renders the configured `loadingFallback`. If unauthenticated, redirects to `/login` (replace). `requireEvent` is left at its default (`false`) — PUMP routes do not require event scope.

**BR-P — Session restoration window.** `<SessionRestorationLoader>` is mounted as a direct child of `<ProtectedRoute>` and the parent of `<AuthenticatedShell>` in the wrapper chain for every authenticated route (see §3 route table). While `sessionRestoration.isRestoring === true && !hasTimedOut`, the loader renders its own loading UI (centred spinner inside `<main>` with sr-only "Restoring session…") and the `<AuthenticatedShell>` subtree is **not yet mounted** — no chrome, no `<Outlet />`, no `<PagePermissionGuard>` evaluation. After session restoration completes (`isRestoring === false`) or times out (10,000 ms default), the loader unmounts its loading UI and mounts its children — at which point the `<AuthenticatedShell>` subtree mounts. After timeout, content renders with whatever auth state exists. Restoration is not retried.

**BR-Q — `/comms` and `/comms/settings` are unrouted.** No route registration anywhere in the router. Authenticated users hitting either fall through to `*` → NotFound. Unauthenticated users are redirected to `/login` first by `<ProtectedRoute>`.

**BR-R — `*` catch-all renders inside the chrome.** The catch-all `*` route is wrapped in `<ProtectedRoute>` and `<AuthenticatedShell>` so the chrome remains visible. The NotFound page shows: heading "404"; body "The page you're looking for doesn't exist."; "Go to home" link to `/`. The unmatched path is logged via `console.error('[PUMP] Unmatched route:', pathname)`.

**BR-S — Unauthenticated user on unknown path.** Combined consequence of BR-O + BR-R: an unauthenticated user requesting any unknown path is redirected to `/login`, not to the NotFound page.

**BR-T — Lazy-loaded feature routes.** Each feature route component (`/`, `/comms/create`, `/comms/templates`) is loaded via `React.lazy(() => import('...'))`. Each lazy import is rendered inside `<Suspense fallback={<LoadingSpinner />}>` so the chunk-fetch state shows the full-viewport centred spinner.

**BR-U — TanStack Query defaults.** `<QueryClientProvider>` is constructed with `defaultOptions.queries.staleTime = 5 * 60 * 1000`, `gcTime = 10 * 60 * 1000`, `refetchOnWindowFocus = false`, `retry = 1`. PUMP-01 itself does not register any query keys — these defaults apply to downstream slices.

**BR-V — App-level error boundary.** `<ErrorBoundaryProvider>` from `@solvera/pace-core/components` is the outermost context provider in the stack — it wraps `<QueryClientProvider>` (and therefore everything below it: `<BrowserRouter>`, `<UnifiedAuthProvider>`, `<AppProviders>`, `<OrganisationServiceProvider>`, `<App>`). Catches uncaught render errors — including router-thrown errors — and logs via the structured logger (`componentName="PumpApp"`). Renders the default error fallback inside `<PaceMain>`.

**BR-W — Login redirect.** Successful sign-in redirects to `/` (`<PaceLoginPage>` default `onSuccessRedirectPath`). An already-authenticated user navigating to `/login` is redirected to `/` by `<PaceLoginPage>` internals.

**BR-X — Inactivity warning trigger.** When elapsed idle ≥ `idleTimeoutMs − warnBeforeMs` (i.e. ≥ 28 minutes since last activity), `<UnifiedAuthProvider>` invokes `renderInactivityWarning({ timeRemaining, onStaySignedIn, onSignOutNow })`. PUMP-01's callback renders `<InactivityWarningModal>` (BR-G).

**BR-Y — Idle logout redirect.** After `onIdleLogout` fires (BR-F), the user lands on `/login` because `<ProtectedRoute>` re-evaluates and redirects.

**BR-Z — Page-level guard ordering (per route).** For each authenticated feature route: (1) session restoration → (2) auth check (`<ProtectedRoute>`) → (3) auth-loading branch (`<AuthenticatedShell>`) → (4) no-organisation branch — if `selectedOrganisation === null`, the no-org message renders and the guard at step 5 is **never reached** → (5) `<PagePermissionGuard pageName operation>`. The guard resolves scope internally from `<OrganisationServiceProvider>` context — no `scope` prop is passed. While the RBAC check is in flight, the guard returns `null`.

**BR-Z2 — Nav permission gating.** Each `<NavigationItem>` inside the NavigationMenu dropdown is wrapped in `<NavigationGuard permission="...">` with `hideWhenDenied=true` (the default). Permissions:

- Comms log → `read:page.CommsLog`
- Compose → `create:page.CommsLog`
- Templates → `read:page.CommsTemplates`

`<NavigationGuard>` evaluates the permission against the current organisation scope (resolved internally). `<NavigationGuard>` is independent of `<PagePermissionGuard>` — it controls whether the link is visible; the route-level guard still fires when a user navigates by URL.

**BR-AA — `<CommRbacContextProvider>` derivation.** `<CommRbacContextProvider>` is mounted by `<AuthenticatedShell>` inside the normal `<PaceAppLayout>` branch (around `<Outlet />`). Not mounted on the loading or no-organisation branches. The provider derives the `CommRbacContext` once per active organisation:

- `canCompose ← create:page.CommsLog`
- `canSend ← update:page.CommsLog`
- `canSchedule ← update:page.CommsLog`

Re-derivation occurs when the active organisation changes (organisation context selector). Downstream slices consume via `useCommRbacContext()`. If pace-core2 has not yet published `<CommRbacContextProvider>` and `useCommRbacContext` from `@solvera/pace-core/comms` at PUMP-01 build time, PUMP-01 implements the provider inline against `useCan(permission, scope)` from `@solvera/pace-core/rbac`, exposing the same `CommRbacContext` type from `@solvera/pace-core/comms` and the same hook signature.

**BR-BB — `userFullName` and `userEmail` derivation.** `userFullName` is `user?.user_metadata?.full_name` if it is a non-empty string; otherwise `user?.email`; otherwise `'Authenticated user'`. `userEmail` is `user?.email ?? 'No email available'`. `<AuthenticatedShell>` does not pass a raw user object to `<PaceAppLayout>`.

---

## §7 API / Contract

### Public exports

PUMP-01 publishes two cross-slice contracts:

1. **`APP_NAME = 'PUMP'`** — named constant export from `src/App.tsx`. Imported (not redeclared) by `main.tsx` and consumed by `setupRBAC(...)` and `<UnifiedAuthProvider>`. The literal `"PUMP"` is the canonical app key for `rbac_apps.name` and for `<PaceLoginPage appName="PUMP">`.

2. **`CommRbacContext`** — `{ canCompose: boolean; canSend: boolean; canSchedule: boolean }`. Published by the `<CommRbacContextProvider>` mounted inside `<AuthenticatedShell>`. Consumed by descendants via `useCommRbacContext()`. PUMP-05 is the v1 consumer.

### Read contracts

PUMP-01 itself does not read PUMP-domain tables. All reads are internal to pace-core2 providers:

- `<OrganisationServiceProvider>` reads organisation membership data to resolve `selectedOrganisation`. No slice-level query.
- `<PagePermissionGuard>` and `<NavigationGuard>` read RBAC tables via the RBAC engine (`check_rbac_permission_with_context(...)` + `get_app_id('PUMP')`). No slice-level query.
- `<CommRbacContextProvider>` invokes `useCan(permission, scope)` (or its inline equivalent) to resolve `create:page.CommsLog` and `update:page.CommsLog`. No slice-level query.

### Write contracts

PUMP-01 owns two write surfaces, both auth-related:

- **Sign out** — `signOut()` from `useUnifiedAuth()` invoked by `<AuthenticatedShell>` (user menu); `supabaseClient.auth.signOut()` invoked directly by `onIdleLogout` in `main.tsx` (module-level — no hook context). Both clear the Supabase session.
- **Change password** — `updatePassword(newPassword: string)` from `useUnifiedAuth()`. Returns `Promise<{ error?: AuthError }>`. The result is returned to `<PasswordChangeForm>` for inline error display. On success: dialog closes. On error: dialog stays open with the inline message.

There are no PUMP-domain DB writes from PUMP-01.

### RLS / permission contracts

- `/` requires `read:page.CommsLog`.
- `/comms/create` requires `create:page.CommsLog`.
- `/comms/templates` requires `read:page.CommsTemplates`.
- Send / schedule / test-send actions on `/comms/create` require `update:page.CommsLog`. PUMP-01 surfaces the booleans via `<CommRbacContextProvider>` for PUMP-05; the route-level guard for `/comms/create` does **not** require `update`.
- All RBAC checks resolve scope from `<OrganisationServiceProvider>` context — no `scope` prop is passed to `<PagePermissionGuard>`.

### Cross-slice handoffs

- **PUMP-02 ↔ PUMP-01.** PUMP-02 replaces PUMP-01's placeholder content at `/`. The route registration and `<PagePermissionGuard pageName="CommsLog" operation="read">` mount stay with PUMP-01. PUMP-02 does not re-mount the guard.
- **PUMP-04 ↔ PUMP-01.** PUMP-04 replaces PUMP-01's placeholder content at `/comms/templates`. The route registration and `<PagePermissionGuard pageName="CommsTemplates" operation="read">` mount stay with PUMP-01.
- **PUMP-05 ↔ PUMP-01.** PUMP-05 replaces PUMP-01's placeholder content at `/comms/create`. The route registration and `<PagePermissionGuard pageName="CommsLog" operation="create">` mount stay with PUMP-01. PUMP-05 also consumes `CommRbacContext` via `useCommRbacContext()` from inside the chrome.
- PUMP-01 does not hand off to PUMP-06 (Edge / webhook ingestion is out of UI scope).

### ID contracts

PUMP-01 does not expose or consume typed entity IDs. Organisation IDs are handled internally by `<OrganisationServiceProvider>` and by `<PagePermissionGuard>` scope resolution.

---

## §8 Data and schema references

### Tables accessed (via pace-core2 providers)

| Table | Access | Via |
|---|---|---|
| `core_organisations` | Read | `<OrganisationServiceProvider>` |
| `rbac_apps` | Read | RBAC engine (initialised by `setupRBAC`) |
| `rbac_app_pages` | Read | RBAC engine (`<PagePermissionGuard>`, `<NavigationGuard>`, `useCan`) |
| RBAC role / grant tables | Read | RBAC engine (permission resolution) |

PUMP-01 makes no PUMP-domain table reads or writes.

### RPCs invoked (via pace-core2 RBAC engine)

- `check_rbac_permission_with_context(p_permission, p_page_name, p_organisation_id, p_event_id, p_app_id)` — invoked by `<PagePermissionGuard>`, `<NavigationGuard>`, and `useCan` for permission checks.
- `get_app_id('PUMP')` — invoked by the RBAC engine to resolve the app ID at first use.

### Dev-db verification (project: `rkytnffgmwnnmewevqgp`)

1. Confirm `rbac_apps` row: `name = 'PUMP'`, `is_active = true`.
2. Confirm `rbac_app_pages` rows exist for `(app = 'PUMP', page_name IN ('CommsLog', 'CommsTemplates'))`.
3. Note (informational): `CreateComms` and `CommsSettings` rows persist on dev-db but PUMP-01 does **not** consume them. Cleanup is platform-team work, not a PUMP-01 build action.

### Domain references

- Architecture doc § "RBAC model (PUMP management app)" — page model + `CommRbacContext` derivation chain.
- Architecture doc § "Information architecture — home (`/`)" — operator-first home framing; `/` owned by PUMP-02; `/comms` not registered.
- Architecture doc § "Route access mapping (v1)" — page guard mapping for `/`, `/comms/create`, `/comms/templates`.
- pace-core2 standards: [`docs/product-delivery-lifecycle.md`](../../product-delivery-lifecycle.md) § "RBAC API usage contract" for guard prop conventions.

---

## §9 pace-core2 imports

### §9.1 Imports table

| Symbol | Import path | One-line why |
|--------|-------------|--------------|
| `UnifiedAuthProvider` | `@solvera/pace-core` | Root auth provider; idle config entry point |
| `createBaseClient` | `@solvera/pace-core` | Constructs the Supabase client used by auth + RBAC |
| `setupRBAC` | `@solvera/pace-core/rbac` | Module-level RBAC engine init in `main.tsx` |
| `PagePermissionGuard` | `@solvera/pace-core/rbac` | Page-level RBAC guard wired on `/`, `/comms/create`, `/comms/templates` |
| `NavigationGuard` | `@solvera/pace-core/rbac` | Hides each header nav item when the user lacks the gating page grant |
| `AccessDenied` | `@solvera/pace-core/rbac` | Default `<PagePermissionGuard>` fallback when permission is denied |
| `useCan` | `@solvera/pace-core/rbac` | Used by `<CommRbacContextProvider>` (inline implementation path) to derive `canCompose` / `canSend` / `canSchedule` from page grants |
| `OrganisationServiceProvider` | `@solvera/pace-core/providers` | Organisation context provider; requires explicit `user` + `session` props |
| `useUnifiedAuthContext` | `@solvera/pace-core/providers` | Called inside `AppProviders` bridge to extract `user` + `session` |
| `useUnifiedAuth` | `@solvera/pace-core/hooks` | Auth + organisation context in `<AuthenticatedShell>`; provides `isLoading`, `user`, `selectedOrganisation`, `signOut`, `updatePassword` |
| `PaceLoginPage` | `@solvera/pace-core/components` | `/login` surface |
| `PaceAppLayout` | `@solvera/pace-core/components` | App chrome (header, PaceMain, footer) |
| `NavigationItem` | `@solvera/pace-core/components` | Type for the `navItems` array |
| `ProtectedRoute` | `@solvera/pace-core/components` | Redirects unauthenticated users to `/login`; wraps the authenticated subtree |
| `SessionRestorationLoader` | `@solvera/pace-core/components` | Loading state during Supabase session restoration |
| `LoadingSpinner` | `@solvera/pace-core/components` | Full-viewport spinner used by `<AuthenticatedShell>` and lazy `<Suspense>` fallbacks |
| `InactivityWarningModal` | `@solvera/pace-core/components` | Rendered by `renderInactivityWarning` callback in `main.tsx` |
| `PasswordChangeForm` | `@solvera/pace-core/components` | Body of the change-password dialog |
| `Dialog` | `@solvera/pace-core/components` | Change-password dialog root |
| `DialogContent` | `@solvera/pace-core/components` | Change-password dialog content panel |
| `DialogHeader` | `@solvera/pace-core/components` | Change-password dialog header |
| `DialogTitle` | `@solvera/pace-core/components` | Change-password dialog title ("Change password") |
| `DialogBody` | `@solvera/pace-core/components` | Change-password dialog body wrapper |
| `ToastProvider` | `@solvera/pace-core/components` | Mounted by `<AuthenticatedShell>`; renders `<Toaster />` internally |
| `toast` | `@solvera/pace-core/components` | Module-level `(props) => string`; descendants of `<AuthenticatedShell>` may call. Variants: `'default' \| 'destructive' \| 'success'` |
| `ErrorBoundaryProvider` | `@solvera/pace-core/components` | Catches uncaught render errors below `<QueryClientProvider>` |
| `CommRbacContext` (type) | `@solvera/pace-core/comms` | Type of the value published by `<CommRbacContextProvider>` |
| `CommRbacContextProvider` | `@solvera/pace-core/comms` | **[verify export at build time; inline-implementation fallback in §9.2 / §14 / §17 if not yet published by pace-core2]** Mounted inside `<AuthenticatedShell>` |
| `useCommRbacContext` | `@solvera/pace-core/comms` | **[verify export at build time; inline-implementation fallback in §9.2 / §14 / §17 if not yet published by pace-core2]** Downstream consumption hook |
| `Mail` | `lucide-react` | Icon for the "Comms log" nav item |
| `MessageSquare` | `lucide-react` | Icon for the "Compose" nav item |
| `FileText` | `lucide-react` | Icon for the "Templates" nav item |

### §9.2 Slice-specific caveats

**`<OrganisationServiceProvider>` wiring.** The provider does not consume `<UnifiedAuthProvider>` context internally — it requires `user` and `session` as explicit props. The internal `AppProviders` bridge component, defined inline in `main.tsx` and not exported, calls `useUnifiedAuthContext()` and forwards the values. `<AppProviders>` is placed as the immediate child of `<UnifiedAuthProvider>` and the immediate parent of `<OrganisationServiceProvider>`.

**`onIdleLogout`.** Module-level callback in `main.tsx`. Hooks are unavailable here. Invoke `supabaseClient.auth.signOut()` directly (as a void-wrapped Promise). Do not attempt to call a `signOut` function from a hook.

**`renderInactivityWarning`.** The provider invokes the callback with `{ timeRemaining, onStaySignedIn, onSignOutNow }`. Return `<InactivityWarningModal isOpen timeRemaining={timeRemaining} onStaySignedIn={onStaySignedIn} onSignOutNow={onSignOutNow} />`. `isOpen` is always `true` when the function is called; the provider mounts/unmounts the modal by calling/not calling the function.

**`<AuthenticatedShell>` is the single owner.** All of: the auth-loading guard, no-organisation guard, `<PaceAppLayout>` render with `<Outlet />`, change-password dialog, `<ToastProvider>` mount, and `<CommRbacContextProvider>` mount live in `src/components/layout/AuthenticatedShell.tsx` and nowhere else.

**`<ToastProvider>` placement.** `<ToastProvider>` is the outermost element returned by `<AuthenticatedShell>`, wrapping the loading branch, the no-organisation branch, and the normal `<PaceAppLayout>` branch alike. `<ToastProvider>` renders `<Toaster />` internally — `<AuthenticatedShell>` does not mount `<Toaster />` directly. Toasts are unavailable on `/login` (which is outside `<AuthenticatedShell>`).

**`<CommRbacContextProvider>` placement.** `<CommRbacContextProvider>` is mounted inside the normal `<PaceAppLayout>` branch only — descendants of the loading branch or no-organisation branch cannot call `useCommRbacContext()`. PUMP-05 mounts inside the chrome via the `<Outlet />`, so this is the correct scope.

**`<CommRbacContextProvider>` resolution path.** Verify the export at PUMP-01 authoring/build time. If `@solvera/pace-core/comms` publishes `<CommRbacContextProvider>` and `useCommRbacContext`, import them. If pace-core2 has not yet published the provider, implement it inline in `src/components/comms/CommRbacContextProvider.tsx`: derive `canCompose` from `useCan('create:page.CommsLog', { organisationId })`, `canSend` and `canSchedule` from `useCan('update:page.CommsLog', { organisationId })`, expose the value as `CommRbacContext` (type imported from `@solvera/pace-core/comms`), and publish a local `useCommRbacContext()` hook with the same signature so PUMP-05's import surface does not change when pace-core2 promotes the provider.

**`userFullName` derivation.** Read `user` from `useUnifiedAuth()`. `userFullName` is `user?.user_metadata?.full_name` if it is a non-empty string; otherwise `user?.email`; otherwise `'Authenticated user'`. Do not pass a raw user object to `<PaceAppLayout>`.

**`onUserMenuSignOut`.** Call `signOut()` from `useUnifiedAuth()` (hook-based, inside `<AuthenticatedShell>`), then `navigate('/login', { replace: true })`. This differs from `onIdleLogout` in `main.tsx` (BR-F) which uses `supabaseClient.auth.signOut()` directly because hooks are unavailable there.

**`updatePassword`.** Returned by `useUnifiedAuth()`. Signature: `(newPassword: string) => Promise<{ error?: AuthError }>`. Return the full result object to `<PasswordChangeForm>`'s submit handler — do not swallow errors.

**Lazy route boundaries.** Each of `/`, `/comms/create`, `/comms/templates` is loaded via `React.lazy(...)`; each lazy component is wrapped in `<Suspense fallback={<LoadingSpinner />}>`. Do not collapse the three boundaries into a single outer `<Suspense>` — owner slices may set their own loading semantics inside their content.

**Sub-path import resolution.** Verify that `@solvera/pace-core`, `@solvera/pace-core/components`, `/providers`, `/rbac`, `/hooks`, and `/comms` resolve correctly during `npm run validate`. If any sub-path fails to resolve, escalate before proceeding — do not fall back to root barrel imports or to `packages/core/src/*` paths.

---

## §10 Permission and access rules

### Page-level guards (mounted by PUMP-01)

| Route | `pageName` | `operation` | Fallback |
|---|---|---|---|
| `/` | `CommsLog` | `read` | `<AccessDenied />` (default) |
| `/comms/create` | `CommsLog` | `create` | `<AccessDenied />` (default) |
| `/comms/templates` | `CommsTemplates` | `read` | `<AccessDenied />` (default) |

`/login` and `*` are not gated by `<PagePermissionGuard>`. `/login` is fully unauthenticated. `*` (NotFound) is wrapped only by `<ProtectedRoute>` and renders inside `<AuthenticatedShell>`; any authenticated user can see NotFound.

### Nav-level guards (mounted by PUMP-01)

| Nav item | Permission | Behaviour |
|---|---|---|
| Comms log | `read:page.CommsLog` | Hidden when denied |
| Compose | `create:page.CommsLog` | Hidden when denied |
| Templates | `read:page.CommsTemplates` | Hidden when denied |

`<NavigationGuard>` `hideWhenDenied` defaults to `true`. No `disableWhenDenied` is set.

### Action-level (used by `<CommRbacContextProvider>`)

The provider derives:

- `canCompose` from `create:page.CommsLog`.
- `canSend` from `update:page.CommsLog`.
- `canSchedule` from `update:page.CommsLog`.

These booleans are consumed downstream by PUMP-05 — they do not gate any PUMP-01 surface.

### Access rules (general)

- `<PagePermissionGuard>` resolves scope internally from `<OrganisationServiceProvider>` context. No `scope` prop is passed.
- `<NavigationGuard>` resolves scope internally; no `scope` prop is passed.
- A user must be authenticated before any guard fires (`<ProtectedRoute>` fires first).
- A user must have organisation context before any guard fires (no-organisation branch fires before the page guard; see §3 evaluation ordering).
- Users denied a page grant see `<AccessDenied />` inside `<PaceMain>`; the chrome remains visible.
- `update:page.CommsLog` is consumed only by `<CommRbacContextProvider>` (it influences `canSend` / `canSchedule`); it does not gate any nav item or route in PUMP-01.

---

## §11 Acceptance criteria

**AC-01 — Unauthenticated redirect.** Given a user is not authenticated, when they navigate to `/`, then they are redirected to `/login` and no PUMP authenticated content is visible.

**AC-02 — Successful login.** Given a user on `/login` enters valid credentials, when they submit the sign-in form, then they are authenticated and redirected to `/`.

**AC-03 — Login error — invalid credentials.** Given a user on `/login` enters invalid credentials, when they submit the sign-in form, then an inline error alert is displayed below the form and no redirect occurs.

**AC-04 — Authenticated user with organisation lands at `/`.** Given a user is authenticated and has at least one organisation membership, when they navigate to `/`, then `<AuthenticatedShell>` renders the chrome and the `/` route slot renders the placeholder block "Communications log — coming in PUMP-02." inside `<PaceMain>`.

**AC-05 — No organisation assigned.** Given a user is authenticated but has no organisation membership, when they navigate to any authenticated route, then `<AuthenticatedShell>` renders the chrome and the message "No organisation assigned. Please contact your administrator." inside `<PaceMain>`. No feature content, no nav items, and no `<PagePermissionGuard>` evaluation occurs.

**AC-06 — Permission denied on `/`.** Given a user is authenticated with an organisation but lacks `read:page.CommsLog`, when they navigate to `/`, then `<AccessDenied />` is rendered inside `<PaceMain>` and the header and footer remain visible.

**AC-07 — Permission denied on `/comms/create`.** Given a user is authenticated with an organisation but lacks `create:page.CommsLog`, when they navigate to `/comms/create`, then `<AccessDenied />` is rendered inside `<PaceMain>`.

**AC-08 — Permission denied on `/comms/templates`.** Given a user is authenticated with an organisation but lacks `read:page.CommsTemplates`, when they navigate to `/comms/templates`, then `<AccessDenied />` is rendered inside `<PaceMain>`.

**AC-09 — Nav item hidden when permission missing.** Given a user is authenticated with an organisation and lacks `read:page.CommsTemplates`, when they open the NavigationMenu dropdown, then the "Templates" item is not rendered, and only the items whose grants the user holds are visible.

**AC-10 — `/comms` is unrouted.** Given an authenticated user navigates to `/comms`, then the `*` catch-all renders the NotFound page inside the chrome with no redirect.

**AC-11 — `/comms/settings` is unrouted.** Given an authenticated user navigates to `/comms/settings`, then the `*` catch-all renders the NotFound page inside the chrome with no redirect.

**AC-12 — NotFound copy.** Given a user navigates to an unmatched path inside the authenticated shell, when the NotFound page renders, then the heading shows "404", the body shows "The page you're looking for doesn't exist.", and a "Go to home" link points to `/`.

**AC-13 — Session restoration.** Given a user has a valid Supabase session token, when the app loads, then `<SessionRestorationLoader>` shows a centred spinner with sr-only "Restoring session…" text until restoration completes, after which the user lands inside the chrome without re-entering credentials.

**AC-14 — Inactivity warning appears.** Given a user has been idle for 28 minutes (30-minute timeout minus 2-minute warning), when the idle timer fires, then `<InactivityWarningModal>` is shown as an overlay with a visible countdown in seconds.

**AC-15 — Stay signed in.** Given `<InactivityWarningModal>` is showing, when the user clicks "Stay signed in", then the modal closes, the idle timer resets, and the session continues.

**AC-16 — Idle logout.** Given `<InactivityWarningModal>` is showing and the user takes no action for 2 minutes, when the warn window expires, then the user is signed out and redirected to `/login`.

**AC-17 — Catch-all for unbuilt slice.** Given a user navigates to a route slot whose owner slice has not yet replaced the placeholder (e.g. `/comms/templates` before PUMP-04 ships), when they arrive (and they hold the page grant), then the placeholder block ("Templates — coming in PUMP-04.") renders inside `<PaceMain>` without an unhandled error.

**AC-18 — Sign out.** Given a user is authenticated, when they sign out via the user menu, then their Supabase session is cleared and they are redirected to `/login` with `replace: true`.

**AC-19 — Change password — success.** Given a user is authenticated and opens the change-password dialog via the user menu, when they submit a valid new password, then `updatePassword(newPassword)` resolves with no error, the dialog closes, and there is no toast or redirect.

**AC-20 — Change password — error.** Given a user is authenticated and opens the change-password dialog, when they submit a new password that fails validation, then an inline error message is displayed within the form and the dialog remains open.

**AC-21 — Toast available from any authenticated route.** Given a user is authenticated and inside `<AuthenticatedShell>`, when any descendant component calls `toast({ title, description, variant })` from `@solvera/pace-core/components`, then a notification renders as an overlay anchored to the bottom-right of the viewport without throwing a "must be called within a ToastProvider" error, and auto-dismisses after the configured `duration` (default 5000 ms).

**AC-22 — `CommRbacContext` resolves for descendants.** Given a user is authenticated with an organisation and holds `create:page.CommsLog` and `update:page.CommsLog`, when a descendant of `<AuthenticatedShell>` calls `useCommRbacContext()`, then it returns `{ canCompose: true, canSend: true, canSchedule: true }` without throwing.

**AC-23 — `CommRbacContext` denies when grants are missing.** Given a user is authenticated with an organisation but lacks `create:page.CommsLog` and `update:page.CommsLog`, when a descendant of `<AuthenticatedShell>` calls `useCommRbacContext()`, then it returns `{ canCompose: false, canSend: false, canSchedule: false }`.

**AC-24 — `npm run validate` passes.** Given the PUMP-01 implementation is complete, when `npm run validate` runs, then it exits with code 0 with no TypeScript errors and no lint errors, and every `@solvera/pace-core` sub-path resolves.

---

## §12 Verification

- Confirm `setupRBAC(supabaseClient, { appName: APP_NAME })` appears at module level in `main.tsx`, not inside a component, hook, or effect.
- Confirm `APP_NAME` is exported from `src/App.tsx` and imported (not redeclared) in `main.tsx`. Confirm `src/config/appConfig.ts` does not exist (or, if removed, the change is committed).
- Confirm `<AppProviders>` bridge calls `useUnifiedAuthContext()` and passes `user` and `session` to `<OrganisationServiceProvider>` as explicit props.
- Confirm `<AuthenticatedShell>` is implemented as a React Router layout route (renders `<Outlet />`) at `src/components/layout/AuthenticatedShell.tsx`.
- Confirm `<AuthenticatedShell>` checks `isLoading` first (renders `<LoadingSpinner />`), then checks `selectedOrganisation === null` (renders no-organisation message), before rendering `<PaceAppLayout>`.
- Confirm `<ToastProvider>` is the outermost element returned by `<AuthenticatedShell>` and wraps all three branches.
- Confirm `<CommRbacContextProvider>` is mounted inside the normal `<PaceAppLayout>` branch only.
- Confirm change-password dialog is defined inside `<AuthenticatedShell>` and wired to `onUserMenuChangePassword`.
- Confirm `<EventServiceProvider>` is absent from the provider stack.
- Confirm the three nav items appear in this order in the dropdown: Comms log, Compose, Templates. Each is wrapped in `<NavigationGuard>` with the correct permission string.
- Confirm `/comms` and `/comms/settings` are not registered anywhere in the router; navigating to either falls through to `*` (NotFound) for authenticated users.
- Manual QA — confirm `/logos/pump_logo_square.svg` exists in the `/public/logos/` directory. If absent, note as a known asset gap and raise with the platform team — do not block the build on this.
- Sign in and confirm `<PaceLoginPage>` renders with the PUMP logo, the "Sign in to PUMP" heading, the email + password fields, and the Sign-in button.
- Sign out via the user menu and confirm redirect to `/login`.
- Open the change-password dialog from the user menu, submit, and confirm dialog-close behaviour.
- Trigger inactivity by simulated idle and confirm `<InactivityWarningModal>` appears at the 28-minute mark.
- Against dev-db (`rkytnffgmwnnmewevqgp`):
  - Confirm `rbac_apps` row `name = 'PUMP'`, `is_active = true`.
  - Confirm `rbac_app_pages` rows for `(app = 'PUMP', page_name IN ('CommsLog', 'CommsTemplates'))`.
  - Note: `CreateComms` and `CommsSettings` may also exist on dev-db; PUMP-01 does not consume them.

---

## §13 Testing requirements

n/a — standard PDLC quality gates apply.

---

## §14 Build execution rules

- `APP_NAME` must be declared as `export const APP_NAME = 'PUMP'` in `src/App.tsx`. Import it in `main.tsx`. Do not redeclare it elsewhere. Remove `src/config/appConfig.ts` if present in the working tree at build time.
- `setupRBAC` must be called at module level in `main.tsx`, before `createRoot(...)`. Not inside a component, hook, or effect.
- `<AppProviders>` bridge is defined inline in `main.tsx`. Do not create a separate file for it. Do not export it.
- `<AuthenticatedShell>` is created at `src/components/layout/AuthenticatedShell.tsx`. It is used as a React Router layout route (renders `<Outlet />`). It is the only component that checks `isLoading`, the no-organisation state, hosts the change-password dialog, mounts `<ToastProvider>`, and mounts `<CommRbacContextProvider>`. Do not implement any of these checks in `App.tsx`, individual page components, or `main.tsx`.
- The `AppProviders` component wires the provider stack only — do not put auth-loading checks, no-org checks, or chrome rendering inside `AppProviders`. Those live in `<AuthenticatedShell>`.
- Do not add `<EventServiceProvider>` — PUMP is organisation-scoped.
- Do not pass a `scope` prop to `<PagePermissionGuard>` or `<NavigationGuard>`.
- Do not use `useCan` for page-level route protection — `<PagePermissionGuard>` only.
- Do not import from internal `packages/core/src/*` paths — use published sub-paths only.
- If `<CommRbacContextProvider>` and `useCommRbacContext` are not yet exported by `@solvera/pace-core/comms` at PUMP-01 build time, implement them locally per §9.2 caveat. Do not block PUMP-01 on the export — the inline implementation is the documented fallback.

---

## §15 Done criteria

- All 24 acceptance criteria (AC-01 through AC-24) verified.
- `@solvera/pace-core` sub-path imports (`/`, `/components`, `/providers`, `/rbac`, `/hooks`, `/comms`) confirmed resolving in `npm run validate` output.
- `<CommRbacContextProvider>` resolution path documented in the build queue: which path was taken (pace-core2 published or local inline implementation) and the date.
- Post-build RBAC seeding reminder documented in the QA pack: confirm `rbac_apps('PUMP')` and `rbac_app_pages` rows for `CommsLog` and `CommsTemplates`.

---

## §16 Do not

- Do not register `/comms` or `/comms/settings` in the router. Both fall through to `*` NotFound. There is no redirect.
- Do not re-mount route-level `<PagePermissionGuard>` in downstream owner-slice content. PUMP-01 owns the route-table guard mount surface; PUMP-02, PUMP-04, and PUMP-05 replace placeholder content only.
- Do not import `<TooltipProvider>` from any `@solvera/pace-core/*` subpath — pace-core2 does not publish a Tooltip primitive in the snapshot dated 2026-05-07. Do not introduce app-local Tooltip primitives inside PUMP-01; surface any future tooltip need as a pace-core2 capability gap.
- Do not add `<EventServiceProvider>` to the provider stack.
- Do not add a sender-identity, gateway, or org-comms-defaults UI to the PUMP shell. None of those surfaces exist in v1.
- Do not introduce an app-local stand-in for `@solvera/pace-core/comms` symbols other than the documented `<CommRbacContextProvider>` fallback in §9.2. The shared composer surface stays in pace-core2.
- Do not wire feature-domain queries, mutations, or business behaviour into PUMP-01. The slice contains placeholder blocks only.
- Do not import from internal `packages/core/src/*` paths — use published sub-paths only.
- Do not introduce a local `useAppName()` hook or `AppNameContext`. Components import the `APP_NAME` constant from `src/App.tsx` directly.
- Do not use `useCan` at the route level — `<PagePermissionGuard>` is canonical.
- Do not pass a `scope` prop to `<PagePermissionGuard>` or `<NavigationGuard>`.

---

## §17 References

- [`pump-project-brief.md`](./pump-project-brief.md) — scope boundaries, admin-only mandate, exclusions.
- [`pump-architecture.md`](./pump-architecture.md) — provider stack, route-access mapping (v1), RBAC model (PUMP management app), home-IA framing, orchestration metadata, and slice dependency map.
- [`pump-feature-list.md`](./pump-feature-list.md) — derived feature inventory (traceability).
- [`pump-user-stories.md`](./pump-user-stories.md) — derived user stories (traceability).
- [`../../database/decisions/DB-change-decisions-p4.md`](../../database/decisions/DB-change-decisions-p4.md) — p4 target schema/RLS (DB-404–DB-411); verify live dev-db via Supabase MCP before build.
- [`../../database/domains/pump.md`](../../database/domains/pump.md) — pump domain tables, RPC, and tenancy notes.
- [`../../../packages/core/docs/requirements/CR23-comms-platform.md`](../../../packages/core/docs/requirements/CR23-comms-platform.md) — `@solvera/pace-core/comms` export map, Edge contracts, RBAC alignment.
- [`../../product-delivery-lifecycle.md`](../../product-delivery-lifecycle.md) § "RBAC API usage contract" — guard prop conventions (no `scope` prop on `<PagePermissionGuard>`; `<NavigationGuard>` takes a single permission string; `useCan` takes a concatenated permission string).
- [`../../AGENT-RULES.md`](../../AGENT-RULES.md) — generic agent contract.
- Sibling slices:
  - **PUMP-02** — replaces PUMP-01's `/` placeholder. Communications log content; consumes `read:page.CommsLog`.
  - **PUMP-04** — replaces PUMP-01's `/comms/templates` placeholder. Templates CRUD; consumes `CommsTemplates` page grants.
  - **PUMP-05** — replaces PUMP-01's `/comms/create` placeholder. Compose surface; consumes `CommRbacContext` from PUMP-01 via `useCommRbacContext()`.
  - **PUMP-06** — Edge / webhook ingestion; not consumed by PUMP-01.
- **Outstanding gates / known gaps:**
  - **pace-core2 capability gap — no Tooltip primitive published.** PUMP-01 ships without an app-level `<TooltipProvider>`. Downstream slices that require hover-tooltips must surface this as a follow-up capability gap rather than introducing app-local primitives. (Source: orchestrator-verified during PUMP-01 audit, 2026-05-07 — zero `tooltip` matches in `../../../packages/core/src/`; no `Tooltip.tsx`; no export in `components/index.ts`.)
  - **`/logos/pump_logo_square.svg` asset.** Asset existence is a known platform follow-up. PUMP-01 does not block the build on the asset; §12 manual QA records the check.
  - **`<CommRbacContextProvider>` export availability.** Verify at PUMP-01 build time whether `@solvera/pace-core/comms` publishes `<CommRbacContextProvider>` and `useCommRbacContext`. If not, PUMP-01 ships the inline implementation per §9.2 and §14; raise the publication need as a pace-core2 backlog item so the inline implementation can be retired in a future iteration.
  - **CR23 PUMP Edge functions deployment.** Out of scope for PUMP-01 (PUMP-05 / PUMP-06 carry the gate). Listed for cross-slice context.

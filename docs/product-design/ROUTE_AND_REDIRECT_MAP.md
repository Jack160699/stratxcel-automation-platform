# Route & Redirect Map

Design documentation only. No routes are created or moved by this document. Existing routes are listed exactly as found in `app/**/page.tsx` and `app/**/layout.tsx`; proposed routes are marked **(new)**.

## 1. Full route table

### Public (`stratxcel.in`)

| Route | Status | Notes |
|---|---|---|
| `/` | exists (`app/page.tsx`) | Home — currently the WebGL "journey" experience |
| `/pricing` | exists | |
| `/modules` | exists | → renamed in IA to "Products," route can stay or 301, see migration plan |
| `/use-cases` | exists | → "Solutions" in new IA |
| `/social-autopilot` | exists | Product detail page for the first product |
| `/agents` | exists | |
| `/system` | exists | Purpose unclear from routing alone — inventory in migration plan |
| `/contact` | exists | |
| `/privacy`, `/terms`, `/data-deletion` | exist | Legal, unchanged |
| `/security` **(new)** | new | Security & Trust, required by IA §Public Website |
| `/about` **(new)** | new | |
| `/how-it-works` **(new)** | new | |
| `/work` **(new)** | new | Results/case studies |
| `/signup` **(new)** | new | Distinct from onboarding — account creation only |
| `/login` **(new)** | new | Single login entry point for both client and staff identities (role resolved post-auth, see §3) |
| `/forgot-password`, `/reset-password` **(new)** | new | Public-side reset request; distinct from `app/admin/reset-password/page.tsx` which is staff-scoped today |
| `/invite/{token}` **(new)** | new | Invitation acceptance landing (public — the invitee may not have an account yet) |

### Client workspace (`/app`) — entirely new

| Route | Purpose |
|---|---|
| `/app/onboarding` | 6-step flow, see `AUTH_AND_ONBOARDING_FLOW.md` |
| `/app` | Command Center (tenant-scoped) |
| `/app/copilot` | |
| `/app/missions`, `/app/missions/{id}` | |
| `/app/approvals`, `/app/approvals/{id}` | |
| `/app/content`, `/app/content/studio`, `/app/content/calendar`, `/app/content/pipeline` | |
| `/app/inbox` | Social inbox |
| `/app/analytics` | Content analytics |
| `/app/automations` | |
| `/app/brand` | |
| `/app/website` | Website & SEO |
| `/app/ads` | |
| `/app/crm`, `/app/crm/{leadId}` | |
| `/app/conversations` | |
| `/app/files`, `/app/files/{artifactId}` | |
| `/app/reports` | |
| `/app/integrations` | |
| `/app/billing` | |
| `/app/team` | |
| `/app/settings` | |
| `/app/switch` **(server action, not a page)** | mirrors `app/admin/(shell)/tenant-actions.ts`'s existing pattern for tenant switching |

Full per-page spec: `CLIENT_APP_INFORMATION_ARCHITECTURE.md` and `PAGE_BY_PAGE_SPECIFICATIONS.md`.

### Internal admin (`/admin`)

| Route | Status |
|---|---|
| `/admin` | exists (`app/admin/(shell)/page.tsx`) — becomes "Agency Overview" |
| `/admin/clients`, `/admin/clients/{id}` | new (renamed/expanded from today's `platform/tenants`) |
| `/admin/missions` | new — "All Missions" (agency-wide, vs. tenant-scoped `/app/missions`) |
| `/admin/queue` | exists as `platform/queue`, renamed |
| `/admin/approvals` | exists as `platform/approvals`, renamed |
| `/admin/handoffs` | new — "Human Handoffs" |
| `/admin/leads` | new |
| `/admin/finance` | new — supersedes `platform/wallet` at the agency level |
| `/admin/team` | new |
| `/admin/integrations` | new (WhatsApp today lives at `platform/whatsapp`, folds in here) |
| `/admin/system` | new — "System Health" |
| `/admin/audit` | new — "Audit Log" |
| `/admin/social/*` | exists, unchanged in this phase — see migration plan for how/when it folds in |

## 2. Cookies and session state already in play

- `stratxcel_active_tenant` (`ACTIVE_TENANT_COOKIE`, `lib/tenants/current-tenant.ts`) — already exists, already httpOnly/sameSite=lax/secure-in-prod, already membership-verified on every read. This is the mechanism `/app`'s active-tenant resolution reuses unchanged.
- Staff session is whatever Supabase auth session already backs `requireOwnerContext()` — no new cookie needed for identity, only the presentational "staff-context" flag described in `ROLE_AND_PERMISSION_EXPERIENCE.md` §6, which should be a short-lived, server-derived indicator (e.g. a route segment like `/admin/clients/{id}/workspace` proxying into `/app`, rather than a client-settable cookie) — implementation detail for engineering, not decided here.

## 3. Redirect decision table

Evaluated in order, top match wins, on every authenticated entry to `/`, `/app`, `/app/*`, `/admin`, `/admin/*`, and immediately post-login:

| # | Condition | Destination |
|---|---|---|
| 1 | No session | Public site (no redirect away from public pages) |
| 2 | Session, has `stratxcel_admins` row | `/admin` |
| 3 | Session, no admin row, has a pending invite (see §5 of `ROLE_AND_PERMISSION_EXPERIENCE.md` on schema caveat) | `/invite/{token}` (if arriving with a token) or `/app/accept-invite` (if arriving without one, e.g. re-login) |
| 4 | Session, no admin row, 0 `tenant_members` rows | `/app/onboarding` |
| 5 | Session, no admin row, ≥1 `tenant_members` row | `/app` — active tenant from `stratxcel_active_tenant` cookie if valid, else the first membership, exactly like `resolveCurrentTenant()` already does for `/admin`'s tenant switcher today |

Direct navigation exceptions:
- A client session hitting `/admin/*` → treated as not-found, never a permission-denied page (see `ROLE_AND_PERMISSION_EXPERIENCE.md` §4).
- A staff-only session (no tenant membership, not in staff-context view) hitting `/app/*` directly → redirected to `/admin` with no error messaging; staff only ever reach `/app` through the explicit "View client workspace" action.
- Logged-out visit to any `/app/*` or `/admin/*` URL → redirected to `/login?next={originalPath}`, and post-login the redirect table above still governs where they actually land (a client bookmarking a deep `/app/crm/{leadId}` link while logged out gets sent back to that link only if their resolved identity is allowed there; otherwise the table wins).

## 4. What existing code this maps onto

This redirect table is a superset of what `app/admin/(shell)/layout.tsx` already does (`requireOwnerContext()` → `AdminLogin` fallback → tenant resolution). The design intent is that the **staff/client split becomes a new, earlier gate**, before today's tenant-context logic runs at all — today's logic becomes the `/app`-only half of a bigger decision tree. This is described here as the target design; the actual `middleware.ts`/root-layout refactor to implement it is implementation work tracked in `IMPLEMENTATION_PHASES.md`, not part of this pass.

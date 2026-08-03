# Internal Admin Information Architecture — `/admin`

Design documentation only. `/admin` already exists (`app/admin/(shell)/*`) and already has a real, running Command Center, tenant switcher, missions/approvals/wallet/queue/whatsapp/tenants pages (all fixed for the service-role defect earlier in this branch). This document re-scopes and re-skins that existing surface to the approved design system and the agency-wide framing the brief asks for — it is not a rebuild.

## 1. Nav groups

**Overview**
- Agency Overview (`/admin`) — replaces today's per-tenant Command Center framing with an agency-wide one; see §2.

**Clients**
- Clients (`/admin/clients`) — supersedes today's `platform/tenants`
- Client detail (`/admin/clients/{id}`)

**Operations**
- All Missions (`/admin/missions`) — agency-wide, every tenant, vs. `/app/missions` which is always one tenant
- Operations Queue (`/admin/queue`) — supersedes `platform/queue`
- Approvals (`/admin/approvals`) — supersedes `platform/approvals`, agency-wide view (every tenant's pending approvals, filterable by client) vs. `/app/approvals` (one tenant only)
- Human Handoffs (`/admin/handoffs`) — new; the `human_handoff:assign`/`:resolve` permissions already exist in the role model but no dedicated admin surface was found for them

**Growth ops**
- Leads (`/admin/leads`) — agency's own pipeline (prospective clients), not to be confused with a client's own `/app/crm`

**Business**
- Finance (`/admin/finance`) — supersedes `platform/wallet`, agency-wide (every tenant's wallet/spend), not one tenant's balance
- Team (`/admin/team`) — Stratxcel's own staff roster and `stratxcel_admins` management

**Platform**
- Integrations (`/admin/integrations`) — supersedes `platform/whatsapp`, generalized to every integration type, not WhatsApp-only
- System Health (`/admin/system`) — new
- Audit Log (`/admin/audit`) — new

**Unchanged sibling**
- Social Autopilot (`/admin/social/*`) — not touched by this phase's IA at all; see `CURRENT_TO_FINAL_MIGRATION_PLAN.md` for how/whether it eventually folds into this shell.

## 2. Agency Overview replaces the tenant-scoped Command Center at `/admin`

Today's `/admin` (`app/admin/(shell)/page.tsx`) shows one selected tenant's missions/approvals/integration status. That page's *content pattern* (metric cards, recent missions list, pending approvals list) is correct and reusable — but at `/admin` it should default to **agency-wide** numbers (missions across all clients, approvals across all clients, an "attention required" roll-up), with the existing tenant switcher repurposed as a **"jump into a client"** action rather than the thing that changes what the whole page means. The per-tenant version of that same page pattern is exactly what `/app` (client workspace) already is per `CLIENT_APP_INFORMATION_ARCHITECTURE.md` §2 — one component pattern, two data scopes, which is the same "shared client components, staff sees a badge" principle the brief requires, applied one level up.

## 3. Clients & Client detail

`/admin/clients` (list) → `/admin/clients/{id}` (detail). List view: every tenant, searchable, each row showing name, plan/status, member count, last-active mission. Detail view: everything about one tenant from the agency's perspective — members (mirrors today's tenant-membership data), missions summary, wallet/finance summary, integration status, and the **"View client workspace"** action described in `ROLE_AND_PERMISSION_EXPERIENCE.md` §6, which is the literal reuse of `/app`'s components with a staff-context badge — this is the one explicit place in the admin IA where staff and client surfaces touch.

## 4. All Missions / Operations Queue / Approvals — agency-wide vs. tenant-scoped

The naming distinction matters and is used consistently across this whole package: **an `/admin` page with a plural, unscoped name ("All Missions," "Approvals") always means every tenant, filterable by client; the equivalent `/app` page always means the one active tenant, no filter needed because there's nothing else to filter.** This is not a new concept — it's the same distinction `requireOwnerContext()` (agency-wide) vs. `requireTenantContext(tenantId)` (one tenant) already enforces at the data layer today; the IA just makes that split visible and consistent in the nav instead of implicit in which auth function a route happens to call.

## 5. Human Handoffs

New dedicated surface for the `human_handoff:assign`/`human_handoff:resolve` permissions that already exist in `lib/rbac/policy.ts` but, per the route inventory in this pass, have no corresponding page today. List of open handoffs (which mission, which tenant, reason, time open) → assign to a staff member → resolve with a note. This is agency-wide by nature (a handoff is inherently a "this needs a human at Stratxcel" event, not a client-facing concept), so it lives only in `/admin`, with no `/app` equivalent.

## 6. Finance

Supersedes `platform/wallet`'s single-tenant balance view with an agency-wide ledger roll-up (every tenant's balance, top-ups, spend trend) plus drill-down into one tenant's wallet — which is functionally what `/app/billing` shows that one tenant from their own side. Same underlying `wallet_accounts`/`wallet_ledger_entries` tables (confirmed present via the RLS migration read during the earlier fix in this session), two framings.

## 7. Integrations, System Health, Audit Log

- **Integrations**: generalizes today's WhatsApp-only `platform/whatsapp` page into a per-type, per-tenant integration status board (WhatsApp, Razorpay, Google Drive, social platform OAuth connections) — the existing `IntegrationRow` pattern already in `app/admin/(shell)/page.tsx` is the direct visual precedent, just expanded from 4 hardcoded rows to a real inventory.
- **System Health**: new — queue depth/dead-letter counts (data already exists per `platform/queue`'s `listDeadLetter`), API error rates, background worker status. Operational, staff-only, no client-facing equivalent.
- **Audit Log**: new — a read surface over whatever the existing `@stratxcel/audit` package (present in `package.json` dependencies) already writes. This document assumes that package's existing log data is sufficient; if it isn't, that's an engineering scoping question for `IMPLEMENTATION_PHASES.md`, not a design gap.

## 8. What stays exactly as-is

`/admin/social/*` is explicitly out of scope for restructuring in this pass — its IA, routes, and shell (`SocialShell.tsx`) are untouched. It is visually migrated onto the design tokens (see migration plan) but its page structure does not change here.

# Internal Admin Information Architecture — `/admin`

Stable V1 + owner-admin Beta Mode. Implementation:
- `components/shell/navigation/admin-nav-data.ts`
- `lib/release/*`
- `components/shell/AdminBetaModeToggle.tsx`

## Release classification
Every nav item declares `release: "v1" | "v2"`. Unknown release fails closed (hidden).
V1 is the only default-visible release. Beta Mode never bypasses `requireOwnerContext()`, entitlements, Shadow/Live, or tenant isolation.

## Beta Mode (owner-admin only)
- Preference: httpOnly cookie `sx_release_mode=beta` (SameSite=Lax, Secure in production)
- Set only via `POST /api/admin/release-mode` after `requireOwnerContext()`
- Toggle lives in the **admin** top bar only — never public or `/app`
- Audit actions: `admin.release_mode.beta_enabled` / `admin.release_mode.stable_enabled`
- Turning Beta OFF while on a V2 URL redirects to `/admin`

## Stable admin navigation (Beta OFF)

**Overview**
- Agency Overview (`/admin`)
- Admin Copilot (`/admin/copilot`)

**Clients**
- Clients (`/admin/clients`)
- Leads / CRM (`/admin/leads`)

**Operations**
- All Missions (`/admin/missions`)
- Approvals (`/admin/approvals`)
- Human Handoffs (`/admin/handoffs`)
- Operations Queue (`/admin/operations`)

**Growth**
- Social Autopilot (`/admin/social`)

**Platform**
- Finance (`/admin/finance`)
- Team (`/admin/team`)
- Integrations (`/admin/integrations`)
- System Health (`/admin/system`)
- Audit Log (`/admin/audit`)

## Beta additions (Beta ON — preserves all Stable items)

**Beta**
- My Operating Brain (`/admin/operating-brain`) — `release: "v2"`
- Hermes Mission Control (`/admin/hermes`) — `release: "v2"`
- Capability Registry (`/admin/capabilities`) — `release: "v2"` — real, honest UI over `capability_registry` (packages/agent-core's canonical catalog of what the WhatsApp/Admin Copilot Brain can actually do). Read-only.

## Direct-route / API security
Hiding a nav link is not security. V2 pages and V2-only APIs call `requireReleaseAccess("v2")` / `requireReleaseAccessApi("v2")` (owner-admin **and** Beta) before data loads.

Shared V1 runtime (workers, Hermes execution used by missions) is not disabled when Beta is OFF — only advanced control surfaces are gated.

## Unchanged sibling
`/admin/social/*` Social Autopilot routes remain V1 operational surfaces.

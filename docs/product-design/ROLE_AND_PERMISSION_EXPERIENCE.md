# Role & Permission Experience

Design documentation only. The role model below is not invented — it is the model already implemented and running in production (`lib/rbac/policy.ts`, `lib/tenants/types.ts`, `lib/social/db-context.ts`, `lib/tenants/tenant-context.ts`). This document maps that existing model onto the three-experience architecture (public site / `/app` / `/admin`); it does not propose changing the model itself.

## 1. The two authorization boundaries that already exist

| Boundary | Table | Function | Grants access to |
|---|---|---|---|
| **Internal staff** | `stratxcel_admins` | `requireOwnerContext()` | `/admin` — single workspace, not tenant-scoped |
| **Client membership** | `tenant_members` | `requireTenantContext(tenantId)` | `/app` for one tenant — re-derived from session + membership row on every request, never trusted from client input |

These are independent. A person can be a `stratxcel_admins` row, a `tenant_members` row, both, or neither. Both are already RLS-backed (see `supabase/migrations/20260803120000_platform_tenants_rbac_audit.sql` and neighboring migrations) — this document does not touch that layer.

## 2. Client roles (existing, unchanged)

`TenantRole = "owner" | "admin" | "operator" | "viewer"`, closed permission map in `lib/rbac/policy.ts`:

| Permission | owner | admin | operator | viewer |
|---|:---:|:---:|:---:|:---:|
| `tenant:invite_member` | ✓ | ✓ | | |
| `tenant:manage_members` | ✓ | | | |
| `brand_brain:view` | ✓ | ✓ | ✓ | ✓ |
| `brand_brain:edit` | ✓ | ✓ | | |
| `mission:create` / `mission:cancel` | ✓ | ✓ | ✓ | |
| `mission:view` | ✓ | ✓ | ✓ | ✓ |
| `approval:decide` | ✓ | ✓ | | |
| `wallet:view` | ✓ | ✓ | ✓ | ✓ |
| `wallet:topup` / `wallet:spend` | ✓ | ✓ | | |
| `human_handoff:assign` / `:resolve` | ✓ (both) | ✓ (both) | assign only | |
| `integration:configure` | ✓ | ✓ | | |

This table is the single source every `/app` page's "permission state" (see `EMPTY_LOADING_ERROR_STATE_MATRIX.md`) is defined against — a page never invents its own gating logic, it calls `requirePermission(role, permission)` exactly as the current API routes already do.

## 3. Six identities, six landings

| # | Identity | How determined | Lands on |
|---|---|---|---|
| 1 | Visitor (no session) | No auth cookie | Public site (`stratxcel.in`) |
| 2 | New signup (no tenant yet) | Authenticated, zero `tenant_members` rows | Onboarding (`/app/onboarding`) |
| 3 | Invited client (has a pending invite, not yet accepted) | Authenticated, a `tenant_members` row exists with `invited_by` set and not yet "activated" *(see note below — see §5)* | Invitation acceptance flow |
| 4 | Client owner/member (one or more tenants) | Authenticated, ≥1 `tenant_members` row, no `stratxcel_admins` row | `/app` (their most-recently-active tenant, or a tenant picker if >1 and none marked active) |
| 5 | Internal staff | Authenticated, has a `stratxcel_admins` row, no client memberships | `/admin` |
| 6 | Internal staff who is also a client member (e.g. Stratxcel's own workspace, or a staff member added to a client for support) | Authenticated, has both a `stratxcel_admins` row and ≥1 `tenant_members` row | `/admin` by default; can enter a client workspace deliberately (see §6) |

Full decision table, cookie names, and exact redirect targets: `ROUTE_AND_REDIRECT_MAP.md`.

## 4. Clients never see `/admin`

This is a hard product rule, not a soft default. Concretely:
- No client-facing nav item, deep link, or redirect target may ever point at `/admin/*`.
- If a client-only session (no `stratxcel_admins` row) requests any `/admin/*` URL directly, the response is the same as an unauthenticated 404/redirect-to-`/app` treatment used today for out-of-scope routes — **not** a "you don't have permission" page that confirms `/admin` exists. This mirrors the existing `requireOwnerContext()` pattern, which already returns a generic "No access" panel rather than leaking what a passing check would have shown (the RSC-disclosure defect fixed earlier in this branch is the concrete precedent for why this matters).
- `/app` is therefore the only surface area a client's browser history, bookmarks, or shared links can ever contain.

## 5. Invitation state — a note on what needs a real decision

The current schema has `tenant_members.invited_by` (nullable) but **no separate "invitation pending vs. accepted" status column** was found in the migrations read for this pass (`20260803120000_platform_tenants_rbac_audit.sql`). Today, `inviteMember()` in `lib/tenants/repository.ts` inserts a `tenant_members` row directly with a role — there is no intermediate "invited, not yet a member" state in the data model as it stands. This documentation package designs the invitation-acceptance *experience* (`AUTH_AND_ONBOARDING_FLOW.md`) as if that state will exist (an invited person should land on an acceptance screen, not silently become a full member before they've ever signed in), but **flagging clearly: whether invitations get a first-class pending state (new column, or a separate `tenant_invitations` table) is a schema decision for engineering/business, not something this design pass resolves.** The visual/flow design accommodates either implementation.

## 6. Staff entering a client workspace

Requirement: staff must be able to open a client workspace using **the same `/app` client components** — not a second, staff-only copy of the UI (mirrors the "do not create a second client UI for staff" instruction).

Mechanism (design-level, matches the existing tenant-switcher precedent in `app/admin/(shell)/tenant-actions.ts`):
1. From `/admin/clients/{clientId}`, a "View client workspace" action.
2. This does **not** change which `tenant_members` row governs permissions — staff who are not also a tenant member still act under a support-scoped, read-mostly capability set (a new, narrower permission surface than any `TenantRole` — a business decision, see `ROUTE_AND_REDIRECT_MAP.md` open question) unless they hold a genuine `tenant_members` row for that tenant.
3. The `/app` shell renders identically, with one addition: a persistent **"Viewing as Stratxcel staff"** badge in the top command bar (accent-muted pill, mono label, a "return to /admin" link beside it). This is a presentation-layer flag only — it must never be spoofable from the client, and is derived server-side from the fact that the request carries a `stratxcel_admins` row *and* an explicit staff-initiated "enter workspace" action, not from any client-settable header or query param.
4. Leaving the workspace (badge's "return to /admin" link, or navigating to any `/admin/*` URL) ends the staff-context view; it does not log the staff member out of `/admin`.

## 7. Redirect logic summary (see `ROUTE_AND_REDIRECT_MAP.md` for the literal table)

```
no session               → public site
session, 0 tenants, 0 admin rows            → /app/onboarding
session, pending invite                     → /app/accept-invite/{token}
session, ≥1 tenant, 0 admin rows            → /app (active or last-used tenant)
session, 0 tenants, has admin row           → /admin
session, ≥1 tenant AND has admin row        → /admin (staff identity wins by default)
```

Staff-with-tenant-membership defaulting to `/admin` (not `/app`) is a deliberate choice: `/admin` is the more privileged surface, and defaulting to the more privileged one keeps the "clients never see /admin" rule from silently going the other way (a staff member accidentally landing in a client's workspace with no staff-context badge, because they were treated as a plain client member first). If business wants the opposite default, that is a one-line change to the decision table, not a re-architecture — called out as an open question in the final report.

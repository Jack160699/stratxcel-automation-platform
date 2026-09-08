-- Registers the central Admin CRM's aggregate read (StratXcel Final
-- Production Certification, Section 13/14): /admin/leads now opens
-- directly and reads across every agency client an authorized staff
-- member manages, with no client workspace selection required. Applied
-- live via Supabase MCP; this file makes it reproducible from a fresh
-- database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:admin_crm_aggregate_read',
  'Central Admin CRM (/admin/leads) opens directly with real data aggregated across every authorized agency client -- no client workspace selection required',
  'Before this, /admin/leads'' CRM tab rendered CrmWorkspace scoped to whichever single tenant the ClientSwitcher happened to have active, and showed "Select a client above to view their CRM" with none selected -- the exact defect named in the certification brief (Admin CRM must not require opening a client workspace first). Fixed by adding a new, narrower read gate, requireAdminAggregateReadContext (lib/tenants/tenant-context.ts), distinct from requireTenantReadContext (which always resolves to exactly one tenant): it authorizes purely on real platform-staff status (stratxcel_admins), the same check requireOwnerContext (lib/social/db-context.ts) and the existing staff_support single-tenant read path already trust, then returns every real agency client from the existing, already-filtered listAgencyTenants() (excludes system tenants via SYSTEM_TENANT_SLUGS) -- never an unrestricted scan of the tenants table and never a client-supplied tenant list. Four GET routes (leads, whatsapp/conversations, crm/follow-ups, crm/appointments) now branch: an explicit ?tenantId= keeps the exact original single-tenant path unchanged (customer /app/crm, and any future admin per-client filter); omitting it (the central Admin CRM''s default) routes through the new gate and a matching *ForTenants repository function (listLeadsForTenants etc, each a plain .in("tenant_id", tenantIds) read, capped at 300 rows, tenant_id preserved on every row). CrmWorkspace''s tenantId prop became optional; AdminLeadsTabs (app/admin/(shell)/leads/AdminLeadsTabs.tsx) now renders it unconditionally with no tenantId and role="owner" (matching how staff-support access already bypasses per-tenant role checks server-side for every mutation route), removing the ClientSwitcher gate entirely from this tab. The UI labels each row with its real client name (ConversationRow/ConversationList) and extends search to match client name too, using the tenant list already returned alongside the leads response -- no second round-trip.',
  'admin_crm',
  'Engineering',
  'N/A (Admin UI only, not a Hermes/agent tool)',
  'read',
  'platform_only',
  'free',
  'low_mutation',
  'Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0). Updated the two existing real regression-guard tests that encoded the OLD single-tenant-required behavior: lib/rbac/__tests__/unified-crm-inbox.test.ts (central-CRM assertions -- no ClientSwitcher gate, requireAdminAggregateReadContext exists and is wired into both the leads and conversations routes, exactly the 4 initial list loads may use the aggregate-capable tenantQS and nothing else does) and lib/rbac/__tests__/admin-staff-workspace.test.ts (platformFetch usage assertions updated for the tenantQS template, not a literal ?tenantId=). Both, plus every other real/executable test touching this path (whatsapp-crm-safety.test.ts, update-lead-status.test.ts), pass. One pre-existing, unrelated failure (admin shell Beta mode toggle assertion in client-modules-completion.test.ts) confirmed via git stash to exist before this change -- not introduced by it, not touched.',
  'REAL_EXPOSED',
  'Uses the service-role client for the aggregate branch (createSupabaseServiceClient), matching this codebase''s own established precedent for staff reads (requireTenantReadContext''s existing staff_support single-tenant path does the same) -- authorized by a real stratxcel_admins row, never a fake per-tenant membership and never an unauthenticated/unrestricted table scan. Every returned row still carries its own real tenant_id (no data copying, no merging across tenants) and every subsequent action (send, patch, follow-up/appointment create, automation-mode change) re-derives and uses that specific row''s own tenant_id, never a caller-supplied global one. The four aggregate-capable GET routes are read-only; no mutation route was changed to accept an omitted tenantId.',
  now(),
  'claude_session_2026-09-09'
);

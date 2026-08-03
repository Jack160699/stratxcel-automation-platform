// Run with: node --experimental-strip-types lib/rbac/__tests__/tenant-dashboard-no-service-role.test.ts
//
// Regression guard for the SUPABASE_SERVICE_ROLE_KEY crash on the
// authenticated Phase 1 Preview: app/admin/(shell)/page.tsx and
// lib/tenants/current-tenant.ts were calling getTenantServiceContext()
// for ordinary user-initiated dashboard reads (tenant membership, mission
// listing, pending approvals) that RLS already covers for the
// authenticated session client — a service-role client should never be
// constructed just to render /admin. This asserts against source for the
// same reason every other Server-Component test in this build does:
// requireOwnerContext() reads next/headers cookies() and only resolves
// inside a real Next.js request scope.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // --- 1 & 2. resolveCurrentTenant/listMyTenants use the supplied client,
  // never construct their own service client -------------------------------
  const currentTenant = read("lib", "tenants", "current-tenant.ts");
  assert.equal(
    /getTenantServiceContext|createSupabaseServiceClient/.test(currentTenant),
    false,
    "lib/tenants/current-tenant.ts must have no dependency on the service-role client at all"
  );
  assert.ok(
    /export async function listMyTenants\(supabase: SupabaseClient, userId: string\)/.test(currentTenant),
    "listMyTenants must accept the caller's Supabase client as a parameter, not construct its own"
  );
  assert.ok(
    /export async function resolveCurrentTenant\(supabase: SupabaseClient, userId: string\)/.test(currentTenant),
    "resolveCurrentTenant must accept the caller's Supabase client as a parameter"
  );
  assert.ok(
    /listMyTenants\(supabase, userId\)/.test(currentTenant),
    "resolveCurrentTenant must forward the supplied client to listMyTenants, not a service client"
  );
  assert.ok(
    /export async function isMemberOfTenant\(supabase: SupabaseClient, userId: string, tenantId: string\)/.test(currentTenant),
    "isMemberOfTenant must accept the caller's Supabase client as a parameter"
  );

  // --- 3. setActiveTenantAction passes ctx.supabase to membership verification
  const tenantActions = read("app", "admin", "(shell)", "tenant-actions.ts");
  assert.ok(
    /isMemberOfTenant\(ctx\.supabase, ctx\.ownerId, tenantId\)/.test(tenantActions),
    "setActiveTenantAction must verify membership using ctx.supabase (the authenticated session client), not a service client"
  );
  assert.equal(
    /getTenantServiceContext|createSupabaseServiceClient/.test(tenantActions),
    false,
    "tenant-actions.ts must have no dependency on the service-role client"
  );

  // --- 4. the unified shell passes ctx.supabase into tenant resolution -----
  const shellLayout = read("app", "admin", "(shell)", "layout.tsx");
  assert.ok(
    /resolveCurrentTenant\(ctx\.supabase, ctx\.ownerId\)/.test(shellLayout),
    "the shell layout must resolve the active tenant using ctx.supabase"
  );
  assert.equal(
    /getTenantServiceContext|createSupabaseServiceClient/.test(shellLayout),
    false,
    "the shell layout must have no dependency on the service-role client"
  );

  // --- 5 & 6. Command Center: no service client, uses ctx.supabase for reads
  const commandCenter = read("app", "admin", "(shell)", "page.tsx");
  assert.equal(
    /getTenantServiceContext|createSupabaseServiceClient/.test(commandCenter),
    false,
    "the Command Center must not import or call getTenantServiceContext/createSupabaseServiceClient — this was the exact crash"
  );
  assert.ok(
    /resolveCurrentTenant\(ctx\.supabase, ctx\.ownerId\)/.test(commandCenter),
    "the Command Center must resolve the active tenant using ctx.supabase"
  );
  assert.ok(
    /listMissionsForTenant\(ctx\.supabase, active\.tenantId, 5\)/.test(commandCenter),
    "mission listing must use ctx.supabase, not a service client"
  );
  assert.ok(
    /listPendingApprovals\(ctx\.supabase, active\.tenantId\)/.test(commandCenter),
    "approval listing must use ctx.supabase, not a service client"
  );
  assert.ok(
    /ctx\.supabase\s*\n\s*\.from\("stratxcel_contact_messages"\)/.test(commandCenter),
    "the contact-message count must reuse ctx.supabase rather than constructing a second client"
  );

  // Still independently guarded (the earlier RSC-disclosure fix must survive
  // this refactor) — same assertion the Phase 1 test already covers, kept
  // here too so this file alone proves the crash fix didn't regress it.
  assert.ok(
    /const ctx = await requireOwnerContext\(\);\s*\n\s*if \(!ctx\.ok\) return null;/.test(commandCenter),
    "the Command Center must still independently re-guard with requireOwnerContext()"
  );

  // --- 7. legitimate service-only paths remain service-only ----------------
  const repository = read("lib", "tenants", "repository.ts");
  assert.ok(
    /export async function createTenant\(\s*supabase: ServiceClient/.test(repository),
    "createTenant must remain service-role-typed — RLS has no INSERT policy for authenticated users on tenants/tenant_members"
  );
  assert.ok(
    /export async function inviteMember\(\s*supabase: ServiceClient/.test(repository),
    "inviteMember must remain service-role-typed for the same reason"
  );
  assert.ok(
    /export async function listMembershipsForUser\(\s*supabase: ReadClient/.test(repository),
    "listMembershipsForUser must accept the generalized read-capable client type"
  );
  // app/api/platform/tenants/route.ts backs the Clients page's fetch on
  // mount (GET) and the "Create client" form (POST) — a second, previously
  // unnoticed instance of the exact same bug class: GET was listing the
  // caller's own memberships (a plain RLS-covered read) through the
  // service-role client. Found and fixed alongside the Command Center fix
  // because it sits on the same authenticated dashboard path the owner
  // would hit next in Preview review.
  const tenantsRoute = read("app", "api", "platform", "tenants", "route.ts");
  const getHandler = tenantsRoute.slice(
    tenantsRoute.indexOf("export async function GET"),
    tenantsRoute.indexOf("export async function POST")
  );
  const postHandler = tenantsRoute.slice(tenantsRoute.indexOf("export async function POST"));
  assert.equal(
    /getTenantServiceContext/.test(getHandler),
    false,
    "GET /api/platform/tenants (listing the caller's own memberships) must use the session client, not the service-role client"
  );
  assert.ok(
    /listMembershipsForUser\(supabase, user\.id\)/.test(getHandler),
    "GET must pass the authenticated session client into listMembershipsForUser"
  );
  assert.ok(
    /getTenantServiceContext/.test(postHandler),
    "POST /api/platform/tenants (tenant creation) must keep using the service-role client — this is a legitimate privileged write, not part of this fix"
  );

  // --- 8. the platform API routes backing Missions/Approvals/Wallet/Queue/
  // WhatsApp pages: a second bug class discovered while tracing this fix —
  // requireTenantContext() already returns a membership-verified session
  // client (ctx.supabase), but every one of these GET handlers discarded it
  // in favor of a freshly-constructed service-role client for a plain read.
  // All five tables involved have a tenant-scoped SELECT RLS policy
  // granting `authenticated`, so the read can run on ctx.supabase directly.
  // Writes (mission creation, approval decisions, binding creation) have no
  // corresponding INSERT/UPDATE grant to `authenticated` and correctly stay
  // on the service-role client — untouched by this fix.
  function assertGetUsesSessionClient(routeParts: string[], rlsPolicy: string) {
    const source = read(...routeParts);
    const getStart = source.indexOf("export async function GET");
    assert.notEqual(getStart, -1, `${routeParts.join("/")} must still export GET`);
    const postStart = source.indexOf("export async function POST");
    const getHandler = postStart === -1 ? source.slice(getStart) : source.slice(getStart, postStart);
    assert.equal(
      /getTenantServiceContext/.test(getHandler),
      false,
      `GET ${routeParts.join("/")} must use ctx.supabase, not the service-role client (covered by ${rlsPolicy} RLS)`
    );
    assert.ok(
      /ctx\.supabase/.test(getHandler),
      `GET ${routeParts.join("/")} must reference ctx.supabase somewhere in its read path`
    );
  }

  assertGetUsesSessionClient(["app", "api", "platform", "missions", "route.ts"], "missions_tenant_read");
  assertGetUsesSessionClient(["app", "api", "platform", "approvals", "route.ts"], "approvals_tenant_read");
  assertGetUsesSessionClient(["app", "api", "platform", "wallet", "route.ts"], "wallet_accounts_tenant_read");
  assertGetUsesSessionClient(["app", "api", "platform", "queue", "route.ts"], "queue_jobs_tenant_read");
  assertGetUsesSessionClient(
    ["app", "api", "platform", "whatsapp", "bindings", "route.ts"],
    "whatsapp_phone_bindings_tenant_read"
  );
  assertGetUsesSessionClient(
    ["app", "api", "platform", "whatsapp", "shadow-messages", "route.ts"],
    "whatsapp_shadow_tenant_read"
  );
  assertGetUsesSessionClient(
    ["app", "api", "platform", "missions", "[missionId]", "events", "route.ts"],
    "mission_events_tenant_read"
  );

  // Legitimate privileged writes on these same route files must still use
  // the service-role client — no INSERT/UPDATE grant to `authenticated`
  // exists for missions, approvals, or whatsapp_phone_bindings.
  const missionsRoute = read("app", "api", "platform", "missions", "route.ts");
  assert.ok(
    /getTenantServiceContext/.test(missionsRoute.slice(missionsRoute.indexOf("export async function POST"))),
    "POST /api/platform/missions (mission creation) must keep using the service-role client"
  );
  const bindingsRoute = read("app", "api", "platform", "whatsapp", "bindings", "route.ts");
  assert.ok(
    /getTenantServiceContext/.test(bindingsRoute.slice(bindingsRoute.indexOf("export async function POST"))),
    "POST /api/platform/whatsapp/bindings (binding creation) must keep using the service-role client"
  );
  const decideRoute = read("app", "api", "platform", "approvals", "[approvalId]", "decide", "route.ts");
  assert.ok(
    /getTenantServiceContext/.test(decideRoute),
    "POST /api/platform/approvals/[id]/decide (approval decision, a write) must keep using the service-role client"
  );

  console.log(
    "tenant-dashboard-no-service-role.test.ts: ALL PASS (no service-role dependency in tenant resolution/shell layout/Command Center/platform API reads, ctx.supabase used throughout, privileged writes untouched, RSC guard intact)"
  );
}

run();

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const currentTenant = read("lib", "tenants", "current-tenant.ts");
  assert.equal(/getTenantServiceContext|createSupabaseServiceClient/.test(currentTenant), false);
  assert.ok(/listMyTenants\(supabase: SupabaseClient, userId: string\)/.test(currentTenant));
  assert.ok(/resolveCurrentTenant\(supabase: SupabaseClient, userId: string\)/.test(currentTenant));
  assert.ok(/isMemberOfTenant\(supabase: SupabaseClient, userId: string, tenantId: string\)/.test(currentTenant));

  const tenantActions = read("app", "admin", "(shell)", "tenant-actions.ts");
  assert.ok(/isMemberOfTenant\(ctx\.supabase, ctx\.ownerId, tenantId\)/.test(tenantActions));
  assert.equal(/getTenantServiceContext|createSupabaseServiceClient/.test(tenantActions), false);

  const shellLayout = read("app", "admin", "(shell)", "layout.tsx");
  assert.ok(/resolveCurrentTenant\(identity\.supabase, identity\.userId\)/.test(shellLayout));
  assert.equal(/getTenantServiceContext|createSupabaseServiceClient/.test(shellLayout), false);

  const commandCenter = read("app", "admin", "(shell)", "page.tsx");
  assert.equal(/getTenantServiceContext|createSupabaseServiceClient/.test(commandCenter), false);
  assert.ok(/listMissionsForTenant\(ctx\.supabase, active\.tenantId, 5\)/.test(commandCenter));
  assert.ok(/listPendingApprovals\(ctx\.supabase, active\.tenantId\)/.test(commandCenter));
  assert.ok(/requireOwnerContext\(\)/.test(commandCenter));

  const repository = read("lib", "tenants", "repository.ts");
  assert.ok(/createTenant\(\s*supabase: ServiceClient/.test(repository));
  assert.ok(/inviteMember\(\s*supabase: ServiceClient/.test(repository));
  assert.ok(/listMembershipsForUser\(\s*supabase: ReadClient/.test(repository));

  // Agency-wide access is isolated in one server-only repository and is
  // reached only after requireOwnerContext; it never fabricates membership.
  const tenantsRoute = read("app", "api", "platform", "tenants", "route.ts");
  const adminRepository = read("lib", "tenants", "admin-repository.ts");
  assert.ok(/requireOwnerContext/.test(tenantsRoute) && /listAgencyTenants/.test(tenantsRoute) && /createAgencyTenant/.test(tenantsRoute));
  assert.equal(/tenant_members|listMembershipsForUser/.test(tenantsRoute), false);
  assert.ok(/import "server-only"/.test(adminRepository) && /createSupabaseServiceClient/.test(adminRepository));
  const agencyCreate = adminRepository.slice(adminRepository.indexOf("createAgencyTenant"), adminRepository.indexOf("loadAgencyClientOverview"));
  assert.equal(/tenant_members/.test(agencyCreate), false);

  // Customer reads retain membership/RLS; explicit staff support reads use
  // the exact signed tenant context and a server-only read client.
  const tenantContext = read("lib", "tenants", "tenant-context.ts");
  const readDecision = read("lib", "tenants", "read-access-decision.ts");
  assert.ok(/export async function requireTenantContext/.test(tenantContext));
  assert.ok(/\.from\("tenant_members"\)/.test(tenantContext));
  assert.ok(/export async function requireTenantReadContext/.test(tenantContext));
  assert.ok(/\.from\("stratxcel_admins"\)/.test(tenantContext));
  assert.ok(/staffWorkspaceTenantId === input\.requestedTenantId/.test(readDecision));

  for (const parts of [
    ["app", "api", "platform", "missions", "route.ts"],
    ["app", "api", "platform", "approvals", "route.ts"],
    ["app", "api", "platform", "wallet", "route.ts"],
    ["app", "api", "platform", "missions", "[missionId]", "events", "route.ts"],
  ]) {
    const source = read(...parts);
    const getStart = source.indexOf("export async function GET");
    const nextWrite = [source.indexOf("export async function POST", getStart), source.indexOf("export async function PATCH", getStart)]
      .filter((index) => index !== -1)
      .sort((a, b) => a - b)[0];
    const getHandler = source.slice(getStart, nextWrite ?? undefined);
    assert.ok(/requireTenantReadContext/.test(getHandler), `${parts.join("/")} must use the explicit read gate`);
    assert.ok(/ctx\.supabase/.test(getHandler), `${parts.join("/")} must use the context's bounded data client`);
  }

  const missions = read("app", "api", "platform", "missions", "route.ts");
  const missionPost = missions.slice(missions.indexOf("export async function POST"));
  assert.ok(/requireTenantContext/.test(missionPost) && /getTenantServiceContext/.test(missionPost));
  const decide = read("app", "api", "platform", "approvals", "[approvalId]", "decide", "route.ts");
  assert.ok(/requireTenantContext/.test(decide) && /getTenantServiceContext/.test(decide));

  console.log("tenant-dashboard-no-service-role.test.ts: ALL PASS (customer RLS preserved, staff agency access isolated, writes membership-gated)");
}

run();

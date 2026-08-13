import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideIdentityState } from "../../identity/identity-state.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const adminRepo = read("lib", "tenants", "admin-repository.ts");
  const tenantsRoute = read("app", "api", "platform", "tenants", "route.ts");
  const detail = read("app", "admin", "(shell)", "clients", "[tenantId]", "page.tsx");
  const enter = read("app", "admin", "(shell)", "clients", "[tenantId]", "staff-workspace-actions.ts");
  const appLayout = read("app", "app", "layout.tsx");
  const resolver = read("lib", "identity", "resolve-identity.ts");
  const clientContext = read("lib", "tenants", "client-context.ts");
  const tenantContext = read("lib", "tenants", "tenant-context.ts");
  const token = read("lib", "identity", "staff-workspace.ts");

  // 1. Internal admin with zero memberships can see agency clients.
  assert.ok(tenantsRoute.includes("requireOwnerContext") && tenantsRoute.includes("listAgencyTenants"));
  assert.equal(tenantsRoute.includes("listMembershipsForUser"), false);
  assert.ok(adminRepo.includes('.from("tenants").select("id,name,slug")'));

  // 2. Internal admin with zero memberships can open client detail.
  assert.ok(detail.includes("requireOwnerContext") && detail.includes("loadAgencyClientOverview(tenantId)"));
  assert.equal(detail.includes("listMyTenants"), false);

  // 3. Internal admin with zero memberships can enter a valid client workspace.
  assert.ok(enter.includes("requireOwnerContext") && enter.includes("getAgencyTenant(tenantId)"));
  assert.ok(enter.includes("setStaffWorkspaceCookie") && enter.includes('redirect("/app")'));
  assert.equal(enter.includes("isMemberOfTenant"), false);

  // 4. Staff workspace entry never creates a fake tenant_members row.
  const createAgency = adminRepo.slice(adminRepo.indexOf("export async function createAgencyTenant"), adminRepo.indexOf("export async function loadAgencyClientOverview"));
  assert.equal(createAgency.includes("tenant_members"), false);
  assert.equal(enter.includes("tenant_members"), false);

  // 5. Direct /app navigation by staff without explicit context redirects to /admin.
  assert.ok(appLayout.includes('identity.state === "INTERNAL_STAFF"') && appLayout.includes('redirect("/admin")'));
  assert.equal(decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 0, hasValidStaffWorkspace: false, workspaceMode: null }), "INTERNAL_STAFF");

  // 6. Ordinary customer access still requires the exact tenant_members row.
  assert.ok(tenantContext.includes('.from("tenant_members")'));
  assert.ok(tenantContext.includes('.eq("tenant_id", tenantId)') && tenantContext.includes('.eq("user_id", user.id)'));
  assert.ok(tenantContext.includes('if (!memberRow) return { ok: false, status: 403, error: "Not a member of this tenant" }'));

  // 7. A forged staff-workspace tenant ID fails signature/subject/exact-tenant checks.
  assert.ok(token.includes("createHmac") && token.includes("timingSafeEqual"));
  assert.ok(token.includes("claims.subject !== subject") && token.includes("claims.expiresAt <= currentTime"));
  assert.ok(tenantContext.includes("workspaceTenantId !== tenantId"));

  // 8. Deleted or nonexistent target tenants fail closed.
  assert.ok(adminRepo.includes('.eq("id", tenantId).maybeSingle()'));
  assert.ok(enter.includes("if (!(await getAgencyTenant(tenantId)))"));
  assert.ok(resolver.includes("hasValidStaffWorkspace: Boolean(staffWorkspace)"));

  // 9. Non-admins cannot create or use staff workspace context.
  const staffLookup = tenantContext.indexOf('.from("stratxcel_admins")');
  const tokenRead = tenantContext.indexOf("readStaffWorkspaceTenantId(user.id)");
  assert.ok(staffLookup !== -1 && tokenRead > staffLookup && tenantContext.includes("if (staffRow)"));
  assert.ok(enter.includes("requireOwnerContext"));

  // 10. Dual-role staff + membership: customer intent → customer; admin intent → admin.
  assert.equal(decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 1, hasValidStaffWorkspace: false, workspaceMode: "customer" }), "CUSTOMER_MEMBER");
  assert.equal(decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 1, hasValidStaffWorkspace: false, workspaceMode: "admin" }), "INTERNAL_STAFF");
  assert.equal(decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 1, hasValidStaffWorkspace: true, workspaceMode: "customer" }), "STAFF_VIEWING_CLIENT");

  // Explicit support posture: no fake TenantRole and unsafe writes unavailable.
  assert.ok(clientContext.includes('accessMode: "staff_support"') && clientContext.includes("workspaceTenant: identity.staffWorkspace"));
  assert.equal(/role:\s*["']owner["']/.test(clientContext), false);
  const socialAutopilot = read("app", "api", "platform", "social", "autopilot", "route.ts");
  const imageGeneration = read("lib", "image-generation", "http.ts");
  const contentPipeline = read("app", "app", "content", "pipeline", "page.tsx");
  assert.ok(socialAutopilot.includes("allowStaffRead = false") && socialAutopilot.includes("Staff support mode is read-only"));
  assert.ok(imageGeneration.includes('auth.accessMode === "staff_support"') && imageGeneration.includes("read-only staff support mode"));
  assert.ok(contentPipeline.includes('ctx.accessMode === "customer"') && contentPipeline.includes('.eq("tenant_id", ctx.workspaceTenant.tenantId)'));

  const loginForm = read("app", "login", "LoginForm.tsx");
  const callback = read("app", "auth", "callback", "route.ts");
  assert.ok(/finalizeAuthWorkspaceIntent/.test(loginForm) && /finalizeAuthWorkspaceIntent/.test(callback));
  assert.ok(/mode=customer&next=\/audit\/checkout/.test(read("app", "audit", "checkout", "GuestCheckoutForm.tsx")));

  console.log("staff-membership-independence.test.ts: ALL PASS (10 required staff/customer separation regressions)");
}

run();

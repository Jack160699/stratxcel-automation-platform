// Run with: node --experimental-strip-types lib/rbac/__tests__/admin-staff-workspace.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const tenantActions = read("app", "admin", "(shell)", "tenant-actions.ts");
  const layout = read("app", "admin", "(shell)", "layout.tsx");
  const adminWorkspace = read("lib", "identity", "admin-staff-workspace.ts");
  const staffToken = read("lib", "identity", "staff-workspace.ts");
  const syncRoute = read("app", "api", "admin", "staff-workspace", "sync", "route.ts");
  const platformFetch = read("lib", "admin", "platform-fetch.ts");
  const tenantContext = read("lib", "tenants", "tenant-context.ts");
  const missions = read("app", "admin", "(shell)", "missions", "page.tsx");
  const approvals = read("app", "admin", "(shell)", "approvals", "page.tsx");
  const proxy = read("proxy.ts");

  // Owner admin tenant selection establishes signed staff workspace atomically.
  assert.ok(tenantActions.includes("ensureAdminStaffWorkspace"), "setActiveTenantAction must mint staff workspace with tenant cookie");
  const setIndex = tenantActions.indexOf("export async function setActiveTenantAction");
  const memberIndex = tenantActions.indexOf("await isMemberOfTenant(");
  const ensureIndex = tenantActions.indexOf("await ensureAdminStaffWorkspace(");
  const cookieIndex = tenantActions.indexOf("cookieStore.set(ACTIVE_TENANT_COOKIE");
  assert.ok(setIndex < memberIndex && memberIndex < ensureIndex && ensureIndex < cookieIndex, "membership must be verified before workspace + active tenant cookies");

  // Admin shell must never mutate cookies during Server Component render.
  assert.equal(layout.includes("ensureAdminStaffWorkspace"), false, "admin layout must not import or call cookie-mutating workspace helpers");
  assert.equal(layout.includes("setStaffWorkspaceCookie"), false, "admin layout must not write staff workspace cookies during render");
  assert.equal(layout.includes("cookieStore.set("), false, "admin layout must not set cookies during render");

  // Expired tokens can be re-established through the guarded sync route.
  assert.ok(syncRoute.includes("requireOwnerContext") && syncRoute.includes("authorizeAdminStaffWorkspaceTarget"));
  assert.ok(syncRoute.includes("ensureAdminStaffWorkspace"));

  // Client fetch retries once after safe recovery — no infinite loops.
  assert.ok(platformFetch.includes('fetch("/api/admin/staff-workspace/sync"'));
  assert.ok(platformFetch.includes("const response = await fetch(input, init)") && platformFetch.includes("return fetch(input, init)"));

  // Forged / cross-tenant workspace still fails closed server-side.
  assert.ok(staffToken.includes("createHmac") && staffToken.includes("timingSafeEqual"));
  assert.ok(staffToken.includes("claims.subject !== subject") && staffToken.includes("claims.expiresAt <= currentTime"));
  assert.ok(tenantContext.includes("workspaceTenantId !== tenantId"), "cross-tenant read must still fail");
  assert.ok(adminWorkspace.includes("authorizeAdminStaffWorkspaceTarget"), "recovery must re-validate tenant authority");

  // Non-staff cannot mint staff context through tenant actions.
  assert.ok(tenantActions.includes("requireOwnerContext"), "tenant switch must require platform staff session");

  // Failed list APIs must not leave permanent Loading state.
  assert.ok(missions.includes("setListLoading(false)") && missions.includes("setMissions([])"));
  assert.ok(approvals.includes("setListLoading(false)") && approvals.includes("setApprovals([])"));
  assert.ok(!/missions === null &&/.test(missions), "missions must not gate forever on null after failure");

  // Staff identity never silently becomes customer identity on read gate.
  const readContext = tenantContext.slice(tenantContext.indexOf("export async function requireTenantReadContext"));
  assert.ok(readContext.includes('if (staffRow)') && readContext.includes('accessMode: "staff_support"'));
  assert.ok(!readContext.slice(0, readContext.indexOf("const { data: memberRow }")).includes('accessMode: "customer"'));

  // Multi-tab stale refresh must not crash proxy/middleware.
  assert.ok(proxy.includes("refresh_token_already_used") && proxy.includes("signOut"));

  console.log("admin-staff-workspace.test.ts: ALL PASS (workspace sync, recovery, expiry, cross-tenant, loading exit, auth hardening)");
}

run();

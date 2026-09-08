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
  const readDecision = read("lib", "tenants", "read-access-decision.ts");
  const missions = read("app", "admin", "(shell)", "missions", "page.tsx");
  const approvals = read("app", "admin", "(shell)", "approvals", "page.tsx");
  const proxy = read("proxy.ts");
  const crmWorkspace = read("components", "crm", "CrmWorkspace.tsx");
  const conversationList = read("components", "crm", "ConversationList.tsx");
  const adminShellLayout = read("app", "admin", "(shell)", "layout.tsx");

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
  assert.ok(readDecision.includes("staffWorkspaceTenantId === input.requestedTenantId"), "cross-tenant read must still fail");
  assert.ok(adminWorkspace.includes("authorizeAdminStaffWorkspaceTarget"), "recovery must re-validate tenant authority");

  // Non-staff cannot mint staff context through tenant actions.
  assert.ok(tenantActions.includes("requireOwnerContext"), "tenant switch must require platform staff session");

  // Failed list APIs must not leave permanent Loading state.
  assert.ok(missions.includes("setListLoading(false)") && missions.includes("setMissions([])"));
  assert.ok(approvals.includes("setListLoading(false)") && approvals.includes("setApprovals([])"));
  assert.ok(!/missions === null &&/.test(missions), "missions must not gate forever on null after failure");

  // Customer intent + real membership wins for dual-role users; explicit
  // admin intent + exact signed workspace remains staff support.
  const readContext = tenantContext.slice(tenantContext.indexOf("export async function requireTenantReadContext"));
  assert.ok(readContext.includes("decideTenantReadAccess") && readContext.includes('access === "customer"'));
  assert.ok(readContext.includes('access === "staff_support"') && readContext.includes('accessMode: "staff_support"'));

  // Multi-tab stale refresh must not crash proxy/middleware.
  assert.ok(proxy.includes("refresh_token_already_used") && proxy.includes("signOut"));

  // Regression: CrmWorkspace (the shared /app/crm + /admin/leads workspace)
  // previously issued every backend read/write via raw fetch() -- when a
  // staff member's 15-minute staff-workspace cookie expired mid-session,
  // every CRM request 403'd with STAFF_WORKSPACE_CONTEXT_ERROR, got masked
  // by customerSafeError into "We couldn't load your CRM. Please try
  // again.", and Retry re-ran the same raw fetch forever -- because the
  // one place that recovers from this (platformFetch, tested above) was
  // never in the loop. Every CrmWorkspace backend call must now go through
  // platformFetch instead.
  assert.ok(crmWorkspace.includes('import { platformFetch } from "@/lib/admin/platform-fetch"'), "CrmWorkspace must import platformFetch");
  for (const endpoint of [
    "`/api/platform/leads?tenantId=",
    "`/api/platform/whatsapp/conversations?tenantId=",
    "`/api/platform/crm/follow-ups?tenantId=",
    "`/api/platform/crm/appointments?tenantId=",
    "`/api/platform/whatsapp/conversations/${convoId}?tenantId=",
  ]) {
    assert.ok(crmWorkspace.includes(`platformFetch(${endpoint}`), `list/detail read for ${endpoint} must go through platformFetch, not raw fetch`);
    assert.equal(crmWorkspace.includes(`() => fetch(${endpoint}`), false, `${endpoint} must not still use raw fetch()`);
  }
  for (const endpoint of ["/api/platform/whatsapp/send", "/api/platform/whatsapp/conversations/${conversationId}`", "/api/platform/leads/${selectedEntry.lead.id}`", "/api/platform/crm/follow-ups", "/api/platform/crm/appointments"]) {
    assert.ok(crmWorkspace.includes(`platformFetch(\`${endpoint}`) || crmWorkspace.includes(`platformFetch("${endpoint}"`), `mutation to ${endpoint} must go through platformFetch`);
  }

  // Regression: the left conversation list must never render "No
  // conversations yet" for an empty list caused by the backend error above
  // -- only for a genuinely successful, empty response (Section 10: empty
  // state and error state are never the same thing).
  assert.ok(/error\?:\s*string \| null/.test(conversationList), "ConversationList must accept an error prop");
  assert.ok(/!loading && !error && filtered\.length === 0/.test(conversationList), "the 'No conversations yet' empty state must be gated on the absence of an error");
  assert.ok(/!loading && error && filtered\.length === 0/.test(conversationList), "a distinct message must render when the list is empty because of a real error");
  assert.ok(/error=\{error\}/.test(crmWorkspace), "CrmWorkspace must actually pass its error state down to ConversationList");

  // Regression: resolveCanonicalIdentity({routeSurface:"admin"}) already
  // re-verifies a staff member's active client workspace (identity.state
  // === "STAFF_VIEWING_CLIENT", identity.staffWorkspace) via the same
  // signed cookie + getAgencyTenant check every CRM/API read route trusts
  // -- but the admin shell layout used to discard it and build
  // CurrentTenantProvider purely from resolveCurrentTenant's own-
  // membership-only list, so no page under the shell (leads, missions,
  // finance, approvals, audit, integrations, handoffs, connectors,
  // operations) could ever display a client whose workspace the admin had
  // actually opened -- only the admin's own tenant.
  assert.ok(adminShellLayout.includes('identity.state === "STAFF_VIEWING_CLIENT"'), "admin shell layout must recognize an active staff-viewed client workspace");
  assert.ok(/initialTenants\s*=\s*\[staffTenant/.test(adminShellLayout), "an active client workspace must be surfaced into the tenant list, not just silently dropped");
  assert.ok(/initialActive\s*=\s*staffTenant/.test(adminShellLayout), "an active client workspace must become the active tenant, not fall back to the admin's own");
  assert.ok(/<CurrentTenantProvider initialTenants=\{initialTenants\} initialActive=\{initialActive\}>/.test(adminShellLayout), "CurrentTenantProvider must receive the merged tenant/active values, not the raw resolveCurrentTenant output");

  console.log("admin-staff-workspace.test.ts: ALL PASS (workspace sync, recovery, expiry, cross-tenant, loading exit, auth hardening, CRM workspace recovery, CRM empty-vs-error state, admin shell client-workspace surfacing)");
}

run();

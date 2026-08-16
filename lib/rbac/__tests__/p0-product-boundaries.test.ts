import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideIdentityState, defaultDestination } from "../../identity/identity-state.ts";
import { isActivePaidSubscription } from "../../billing/plan-state.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  // AUTH / ROUTING
  assert.equal(defaultDestination(decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 0, hasValidStaffWorkspace: false, workspaceMode: null })), "/admin");
  assert.equal(defaultDestination(decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 2, hasValidStaffWorkspace: false, workspaceMode: "admin" })), "/admin");
  assert.equal(defaultDestination(decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 2, hasValidStaffWorkspace: false, workspaceMode: "customer" })), "/app");
  assert.equal(defaultDestination(decideIdentityState({ hasSession: true, isStaff: false, membershipCount: 1, hasValidStaffWorkspace: false, workspaceMode: null })), "/app");
  assert.equal(decideIdentityState({ hasSession: true, isStaff: false, membershipCount: 0, hasValidStaffWorkspace: false, workspaceMode: null }), "NEW_CUSTOMER");
  assert.equal(decideIdentityState({ hasSession: false, isStaff: false, membershipCount: 0, hasValidStaffWorkspace: false, workspaceMode: null }), "NO_SESSION");

  const appLayout = read("app", "app", "layout.tsx");
  const adminLayout = read("app", "admin", "(shell)", "layout.tsx");
  assert.ok(adminLayout.includes('redirect("/app")'), "customers fail closed before Admin shell data renders");
  assert.ok(appLayout.includes('identity.state === "INTERNAL_STAFF"') && appLayout.includes('redirect("/admin")'));
  assert.ok(appLayout.includes('identity.state === "STAFF_VIEWING_CLIENT"'), "valid explicit staff context enters normal customer UI");

  const enter = read("app", "admin", "(shell)", "clients", "[tenantId]", "staff-workspace-actions.ts");
  const exit = read("app", "app", "staff-workspace-actions.ts");
  const staffCookie = read("lib", "identity", "staff-workspace.ts");
  assert.ok(enter.includes("requireOwnerContext") && enter.includes("getAgencyTenant"));
  assert.equal(enter.includes("isMemberOfTenant"), false, "staff workspace entry must not depend on customer membership");
  assert.ok(enter.includes("setStaffWorkspaceCookie") && enter.includes('setWorkspaceModeCookie') && enter.includes('redirect("/app")'));
  assert.ok(exit.includes("clearStaffWorkspaceCookie") && exit.includes('redirect("/admin")'));
  assert.ok(staffCookie.includes("createHmac") && staffCookie.includes("timingSafeEqual"));
  assert.ok(staffCookie.includes("15 * 60") && staffCookie.includes("expiresAt"));
  assert.ok(staffCookie.includes("subject") && staffCookie.includes("tenantId"));

  const onboarding = read("app", "api", "platform", "onboarding", "route.ts");
  const auditCheckout = read("app", "api", "platform", "audit", "checkout", "route.ts");
  assert.ok(onboarding.includes("Staff accounts must create clients from the Admin workspace"));
  assert.ok(auditCheckout.includes("Staff accounts cannot start customer checkout"));

  // CUSTOMER INTEGRATIONS
  const integrations = read("app", "app", "integrations", "page.tsx");
  for (const forbidden of ["WABA ID", "Phone number ID", "shadow_mode", "inbound_enabled", "outbound_enabled", "WhatsAppAgentPairingCard", "linkCommandPrefix", "WhatsApp Business"]) {
    assert.equal(integrations.includes(forbidden), false, `customer integrations must not expose ${forbidden}`);
  }
  assert.ok(integrations.includes("WhatsApp Number"));
  const safeStatus = read("app", "api", "platform", "integrations", "status", "route.ts");
  assert.ok(safeStatus.includes('select("status")') && !safeStatus.includes("waba_id") && !safeStatus.includes("phone_number_id"));
  const rawBindings = read("app", "api", "platform", "whatsapp", "bindings", "route.ts");
  assert.ok(rawBindings.includes("requireOwnerContext"), "raw binding operations remain staff-only");

  // COPILOT / SHELL
  const adminNav = read("components", "shell", "navigation", "admin-nav-data.ts");
  assert.equal((adminNav.match(/href: "\/admin\/copilot"/g) ?? []).length, 1);
  const legacyCopilot = read("app", "admin", "(shell)", "social", "copilot", "page.tsx");
  assert.ok(legacyCopilot.includes('redirect("/admin/copilot?context=social")'));
  const socialLayout = read("app", "admin", "(shell)", "social", "layout.tsx");
  assert.ok(socialLayout.includes('href="/admin/copilot?context=social"'));
  assert.equal(/\["Copilot",/.test(socialLayout), false);
  assert.ok(exists("app", "admin", "(shell)", "social", "page.tsx"));
  assert.equal(exists("app", "admin", "(shell)", "social", "SocialShell.tsx"), false);
  assert.equal(exists("app", "admin", "(shell)", "social", "nav.ts"), false);
  assert.ok(adminLayout.includes("<AppShell"));
  const canonicalCopilot = read("app", "admin", "(shell)", "copilot", "page.tsx");
  assert.ok(canonicalCopilot.includes('context !== "social"') && canonicalCopilot.includes("CopilotFullPage"));

  const principals = read("lib", "agent-core", "web-principal.ts");
  assert.ok(principals.includes("buildClientPrincipal") && principals.includes("requireTenantContext"));
  assert.ok(principals.includes("buildStaffPrincipal") && principals.includes("requirePlatformStaff"));
  const registry = read("packages", "agent-core", "src", "tools", "registry.ts");
  assert.ok(registry.includes('principal.kind === "staff"'), "customer principal cannot receive admin tools");
  const orchestrator = read("packages", "agent-core", "src", "orchestrator.ts");
  assert.ok(orchestrator.includes('decision.action === "confirm_required"') && orchestrator.includes("createActionConfirmation"), "mutating Copilot tools retain confirmation gates");

  // PLAN / BRAND / OPERATIONS TRUTH
  assert.equal(isActivePaidSubscription({ status: "payment_failed", plan_tier: "starter" }), false);
  assert.equal(isActivePaidSubscription({ status: "pending_payment", plan_tier: "starter" }), false);
  assert.equal(isActivePaidSubscription({ status: "active", plan_tier: "starter" }), true);
  assert.equal(isActivePaidSubscription(null), false, "membership alone cannot fabricate a paid plan");
  const billing = read("app", "app", "billing", "page.tsx");
  assert.ok(billing.includes('title="Free"') && billing.includes("No active paid plan"));
  assert.ok(exists("app", "app", "brand", "page.tsx"), "customer tenant Brand Brain remains available");
  const team = read("app", "admin", "(shell)", "team", "page.tsx");
  assert.ok(team.includes("Staff with client memberships") && team.includes("tenant_members"));

  console.log("p0-product-boundaries.test.ts: ALL PASS (identity precedence, staff workspace, onboarding, safe integrations, canonical Copilot/Social shell, plan truth, Brand boundary, dual-membership diagnostic)");
}

run();

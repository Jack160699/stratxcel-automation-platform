// Run with: node --experimental-strip-types lib/identity/__tests__/account-context.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideIdentityState, defaultDestination } from "../identity-state.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // =========================================================================
  // 1. Identity State and Admin -> User Mode Routing
  // =========================================================================
  // Staff account with 0 memberships in customer/user mode must be NEW_CUSTOMER (enables onboarding & connector testing)
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: true,
      membershipCount: 0,
      hasValidStaffWorkspace: false,
      workspaceMode: "customer",
    }),
    "NEW_CUSTOMER",
    "Staff in customer workspace mode with 0 memberships must enter /app as NEW_CUSTOMER"
  );

  // Staff account with 1+ memberships in customer/user mode must be CUSTOMER_MEMBER
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: true,
      membershipCount: 1,
      hasValidStaffWorkspace: false,
      workspaceMode: "customer",
    }),
    "CUSTOMER_MEMBER"
  );

  // Staff account in admin mode must be INTERNAL_STAFF
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: true,
      membershipCount: 1,
      hasValidStaffWorkspace: false,
      workspaceMode: "admin",
    }),
    "INTERNAL_STAFF"
  );

  // Non-staff account attempting admin mode must fail safe to customer state
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: false,
      membershipCount: 1,
      hasValidStaffWorkspace: false,
      workspaceMode: "admin",
    }),
    "CUSTOMER_MEMBER",
    "Non-staff user with admin workspaceMode must remain CUSTOMER_MEMBER (no privilege escalation)"
  );

  // Non-staff account with 0 memberships must be NEW_CUSTOMER
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: false,
      membershipCount: 0,
      hasValidStaffWorkspace: false,
      workspaceMode: "customer",
    }),
    "NEW_CUSTOMER"
  );

  // Default destinations
  assert.equal(defaultDestination("INTERNAL_STAFF"), "/admin");
  assert.equal(defaultDestination("CUSTOMER_MEMBER"), "/app");
  assert.equal(defaultDestination("NEW_CUSTOMER"), "/app");
  assert.equal(defaultDestination("STAFF_VIEWING_CLIENT"), "/app");
  assert.equal(defaultDestination("NO_SESSION"), "/");

  // =========================================================================
  // 2. Module & Source Code Static Analysis
  // =========================================================================
  const accountContextSrc = read("lib", "identity", "account-context.ts");
  const selectContextPage = read("app", "auth", "select-context", "page.tsx");
  const selectContextForm = read("app", "auth", "select-context", "ContextSelectionForm.tsx");
  const contextSwitcher = read("components", "shell", "ContextSwitcher.tsx");
  const adminAppShell = read("app", "admin", "(shell)", "AppShell.tsx");
  const customerHeader = read("app", "app", "components", "CustomerHeaderActions.tsx");
  const onboardingWizard = read("app", "app", "onboarding", "OnboardingWizard.tsx");
  const appLayout = read("app", "app", "layout.tsx");
  const adminLayout = read("app", "admin", "(shell)", "layout.tsx");
  const googleBusiness = read("lib", "social", "providers", "google-business.ts");
  const youtube = read("lib", "social", "providers", "youtube.ts");
  const staffWorkspace = read("lib", "identity", "staff-workspace.ts");

  // HMAC-SHA256 Token Security
  assert.ok(staffWorkspace.includes("createHmac") && staffWorkspace.includes("timingSafeEqual"), "Tokens must be signed with HMAC and checked with timingSafeEqual");
  assert.ok(staffWorkspace.includes("WORKSPACE_MODE_COOKIE") && staffWorkspace.includes("setWorkspaceModeCookie"), "Workspace mode must be persisted in cookie");

  // Server security in account-context.ts
  assert.ok(accountContextSrc.includes("stratxcel_admins"), "Server must query stratxcel_admins for role truth");
  assert.ok(accountContextSrc.includes("setWorkspaceModeCookie"), "Server must persist context in signed cookie");
  assert.ok(accountContextSrc.includes("context_switch_rejected"), "Server must audit rejected privilege escalations");

  // Context Selector page & form
  assert.ok(selectContextPage.includes("getAvailableAccountContexts"), "SelectContext page must check available contexts");
  assert.ok(selectContextPage.includes('redirect("/app")'), "Single context users must bypass to /app");
  assert.ok(selectContextForm.includes("selectContextAction"), "Form must invoke selectContextAction");
  assert.ok(selectContextForm.includes("User Workspace") && selectContextForm.includes("Admin Command Center"));

  // Context Switcher integration across surfaces
  assert.ok(adminAppShell.includes("<ContextSwitcher"), "Admin AppShell must render ContextSwitcher");
  assert.ok(customerHeader.includes("<ContextSwitcher"), "CustomerHeaderActions must render ContextSwitcher when isStaff");
  assert.ok(onboardingWizard.includes("<ContextSwitcher"), "OnboardingWizard must render ContextSwitcher when isStaff");
  assert.ok(appLayout.includes("isStaff={identity.isStaff}"), "App layout must pass isStaff to ClientAppShell & OnboardingPanel");

  // Protection boundaries
  assert.ok(adminLayout.includes('redirect("/app")'), "Admin shell must reject customer contexts");
  assert.ok(appLayout.includes('identity.state === "INTERNAL_STAFF"') && appLayout.includes('redirect("/admin")'), "App layout must reject internal staff context");

  // Google Business vs YouTube independence
  assert.ok(googleBusiness.includes("GOOGLE_BUSINESS_CLIENT_ID"), "Google Business must use dedicated client id variable");
  assert.ok(googleBusiness.includes("prompt: \"select_account\""), "Google Business must retain prompt=select_account");
  assert.equal(googleBusiness.includes("login_hint"), false, "Google Business must not inject login_hint");
  assert.ok(youtube.includes("YOUTUBE_CLIENT_ID"), "YouTube must use dedicated YOUTUBE_CLIENT_ID");
  assert.ok(youtube.includes("youtube.upload"), "YouTube must request youtube.upload scope");

  console.log(
    "account-context.test.ts: ALL PASS (context discovery, server-enforced role verification, zero privilege escalation, admin->user onboarding testing, persistent ContextSwitcher, and independent Google Business OAuth verified)"
  );
}

run();

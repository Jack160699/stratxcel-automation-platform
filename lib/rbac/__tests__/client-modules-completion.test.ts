// Run with: node --experimental-strip-types lib/rbac/__tests__/client-modules-completion.test.ts
//
// Regression guard for the client-module completion pass (branch
// feat/stratxcel-core-product-experience): Copilot, Website, Ads, CRM,
// Conversations, Files, Reports, Team, Settings, plus their new API routes
// and shared components. Asserts against source, same reason every other
// Server/Client-Component test in this build does: these pages read
// next/headers cookies() indirectly (via the layout gate) or React hooks
// that only resolve inside a real Next.js request/browser context.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAV_GROUPS_DATA } from "../../../components/shell/navigation/app-nav-data.ts";
import { flattenNavGroups } from "../../../components/shell/navigation/active-route.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  // --- 1. Every required /app route exists, including new detail routes ---
  const requiredPages = [
    ["app", "app", "copilot", "page.tsx"],
    ["app", "app", "website", "page.tsx"],
    ["app", "app", "ads", "page.tsx"],
    ["app", "app", "crm", "page.tsx"],
    ["app", "app", "crm", "[leadId]", "page.tsx"],
    ["app", "app", "conversations", "page.tsx"],
    ["app", "app", "files", "page.tsx"],
    ["app", "app", "files", "[artifactId]", "page.tsx"],
    ["app", "app", "reports", "page.tsx"],
    ["app", "app", "team", "page.tsx"],
    ["app", "app", "settings", "page.tsx"],
  ];
  for (const parts of requiredPages) {
    assert.ok(exists(...parts), `${parts.join("/")} must exist`);
  }

  // --- 2. No module in scope for this pass remains a generic FoundationPage ---
  for (const parts of [
    ["app", "app", "copilot", "page.tsx"],
    ["app", "app", "files", "page.tsx"],
    ["app", "app", "reports", "page.tsx"],
    ["app", "app", "team", "page.tsx"],
    ["app", "app", "settings", "page.tsx"],
  ]) {
    const source = read(...parts);
    assert.equal(/FoundationPage/.test(source), false, `${parts.join("/")} must no longer render the generic FoundationPage placeholder`);
    assert.ok(/"use client"/.test(source), `${parts.join("/")} must be a real interactive client module, not a static server placeholder`);
  }
  // CRM & Conversations redirect to /app in customer V1
  assert.ok(/redirect\("\/app"\)/.test(read("app", "app", "crm", "page.tsx")), "CRM must redirect to /app in customer V1");
  assert.ok(/redirect\("\/app"\)/.test(read("app", "app", "conversations", "page.tsx")), "Conversations must redirect to /app in customer V1");
  // Website/Ads keep "use client" real interfaces too, but intentionally still
  // show disconnected states (no backend exists) — checked separately below.
  for (const parts of [
    ["app", "app", "website", "page.tsx"],
    ["app", "app", "ads", "page.tsx"],
  ]) {
    const source = read(...parts);
    assert.equal(/FoundationPage/.test(source), false, `${parts.join("/")} must no longer render the generic FoundationPage placeholder`);
    assert.ok(/"use client"/.test(source), `${parts.join("/")} must be a real interface, not the old server-only placeholder`);
  }

  // --- 3. Copilot never fabricates runtime output -----------------------
  const copilot = read("app", "app", "copilot", "page.tsx");
  assert.ok(/RuntimeStatus/.test(copilot), "Copilot must render the shared RuntimeStatus indicator");
  assert.equal(/state=["']RUNNING["']|state:\s*["']RUNNING["']/.test(copilot), false, "Copilot must never hardcode a RUNNING mission state client-side");
  assert.ok(/POST.*api\/platform\/missions|fetch\("\/api\/platform\/missions"/s.test(copilot), "Copilot mission submission must call the real missions API, not a mock");
  const runtimeStatus = read("app", "app", "components", "RuntimeStatus.tsx");
  assert.ok(/state = ["']disconnected["']/.test(runtimeStatus), "RuntimeStatus must default to disconnected — Hermes execution is not connected in this build phase");

  // --- 4. Website/Ads: no real production/spend/publish action -----------
  const website = read("app", "app", "website", "page.tsx");
  assert.ok(/DisconnectedState/.test(website), "Website must use the shared DisconnectedState component for Preview/production");
  assert.ok(/Production promotion requires approval/.test(website), "Website must state that production promotion always requires approval");
  assert.equal(/\/api\/platform\/(deploy|production|vercel)/.test(website), false, "Website must not call any real deploy/production API — none exists");

  const ads = read("app", "app", "ads", "page.tsx");
  assert.ok(/Spend safety/.test(ads), "Ads must include a spend-safety explanation");
  assert.equal(/\/api\/platform\/(ads|spend|publish)/.test(ads), false, "Ads must not call any real spend/publish API — none exists");
  assert.equal(/state="connected"/.test(ads), false, "Ads must never render a connected ad-account state — none is ever connected in this build");

  // --- 5. CRM: tenant isolation on both the list and the write route ------
  const leadsRoute = read("app", "api", "platform", "leads", "route.ts");
  assert.ok(/requireTenantReadContext/.test(leadsRoute), "GET /api/platform/leads must gate on the customer-or-explicit-staff read context");
  assert.equal(/getTenantServiceContext/.test(leadsRoute), false, "GET /api/platform/leads is a plain read covered by crm_leads_tenant_read RLS — must use the session client, not service-role");

  const leadPatchRoute = read("app", "api", "platform", "leads", "[leadId]", "route.ts");
  assert.ok(/requireTenantContext/.test(leadPatchRoute), "PATCH /api/platform/leads/[leadId] must gate on requireTenantContext");
  assert.ok(
    /\.eq\("tenant_id", body\.tenantId\)/.test(leadPatchRoute),
    "PATCH /api/platform/leads/[leadId] must re-verify the lead belongs to the caller's own tenant before writing — a service-role write must never be pointed at another tenant's lead"
  );

  // --- 6. Owner-scoped Social data is never exposed to /app --------------
  for (const parts of [
    ["app", "app", "conversations", "page.tsx"],
    ["app", "app", "crm", "page.tsx"],
    ["app", "app", "crm", "[leadId]", "page.tsx"],
    ["components", "crm", "CrmWorkspace.tsx"],
  ]) {
    const source = read(...parts);
    assert.equal(/from\s+["']@\/lib\/social/.test(source), false, `${parts.join("/")} must never import from lib/social (owner-scoped)`);
    assert.equal(/social_(accounts|content_master|content_variants|messages)/.test(source), false, `${parts.join("/")} must never reference owner-scoped social_* tables`);
  }
  // Conversations no longer has its own fetch/render logic (it used to
  // duplicate, incompletely, what CRM now does properly) — it's a thin
  // redirect into the one unified CRM/inbox workspace at /app/crm, which
  // reads only whatsapp_conversations/whatsapp_messages (never Social's
  // owner-scoped tables, asserted above). Social's own DM/comment inbox
  // keeps its StaffScopedNotice on its own page, unchanged
  // (app/app/content/inbox/page.tsx) — it was never actually lost, just no
  // longer duplicated on a page that doesn't fetch anything Social-related.
  const conversations = read("app", "app", "conversations", "page.tsx");
  assert.ok(/redirect\("\/app"\)/.test(conversations), "Conversations must redirect to /app in customer V1");
  const contentInbox = read("app", "app", "content", "inbox", "page.tsx");
  assert.ok(/StaffScopedNotice/.test(contentInbox), "Social's own DM/comment inbox must still surface StaffScopedNotice");
  const crmWorkspace = read("components", "crm", "CrmWorkspace.tsx");
  assert.ok(/whatsapp\/conversations/.test(crmWorkspace), "CrmWorkspace must read through the real, tenant-scoped whatsapp conversations API");
  assert.equal(/shadow-messages/.test(crmWorkspace), false, "CrmWorkspace must never depend on the shadow-messages diagnostics route for primary inbox content");

  // --- 7. Files detail route stays tenant-scoped, no server-filesystem paths
  const artifactDetail = read("app", "app", "files", "[artifactId]", "page.tsx");
  assert.ok(/useCurrentTenant/.test(artifactDetail), "Artifact detail page must scope reads through the active tenant");
  assert.ok(/api\/platform\/artifacts/.test(artifactDetail), "Artifact detail page must read through the tenant-scoped artifacts API");
  assert.equal(/fs\.|require\(["']fs["']\)|process\.cwd\(\)/.test(artifactDetail), false, "Artifact detail page must never reference a server filesystem path");
  const artifactsRoute = read("app", "api", "platform", "artifacts", "route.ts");
  assert.ok(/requireTenantReadContext/.test(artifactsRoute), "GET /api/platform/artifacts must gate on the customer-or-explicit-staff read context");

  // --- 8. Reports never fabricate a metric --------------------------------
  const reports = read("app", "app", "reports", "page.tsx");
  assert.ok(/MetricUnavailable/.test(reports), "Reports must use MetricUnavailable for metrics with no real data source");
  assert.equal(/deltaLabel=["'][+-]\d/.test(reports), false, "Reports must never hardcode a fabricated numeric delta");
  assert.ok(/No ad account connected/.test(reports), "Reports must honestly disclose the missing ad-performance data source");

  // --- 9. Team never exposes stratxcel_admins -----------------------------
  const teamRoute = read("app", "api", "platform", "team", "route.ts");
  assert.equal(/\.from\(["']stratxcel_admins["']\)/.test(teamRoute), false, "app/api/platform/team/route.ts must never query stratxcel_admins");
  assert.ok(/\.from\(["']tenant_members["']\)/.test(teamRoute), "Team route must list real tenant_members rows");
  const teamPage = read("app", "app", "team", "page.tsx");
  assert.equal(/stratxcel_admins/.test(teamPage), false, "/app/team page must never reference stratxcel_admins");

  // --- 10. Unsupported Settings fields are not advertised as controls -----
  const settings = read("app", "app", "settings", "page.tsx");
  assert.equal(/draft only|\/app\/integrations/.test(settings), false, "Settings must not advertise unsupported draft or hidden integration surfaces");
  assert.equal(/method:\s*["'](PATCH|POST)["']/.test(settings), false, "Settings must not issue any write request for fields with no backing schema");

  // --- 11. Navigation: /app and /admin have deliberately SEPARATE information
  // architectures (components/shell/navigation/app-nav-data.ts and
  // admin-nav-data.ts) sharing only the visual Sidebar/CoreAppShell/icons —
  // a previous pass mapped one canonical nav item to both an appHref and an
  // adminHref, which conceptually merged two different products; that was
  // reverted. See app-nav-data.ts's and admin-nav-data.ts's header comments.
  const appNavData = read("components", "shell", "navigation", "app-nav-data.ts");
  const adminNavData = read("components", "shell", "navigation", "admin-nav-data.ts");
  assert.equal(/\bappHref\s*:|\badminHref\s*:/.test(appNavData + adminNavData), false, "neither nav-data file may reuse the old appHref/adminHref shared-item field shape");

  for (const href of [
    "/app",
    "/app/audit",
    "/app/brand",
    "/app/website",
    "/app/billing",
    "/app/team",
    "/app/settings",
    "/app/social/copilot",
    "/app/integrations",
  ]) {
    assert.ok(appNavData.includes(`href: "${href}"`), `app-nav-data.ts must include ${href}`);
  }
  for (const hiddenUntilComplete of [
    "/app/crm",
    "/app/copilot",
    "/app/missions",
    "/app/approvals",
    "/app/search",
    "/app/ads",
    "/app/reports",
  ]) {
    assert.equal(
      appNavData.includes(`href: "${hiddenUntilComplete}"`),
      false,
      `${hiddenUntilComplete} must stay out of closed-beta navigation until its primary workflow is operational`
    );
  }
  // Files stays reachable contextually — not a top-level V1 sidebar item.
  assert.equal(/href:\s*["']\/app\/files["']/.test(appNavData), false, "app-nav-data.ts must not list /app/files as a top-level destination");
  assert.equal(/href:\s*["']\/app\/content["']/.test(appNavData), false, "staff-scoped Content must not appear in the customer V1 navigation");
  const contentLayout = read("app", "app", "content", "layout.tsx");
  assert.ok(/redirect\(["']\/app["']\)/.test(contentLayout), "direct customer Content routes must recover to the tenant-safe command center");
  // Conversations is no longer a separate nav destination — merged into the
  // one CRM item (see app/app/conversations/page.tsx's redirect above).
  assert.equal(/href:\s*["']\/app\/conversations["']/.test(appNavData), false, "app-nav-data.ts must not list /app/conversations as its own destination");
  assert.equal(
    flattenNavGroups(APP_NAV_GROUPS_DATA).some((i) => i.release === "v2"),
    false,
    "customer /app nav must never declare release v2"
  );
  // /app must never carry agency-only staff destinations.
  for (const forbidden of ["/admin/clients", "/admin/handoffs", "/admin/operations", "/admin/system", "/admin/audit"]) {
    assert.equal(appNavData.includes(`href: "${forbidden}"`), false, `app-nav-data.ts must never include the agency-only route ${forbidden}`);
  }

  for (const href of ["/admin", "/admin/clients", "/admin/leads", "/admin/missions", "/admin/approvals", "/admin/handoffs", "/admin/operations", "/admin/social", "/admin/finance", "/admin/go-free-codes", "/admin/team", "/admin/integrations", "/admin/system", "/admin/audit"]) {
    assert.ok(adminNavData.includes(`href: "${href}"`), `admin-nav-data.ts must include ${href}`);
  }
  // V2 surfaces exist in admin-nav-data but are release:"v2" — Stable filter hides them.
  assert.ok(adminNavData.includes('href: "/admin/operating-brain"'), "operating-brain must remain classified in admin nav data");
  assert.ok(adminNavData.includes('href: "/admin/hermes"'), "hermes must remain classified in admin nav data");
  assert.ok(/release:\s*["']v2["']/.test(adminNavData), "admin nav must declare V2 items with release v2");
  // /admin must never carry client-only modules merely because they exist in /app.
  for (const forbidden of ["/app/copilot", "/app/website", "/app/ads", "/app/brand", "/app/files", "/app/billing", "/app/settings"]) {
    assert.equal(adminNavData.includes(`href: "${forbidden}"`), false, `admin-nav-data.ts must never include the client-only route ${forbidden}`);
  }

  const shell = read("app", "app", "ClientAppShell.tsx");
  assert.ok(/APP_SIDEBAR_GROUPS/.test(shell), "ClientAppShell must build its sidebar from the app-specific nav model");
  assert.equal(/ADMIN_SIDEBAR_GROUPS|ADMIN_NAV_GROUPS/.test(shell), false, "ClientAppShell must never import the admin nav model");
  assert.equal(/Beta|release-mode|AdminBetaModeToggle/.test(shell), false, "customer shell must never expose Beta mode");
  const adminShell = read("app", "admin", "(shell)", "AppShell.tsx");
  assert.ok(/getAdminSidebarGroups/.test(adminShell), "AppShell (admin) must build its sidebar from the admin-specific nav model");
  assert.ok(/AdminBetaModeToggle/.test(adminShell), "admin shell must expose the Beta mode toggle");
  assert.equal(/APP_SIDEBAR_GROUPS|APP_NAV_GROUPS/.test(adminShell), false, "AppShell (admin) must never import the client nav model");

  const mobileNavMatch = appNavData.match(/APP_MOBILE_NAV_KEYS = \[([\s\S]*?)\]/);
  assert.ok(mobileNavMatch, "APP_MOBILE_NAV_KEYS must be defined in app-nav-data.ts");
  const mobileNavItemCount = (mobileNavMatch![1].match(/"/g) ?? []).length / 2;
  assert.equal(mobileNavItemCount, 4, "Mobile bottom nav must stay at exactly 4 closed-beta items (Home, Audit, Copilot, CRM)");
  assert.ok(/mobileMoreGroups=\{APP_SIDEBAR_GROUPS\.map/.test(shell), "The mobile More sheet must be derived from APP_SIDEBAR_GROUPS, not a separately hand-maintained list");
  assert.ok(/mobileMoreGroups=\{sidebarGroups\.map/.test(adminShell), "Admin's mobile More sheet must be derived from the filtered admin sidebar groups");

  // --- 12. No service-role dependency in any new client-rendered module --
  for (const parts of [
    ["app", "app", "copilot", "page.tsx"],
    ["app", "app", "website", "page.tsx"],
    ["app", "app", "ads", "page.tsx"],
    ["app", "app", "crm", "page.tsx"],
    ["app", "app", "crm", "[leadId]", "page.tsx"],
    ["app", "app", "conversations", "page.tsx"],
    ["app", "app", "files", "page.tsx"],
    ["app", "app", "files", "[artifactId]", "page.tsx"],
    ["app", "app", "reports", "page.tsx"],
    ["app", "app", "team", "page.tsx"],
    ["app", "app", "settings", "page.tsx"],
  ]) {
    const source = read(...parts);
    assert.equal(
      /getTenantServiceContext|createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(source),
      false,
      `${parts.join("/")} must have no service-role dependency — it's a client component that only talks to tenant-scoped API routes`
    );
  }

  // --- 13. Shared disconnected/unavailable state components exist and are used
  for (const file of [
    "ModulePageHeader.tsx",
    "RuntimeStatus.tsx",
    "MissionSummaryCard.tsx",
    "ApprovalSummary.tsx",
    "ArtifactCard.tsx",
    "EmptyModuleState.tsx",
    "DisconnectedState.tsx",
    "IntegrationStatus.tsx",
    "DetailPanel.tsx",
    "MetricUnavailable.tsx",
  ]) {
    assert.ok(exists("app", "app", "components", file), `Shared module component app/app/components/${file} must exist`);
  }
  // CRM's empty/detail-panel behavior now lives inside components/crm/* — a
  // real messaging-app workspace (list / chat thread / details rail), not
  // the old DataTable + slide-in panel over a flat lead list.
  assert.ok(/EmptyState/.test(read("components", "crm", "ConversationList.tsx")), "CRM's conversation list must use the shared EmptyState for an empty inbox");
  assert.ok(/Drawer|Modal/.test(read("components", "crm", "CrmWorkspace.tsx")), "CRM's lead-details panel must reuse the shared Drawer/Modal overlay primitives below the desktop breakpoint");
  assert.ok(/DetailPanel/.test(read("app", "app", "files", "page.tsx")), "Files must use the shared DetailPanel for artifact quick-view");

  console.log(
    "client-modules-completion.test.ts: ALL PASS (routes exist, no leftover FoundationPage, Copilot/Website/Ads don't fabricate execution, CRM/Files/Team tenant isolation, no owner-scoped Social exposure, Reports honesty, Settings honesty, nav completeness, no service-role in client modules, shared components in use)"
  );
}

run();

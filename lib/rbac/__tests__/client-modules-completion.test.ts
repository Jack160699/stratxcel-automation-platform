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
    ["app", "app", "crm", "page.tsx"],
    ["app", "app", "files", "page.tsx"],
    ["app", "app", "reports", "page.tsx"],
    ["app", "app", "team", "page.tsx"],
    ["app", "app", "settings", "page.tsx"],
  ]) {
    const source = read(...parts);
    assert.equal(/FoundationPage/.test(source), false, `${parts.join("/")} must no longer render the generic FoundationPage placeholder`);
    assert.ok(/"use client"/.test(source), `${parts.join("/")} must be a real interactive client module, not a static server placeholder`);
  }
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
  assert.ok(/requireTenantContext/.test(leadsRoute), "GET /api/platform/leads must gate on requireTenantContext");
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
  ]) {
    const source = read(...parts);
    assert.equal(/from\s+["']@\/lib\/social/.test(source), false, `${parts.join("/")} must never import from lib/social (owner-scoped)`);
    assert.equal(/social_(accounts|content_master|content_variants|messages)/.test(source), false, `${parts.join("/")} must never reference owner-scoped social_* tables`);
  }
  const conversations = read("app", "app", "conversations", "page.tsx");
  assert.ok(/StaffScopedNotice/.test(conversations), "Conversations must surface Social's owner-scoped boundary via StaffScopedNotice, not fetch it");
  assert.ok(/whatsapp\/shadow-messages/.test(conversations), "Conversations must reuse the existing tenant-scoped whatsapp shadow-messages route, not a duplicate");

  // --- 7. Files detail route stays tenant-scoped, no server-filesystem paths
  const artifactDetail = read("app", "app", "files", "[artifactId]", "page.tsx");
  assert.ok(/useCurrentTenant/.test(artifactDetail), "Artifact detail page must scope reads through the active tenant");
  assert.ok(/api\/platform\/artifacts/.test(artifactDetail), "Artifact detail page must read through the tenant-scoped artifacts API");
  assert.equal(/fs\.|require\(["']fs["']\)|process\.cwd\(\)/.test(artifactDetail), false, "Artifact detail page must never reference a server filesystem path");
  const artifactsRoute = read("app", "api", "platform", "artifacts", "route.ts");
  assert.ok(/requireTenantContext/.test(artifactsRoute), "GET /api/platform/artifacts must gate on requireTenantContext");

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

  // --- 10. Unsupported Settings fields are never claimed as saved --------
  const settings = read("app", "app", "settings", "page.tsx");
  assert.ok(/not saved/.test(settings), "Settings must explicitly label unsupported fields as not saved");
  assert.equal(/method:\s*["'](PATCH|POST)["']/.test(settings), false, "Settings must not issue any write request for fields with no backing schema");

  // --- 11. Navigation: desktop sidebar has every module, mobile bar stays lean
  const shell = read("app", "app", "ClientAppShell.tsx");
  for (const href of [
    "/app/copilot",
    "/app/missions",
    "/app/approvals",
    "/app/content",
    "/app/brand",
    "/app/website",
    "/app/ads",
    "/app/crm",
    "/app/conversations",
    "/app/files",
    "/app/reports",
    "/app/integrations",
    "/app/billing",
    "/app/team",
    "/app/settings",
  ]) {
    assert.ok(shell.includes(`href: "${href}"`), `ClientAppShell's desktop sidebar must include ${href}`);
  }
  const mobileNavMatch = shell.match(/const MOBILE_NAV = \[([\s\S]*?)\];/);
  assert.ok(mobileNavMatch, "MOBILE_NAV must be defined");
  const mobileNavItemCount = (mobileNavMatch![1].match(/key:/g) ?? []).length;
  assert.equal(mobileNavItemCount, 4, "Mobile bottom nav must stay at exactly 4 items (Home, Copilot, Missions, Approvals) — everything else lives in the More sheet");
  assert.ok(/mobileMoreGroups=\{SIDEBAR_GROUPS\.map/.test(shell), "The mobile More sheet must be derived from SIDEBAR_GROUPS, not a separately hand-maintained list");

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
  assert.ok(/EmptyModuleState/.test(read("app", "app", "crm", "page.tsx")), "CRM must use the shared EmptyModuleState for empty lists");
  assert.ok(/DetailPanel/.test(read("app", "app", "crm", "page.tsx")), "CRM must use the shared DetailPanel (desktop drawer + mobile sheet) for lead quick-view");
  assert.ok(/DetailPanel/.test(read("app", "app", "files", "page.tsx")), "Files must use the shared DetailPanel for artifact quick-view");

  console.log(
    "client-modules-completion.test.ts: ALL PASS (routes exist, no leftover FoundationPage, Copilot/Website/Ads don't fabricate execution, CRM/Files/Team tenant isolation, no owner-scoped Social exposure, Reports honesty, Settings honesty, nav completeness, no service-role in client modules, shared components in use)"
  );
}

run();

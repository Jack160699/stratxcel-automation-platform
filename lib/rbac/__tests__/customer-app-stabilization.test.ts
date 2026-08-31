import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideIdentityState } from "../../identity/identity-state.ts";
import { decideTenantReadAccess } from "../../tenants/read-access-decision.ts";
import { customerSafeError, loadCustomerJson } from "../../customer-app/load-result.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

async function run() {
  // Dual-role customer intent is ordinary customer membership, even if a
  // stale signed staff token still exists.
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: true,
      membershipCount: 1,
      hasValidStaffWorkspace: true,
      workspaceMode: "customer",
    }),
    "CUSTOMER_MEMBER"
  );
  assert.equal(
    decideTenantReadAccess({
      isStaff: true,
      hasMembership: true,
      workspaceMode: "customer",
      staffWorkspaceTenantId: "tenant-a",
      requestedTenantId: "tenant-a",
    }),
    "customer"
  );

  // Staff support remains explicit, signed, and exact-tenant only.
  assert.equal(
    decideTenantReadAccess({
      isStaff: true,
      hasMembership: false,
      workspaceMode: "admin",
      staffWorkspaceTenantId: "tenant-a",
      requestedTenantId: "tenant-a",
    }),
    "staff_support"
  );
  assert.equal(
    decideTenantReadAccess({
      isStaff: true,
      hasMembership: false,
      workspaceMode: "admin",
      staffWorkspaceTenantId: null,
      requestedTenantId: "tenant-a",
    }),
    "deny"
  );
  assert.equal(
    decideTenantReadAccess({
      isStaff: true,
      hasMembership: true,
      workspaceMode: "admin",
      staffWorkspaceTenantId: "tenant-b",
      requestedTenantId: "tenant-a",
    }),
    "deny"
  );

  // Every affected customer GET endpoint delegates to the same central gate.
  const customerGetRoutes = [
    ["app", "api", "platform", "brand", "route.ts"],
    ["app", "api", "platform", "team", "route.ts"],
    ["app", "api", "platform", "leads", "route.ts"],
    ["app", "api", "platform", "crm", "follow-ups", "route.ts"],
    ["app", "api", "platform", "crm", "appointments", "route.ts"],
    ["app", "api", "platform", "wallet", "route.ts"],
    ["app", "api", "platform", "billing-profile", "route.ts"],
    ["app", "api", "platform", "subscriptions", "route.ts"],
    ["app", "api", "platform", "artifacts", "route.ts"],
    ["app", "api", "platform", "missions", "route.ts"],
    ["app", "api", "platform", "approvals", "route.ts"],
  ];
  for (const route of customerGetRoutes) {
    assert.ok(read(...route).includes("requireTenantReadContext"), `${route.join("/")} must use the customer read gate`);
  }

  // Loader behavior: rejected and infrastructure-error responses always
  // resolve to a customer-safe terminal error instead of remaining loading.
  const rejected = await loadCustomerJson<{ value: string }>(
    async () => {
      throw new Error("offline");
    },
    "Please try again."
  );
  assert.deepEqual(rejected, { status: "error", message: "Please try again." });

  const infrastructureFailure = await loadCustomerJson<{ value: string }>(
    async () =>
      new Response(JSON.stringify({ error: "Valid staff workspace context required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    "We couldn't load this workspace."
  );
  assert.deepEqual(infrastructureFailure, { status: "error", message: "We couldn't load this workspace." });
  assert.equal(customerSafeError("Row-level security denied tenant_members", "Safe message"), "Safe message");

  const success = await loadCustomerJson<{ value: string }>(
    async () =>
      new Response(JSON.stringify({ value: "ready" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    "Please try again."
  );
  assert.deepEqual(success, { status: "success", data: { value: "ready" } });

  const commandCenter = read("app", "app", "page.tsx");
  assert.equal(commandCenter.includes("listMissionsForTenant"), false);
  assert.equal(commandCenter.includes("listPendingApprovals"), false);
  assert.equal(/\/app\/(missions|approvals)/.test(commandCenter), false);

  const nav = read("components", "shell", "navigation", "app-nav-data.ts");
  for (const href of ["/app", "/app/audit", "/app/content", "/app/growth", "/app/brand", "/app/billing", "/app/team", "/app/settings", "/app/integrations", "/app/website"]) {
    assert.ok(nav.includes(`href: "${href}"`), `${href} must remain a V1 destination`);
  }
  assert.equal(nav.includes('href: "/app/crm"'), false, "/app/crm must NOT be in customer V1 navigation");
  // Checks the real gate usage (the re-export from the shared component),
  // not a bare mention of the identifier -- a layout is free to reference
  // NotV1CustomerRoute in an explanatory comment (e.g. documenting why a
  // route is no longer gated) without that counting as still using it.
  const usesGate = (layoutSource: string) => /from\s*["'][^"']*\/components\/NotV1CustomerRoute["']/.test(layoutSource);
  for (const segment of ["missions", "approvals", "copilot", "ads", "files", "reports"]) {
    assert.ok(
      usesGate(read("app", "app", segment, "layout.tsx")),
      `/app/${segment} must terminate at the V1 route boundary`
    );
  }
  assert.equal(usesGate(read("app", "app", "website", "layout.tsx")), false, "Website at /app/website must be reachable");
  assert.equal(usesGate(read("app", "app", "social", "layout.tsx")), false, "Copilot at /app/social/copilot must be reachable");
  assert.equal(usesGate(read("app", "app", "integrations", "layout.tsx")), false, "Connectors at /app/integrations must be reachable");
  // Update 14 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): the
  // Search Growth OS gate was lifted once its root cause -- 13 real
  // fabrication defects in SearchGrowthDashboardView.tsx, not an
  // unresolvable product gap -- was found and fixed. Real protection for
  // this route is unchanged: app/app/layout.tsx still enforces
  // auth/tenant resolution, and page.tsx's own EntitlementGate
  // (minTier="growth") still enforces the paid-tier boundary. Reachable
  // today via the real, already-live Search Console connect flow on
  // /app/integrations, whose OAuth callback lands here.
  assert.equal(usesGate(read("app", "app", "search", "layout.tsx")), false, "Search Growth OS at /app/search must be reachable");
  assert.ok(read("app", "app", "search", "page.tsx").includes('minTier="growth"'), "Search Growth OS must still be paid-tier gated via EntitlementGate");

  const settings = read("app", "app", "settings", "page.tsx");
  assert.equal(settings.includes("/app/integrations"), false);
  assert.equal(settings.includes("/app/brand"), false);
  assert.equal(settings.includes("draft only"), false);

  const brand = read("app", "app", "brand", "page.tsx");
  const team = read("app", "app", "team", "page.tsx");
  const crm = read("components", "crm", "CrmWorkspace.tsx");
  assert.ok(brand.includes("loadCustomerJson") && brand.includes("setContent(null)") && brand.includes("onRetry={load}"));
  assert.ok(team.includes("loadCustomerJson") && team.includes("setMembers(null)") && team.includes("No team members found."));
  assert.ok(crm.includes("loadCustomerJson") && crm.includes("setLeads([])") && crm.includes("setConversations([])"));

  const shell = read("components", "shell", "CoreAppShell.tsx");
  assert.ok(shell.includes('src="/logo-v2.png"') && shell.includes("OFFICIAL_LOGO"));
  assert.equal(shell.includes('from "@/app/components/Mark"'), false);
  assert.ok(shell.includes('showSearch={product !== "App"}'), "customer App shell must not advertise the unfinished search surface");

  const staffIntent = read("lib", "identity", "staff-workspace.ts");
  assert.ok(staffIntent.includes('if (mode === "customer") await clearStaffWorkspaceCookie()'));
  const enterClient = read("app", "admin", "(shell)", "clients", "[tenantId]", "staff-workspace-actions.ts");
  assert.ok(enterClient.includes('setWorkspaceModeCookie(ctx.ownerId, "admin")'));

  console.log("customer-app-stabilization.test.ts: ALL PASS");
}

await run();

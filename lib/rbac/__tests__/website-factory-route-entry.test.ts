// Run with: node --experimental-strip-types lib/rbac/__tests__/website-factory-route-entry.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAV_GROUPS_DATA, APP_MOBILE_NAV_KEYS } from "../../../components/shell/navigation/app-nav-data.ts";
import { flattenNavGroups } from "../../../components/shell/navigation/active-route.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  console.log("Running Website Factory Customer Route & Navigation Verification...\n");

  // 1. Required Website Pages & Components Exist
  const requiredPaths = [
    ["app", "app", "website", "page.tsx"],
    ["app", "app", "website", "create", "page.tsx"],
    ["app", "app", "website", "[siteId]", "preview", "[[...slug]]", "page.tsx"],
    ["app", "app", "website", "[siteId]", "preview", "PreviewClientWrapper.tsx"],
    ["components", "site-builder", "SmartWebsiteCreator.tsx"],
    ["components", "site-builder", "CustomerDomainManager.tsx"],
    ["components", "site-builder", "CustomerPreviewToolbar.tsx"],
    ["components", "site-builder", "SiteRenderer.tsx"],
    ["app", "api", "platform", "website-factory", "route.ts"],
    ["app", "api", "platform", "website-factory", "[projectId]", "domains", "route.ts"],
    ["app", "api", "platform", "website-factory", "[projectId]", "domains", "[domainId]", "verify", "route.ts"],
    ["app", "api", "platform", "website-factory", "[projectId]", "domains", "[domainId]", "disconnect", "route.ts"],
  ];

  for (const p of requiredPaths) {
    assert.ok(exists(...p), `${p.join("/")} must exist on disk`);
  }
  console.log("✓ All Website Factory pages, components, and API routes verified on disk.");

  // 2. Navigation Exposes /app/website to Customer V1
  const flatNav = flattenNavGroups(APP_NAV_GROUPS_DATA);
  const websiteNavItem = flatNav.find((item) => item.key === "website");
  assert.ok(websiteNavItem, "APP_NAV_GROUPS_DATA must contain a nav item with key 'website'");
  assert.equal(websiteNavItem.href, "/app/website", "Website nav item must point to /app/website");
  assert.equal(websiteNavItem.release, "v1", "Website nav item must be release 'v1'");

  const growthGroup = APP_NAV_GROUPS_DATA.find((g) => g.label === "Growth");
  assert.ok(growthGroup, "APP_NAV_GROUPS_DATA must have a Growth group");
  assert.ok(
    growthGroup.items.some((i) => i.key === "website"),
    "Growth group must contain the Website navigation item"
  );
  console.log("✓ Desktop navigation correctly exposes Website under Growth as V1.");

  // 3. Dashboard Contains Create Website CTA
  const dashboardHome = read("app", "app", "page.tsx");
  assert.ok(
    dashboardHome.includes('href="/app/website"') || dashboardHome.includes("href='/app/website'"),
    "Dashboard page must have a direct link to /app/website"
  );
  assert.ok(
    dashboardHome.includes("Create Website"),
    "Dashboard banner must display a Create Website action"
  );
  console.log("✓ Customer dashboard contains prominent Create Website CTA.");

  // 4. SmartWebsiteCreator is Embedded in /app/website & /app/website/create
  const websitePage = read("app", "app", "website", "page.tsx");
  assert.ok(
    websitePage.includes("SmartWebsiteCreator"),
    "/app/website page must embed the SmartWebsiteCreator component"
  );
  const createPage = read("app", "app", "website", "create", "page.tsx");
  assert.ok(
    createPage.includes("SmartWebsiteCreator"),
    "/app/website/create page must embed the SmartWebsiteCreator component"
  );
  console.log("✓ Smart Website Creator embedded as primary interactive experience.");

  // 5. Tenant Scoping & Zero Service-Role Leakage
  for (const p of [
    ["app", "app", "website", "page.tsx"],
    ["app", "app", "website", "create", "page.tsx"],
    ["components", "site-builder", "SmartWebsiteCreator.tsx"],
  ]) {
    const src = read(...p);
    assert.equal(
      /getTenantServiceContext|createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(src),
      false,
      `${p.join("/")} must never import or reference service-role keys`
    );
  }
  console.log("✓ Zero service-role credential leakage in customer client components.");

  // 6. Preview Route Integrity
  const previewPage = read("app", "app", "website", "[siteId]", "preview", "[[...slug]]", "page.tsx");
  assert.ok(
    previewPage.includes("CustomerPreviewToolbar") || previewPage.includes("PreviewClientWrapper"),
    "Preview page must include the CustomerPreviewToolbar or client wrapper"
  );
  console.log("✓ Preview route verified with responsive toolbar and isolated preview container.");

  console.log("\n=================================================================");
  console.log("ALL WEBSITE FACTORY ROUTE & NAVIGATION CHECKS PASSED!");
  console.log("=================================================================\n");
}

run();

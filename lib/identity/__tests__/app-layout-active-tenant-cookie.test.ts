// Run with: node --experimental-strip-types lib/identity/__tests__/app-layout-active-tenant-cookie.test.ts
//
// Real, live bug found and fixed this session: app/app/layout.tsx computed
// its Server-Component "active" tenant as a hardcoded `tenants[0]`, never
// consulting the real ACTIVE_TENANT_COOKIE that ClientSwitcher's "Switch
// Workspace" UI writes via setActiveTenantAction (lib/tenants/current-tenant.ts
// / app/app/tenant-actions.ts). A client-side switchTenant() call looked
// like it worked -- the shop switcher UI updated instantly and every
// client-fetched API call used the newly selected tenant, because that
// update lived only in the client's in-memory React state -- but any hard
// navigation re-ran the layout fresh server-side and silently reverted back
// to whichever tenant listMyTenants happened to return first. Every real
// customer to date has exactly one tenant membership, so tenants[0] was
// always trivially correct in production; this only surfaces once an
// account holds 2+ real memberships, which is exactly the scenario the
// switcher exists for. This is a source-level proof (not a runtime mock)
// because the layout is an async Server Component wired to real
// authentication, cookies(), and Supabase -- there is no seam to exercise it
// in a plain-node runner without a much larger integration harness.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const layoutSrc = readFileSync(resolve(root, "app/app/layout.tsx"), "utf8");
const currentTenantSrc = readFileSync(resolve(root, "lib/tenants/current-tenant.ts"), "utf8");

function run() {
  // The layout must import the same ACTIVE_TENANT_COOKIE constant that
  // resolveCurrentTenant() and setActiveTenantAction() both use -- a
  // locally-redeclared string would silently drift from the real cookie
  // name the switcher actually writes.
  assert.ok(
    layoutSrc.includes('import { ACTIVE_TENANT_COOKIE } from "@/lib/tenants/current-tenant"'),
    "layout.tsx must import the real ACTIVE_TENANT_COOKIE constant, not redeclare its own"
  );
  assert.ok(currentTenantSrc.includes('export const ACTIVE_TENANT_COOKIE = "stratxcel_active_tenant"'), "the real cookie name must be unchanged");

  // The old, buggy unconditional `const active = tenants[0];` must be gone.
  assert.equal(/const active = tenants\[0\];/.test(layoutSrc), false, "the old unconditional tenants[0] assignment must no longer exist");

  // The real fix: read the cookie, and only trust it when it matches an
  // entry in the tenants this exact user was already verified to belong to
  // (the same trust boundary resolveCurrentTenant() documents and enforces)
  // -- never trust an arbitrary cookie value directly.
  assert.match(
    layoutSrc,
    /const activeTenantCookieId =\s*\n?\s*identity\.state === "STAFF_VIEWING_CLIENT" \? undefined : \(await cookies\(\)\)\.get\(ACTIVE_TENANT_COOKIE\)\?\.value;/,
    "layout.tsx must read the real active-tenant cookie for every non-staff-support state"
  );
  assert.match(
    layoutSrc,
    /const active = \(activeTenantCookieId && tenants\.find\(\(t\) => t\.tenantId === activeTenantCookieId\)\) \|\| tenants\[0\];/,
    "the selected active tenant must be re-verified against the real fetched tenants array, falling back to tenants[0] exactly as before when the cookie is missing/invalid/stale"
  );

  // STAFF_VIEWING_CLIENT must be explicitly excluded -- that path's
  // single-entry tenants array comes from the separate signed
  // stratxcel_staff_workspace cookie, not this one, and must keep behaving
  // exactly as it did before this fix.
  assert.ok(
    layoutSrc.includes('identity.state === "STAFF_VIEWING_CLIENT" ? undefined :'),
    "STAFF_VIEWING_CLIENT must be excluded from the active-tenant-cookie lookup"
  );

  console.log("app-layout-active-tenant-cookie.test.ts: ALL PASS (real ACTIVE_TENANT_COOKIE now drives Server-Component tenant selection, re-verified against real membership, tenants[0] fallback preserved, STAFF_VIEWING_CLIENT unaffected)");
}

run();

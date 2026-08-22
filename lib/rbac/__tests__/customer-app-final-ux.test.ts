import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCustomerPlanSummary } from "../../billing/customer-plan.ts";

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), "utf8");

const commandCenter = read("app", "app", "page.tsx");
assert.match(commandCenter, /Online Health/);
assert.match(commandCenter, /Today('s|&apos;s) Priorities/);
assert.match(commandCenter, /Quick tools/i);
assert.doesNotMatch(commandCenter, /JourneyPanel|Your setup|setup checklist/i);

const header = read("app", "app", "components", "CustomerHeaderActions.tsx");
for (const expected of ["Notifications", "Account & Profile", "Plan", "Reset Password", "Account Settings", "Sign out", "Appearance"]) {
  assert.match(header, new RegExp(expected));
}
assert.match(header, /recommended next step/i);
assert.match(header, /plan-prompt/);

const shell = read("app", "app", "ClientAppShell.tsx");
assert.match(shell, /CustomerHeaderActions/);
assert.doesNotMatch(shell, />\s*Sign out\s*</);
assert.doesNotMatch(read("app", "app", "settings", "page.tsx"), /signOutAction|>\s*Sign out\s*</, "sign out belongs only in the profile sheet");

const nav = read("components", "shell", "navigation", "app-nav-data.ts");
for (const group of ["Overview", "More"]) assert.match(nav, new RegExp(`label: "${group}"`));

const mobileNav = read("components", "shell", "MobileBottomNav.tsx");
assert.match(mobileNav, /text-\[11px\] font-semibold/);
assert.match(mobileNav, /min-h-\[48px\]/);
assert.match(read("app", "app", "team", "page.tsx"), /className="sm:flex-1"/, "team invite input must not collapse in the mobile flex column");

const styles = read("app", "globals.css");
assert.match(styles, /\.sx-customer-app \.text-sm/);
assert.match(styles, /0\.9375rem/);

const walletRoute = read("app", "api", "platform", "wallet", "route.ts");
assert.match(walletRoute, /requireTenantReadPermission/);
// getTenantServiceContext().supabase (service-role) was replaced by the
// tenant-scoped, RLS-respecting ctx.supabase client — the service-role read
// was itself the bug (crossed the customer-read RLS boundary; see
// tenant-dashboard-no-service-role.test.ts) and is fixed by the
// wallet_accounts_tenant_insert migration's zero-balance INSERT policy.
assert.match(walletRoute, /getWalletAccount\(ctx\.supabase, tenantId\)/);

const billing = read("app", "app", "billing", "page.tsx");
assert.match(billing, /Current plan/);
assert.match(billing, /Request \{p\.name\} activation/);
assert.match(billing, /Included each month/);
assert.match(billing, /walletError/);
assert.doesNotMatch(billing, /createPayment|capturePayment/);

assert.equal(resolveCustomerPlanSummary(null).name, "Free");
assert.equal(resolveCustomerPlanSummary(null).activePaid, false);
assert.deepEqual(
  resolveCustomerPlanSummary({ plan_tier: "growth", status: "active", provider_status: "active", current_period_end: "2026-09-01" }),
  {
    tier: "growth",
    name: "Growth",
    status: "Active",
    billingStatus: "Active",
    billingCycle: "Monthly",
    nextRenewalAt: "2026-09-01",
    priceCents: 799_900,
    activePaid: true,
  },
);

console.log("customer-app-final-ux.test.ts: ALL PASS");

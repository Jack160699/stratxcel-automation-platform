import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCustomerPlanSummary } from "../../billing/customer-plan.ts";

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), "utf8");

const commandCenter = read("app", "app", "page.tsx");
assert.match(commandCenter, /Your business growth command center/);
assert.match(commandCenter, /Business impact summary/);
assert.match(commandCenter, /What changed/);
assert.match(commandCenter, /Biggest opportunities/);
assert.match(commandCenter, /Next best actions/);
assert.doesNotMatch(commandCenter, /JourneyPanel|Your setup|setup checklist/i);
assert.match(commandCenter, /Not enough verified data/);
assert.match(commandCenter, /Unlock ongoing execution with Growth/);

const header = read("app", "app", "components", "CustomerHeaderActions.tsx");
for (const expected of ["Notifications", "Profile & account", "Current plan", "Reset password", "Account settings", "Sign out", "Appearance"]) {
  assert.match(header, new RegExp(expected));
}
assert.match(header, /safe-area-inset-bottom/);
assert.match(header, /Request|View Growth|recommended next step/i);
assert.match(header, /plan-prompt/);

const shell = read("app", "app", "ClientAppShell.tsx");
assert.match(shell, /CustomerHeaderActions/);
assert.doesNotMatch(shell, />\s*Sign out\s*</);
assert.doesNotMatch(read("app", "app", "settings", "page.tsx"), /signOutAction|>\s*Sign out\s*</, "sign out belongs only in the profile sheet");

const nav = read("components", "shell", "navigation", "app-nav-data.ts");
// StratXcel Desktop canvas regrouped the four labeled sections into two
// (primary: Home/Audit/Growth Assistant/Shop Profile, secondary: Website &
// Domain/Connected Accounts/Plan & Billing/Staff/Settings) — the sidebar
// itself never renders these labels for the customer shell; they exist only
// for the mobile "More" sheet's section headings.
for (const group of ["Overview", "Account"]) assert.match(nav, new RegExp(`label: "${group}"`));

const mobileNav = read("components", "shell", "MobileBottomNav.tsx");
assert.match(mobileNav, /text-xs font-medium/);
assert.match(mobileNav, /min-h-12/);
assert.match(read("components", "crm", "ConversationList.tsx"), /h-11[\s\S]*text-base[\s\S]*md:h-8/, "CRM search must use a mobile-sized control");
assert.match(read("app", "app", "team", "page.tsx"), /className="sm:flex-1"/, "team invite input must not collapse in the mobile flex column");

const styles = read("app", "globals.css");
assert.match(styles, /\.sx-customer-app \.text-sm/);
assert.match(styles, /0\.9375rem/);

const walletRoute = read("app", "api", "platform", "wallet", "route.ts");
assert.match(walletRoute, /requireTenantReadPermission/);
assert.match(walletRoute, /getTenantServiceContext\(\)\.supabase/);

const billing = read("app", "app", "billing", "page.tsx");
assert.match(billing, /Current plan/);
assert.match(billing, /Start Growth/);
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
    priceCents: 999_900,
    activePaid: true,
  },
);

console.log("customer-app-final-ux.test.ts: ALL PASS");

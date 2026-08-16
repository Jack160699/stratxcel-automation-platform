// Run with: node --experimental-strip-types app/app/onboarding/__tests__/onboarding-wizard.test.ts
//
// Source-level regression guard for the structured client onboarding wizard
// (branch feat/stratxcel-core-product-experience). Asserts against source,
// same reasoning as lib/rbac/__tests__/client-app-shell.test.ts: these are
// Server Components / client components wired to next/headers and browser
// APIs that only resolve inside a real Next.js request scope.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const layout = read("app", "app", "layout.tsx");
  const pageTsx = read("app", "app", "page.tsx");
  const onboardingPanel = read("app", "app", "OnboardingPanel.tsx");
  const wizard = read("app", "app", "onboarding", "OnboardingWizard.tsx");
  const route = read("app", "api", "platform", "onboarding", "route.ts");
  const stepAccount = read("app", "app", "onboarding", "steps", "StepAccount.tsx");
  const stepBusiness = read("app", "app", "onboarding", "steps", "StepBusiness.tsx");
  const stepBrand = read("app", "app", "onboarding", "steps", "StepBrand.tsx");
  const stepReview = read("app", "app", "onboarding", "steps", "StepReview.tsx");

  // --- 1. Onboarding only appears for zero-membership users, unchanged gate --
  assert.ok(layout.includes('identity.state === "NEW_CUSTOMER"') && layout.includes("<OnboardingPanel />"), "layout.tsx must gate onboarding on the canonical NEW_CUSTOMER state");
  assert.ok(/requireClientContext\(\)/.test(pageTsx) && /ctx\.workspaceTenant/.test(pageTsx), "page.tsx must independently use the canonical client context; NEW_CUSTOMER is handled by layout onboarding");
  assert.ok(onboardingPanel.includes('from "./onboarding/OnboardingWizard"'), "OnboardingPanel must render the structured wizard");

  // --- 2. Existing tenant members bypass onboarding entirely -----------------
  // Both gates return *before* CurrentTenantProvider/ClientAppShell render,
  // so a user with active !== null never reaches OnboardingPanel — same
  // resolveCurrentTenant() call already exercised by lib/tenants tests.
  assert.ok(/resolveCanonicalIdentity/.test(layout), "must reuse the canonical resolver, not a second membership check");

  // --- 3. No raw tenant UUID input anywhere in the wizard --------------------
  for (const [name, source] of [
    ["OnboardingWizard.tsx", wizard],
    ["StepAccount.tsx", stepAccount],
    ["StepBusiness.tsx", stepBusiness],
    ["StepBrand.tsx", stepBrand],
    ["StepReview.tsx", stepReview],
  ] as const) {
    assert.equal(/name=["']tenantId["']|<input[^>]*tenant\.id/i.test(source), false, `${name} must never expose a raw tenant UUID as user input`);
  }

  // --- 4. Tenant creation uses authenticated server identity -----------------
  assert.ok(/ownerUserId: user\.id/.test(route), "createTenant must be called with the session-derived user.id, never a client-supplied id");
  assert.equal(/ownerUserId:\s*body\./.test(route), false, "ownerUserId must never come from the request body");
  assert.ok(/await supabase\.auth\.getUser\(\)/.test(route), "the route must verify the session before doing anything else");

  // --- 5. Owner membership created via the real, existing repository ---------
  assert.ok(/import\s*\{[^}]*createTenant[^}]*\}\s*from ["']@\/lib\/tenants\/repository["']/.test(route), "must import the real createTenant(), not a duplicate implementation");

  // --- 6. No service-role key enters browser code ----------------------------
  const clientFiles = [
    ["OnboardingWizard.tsx", wizard],
    ["StepAccount.tsx", stepAccount],
    ["StepBusiness.tsx", stepBusiness],
    ["StepBrand.tsx", stepBrand],
    ["StepReview.tsx", stepReview],
    ["OnboardingPanel.tsx", onboardingPanel],
  ] as const;
  for (const [name, source] of clientFiles) {
    assert.equal(/getTenantServiceContext|createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(source), false, `${name} is client-rendered and must have no service-role dependency`);
  }
  assert.ok(route.includes("getTenantServiceContext"), "the API route (server-only) is the one place allowed to use the service-role client");

  // --- 7. Brand Brain persistence uses the existing model, not a duplicate ---
  assert.ok(route.includes('from "@stratxcel/brand-brain"'), "must import the real Brand Brain package");
  assert.ok(route.includes("saveBrandBrainVersion("), "must write through saveBrandBrainVersion(), the existing versioned repository function");

  // --- 8. Unsupported fields are labeled honestly, never faked as saved ------
  assert.ok(/Workspace Settings/.test(stepBusiness), "StepBusiness must honestly label website/location as not-yet-persisted");
  assert.ok(/Workspace Settings/.test(stepBrand), "StepBrand must honestly label the description field as not-yet-persisted");
  assert.ok(/No plan is activated/.test(stepReview), "StepReview must not imply a plan/payment was activated");

  // --- 9. Post-creation active-tenant selection reuses the existing action ---
  assert.ok(/import\s*\{\s*setActiveTenantAction\s*\}\s*from ["']\.\.\/tenant-actions["']/.test(wizard), "must reuse the existing setActiveTenantAction, not a new cookie-writing path");
  assert.ok(/await setActiveTenantAction\(tenant\.id\)/.test(wizard), "must set the active-tenant cookie immediately after workspace creation");
  assert.ok(/router\.push\(["']\/app["']\)/.test(wizard), "must redirect to /app after creation");

  // --- 10. Double-submission protection ---------------------------------------
  assert.ok(/if \(submitting\) return;/.test(wizard), "handleCreateWorkspace must guard against double-submit");
  assert.ok(/disabled=\{submitting\}/.test(stepReview), "the create-workspace button must be disabled while submitting");
  assert.ok(existing_users_short_circuit(route), "the API route must detect an existing membership and skip creating a second tenant");

  function existing_users_short_circuit(source: string): boolean {
    return /existing\.length > 0/.test(source) && /created: false/.test(source);
  }

  // --- 11. Onboarding cannot grant internal admin access ----------------------
  for (const [name, source] of [["route.ts", route], ...clientFiles] as const) {
    assert.equal(/stratxcel_admins/.test(source), false, `${name} must never reference stratxcel_admins — onboarding only ever creates tenant_members rows`);
  }

  // --- 12. Mobile structure and accessibility ---------------------------------
  assert.ok(/role="status"/.test(wizard), "wizard must expose an accessible 'step X of N' status region");
  assert.ok(/size="touch"/.test(wizard), "primary Back/Continue controls must use the ~44px touch target size");
  assert.ok(/aria-pressed=\{isSelected\}/.test(read("app", "app", "onboarding", "steps", "StepGoals.tsx")), "goal chips must expose pressed state to assistive tech");
  assert.ok(/role="radiogroup"/.test(read("app", "app", "onboarding", "steps", "StepPlan.tsx")), "plan tier selection must use a radiogroup for assistive tech");
  assert.ok(/max-w-(full|xl|2xl|3xl|4xl|5xl|6xl|7xl)/.test(wizard), "wizard container must be a single-column, mobile-first layout");
  assert.ok(/aria-invalid/.test(stepBusiness), "form fields must expose aria-invalid on validation errors");
  assert.ok(/aria-describedby/.test(stepBusiness), "form field errors/hints must be associated via aria-describedby");

  // --- 13. Draft progress survives refresh and device changes -----------------
  assert.ok(/export async function GET\(\)/.test(route), "onboarding API must expose the authenticated saved draft");
  assert.ok(/export async function PATCH\(request: Request\)/.test(route), "onboarding API must persist draft progress");
  assert.ok(/supabase\.auth\.updateUser/.test(route), "draft persistence must bind to the authenticated user's account metadata");
  assert.ok(/sanitizeDraft/.test(route), "server must bound and sanitize every saved draft");
  assert.ok(/method: "PATCH"/.test(wizard), "wizard must save draft progress to the server");
  assert.ok(/fetch\("\/api\/platform\/onboarding", \{ cache: "no-store" \}\)/.test(wizard), "wizard must restore server-saved progress");

  console.log(
    "onboarding-wizard.test.ts: ALL PASS (zero-membership gating, no raw UUID input, authenticated identity, server-resumable bounded draft, real Brand Brain persistence, honest unsupported-field labeling, active-tenant cookie reuse, double-submit guard, no admin-access grant, mobile/a11y structure)"
  );
}

run();

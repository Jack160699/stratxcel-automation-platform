// Run with: node --experimental-strip-types app/app/onboarding/__tests__/onboarding-wizard.test.ts
//
// Source-level regression guard for the structured client onboarding wizard,
// rebuilt to the approved "StratXcel Onboarding.dc.html" reference (Claude
// Design project 6c2ad0a0-c8c8-47d1-a79d-3a1b255a7b01): Welcome -> Business
// -> Your Goals -> Your Brand -> Review & Launch, with account connections
// moved out of a dedicated step into an optional ConnectorSheet reachable
// from Brand and Review. Same reasoning as lib/rbac/__tests__/
// client-app-shell.test.ts: these are Server Components / client components
// wired to next/headers and browser APIs that only resolve inside a real
// Next.js request scope.
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
  const types = read("app", "app", "onboarding", "types.ts");
  const stepWelcome = read("app", "app", "onboarding", "steps", "StepWelcome.tsx");
  const stepBusiness = read("app", "app", "onboarding", "steps", "StepBusiness.tsx");
  const stepGoals = read("app", "app", "onboarding", "steps", "StepGoals.tsx");
  const stepBrand = read("app", "app", "onboarding", "steps", "StepBrand.tsx");
  const stepReview = read("app", "app", "onboarding", "steps", "StepReview.tsx");
  const connectorSheet = read("app", "app", "onboarding", "ConnectorSheet.tsx");

  // --- 1. Onboarding only appears for zero-membership users, unchanged gate --
  assert.ok(layout.includes('identity.state === "NEW_CUSTOMER"') && /<OnboardingPanel[\s/>]/.test(layout), "layout.tsx must gate onboarding on the canonical NEW_CUSTOMER state");
  assert.ok(/requireClientContext\(\)/.test(pageTsx) && /ctx\.workspaceTenant/.test(pageTsx), "page.tsx must independently use the canonical client context; NEW_CUSTOMER is handled by layout onboarding");
  assert.ok(onboardingPanel.includes('from "./onboarding/OnboardingWizard"'), "OnboardingPanel must render the structured wizard");

  // --- 2. Existing tenant members bypass onboarding entirely -----------------
  assert.ok(/resolveCanonicalIdentity/.test(layout), "must reuse the canonical resolver, not a second membership check");

  // --- 3. No raw tenant UUID input anywhere in the wizard --------------------
  for (const [name, source] of [
    ["OnboardingWizard.tsx", wizard],
    ["StepWelcome.tsx", stepWelcome],
    ["StepBusiness.tsx", stepBusiness],
    ["StepGoals.tsx", stepGoals],
    ["StepBrand.tsx", stepBrand],
    ["StepReview.tsx", stepReview],
    ["ConnectorSheet.tsx", connectorSheet],
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
    ["StepWelcome.tsx", stepWelcome],
    ["StepBusiness.tsx", stepBusiness],
    ["StepGoals.tsx", stepGoals],
    ["StepBrand.tsx", stepBrand],
    ["StepReview.tsx", stepReview],
    ["ConnectorSheet.tsx", connectorSheet],
    ["OnboardingPanel.tsx", onboardingPanel],
  ] as const;
  for (const [name, source] of clientFiles) {
    assert.equal(/getTenantServiceContext|createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(source), false, `${name} is client-rendered and must have no service-role dependency`);
  }
  assert.ok(route.includes("getTenantServiceContext"), "the API route (server-only) is the one place allowed to use the service-role client");

  // --- 7. Brand Brain persistence uses the existing model, not a duplicate ---
  assert.ok(route.includes('from "@stratxcel/brand-brain"'), "must import the real Brand Brain package");
  assert.ok(route.includes("saveBrandBrainVersion("), "must write through saveBrandBrainVersion(), the existing versioned repository function");

  // --- 8. Canonical reference 5-step sequence (Welcome now included, Brand now real) --
  assert.ok(
    types.includes('"Welcome"') && types.includes('"Business"') && types.includes('"Your Goals"') && types.includes('"Your Brand"') && types.includes('"Review & Launch"'),
    "types.ts must define the reference's 5-step sequence"
  );
  assert.equal(/isStep0.*isStep1.*isStep2.*isStep3.*isStep4/s.test(wizard) || /step === 0/.test(wizard), true, "wizard must use the reference's own 0-4 step numbering");
  assert.ok(/Website or Google Maps link/.test(stepBusiness), "StepBusiness must render the reference's single combined website/Maps link field");
  assert.equal(/Workspace Slug/i.test(stepBusiness), false, "StepBusiness must NEVER show workspace slug in UI");
  assert.ok(/Tell us about your business/.test(stepBusiness), "StepBusiness must render the reference's headline");
  assert.ok(/Your Business/.test(stepReview), "StepReview must render a Your Business summary section");
  assert.ok(/Connected Accounts/.test(stepReview), "StepReview must render a Connected Accounts summary section");

  // --- 8b. Brand step must be real and must never fabricate content ----------
  assert.ok(/What do you sell or offer/.test(stepBrand), "StepBrand must render the reference's real 'what do you sell' question");
  assert.ok(/Anything StratXcel should avoid saying/.test(stepBrand), "StepBrand must render the reference's real restrictions question");
  assert.equal(/useEffect/.test(stepBrand), false, "StepBrand must never auto-fill brand fields with generated placeholder text on mount — every field must start genuinely empty");
  assert.equal(/Do not guarantee specific revenue/.test(stepBrand), false, "StepBrand must not reintroduce the fabricated canned-restrictions boilerplate");

  // --- 9. Post-creation active-tenant selection reuses the existing action ---
  assert.ok(/import\s*\{\s*setActiveTenantAction\s*\}\s*from ["']\.\.\/tenant-actions["']/.test(wizard), "must reuse the existing setActiveTenantAction, not a new cookie-writing path");
  assert.ok(/await setActiveTenantAction\(tenant\.id\)/.test(wizard), "must set the active-tenant cookie immediately after workspace creation");
  assert.ok(/router\.push\(["']\/app\/audit["']\)/.test(wizard), "must redirect to /app/audit after creation");

  // --- 10. Double-submission protection ---------------------------------------
  assert.ok(/if \(launchState === ["']launching["']\) return;/.test(wizard), "launch() must guard against double-submit");
  assert.ok(/disabled=\{launchState === ["']launching["']\}/.test(wizard), "the launch control must disable itself while launching");
  assert.ok(existing_users_short_circuit(route), "the API route must detect an existing membership and skip creating a second tenant");

  function existing_users_short_circuit(source: string): boolean {
    return /existing\.length > 0/.test(source) && /created: false/.test(source);
  }

  // --- 11. Onboarding cannot grant internal admin access ----------------------
  for (const [name, source] of [["route.ts", route], ...clientFiles] as const) {
    assert.equal(/stratxcel_admins/.test(source), false, `${name} must never reference stratxcel_admins — onboarding only ever creates tenant_members rows`);
  }

  // --- 12. Mobile structure and accessibility ---------------------------------
  assert.ok(/role="status"/.test(wizard), "wizard must expose an accessible autosave status region");
  assert.ok(/h-\[52px\]/.test(wizard), "primary Continue/Launch controls must meet the ~44px+ touch target size (reference spec: 52px)");
  assert.ok(/aria-pressed=\{isSelected\}/.test(stepGoals), "goal cards must expose pressed state to assistive tech");
  assert.ok(/role="radio"|role="radiogroup"/.test(read("app", "app", "audit", "VisualAuditReport.tsx")), "plan tier selection in audit report must use radio semantics for assistive tech");
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

  // --- 14. Account connections now live in ConnectorSheet, not a dedicated step ---
  const connectRoute = read("app", "api", "social", "oauth", "[provider]", "connect", "route.ts");
  const callbackRoute = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");

  assert.ok(/window\.location\.href\s*=\s*[`"']\/api\/social\/oauth\//.test(connectorSheet), "ConnectorSheet's Connect button must redirect to the real OAuth endpoint, not open a URL input form");
  assert.ok(/connectionType/.test(connectorSheet), "ConnectorSheet must track connection type (oauth vs otp_verified)");
  assert.ok(/send-otp/.test(connectorSheet) && /verify-otp/.test(connectorSheet), "ConnectorSheet's WhatsApp connect must use the real send-otp/verify-otp endpoints, not a fake instant toggle");

  // Connect route must use canonical provider infrastructure, not a parallel system
  assert.ok(/from\s*["']@\/lib\/social\/providers["']/.test(connectRoute), "onboarding connect route must reuse canonical provider registry");
  assert.ok(/from\s*["']@\/lib\/social\/oauth-state["']/.test(connectRoute), "onboarding connect route must reuse canonical state signing");
  assert.ok(/createSignedState/.test(connectRoute), "onboarding connect route must create signed state tokens");
  assert.ok(/getProvider\(provider\)\.getAuthorizationUrl/.test(connectRoute), "must delegate to the canonical provider for authorization URL");

  // Callback must exchange code and store in user metadata (not a fake connection)
  assert.ok(/exchangeCodeForToken/.test(callbackRoute), "onboarding callback must exchange code via canonical provider");
  assert.ok(/onboarding_oauth_connections/.test(callbackRoute), "callback must store connection data in user metadata");
  assert.ok(/verifySignedState/.test(callbackRoute), "callback must verify signed state to prevent CSRF");
  assert.equal(/accessToken/.test(callbackRoute.split("user_metadata")[1] || ""), false, "callback must NOT store access tokens in user metadata");

  // --- 15. Review step must distinguish real connected-account state ---------
  assert.ok(/googleConnected/.test(stepReview) && /waConnected/.test(stepReview), "StepReview must derive real Google/WhatsApp connection state, not a static label");
  assert.ok(/Connected ✓/.test(stepReview) && /Not connected/.test(stepReview), "StepReview must show the real connected/not-connected wording");

  console.log(
    "onboarding-wizard.test.ts: ALL PASS (reference 5-step sequence — Welcome/Business/Your Goals/Your Brand/Review & Launch, real single-field business discovery, real never-fabricated Brand step, optional ConnectorSheet with real OAuth + WhatsApp OTP, zero-membership gating, server-resumable draft, real Brand Brain persistence, direct audit handoff)"
  );
}

run();

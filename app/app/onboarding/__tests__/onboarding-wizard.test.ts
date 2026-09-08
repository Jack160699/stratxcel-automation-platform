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
  // STRATXCEL PRODUCTION REPAIR mission, Section 4/6: the original
  // reference's single combined "Website or Google Maps link" field is a
  // real, confirmed root cause of customer confusion (a customer's typed
  // Google Maps link never showed a connected/verified state, and a
  // website URL and a Maps URL landed in the same ambiguous box) --
  // explicitly superseded by two independent, separately-labeled, real
  // connection-state fields. Assert the NEW real behavior, not the old one.
  assert.equal(/Website or Google Maps link/.test(stepBusiness), false, "the old combined website/Maps field must be gone");
  assert.ok(/label="Website"/.test(stepBusiness), "StepBusiness must render a dedicated Website field");
  assert.ok(/label="Google Business \/ Google Maps"/.test(stepBusiness), "StepBusiness must render a dedicated, separately-labeled Google Maps/Business field");
  assert.ok(/checkWebsite/.test(stepBusiness) && /checkMaps/.test(stepBusiness), "each field must run its own independent, real connection check");
  assert.ok(/optional/.test(stepBusiness), "both fields must still be clearly marked optional -- never required to proceed");
  assert.equal(/Workspace Slug/i.test(stepBusiness), false, "StepBusiness must NEVER show workspace slug in UI");
  assert.ok(/Tell us about your business/.test(stepBusiness), "StepBusiness must render the reference's headline");
  assert.ok(/Your Business/.test(stepReview), "StepReview must render a Your Business summary section");
  assert.ok(/Connected Accounts/.test(stepReview), "StepReview must render a Connected Accounts summary section");

  // --- 8b. Brand step must be real and must never fabricate content ----------
  assert.ok(/What do you sell or offer/.test(stepBrand), "StepBrand must render the reference's real 'what do you sell' question");
  assert.ok(/Anything StratXcel should avoid saying/.test(stepBrand), "StepBrand must render the reference's real restrictions question");
  assert.equal(/useEffect/.test(stepBrand), false, "StepBrand must never auto-fill brand fields with generated placeholder text on mount — every field must start genuinely empty");
  assert.equal(/Do not guarantee specific revenue/.test(stepBrand), false, "StepBrand must not reintroduce the fabricated canned-restrictions boilerplate");

  // --- 8c. Real website-discovered content DOES prefill the Brand step's
  //     fields (STRATXCEL PRODUCTION REPAIR mission closeout: the engine
  //     already computed intel.brand + provenance, but the wizard never
  //     read it) -- strictly gated on provenance "WEBSITE" (genuinely
  //     scraped), never the engine's own "INDUSTRY_INFERENCE" generic
  //     template fallback, and never overwriting a value the customer
  //     already typed. This is a different, narrower thing than the
  //     fabrication Test 8b guards against (a blind on-mount auto-fill of
  //     generic text) -- this only fires from the same real, user-
  //     triggered discovery action that already populated business.* --------
  assert.ok(/intel\.provenance/.test(wizard), "must read the engine's own real provenance map, not assume every discovered value is real");
  for (const field of ["offers", "description", "audience"]) {
    const re = new RegExp(`provenance\\.${field} === ["']WEBSITE["'][\\s\\S]{0,40}intel\\.brand\\?\\.${field}`);
    assert.ok(re.test(wizard), `brand.${field} must only be prefilled when the engine tagged it real ("WEBSITE") provenance, never its generic fallback`);
    assert.ok(new RegExp(`d\\.brand\\.${field}\\s*\\|\\|`).test(wizard), `brand.${field} prefill must never overwrite a value the customer already typed`);
  }
  assert.equal(/provenance\.restrictions/.test(wizard), false, "restrictions must never be auto-filled -- the engine itself always tags it INDUSTRY_INFERENCE (a preference, not a discoverable fact)");

  // --- 8d. STRATXCEL BUSINESS DISCOVERY redesign: search-first Google
  //     Business/Maps, converging into the same real pipeline as the
  //     pasted-link path -- never a second, disconnected system. -----------
  assert.ok(/Search your business name/.test(stepBusiness), "the search box must be the primary Google Business/Maps affordance");
  assert.ok(/Paste Google Maps link instead/.test(stepBusiness), "the paste-link path must still be reachable for customers who prefer it");
  assert.ok(/onSelectGooglePlace/.test(stepBusiness) && /onSelectGooglePlace/.test(wizard), "StepBusiness and the wizard must actually be wired together for place selection");
  assert.ok(/googlePlaceId/.test(wizard), "selecting a place must call through the real googlePlaceId-aware resolve endpoint, not a second pipeline");
  // Honest degrade: search must fall back to the paste-link path when
  // Places isn't configured, never leave a dead search box.
  assert.ok(/available === false/.test(stepBusiness) && /setShowPasteMapsLink\(true\)/.test(stepBusiness), "must honestly fall back to the paste-link path when business search is unavailable");
  // Never conflates "selected" with "verified" (mission Section 14).
  assert.equal(/Google Business verified/.test(stepBusiness), false, "StepBusiness must never claim Google Business verification -- only recognition/selection");
  assert.ok(/Business selected/.test(stepBusiness), "a selected place must be labeled as selected/found, not verified");

  // --- 8e. Live-caught real defect (production Places API test): Google
  //     reporting a website on file does not mean the real crawl actually
  //     succeeded -- a real hotel chain's own site returned HTTP 403 to the
  //     crawler during live testing, yet the UI still said "Website found
  //     & analyzed". Must gate that specific claim on the crawl's own real
  //     outcome (websiteAnalyzed), not just the URL's existence, and the
  //     Website field's own connection state must reflect the same real
  //     outcome, not a blanket "connected". ------------------------------
  assert.ok(/websiteAnalyzed/.test(wizard) && /websiteAnalyzed/.test(stepBusiness), "both the wizard and StepBusiness must track the website crawl's real success, not just whether a URL was discovered");
  assert.ok(/Boolean\(data\.data\?\.isReachable\)/.test(wizard), "websiteAnalyzed must come from the real crawl's own isReachable result, never assumed true because a URL exists");
  assert.ok(/couldn.{0,10}t be analyzed automatically/.test(stepBusiness), "a discovered-but-unreadable website must get its own honest, distinct message, never silently reported as fully analyzed");
  assert.ok(/if \(result\.websiteAnalyzed\) \{[\s\S]{0,60}setWebsiteCheck\("connected"\)/.test(stepBusiness), "the Website field's own connected/failed state must also be gated on the real crawl outcome for an auto-discovered website");

  // --- 8f. Live-caught real data-loss bug (production Places API test):
  //     a Google-discovered website visibly showed "connected" in the UI
  //     with a real URL, but that URL was never actually saved to
  //     draft.business.website (only to local component display state) --
  //     confirmed live by reloading and watching it vanish. Fixed at two
  //     levels: the general synthesis function (benefits every caller) and
  //     an explicit, guarded call in the search-select path itself. --------
  assert.ok(/website: d\.business\.website \|\| intel\.business\?\.website/.test(wizard), "applySynthesizedIntelligence must copy business.website from the synthesis response -- it never did, a real silent data-loss bug for any caller relying on it alone");
  assert.ok(/googleMapsUrl: d\.business\.googleMapsUrl \|\| intel\.business\?\.googleMapsUrl/.test(wizard), "applySynthesizedIntelligence must also copy business.googleMapsUrl for the same reason");
  assert.ok(/if \(!websiteValue\.trim\(\) && !draft\.business\.website\) \{[\s\S]{0,40}update\(\{ website: result\.discoveredWebsiteUrl \}\)/.test(stepBusiness), "the search-select path must explicitly persist the discovered website into the real draft (not just local display state), guarded so it never overwrites a website the customer already provided");

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

  // --- 16. The onboarding-draft sessionStorage key is never trusted cross-user ---
  //
  // Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md
  // (Platform Convergence): ONBOARDING_DRAFT_KEY is a single, fixed,
  // origin-scoped sessionStorage key. A draft saved by one authenticated
  // user in a browser tab was applied, unvalidated, to whoever next opened
  // onboarding in that same tab -- a real cross-account onboarding-form
  // data leak, matching this brief's "never use browser state to decide
  // identity" rule at the form-content layer. Locked in here so a future
  // edit can't silently drop the ownership check.
  assert.ok(/ownerUserId/.test(wizard), "the persisted draft must be stamped with the real authenticated user id that saved it");
  assert.ok(/clientDraftOwnedByThisUser/.test(wizard), "a loaded client draft must only ever be trusted when it was saved by the currently authenticated user");
  assert.equal(/useState\(initial\.current\.draft\)/.test(wizard), false, "the unvalidated client draft must never be applied to state synchronously at mount, before the real user is known");
  assert.ok(/const \[draft, setDraft\] = useState<OnboardingDraft>\(EMPTY_DRAFT\)/.test(wizard), "initial render must start from an empty draft, not a possibly-different-user's sessionStorage content");

  console.log(
    "onboarding-wizard.test.ts: ALL PASS (reference 5-step sequence — Welcome/Business/Your Goals/Your Brand/Review & Launch, separate real Website + Google Maps fields with independent connection states, real never-fabricated Brand step, optional ConnectorSheet with real OAuth + WhatsApp OTP, zero-membership gating, server-resumable draft, real Brand Brain persistence, direct audit handoff)"
  );
}

run();

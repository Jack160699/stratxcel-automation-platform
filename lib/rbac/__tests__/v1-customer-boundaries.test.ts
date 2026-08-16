// Run with: node --experimental-strip-types lib/rbac/__tests__/v1-customer-boundaries.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAV_GROUPS_DATA, APP_MOBILE_NAV_KEYS } from "../../../components/shell/navigation/app-nav-data.ts";
import { V1_CONNECTORS, INITIAL_SOCIAL_CONNECTORS } from "../../../app/app/onboarding/types.ts";
import { V1_CUSTOMER_PROVIDERS } from "../../../lib/social/providers/index.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // =========================================================================
  // 1. V1 Canonical Connectors Contract
  // =========================================================================
  const expected5Connectors = [
    "google_business",
    "instagram",
    "facebook",
    "youtube",
    "whatsapp",
  ];
  assert.deepEqual(
    [...V1_CONNECTORS],
    expected5Connectors,
    "V1_CONNECTORS must contain exactly the 5 approved customer connectors in mandatory order"
  );
  assert.equal(V1_CONNECTORS.length, 5, "V1_CONNECTORS must have length 5");

  // Initial connectors in onboarding types.ts
  assert.equal(INITIAL_SOCIAL_CONNECTORS.length, 5, "INITIAL_SOCIAL_CONNECTORS must have length 5");
  assert.deepEqual(
    INITIAL_SOCIAL_CONNECTORS.map((c) => c.platform),
    expected5Connectors,
    "INITIAL_SOCIAL_CONNECTORS must match exact mandatory 5-connector order"
  );

  // StepConnectors cards
  const stepConnectors = read("app", "app", "onboarding", "steps", "StepConnectors.tsx");
  const stepMatches = [...stepConnectors.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    stepMatches,
    expected5Connectors,
    "StepConnectors must render exactly the 5 V1 connectors in mandatory order"
  );

  // IntegrationsPage cards
  const integrationsPage = read("app", "app", "integrations", "page.tsx");
  const integrationCardKeys = [...integrationsPage.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    integrationCardKeys,
    expected5Connectors,
    "IntegrationsPage must render exactly the 5 V1 connectors in mandatory order"
  );

  // Assert all StepConnectors cards have ctaText: "Connect"
  const ctaMatches = [...stepConnectors.matchAll(/ctaText:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ctaMatches.length, 5, "Expected exactly 5 ctaText entries in StepConnectors");
  for (const cta of ctaMatches) {
    assert.equal(cta, "Connect", "All initial connector cards must have ctaText 'Connect'");
  }

  // =========================================================================
  // 2. Removal of WhatsApp Business from Client Panel
  // =========================================================================
  assert.equal(
    stepConnectors.includes("WhatsApp Business"),
    false,
    "StepConnectors must NOT mention WhatsApp Business"
  );
  assert.equal(
    integrationsPage.includes("WhatsApp Business"),
    false,
    "IntegrationsPage must NOT mention WhatsApp Business"
  );
  assert.equal(
    stepConnectors.includes("WhatsApp Receptionist"),
    false,
    "StepConnectors must NOT mention WhatsApp Receptionist"
  );

  // WhatsApp connector must represent phone-number OTP verification only
  assert.ok(
    stepConnectors.includes("Verify WhatsApp Number"),
    "WhatsApp connector modal must be titled 'Verify WhatsApp Number'"
  );
  assert.ok(
    stepConnectors.includes("Verify the phone number you use for WhatsApp"),
    "WhatsApp connector description must describe phone verification"
  );
  assert.ok(
    integrationsPage.includes("Verify the phone number you use for WhatsApp"),
    "Integrations page must describe WhatsApp as phone number verification"
  );

  // =========================================================================
  // 3. Removal of CRM from Client Panel Navigation & Routes
  // =========================================================================
  const allAppNavItems = APP_NAV_GROUPS_DATA.flatMap((g) => g.items);
  const appNavKeys = allAppNavItems.map((i) => i.key);
  const appNavHrefs = allAppNavItems.map((i) => i.href);

  assert.equal(appNavKeys.includes("crm"), false, "CRM must NOT be in customer APP_NAV_GROUPS_DATA");
  assert.equal(appNavHrefs.includes("/app/crm"), false, "/app/crm must NOT be in customer APP_NAV_GROUPS_DATA");
  assert.equal(APP_MOBILE_NAV_KEYS.includes("crm"), false, "CRM must NOT be in APP_MOBILE_NAV_KEYS");

  // Client CRM routes must redirect to /app
  const crmPage = read("app", "app", "crm", "page.tsx");
  const crmLeadPage = read("app", "app", "crm", "[leadId]", "page.tsx");
  const conversationsPage = read("app", "app", "conversations", "page.tsx");

  assert.ok(crmPage.includes('redirect("/app")'), "/app/crm must redirect to /app");
  assert.ok(crmLeadPage.includes('redirect("/app")'), "/app/crm/[leadId] must redirect to /app");
  assert.ok(conversationsPage.includes('redirect("/app")'), "/app/conversations must redirect to /app");

  // Command Center page must not link to CRM
  const commandCenter = read("app", "app", "page.tsx");
  assert.equal(commandCenter.includes("/app/crm"), false, "Command Center must NOT link to /app/crm");
  assert.equal(commandCenter.includes("View CRM"), false, "Command Center must NOT say 'View CRM'");
  assert.equal(commandCenter.includes("Initialize CRM Leads"), false, "Command Center must NOT say 'Initialize CRM Leads'");

  // =========================================================================
  // 4. Rehydration & Review Screen Security
  // =========================================================================
  const wizard = read("app", "app", "onboarding", "OnboardingWizard.tsx");
  assert.ok(
    wizard.includes("V1_CONNECTORS.includes"),
    "OnboardingWizard must filter rehydrated OAuth connections with V1_CONNECTORS"
  );
  assert.ok(
    stepConnectors.includes("V1_CONNECTORS.includes"),
    "StepConnectors must filter rehydrated OAuth connections with V1_CONNECTORS"
  );

  const stepReview = read("app", "app", "onboarding", "steps", "StepReview.tsx");
  assert.ok(
    stepReview.includes("V1_CONNECTORS.includes"),
    "StepReview must filter verified channels with V1_CONNECTORS"
  );

  // =========================================================================
  // 5. Backend & Provider Infrastructure Preservation
  // =========================================================================
  const providersIndex = read("lib", "social", "providers", "index.ts");
  assert.ok(providersIndex.includes("threadsProvider"), "Threads provider must remain preserved in backend");
  assert.ok(providersIndex.includes("linkedinProvider"), "LinkedIn provider must remain preserved in backend");
  assert.ok(providersIndex.includes("xProvider"), "X provider must remain preserved in backend");
  assert.deepEqual(
    [...V1_CUSTOMER_PROVIDERS],
    ["google_business", "instagram", "facebook", "youtube"],
    "V1_CUSTOMER_PROVIDERS must export active OAuth providers"
  );

  // Admin CRM and CrmWorkspace components preserved
  const crmWorkspace = read("components", "crm", "CrmWorkspace.tsx");
  assert.ok(crmWorkspace.includes("CrmWorkspace"), "CrmWorkspace component must remain preserved for admin / future use");

  console.log(
    "v1-customer-boundaries.test.ts: ALL PASS (Exact 5 V1 connectors: Google Business -> Instagram -> Facebook -> YouTube -> WhatsApp Number; CRM completely removed from client nav and routes; WhatsApp Business removed from client panel; WhatsApp Number represents OTP phone verification only; Rehydration filtered; Backend & Admin infrastructure preserved)"
  );
}

run();

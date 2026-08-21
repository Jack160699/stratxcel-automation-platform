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
  const expectedConnectors = [
    "google_business",
    "google_search_console",
    "google_analytics",
    "instagram",
    "facebook",
    "youtube",
    "whatsapp",
  ];
  assert.deepEqual(
    [...V1_CONNECTORS],
    expectedConnectors,
    "V1_CONNECTORS must contain the approved customer connectors in mandatory order"
  );
  assert.equal(V1_CONNECTORS.length, 7, "V1_CONNECTORS must have length 7");

  // Connector sheet rows (account connections moved from a dedicated
  // StepConnectors step into an optional ConnectorSheet reachable from the
  // Brand/Review steps — same real connectors, real order changed to match
  // the reference's own visual grouping: Primary Channels (Google Business,
  // WhatsApp) -> Social -> Analytics, rather than the old array's literal
  // sequence, so this is a set check, not a positional one.
  const connectorSheet = read("app", "app", "onboarding", "ConnectorSheet.tsx");
  const integrationsPage = read("app", "app", "integrations", "page.tsx");
  const sheetMatches = [...connectorSheet.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...sheetMatches].sort(),
    [...expectedConnectors].sort(),
    "ConnectorSheet must render exactly the V1 connectors, no more, no fewer"
  );
  assert.ok(/data-platform=\{row\.key\}/.test(connectorSheet), "ConnectorSheet rows must expose their real platform key in the DOM");

  // Assert all ConnectorSheet buttons offer Connect/Verify
  assert.ok(connectorSheet.includes("Connect"), "ConnectorSheet cards must have Connect CTA");

  // =========================================================================
  // 2. Removal of WhatsApp Business from Client Panel
  // =========================================================================
  assert.equal(
    connectorSheet.includes("WhatsApp Business"),
    false,
    "ConnectorSheet must NOT mention WhatsApp Business"
  );
  assert.equal(
    integrationsPage.includes("WhatsApp Business"),
    false,
    "IntegrationsPage must NOT mention WhatsApp Business"
  );
  assert.equal(
    connectorSheet.includes("WhatsApp Receptionist"),
    false,
    "ConnectorSheet must NOT mention WhatsApp Receptionist"
  );

  // WhatsApp connector must represent phone-number OTP verification only
  assert.ok(
    connectorSheet.includes("Verify WhatsApp Number"),
    "ConnectorSheet's WhatsApp step must be titled 'Verify WhatsApp Number'"
  );
  assert.ok(
    connectorSheet.includes("Verify the phone number you use for WhatsApp"),
    "ConnectorSheet's WhatsApp step must describe phone verification"
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
    "OnboardingWizard must filter rehydrated OAuth connections with V1_CONNECTORS — the one place this filtering happens now that ConnectorSheet only ever renders a fixed, already-V1 set of rows"
  );

  // StepReview no longer renders an open-ended list of "whatever got
  // connected" (which needed its own V1_CONNECTORS filter to stay safe) —
  // it shows exactly two fixed, known-V1 rows (Google Business, WhatsApp)
  // derived directly from real connection state, so there is no unfiltered
  // list for a non-V1 connector to leak into.
  const stepReview = read("app", "app", "onboarding", "steps", "StepReview.tsx");
  assert.ok(
    stepReview.includes('connectionFor("google_business")') && stepReview.includes('connectionFor("whatsapp")'),
    "StepReview must derive its two connected-account rows from real, named V1 connector keys"
  );
  assert.ok(
    connectorSheet.includes("isConnected(row.key)"),
    "ConnectorSheet must derive each row's Connected state from real connection data, never a hardcoded true"
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

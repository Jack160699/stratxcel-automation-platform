// Regression coverage for the connector forensic repair pass. Every
// assertion here traces back to a bug confirmed live against production
// (project uccqlgeghkwzujeeymua) before being fixed -- not speculative.
//
// Run with: node --experimental-strip-types lib/social/__tests__/connector-forensic-repair.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  // --- Google Business Profile: the platform_check migration exists and widens (never narrows) the allowed set. ---
  assert.ok(exists("supabase", "migrations", "20260818231000_social_accounts_allow_google_business_platform.sql"));
  const platformMigration = read("supabase", "migrations", "20260818231000_social_accounts_allow_google_business_platform.sql");
  assert.ok(platformMigration.includes("'google_business'"), "the widened CHECK constraint must include google_business");
  assert.ok(platformMigration.includes("drop constraint social_accounts_platform_check"), "must replace the constraint, not merely document the gap");

  // --- provisionTenantConnectorsFromMetadata must cover google_business, not just the five original social platforms. ---
  const provisioning = read("lib", "social", "provisioning.ts");
  assert.ok(
    /socialPlatforms = \[[^\]]*"google_business"[^\]]*\]/.test(provisioning),
    "google_business was missing from the reconciliation bridge's platform list, leaving onboarding-time Google Business connections permanently stuck in user_metadata with no canonical social_accounts row"
  );

  // --- integrations/status reconciliation must be per-provider, not "does social_accounts have ANY row for this tenant". ---
  const statusRoute = read("app", "api", "platform", "integrations", "status", "route.ts");
  assert.ok(!/socialCheck\.data\?\.length \?\? 0\) === 0 && Object\.keys\(oauthConnections\)/.test(statusRoute), "the old all-or-nothing gate must be gone");
  assert.ok(statusRoute.includes("persistedPlatforms") && statusRoute.includes("metadataPlatforms"), "reconciliation must compare the actual set of metadata-proven providers against what's already persisted per tenant, so one successfully-persisted provider never silently blocks reconciliation for every other provider");

  // --- OAuth callback and WhatsApp verify-otp: tenant fallback must never guess across multiple memberships. ---
  const oauthCallback = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");
  assert.ok(!oauthCallback.includes('.eq("user_id", userId)\n            .limit(1);'), "the ambiguous single-row tenant_members lookup must be gone");
  assert.ok(oauthCallback.includes("mems.length === 1"), "a connector must only auto-attach to a tenant when membership is unambiguous, never an arbitrarily-picked one of several");

  const verifyOtp = read("app", "api", "platform", "onboarding", "whatsapp", "verify-otp", "route.ts");
  assert.ok(verifyOtp.includes("mems.length === 1"), "WhatsApp verification must apply the same unambiguous-membership rule as the OAuth callback");

  // --- Disconnect: Search Console / GA4 share one OAuth row and must not silently stay CONNECTED after disconnect. ---
  const disconnectRoute = read("app", "api", "platform", "integrations", "disconnect", "route.ts");
  assert.ok(disconnectRoute.includes("siblingStillSet"), "disconnecting one Google sub-connector must check whether the sibling (GA4 <-> Search Console) still holds a value before deciding whether the shared OAuth row's status can actually drop to disconnected");
  assert.ok(disconnectRoute.includes('status: "disconnected"'), "the shared row's status must actually be clearable, not just the individual property field");

  // --- Canonical resolver: WhatsApp's deliberate "disabled" (disconnect) must never look like "revoked" (a real auth error). ---
  const canonicalStatus = read("lib", "connectors", "canonical-status.ts");
  assert.ok(canonicalStatus.includes('r.status === "revoked"') && canonicalStatus.includes('r.status === "disabled"'), "disabled and revoked must be tracked as distinct WhatsApp states");
  assert.ok(!/disabledWa \? "REAUTH_REQUIRED"/.test(canonicalStatus), "an explicit customer disconnect (disabled) must never render as REAUTH_REQUIRED -- that state is for revoked (an actual provider-side error)");

  // --- Duplicate protection: a real DB-level constraint on (tenant_id, platform), not application logic alone. ---
  assert.ok(exists("supabase", "migrations", "20260818231100_social_accounts_tenant_platform_unique.sql"));
  const uniqueMigration = read("supabase", "migrations", "20260818231100_social_accounts_tenant_platform_unique.sql");
  assert.ok(uniqueMigration.includes("unique index") && uniqueMigration.includes("(tenant_id, platform)") && uniqueMigration.includes("where tenant_id is not null"), "the unique index must be scoped to tenant rows only, never touching the legacy owner-scoped rows which have no tenant_id");

  console.log("connector-forensic-repair.test.ts: ALL PASS (Google Business Profile platform_check widened, reconciliation bridge covers google_business, per-provider reconciliation gate, deterministic tenant-membership resolution in OAuth callback + WhatsApp verify-otp, shared-row-aware Google disconnect, WhatsApp disabled-vs-revoked distinction, tenant+platform uniqueness)");
}

run();

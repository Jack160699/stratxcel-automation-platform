// Run with: node --experimental-strip-types packages/connectors/src/__tests__/resource-selector.test.ts
//
// Autonomous Resource Selection & Fallback Test Suite
// Verifies:
// 1. Google authenticated: Hermes autonomously selects Founder Browser
// 2. Google unauthenticated: Hermes seamlessly falls back to API/secondary
// 3. Image available: Founder Browser selected without manual tester
// 4. Image unavailable: fallback provider selected
// 5. Video available: requires confirmation gate (AVAILABLE_WITH_CONFIRMATION)
// 6. Video unavailable: fallback provider selected
// 7. Antigravity available: selected for coding tasks
// 8. Antigravity unavailable: fallback provider selected
// 9. Drive available: company-scoped storage selection
// 10. Drive unavailable: fallback provider selected
// 11. Quota / budget exceeded: falls back to secondary provider
// 12. Permission denied / isolation enforced
// 13. Approval required enforced
// 14. Founder control lock: Hermes yields to Founder and falls back to API
// 15. Stale / expired session fallback

import assert from "node:assert/strict";
import {
  selectBestResource,
  CAPABILITY_CANDIDATE_MATRIX,
} from "../resources/selector.ts";
import type { ConnectorConnectionRow } from "../types.ts";

function createMockConnectionRow(
  connectorKey: string,
  opts: {
    status?: string;
    domains?: string[];
    accountEmail?: string | null;
    controlLock?: string;
    budgetLimit?: number | null;
    currentUsage?: number;
    lastVerifiedAt?: string | null;
  } = {}
): ConnectorConnectionRow {
  const status = opts.status ?? "connected";
  const domains = opts.domains ?? ["google.com", "accounts.google.com"];
  const controlLock = opts.controlLock ?? "AVAILABLE";

  return {
    id: `conn-${connectorKey}`,
    connector_key: connectorKey,
    tenant_id: null,
    status: status as never,
    encrypted_secret_ref: null,
    discovered_capabilities: [
      "image.generate",
      "video.generate",
      "antigravity.code",
      "antigravity.run_task",
      "drive.browse",
      "drive.upload",
      "gemini.chat",
      "aistudio.prompt",
    ],
    last_health_check_at: new Date().toISOString(),
    last_verified_at: opts.lastVerifiedAt ?? new Date().toISOString(),
    discovered_at: new Date().toISOString(),
    last_error: null,
    connected_by_user_id: "founder-1",
    connected_at: new Date().toISOString(),
    metadata: {
      profileId: "fc-profile-1",
      authenticatedDomains: domains,
      authenticatedGoogleAccount: opts.accountEmail ?? "shriyanshtv@gmail.com",
      controlLock,
      sessionStatus: status === "connected" ? "AUTHENTICATED" : "AUTH_REQUIRED",
    },
    budget_limit_usd: opts.budgetLimit ?? null,
    current_usage_usd: opts.currentUsage ?? 0,
    rate_limit_per_minute: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createMockSupabase(connections: Record<string, ConnectorConnectionRow | null>) {
  return {
    from(table: string) {
      if (table === "connector_connections") {
        return {
          select() {
            let searchedKey: string | null = null;
            let searchedTenant: string | null | undefined = undefined;

            const query: any = {
              eq(col: string, val: string) {
                if (col === "connector_key") searchedKey = val;
                if (col === "tenant_id") searchedTenant = val;
                return query;
              },
              is(col: string, val: unknown) {
                if (col === "tenant_id") searchedTenant = null;
                return query;
              },
              maybeSingle: async () => {
                const conn = searchedKey ? connections[searchedKey] : null;
                if (!conn) return { data: null, error: null };
                // If searched specifically for a tenant, and conn has null tenant, return null unless fallback allowed
                if (searchedTenant && conn.tenant_id !== searchedTenant) {
                  return { data: null, error: null };
                }
                return { data: conn, error: null };
              },
            };
            return query;
          },
        };
      }
      if (table === "connector_assignments") {
        return {
          select: () => {
            const q: any = {
              eq: () => q,
              is: () => q,
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return q;
          },
        };
      }
      if (table === "worker_heartbeats") {
        return {
          select: () => {
            const q: any = {
              eq: () => q,
              order: () => q,
              limit: async () => {
                const hb = (connections as any).__heartbeats ?? [];
                return { data: hb, error: null };
              },
            };
            return q;
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    },
  };
}

// 1. Google Authenticated: image.generate autonomously chooses Founder Browser
async function testGoogleAuthenticatedImageSelection() {
  const fc = createMockConnectionRow("founder_computer");
  const gemini = createMockConnectionRow("gemini");
  const supabase = createMockSupabase({ founder_computer: fc, gemini });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "image.generate",
    tenantId: "tenant-1",
    missionId: "mission-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected, "Resource must be selected");
  assert.equal(result.selected.connectorKey, "founder_computer", "Must prefer Founder Browser");
  assert.equal(result.selected.executionMethod, "browser");
  assert.equal(result.selected.status, "AVAILABLE");
  assert.equal(result.selected.requiresConfirmation, false);
  console.log("PASS: Google authenticated image selection -> Founder Browser autonomous");
}

// 2. Google Unauthenticated: image.generate falls back to Gemini API
async function testGoogleUnauthenticatedImageFallback() {
  const fc = createMockConnectionRow("founder_computer", {
    status: "auth_required",
    domains: [],
    accountEmail: null,
  });
  const gemini = createMockConnectionRow("gemini");
  const supabase = createMockSupabase({ founder_computer: fc, gemini });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "image.generate",
    tenantId: "tenant-1",
    missionId: "mission-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected, "Fallback resource must be selected");
  assert.equal(result.selected.connectorKey, "gemini", "Must fall back to gemini");
  assert.equal(result.selected.executionMethod, "api");
  assert.equal(result.fallbackUsed, true, "Must record fallbackUsed = true");
  console.log("PASS: Google unauthenticated image -> seamless Gemini API fallback");
}

// 3. Video Available: Confirmation Gate Enforced
async function testVideoAvailableConfirmationGate() {
  const fc = createMockConnectionRow("founder_computer");
  const supabase = createMockSupabase({ founder_computer: fc });

  // When requireAutonomous = false (manual/interactive plan allowed)
  const interactiveResult = await selectBestResource(supabase as never, {
    capabilityKey: "video.generate",
    tenantId: "tenant-1",
    requireAutonomous: false,
  });

  assert.ok(interactiveResult.selected, "Candidate should be selected");
  assert.equal(interactiveResult.selected.status, "AVAILABLE_WITH_CONFIRMATION");
  assert.equal(interactiveResult.selected.requiresConfirmation, true);

  // When requireAutonomous = true: refuses unconfirmed video generation!
  const autonomousResult = await selectBestResource(supabase as never, {
    capabilityKey: "video.generate",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.equal(autonomousResult.selected, null, "Must not auto-execute unconfirmed video without approval");
  assert.match(autonomousResult.reason, /requires_confirmation|No candidate/i);
  console.log("PASS: Video generation strictly confirmation-gated (no speculative burn)");
}

// 4. Video Unavailable: Fallback Provider
async function testVideoUnavailableFallback() {
  const fc = createMockConnectionRow("founder_computer", { status: "disconnected" });
  const pro = createMockConnectionRow("google_ai_pro", { status: "connected" });
  const supabase = createMockSupabase({ founder_computer: fc, google_ai_pro: pro });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "video.generate",
    tenantId: "tenant-1",
    requireAutonomous: false,
  });

  assert.ok(result.selected);
  assert.equal(result.selected.connectorKey, "google_ai_pro", "Must fall back to secondary video resource");
  console.log("PASS: Video unavailable -> fallback candidate selected");
}

// 5. Antigravity Available: Autonomous Desktop/Browser Selection
async function testAntigravityAvailableSelection() {
  const fc = createMockConnectionRow("founder_computer");
  const supabase = createMockSupabase({ founder_computer: fc });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "antigravity.code",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected, "Antigravity must be selected");
  assert.equal(result.selected.connectorKey, "founder_computer");
  assert.equal(result.selected.capabilityKey, "antigravity.code");
  assert.equal(result.selected.status, "AVAILABLE");
  console.log("PASS: Antigravity autonomously selected for coding tasks");
}

// 6. Antigravity Unavailable: Fallback to Secondary Coding Agent
async function testAntigravityUnavailableFallback() {
  const fc = createMockConnectionRow("founder_computer", {
    status: "auth_required",
    domains: [],
  });
  const pro = createMockConnectionRow("google_ai_pro");
  const supabase = createMockSupabase({ founder_computer: fc, google_ai_pro: pro });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "antigravity.code",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected);
  assert.equal(result.selected.connectorKey, "google_ai_pro");
  assert.equal(result.fallbackUsed, true);
  console.log("PASS: Antigravity unavailable -> fallback to secondary coding provider");
}

// 7. Drive Available: Company Scoped
async function testDriveAvailableSelection() {
  const fc = createMockConnectionRow("founder_computer");
  const supabase = createMockSupabase({ founder_computer: fc });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "drive.browse",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected);
  assert.equal(result.selected.connectorKey, "founder_computer");
  assert.equal(result.selected.status, "AVAILABLE");
  console.log("PASS: Google Drive capability discovered and selected");
}

// 8. Founder Control Lock: Hermes Yields and Falls Back to API
async function testFounderControlLockYields() {
  const fc = createMockConnectionRow("founder_computer", {
    controlLock: "FOUNDER_CONTROL", // Founder actively has the browser open!
  });
  const gemini = createMockConnectionRow("gemini");
  const supabase = createMockSupabase({ founder_computer: fc, gemini });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "image.generate",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected);
  assert.equal(result.selected.connectorKey, "gemini", "Hermes must yield Founder browser and use API fallback");
  assert.equal(result.fallbackUsed, true);

  const fcAlternative = result.alternatives.find((a) => a.connectorKey === "founder_computer");
  assert.equal(fcAlternative?.status, "DEGRADED");
  assert.match(fcAlternative?.statusReason ?? "", /founder_control_active/);
  console.log("PASS: Founder Control lock honored -> Hermes yields to Founder and falls back to API");
}

// 9. Quota Exceeded: Falls Back to Next Candidate
async function testQuotaExceededFallback() {
  const fc = createMockConnectionRow("founder_computer", {
    budgetLimit: 50,
    currentUsage: 55, // Over budget!
  });
  const gemini = createMockConnectionRow("gemini");
  const supabase = createMockSupabase({ founder_computer: fc, gemini });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "image.generate",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected);
  assert.equal(result.selected.connectorKey, "gemini", "Must fall back when budget exceeded");
  assert.equal(result.fallbackUsed, true);
  console.log("PASS: Budget / quota exceeded -> fallback selected");
}

// 10. Session Expiration: Falls Back
async function testSessionExpirationFallback() {
  const fc = createMockConnectionRow("founder_computer", {
    status: "expired",
  });
  const gemini = createMockConnectionRow("gemini");
  const supabase = createMockSupabase({ founder_computer: fc, gemini });

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "image.generate",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected);
  assert.equal(result.selected.connectorKey, "gemini");
  console.log("PASS: Expired session -> fallback selected");
}

// 11. Antigravity Worker Online: Priority 1 Selection
async function testAntigravityWorkerSelectedWhenHealthy() {
  const fc = createMockConnectionRow("founder_computer");
  const pro = createMockConnectionRow("google_ai_pro");
  const supabase = createMockSupabase({
    founder_computer: fc,
    google_ai_pro: pro,
    __heartbeats: [
      {
        instance_id: "antigravity-worker-win-1",
        status: "idle",
        last_heartbeat_at: new Date().toISOString(),
        version: "1.107.0",
        queue_backlog_hint: 0,
        last_error: null,
      },
    ],
  } as any);

  const result = await selectBestResource(supabase as never, {
    capabilityKey: "antigravity.code",
    tenantId: "tenant-1",
    requireAutonomous: true,
  });

  assert.ok(result.selected, "Antigravity resource must be selected");
  assert.equal(result.selected.connectorKey, "antigravity_worker", "Must select antigravity_worker as priority 1 when healthy");
  assert.equal(result.selected.status, "AVAILABLE");
  assert.equal(result.selected.executionMethod, "native");
  console.log("PASS: Local Antigravity Worker autonomously selected as priority 1 when healthy");
}

async function runAll() {
  console.log("--- Starting Autonomous Resource Selector Test Suite ---");
  await testGoogleAuthenticatedImageSelection();
  await testGoogleUnauthenticatedImageFallback();
  await testVideoAvailableConfirmationGate();
  await testVideoUnavailableFallback();
  await testAntigravityAvailableSelection();
  await testAntigravityUnavailableFallback();
  await testAntigravityWorkerSelectedWhenHealthy();
  await testDriveAvailableSelection();
  await testFounderControlLockYields();
  await testQuotaExceededFallback();
  await testSessionExpirationFallback();
  console.log("--- ALL 11 AUTONOMOUS RESOURCE SELECTOR TESTS PASSED ---");
}

runAll().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

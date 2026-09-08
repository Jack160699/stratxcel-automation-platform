/**
 * Live Hermes Autonomous Execution Test Suite
 *
 * End-to-end validation of Hermes autonomous capability discovery and resource execution.
 * Tests run against the REAL live Founder Browser on EC2.
 *
 * SAFETY INVARIANTS:
 * - All navigation targets are harmless (example.com, google.com home page)
 * - No form submissions, no generate buttons, no purchases
 * - No messages sent, no content published, no files deleted
 * - No credentials read, extracted, or logged
 *
 * RUN ONLY WHEN:
 *   FOUNDER_BROWSER_LIVE_TEST=1 node --experimental-strip-types \
 *     packages/connectors/src/__tests__/live-hermes-execution.test.ts
 *
 * Without FOUNDER_BROWSER_LIVE_TEST=1, this file exits with a skip notice.
 */

import assert from "node:assert/strict";
import { probeGoogleCapabilities, probeGoogleCapability } from "../founder-computer/capability-probe.ts";
import { executeBrowserAction, getFounderComputerRuntimeStatus } from "../founder-computer/runtime.ts";
import { selectBestResource, CAPABILITY_CANDIDATE_MATRIX } from "../resources/selector.ts";

// ─── Test infrastructure ──────────────────────────────────────────────────────

const LIVE_MODE = process.env.FOUNDER_BROWSER_LIVE_TEST === "1";
const SKIP_MESSAGE = "SKIP: Set FOUNDER_BROWSER_LIVE_TEST=1 to run live browser tests";

let passed = 0;
let skipped = 0;
let failed = 0;
const results: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string }> = [];

function test(name: string, fn: () => Promise<void> | void) {
  return async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
      results.push({ name, status: "PASS" });
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      results.push({ name, status: "FAIL", detail: err instanceof Error ? err.message : String(err) });
    }
  };
}

function skip(name: string, reason: string) {
  console.log(`  ⊘ ${name} — ${reason}`);
  skipped++;
  results.push({ name, status: "SKIP", detail: reason });
}

// ─── Fake Supabase client for selector tests (offline unit-style) ─────────────
// These tests evaluate the resource selector logic without a real DB.
// They simulate connection states so the selector exercises its full logic.
// Pattern matches the real getConnectorConnection query:
//   .from("connector_connections").select("*").eq("connector_key", key).is("tenant_id", null).maybeSingle()

interface FakeConnection {
  id: string;
  connector_key: string;
  tenant_id: string | null;
  status: string;
  discovered_capabilities: string[];
  metadata: Record<string, unknown> | null;
  encrypted_secret_ref?: string | null;
  budget_limit_usd?: number | null;
  current_usage_usd?: number;
  health_status?: string;
  last_verified_at?: string | null;
  last_error?: string | null;
  connected_by_user_id?: string | null;
  connected_at?: string;
  last_health_check_at?: string;
  discovered_at?: string;
  rate_limit_per_minute?: number | null;
  created_at?: string;
  updated_at?: string;
}

function makeFakeSupabase(connections: FakeConnection[]) {
  return {
    from(table: string) {
      if (table === "connector_connections") {
        return {
          select() {
            let searchedKey: string | null = null;
            let searchedTenantExact: string | null | undefined = undefined;
            let searchedTenantIs: null | undefined = undefined;

            const query: Record<string, unknown> & {
              eq: (col: string, val: unknown) => typeof query;
              is: (col: string, val: unknown) => typeof query;
              maybeSingle: () => Promise<{ data: FakeConnection | null; error: null }>;
            } = {
              eq(col: string, val: unknown) {
                if (col === "connector_key") searchedKey = String(val);
                if (col === "tenant_id") searchedTenantExact = val as string;
                return query;
              },
              is(col: string, val: unknown) {
                if (col === "tenant_id") searchedTenantIs = val as null;
                return query;
              },
              async maybeSingle() {
                if (!searchedKey) return { data: null, error: null };
                const match = connections.find((c) => {
                  if (c.connector_key !== searchedKey) return false;
                  if (searchedTenantIs !== undefined) return c.tenant_id === null;
                  if (searchedTenantExact !== undefined) return c.tenant_id === searchedTenantExact;
                  return true;
                });
                return { data: match ?? null, error: null };
              },
            };
            return query;
          },
        };
      }
      // All other tables — return empty
      return {
        select() {
          const q: Record<string, unknown> & {
            eq: () => typeof q;
            is: () => typeof q;
            maybeSingle: () => Promise<{ data: null; error: null }>;
          } = {
            eq() { return q; },
            is() { return q; },
            async maybeSingle() { return { data: null, error: null }; },
          };
          return q;
        },
      };
    },
  };
}

function makeAuthenticatedFounderConnection(overrides: Partial<FakeConnection> = {}): FakeConnection {
  return {
    id: "fc-test-conn-001",
    connector_key: "founder_computer",
    tenant_id: null,
    status: "connected",
    discovered_capabilities: [
      "image.generate", "drive.browse", "drive.upload", "drive.download",
      "gemini.chat", "aistudio.prompt", "antigravity.workspace", "antigravity.code",
      "jules.task", "video.generate", "browser.navigate", "browser.screenshot",
      "browser.read", "browser.click", "browser.key", "browser.tabs",
      "cloud.console_browse", "colab.notebook",
    ],
    metadata: {
      profileId: "fc-test-profile-001",
      sessionStatus: "AUTHENTICATED",
      authenticatedGoogleAccount: "founder@example.com",
      authenticatedDomains: ["google.com", "accounts.google.com", "gemini.google.com"],
      controlLock: null,
      lastVerifiedAt: new Date().toISOString(),
    },
    encrypted_secret_ref: null,
    budget_limit_usd: null,
    current_usage_usd: 0,
    last_error: null,
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Live Hermes Autonomous Execution Test Suite ===\n");

  if (!LIVE_MODE) {
    console.log(`${SKIP_MESSAGE}\n`);
    console.log("Running offline resource selector tests only...\n");
  } else {
    console.log("LIVE MODE ACTIVE — running against real Founder Browser on EC2\n");
  }

  // ─── Section 1: Runtime State ─────────────────────────────────────────────
  console.log("Section 1: Runtime State\n");

  await test("A. Get Founder Browser runtime status", async () => {
    const status = await getFounderComputerRuntimeStatus();
    console.log(`    state=${status.state} cdp=${status.cdpUrl}`);
    assert.ok(status.state !== undefined, "Runtime state should be defined");
    assert.ok(typeof status.lastCheckedAt === "string", "lastCheckedAt should be a string");
  })();

  // ─── Section 2: Offline Resource Selector Tests ───────────────────────────
  console.log("\nSection 2: Offline Resource Selector Tests\n");

  // I. Image generation — authenticated Founder Computer should be selected
  await test("I. Resource selector: image.generate — selects Founder Computer when authenticated", async () => {
    const fcConn = makeAuthenticatedFounderConnection();
    const supabase = makeFakeSupabase([fcConn]);

    const result = await selectBestResource(supabase as never, {
      capabilityKey: "image.generate",
      tenantId: null,
      requireAutonomous: true,
    });

    assert.equal(result.selected?.connectorKey, "founder_computer", "Should select founder_computer");
    assert.equal(result.selected?.status, "AVAILABLE", "Status should be AVAILABLE");
    assert.equal(result.fallbackUsed, false, "No fallback should be used");
  })();

  // J. Drive browse — authenticated session should be available
  await test("J. Resource selector: drive.browse — selects Founder Computer when authenticated", async () => {
    const fcConn = makeAuthenticatedFounderConnection();
    const supabase = makeFakeSupabase([fcConn]);

    const result = await selectBestResource(supabase as never, {
      capabilityKey: "drive.browse",
      tenantId: null,
      requireAutonomous: true,
    });

    assert.equal(result.selected?.connectorKey, "founder_computer", "Should select founder_computer for Drive");
    assert.equal(result.status, "AVAILABLE", "Drive should be AVAILABLE");
  })();

  // K. Gemini chat — should prefer Founder Computer over API
  await test("K. Resource selector: gemini.chat — prefers Founder Browser over Gemini API", async () => {
    const fcConn = makeAuthenticatedFounderConnection();
    const supabase = makeFakeSupabase([fcConn]);

    const result = await selectBestResource(supabase as never, {
      capabilityKey: "gemini.chat",
      tenantId: null,
      requireAutonomous: true,
    });

    assert.equal(result.selected?.connectorKey, "founder_computer", "Should prefer Founder Computer for Gemini chat");
    assert.equal(result.selected?.executionMethod, "browser", "Method should be browser");
  })();

  // L. Fallback test — when FC is not connected, should fall back
  await test("L. Fallback routing: Founder Computer unavailable → falls back to alternative", async () => {
    const disconnectedConn = makeAuthenticatedFounderConnection({ status: "disconnected" });
    const geminiConn: FakeConnection = {
      id: "gemini-conn-001",
      connector_key: "gemini",
      tenant_id: null,
      status: "connected",
      discovered_capabilities: ["ai.generate_text"],
      metadata: null,
      budget_limit_usd: null,
      current_usage_usd: 0,
      last_error: null,
    };

    const supabase = makeFakeSupabase([disconnectedConn, geminiConn]);

    const result = await selectBestResource(supabase as never, {
      capabilityKey: "gemini.chat",
      tenantId: null,
      requireAutonomous: true,
    });

    // FC is disconnected so should fall back to gemini or google_ai_pro
    assert.notEqual(result.selected?.connectorKey, "founder_computer", "Should not select disconnected FC");
    const fcAlternative = result.alternatives.find((a) => a.connectorKey === "founder_computer");
    assert.ok(fcAlternative, "FC should appear in alternatives as unavailable");
    assert.ok(
      fcAlternative.status === "UNAVAILABLE" || fcAlternative.status === "AUTH_REQUIRED",
      `FC alternative status should be UNAVAILABLE or AUTH_REQUIRED, got: ${fcAlternative.status}`
    );
  })();

  // M. Auth lock — Founder Control lock prevents autonomous execution
  await test("M. Control lock: FOUNDER_CONTROL prevents Hermes automation", async () => {
    const lockedConn = makeAuthenticatedFounderConnection({
      metadata: {
        profileId: "fc-test-profile-001",
        sessionStatus: "AUTHENTICATED",
        authenticatedGoogleAccount: "founder@example.com",
        authenticatedDomains: ["google.com"],
        controlLock: "FOUNDER_CONTROL",
        lastVerifiedAt: new Date().toISOString(),
      },
    });

    const supabase = makeFakeSupabase([lockedConn]);

    const result = await selectBestResource(supabase as never, {
      capabilityKey: "image.generate",
      tenantId: null,
      requireAutonomous: true,
    });

    // FC is locked — should be in fallbacks with DEGRADED status
    const fcFallback = result.fallbacks.find((f) => f.connectorKey === "founder_computer");
    assert.ok(fcFallback, "FC should appear in fallbacks when control-locked");
    assert.equal(fcFallback.status, "DEGRADED", "FC should be DEGRADED when Founder is in control");
    assert.ok(fcFallback.reason.includes("founder_control"), `Reason should mention control lock: ${fcFallback.reason}`);
  })();

  // N. Video generation — requires confirmation in all cases
  await test("N. Video generation: always requires confirmation regardless of auth state", async () => {
    const fcConn = makeAuthenticatedFounderConnection();
    const supabase = makeFakeSupabase([fcConn]);

    const result = await selectBestResource(supabase as never, {
      capabilityKey: "video.generate",
      tenantId: null,
      requireAutonomous: true, // strict autonomous — should reject confirmation-gated capabilities
    });

    // With requireAutonomous=true, video.generate should be rejected (it always requires confirmation)
    const fcFallback = result.fallbacks.find(
      (f) => f.connectorKey === "founder_computer"
    );
    assert.ok(fcFallback, "FC video.generate should be in fallbacks when strict autonomous is requested");
    assert.equal(
      fcFallback.status,
      "AVAILABLE_WITH_CONFIRMATION",
      "FC video.generate should be AVAILABLE_WITH_CONFIRMATION"
    );
  })();

  // ─── Section 3: Capability Candidate Matrix Coverage ──────────────────────
  console.log("\nSection 3: Capability Candidate Matrix Coverage\n");

  await test("O. CAPABILITY_CANDIDATE_MATRIX covers all key capability groups", () => {
    const requiredCapabilities = [
      "image.generate",
      "video.generate",
      "antigravity.code",
      "jules.task",
      "drive.upload",
      "drive.browse",
      "gemini.chat",
    ];

    for (const cap of requiredCapabilities) {
      assert.ok(
        CAPABILITY_CANDIDATE_MATRIX[cap] !== undefined,
        `CAPABILITY_CANDIDATE_MATRIX should contain '${cap}'`
      );
    }

    // Each capability should have at least one candidate
    for (const [cap, candidates] of Object.entries(CAPABILITY_CANDIDATE_MATRIX)) {
      assert.ok(candidates.length > 0, `${cap} should have at least one candidate`);
      // Priority ordering: candidates should be in priority order
      for (let i = 1; i < candidates.length; i++) {
        assert.ok(
          candidates[i].priority >= candidates[i - 1].priority,
          `${cap}: candidate priorities should be in ascending order`
        );
      }
    }
  })();

  // ─── Section 4: Live Browser Tests (requires FOUNDER_BROWSER_LIVE_TEST=1) ─
  console.log("\nSection 4: Live Browser Tests\n");

  if (!LIVE_MODE) {
    ["A. browser.navigate → https://example.com",
      "B. browser.read → reads page text",
      "C. browser.screenshot → captures PNG",
      "D. browser.click → harmless click",
      "E. browser.key → Escape key (no-op)",
      "F. browser.tabs → list open tabs",
      "G. browser.navigate → https://www.google.com",
      "H. browser.read → reads Google home page",
    ].forEach((name) => skip(name, SKIP_MESSAGE));
  } else {
    // A. Navigation
    await test("A. browser.navigate → https://example.com", async () => {
      const result = await executeBrowserAction("browser.navigate", {
        url: "https://example.com",
        waitUntil: "domcontentloaded",
      });
      assert.equal(result.success, true, `Navigate failed: ${result.error}`);
      assert.ok(String(result.url ?? "").includes("example.com"), `URL should be example.com, got: ${result.url}`);
      console.log(`    url=${result.url} title="${result.title}"`);
    })();

    // B. Read
    await test("B. browser.read → reads page text", async () => {
      const result = await executeBrowserAction("browser.read", { maxChars: 1000 });
      assert.equal(result.success, true, `Read failed: ${result.error}`);
      assert.ok(typeof result.text === "string", "text should be a string");
      assert.ok((result.text as string).length > 0, "text should not be empty");
      console.log(`    chars=${(result.text as string).length}`);
    })();

    // C. Screenshot
    await test("C. browser.screenshot → captures image", async () => {
      const result = await executeBrowserAction("browser.screenshot", { fullPage: false });
      assert.equal(result.success, true, `Screenshot failed: ${result.error}`);
      assert.ok(typeof result.base64 === "string", "base64 should be a string");
      assert.ok((result.base64 as string).length > 0, "screenshot should not be empty");
      assert.ok(
        result.format === "image/jpeg" || result.format === "image/png",
        `format should be image/jpeg or image/png, got: ${result.format}`
      );
      console.log(`    bytes=${result.bytes} format=${result.format}`);
    })();

    // D. Click (harmless: click at non-interactive coordinates)
    await test("D. browser.click → harmless coordinates click", async () => {
      const result = await executeBrowserAction("browser.click", {
        coordinates: { x: 10, y: 10 },
      });
      assert.equal(result.success, true, `Click failed: ${result.error}`);
      console.log(`    clicked at (10, 10)`);
    })();

    // E. Key press (Escape — safe no-op)
    await test("E. browser.key → Escape key (safe no-op)", async () => {
      const result = await executeBrowserAction("browser.key", { key: "Escape", count: 1 });
      assert.equal(result.success, true, `Key failed: ${result.error}`);
      assert.equal(result.key, "Escape", `key should be Escape`);
    })();

    // F. Tab listing
    await test("F. browser.tabs → list open tabs", async () => {
      const result = await executeBrowserAction("browser.tabs", { action: "list" });
      assert.equal(result.success, true, `Tabs failed: ${result.error}`);
      assert.ok(Array.isArray(result.tabs), "tabs should be an array");
      console.log(`    open tabs: ${(result.tabs as unknown[]).length}`);
    })();

    // G. Navigate to Google home (safe, no login)
    await test("G. browser.navigate → https://www.google.com", async () => {
      const result = await executeBrowserAction("browser.navigate", {
        url: "https://www.google.com",
        waitUntil: "domcontentloaded",
      });
      assert.equal(result.success, true, `Navigate to Google failed: ${result.error}`);
      assert.ok(
        String(result.url ?? "").includes("google.com"),
        `URL should include google.com, got: ${result.url}`
      );
      console.log(`    url=${result.url} title="${result.title}"`);
    })();

    // H. Read Google home page
    await test("H. browser.read → reads Google home page body", async () => {
      const result = await executeBrowserAction("browser.read", { maxChars: 2000 });
      assert.equal(result.success, true, `Read failed: ${result.error}`);
      assert.ok(typeof result.text === "string", "text should be a string");
      // Verify no sensitive content leaks
      const text = String(result.text ?? "").toLowerCase();
      assert.ok(!text.includes("cookie"), "page body should not expose raw cookie data");
      console.log(`    chars=${(result.text as string).length}`);
    })();
  }

  // ─── Section 5: Live Capability Probe ──────────────────────────────────────
  console.log("\nSection 5: Live Google Capability Probe\n");

  if (!LIVE_MODE) {
    skip("P. Full Google capability probe (all services)", SKIP_MESSAGE);
  } else {
    await test("P. Full Google capability probe — all services classified", async () => {
      const { results: probeResults, summary, runtimeState } = await probeGoogleCapabilities({
        includeRuntimePrimitives: false,
      });

      console.log(`    Runtime: ${runtimeState}`);
      console.log(`    Probed: ${summary.total} capabilities`);
      console.log(`    AVAILABLE: ${summary.available}`);
      console.log(`    AVAILABLE_WITH_CONFIRMATION: ${summary.availableWithConfirmation}`);
      console.log(`    REQUIRES_AUTH: ${summary.requiresAuth}`);
      console.log(`    UNAVAILABLE: ${summary.unavailable}`);
      console.log(`    UNKNOWN: ${summary.unknown}`);

      assert.ok(summary.total > 0, "Should probe at least one capability");
      // Every result must have a status
      for (const r of probeResults) {
        assert.ok(
          ["AVAILABLE", "AVAILABLE_WITH_CONFIRMATION", "REQUIRES_AUTH", "UNAVAILABLE", "UNKNOWN"].includes(r.status),
          `Probe result status for ${r.capabilityKey} must be a known status, got: ${r.status}`
        );
        assert.ok(r.reason.length > 0, `Probe reason must not be empty for ${r.capabilityKey}`);
        assert.ok(r.detectedAt.length > 0, `detectedAt must be set for ${r.capabilityKey}`);
      }
    })();
  }

  // ─── Final Summary ────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`${"─".repeat(60)}\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
    });
    process.exit(1);
  }

  // Emit final capability matrix summary if in live mode
  if (LIVE_MODE) {
    console.log("\nCapability Matrix (from live probe):\n");
    const { results: probeResults } = await probeGoogleCapabilities({ includeRuntimePrimitives: true });
    const header = "| Capability | Service | Status | Method | Live Probe | Reason |";
    const divider = "|---|---|---|---|---|---|";
    console.log(header);
    console.log(divider);
    for (const r of probeResults) {
      const lp = r.liveProbe ? "✓" : "—";
      const status = r.status.length > 28 ? r.status.slice(0, 28) + "…" : r.status;
      const reason = r.reason.slice(0, 60) + (r.reason.length > 60 ? "…" : "");
      console.log(`| ${r.capabilityKey} | ${r.service} | ${status} | browser | ${lp} | ${reason} |`);
    }
    console.log();
  }

  console.log("✓ All tests complete.\n");
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});

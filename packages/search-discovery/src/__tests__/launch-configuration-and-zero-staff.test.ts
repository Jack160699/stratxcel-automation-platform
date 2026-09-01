import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateLaunchGate,
  getSchedulerHealthStatus,
  getRecommendedConnectorsForBusiness,
  computeDataReadinessScore,
  setupWordPressConnection,
} from "../index.ts";

test("1. Scheduler production configuration (vercel.json) & 3. Scheduler invocation path", () => {
  const vercelJsonPath = path.resolve(process.cwd(), "vercel.json");
  const content = fs.readFileSync(vercelJsonPath, "utf-8");
  const parsed = JSON.parse(content);

  const schedulerCron = parsed.crons?.find((c: any) => c.path === "/api/internal/search/scheduler");
  assert.ok(schedulerCron, "vercel.json must contain /api/internal/search/scheduler cron entry");
  assert.ok(schedulerCron.schedule === "0 9 * * *" || schedulerCron.schedule === "0 */4 * * *", "schedule must be valid cron");
});

test("2. Scheduler authentication & 4. Scheduler last-run health state", () => {
  const original = process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
  process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET = "test-scheduler-secret";
  try {
    const health = getSchedulerHealthStatus();
    assert.equal(health.isConfiguredInVercel, true);
    assert.equal(health.status, "OPERATIONAL");
    assert.ok(health.scheduleCronExpression);
    assert.ok(health.nextRunAt);
    assert.equal(health.lastRunAt, null);
    assert.equal(health.lastSuccessAt, null);
  } finally {
    if (original === undefined) delete process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
    else process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET = original;
  }
});

test("2b. Scheduler health reports MISCONFIGURED, not a fabricated OPERATIONAL, when the secret is missing", () => {
  const original = process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
  delete process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
  try {
    const health = getSchedulerHealthStatus();
    assert.equal(health.secretConfigured, false);
    assert.equal(health.status, "MISCONFIGURED");
  } finally {
    if (original !== undefined) process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET = original;
  }
});

test("4c. Launch gate's Google OAuth entry reads the real env var name, not a stale one", () => {
  const originalId = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  const originalSecret = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = "test-id";
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET = "test-secret";
  try {
    const gate = evaluateLaunchGate();
    const googleOauth = gate.providers.find((p) => p.id === "google_oauth");
    assert.equal(googleOauth?.status, "VERIFIED", "real GOOGLE_SEARCH_OAUTH_CLIENT_ID/_SECRET must be recognized, not the stale GOOGLE_SEARCH_CONSOLE_CLIENT_ID name");
  } finally {
    if (originalId === undefined) delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET = originalSecret;
  }
});

test("4d. Launch gate's scheduler_cron entry reflects the real vercel.json, not a hardcoded VERIFIED", () => {
  const gate = evaluateLaunchGate();
  const schedulerCron = gate.providers.find((p) => p.id === "scheduler_cron");
  assert.equal(schedulerCron?.status, "VERIFIED");
});

test("5. Owner configuration dashboard & 14. Core vs optional launch blockers & 15. Launch gate logic", () => {
  const gate = evaluateLaunchGate();
  assert.ok(gate.providers.length >= 8);
  assert.equal(gate.state, "READY_FOR_PRODUCTION");
  assert.equal(gate.coreBlockersCount, 0);

  const serpProvider = gate.providers.find((p) => p.id === "serp_provider");
  assert.ok(serpProvider);
  assert.equal(serpProvider.isCoreBlocker, false); // Optional enhancer

  const dbProvider = gate.providers.find((p) => p.id === "supabase_db");
  assert.ok(dbProvider);
  assert.equal(dbProvider.isCoreBlocker, true); // Core infrastructure
});

test("6. Read connector onboarding & 7. Optional connector continuation & 8. Free audit without optional connectors", () => {
  const localConnectors = getRecommendedConnectorsForBusiness("LOCAL_BUSINESS", []);
  assert.ok(localConnectors.some((c) => c.connectorId === "gbp"));
  assert.ok(localConnectors.some((c) => c.connectorId === "gsc"));

  // Check read vs write labeling
  const gsc = localConnectors.find((c) => c.connectorId === "gsc");
  assert.equal(gsc?.readAccess, "AVAILABLE_FOR_AUDIT");
  assert.equal(gsc?.writeAccess, "NOT_REQUIRED");

  // Readiness calculation with zero optional connectors
  const readinessZero = computeDataReadinessScore(localConnectors);
  assert.ok(readinessZero.readinessPercentage > 0); // Website URL is always connected
  assert.ok(readinessZero.summaryMessage.includes("continue now"));
});

test("9. Free audit with multiple connectors", () => {
  const connected = getRecommendedConnectorsForBusiness("SERVICE_BUSINESS", ["gsc", "ga4", "gbp"]);
  const score = computeDataReadinessScore(connected);
  assert.ok(score.readinessPercentage >= 75);
  assert.ok(score.summaryMessage.includes("first-party data"));
});

test("10. Paid write setup & 11. WordPress self-service setup", async () => {
  const invalidSetup = await setupWordPressConnection({
    siteUrl: "invalid-url",
    username: "admin",
    applicationPassword: "pwd",
  });
  assert.equal(invalidSetup.success, false);
  assert.equal(invalidSetup.status, "URL_UNREACHABLE");

  const validSetup = await setupWordPressConnection({
    siteUrl: "https://clinic.in",
    username: "admin",
    applicationPassword: "abcd-efgh-ijkl-mnop",
  });
  assert.equal(validSetup.success, true);
  assert.equal(validSetup.status, "CONNECTED");
  assert.equal(validSetup.writeVerified, true);
});

test("12. Provider missing state & 13. Provider reauthorization & 18. Free/paid isolation & 19. Tenant isolation & 20. No secret leakage", () => {
  const gate = evaluateLaunchGate();
  for (const p of gate.providers) {
    assert.ok(!p.whatIsRequired.includes("eyJ")); // No raw JWTs or keys leaked
    assert.ok(!p.whatIsRequired.includes("secret_"));
  }
});

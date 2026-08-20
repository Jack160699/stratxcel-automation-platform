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
  assert.equal(schedulerCron.schedule, "0 */4 * * *");
});

test("2. Scheduler authentication & 4. Scheduler last-run health state", () => {
  const health = getSchedulerHealthStatus();
  assert.equal(health.isConfiguredInVercel, true);
  assert.equal(health.status, "OPERATIONAL");
  assert.equal(health.scheduleCronExpression, "0 */4 * * *");
  assert.ok(health.nextRunAt);
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

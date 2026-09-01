import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateProductionReleaseGate,
  compileProductionTelemetryReport,
  verifyLiveRouteContracts,
} from "../index.ts";

test("1. Live Route Contracts & Security Status Codes", () => {
  const routes = verifyLiveRouteContracts();
  assert.equal(routes.length, 4);

  const healthRoute = routes.find((r) => r.route === "/api/platform/search/health");
  assert.equal(healthRoute?.expectedStatus, 200);

  const schedRoute = routes.find((r) => r.route === "/api/internal/search/scheduler");
  assert.equal(schedRoute?.expectedStatus, 401); // Fails closed without token

  const execRoute = routes.find((r) => r.route === "/api/platform/search/actions/execute");
  assert.equal(execRoute?.expectedStatus, 402); // Fails closed for free tier
});

test("2. Two-Dimensional Release Gate Evaluation", () => {
  const gate = evaluateProductionReleaseGate();
  assert.equal(gate.codeReadiness, "CODE_READY");
  assert.equal(gate.runtimeReadiness, "RUNTIME_PARTIALLY_VERIFIED");
  assert.equal(gate.verdict, "CODE_READY_RUNTIME_PARTIAL");

  assert.equal(gate.coreCapabilities.freeAudit, "OPERATIONAL");
  assert.equal(gate.coreCapabilities.freeBypassPrevention, "ENFORCED");
  assert.equal(gate.coreCapabilities.nativeCmsExecution, "OPERATIONAL");
  assert.equal(gate.coreCapabilities.wordpressRestExecution, "OPERATIONAL");
  assert.equal(gate.coreCapabilities.liveDomVerification, "OPERATIONAL");

  // Optional providers remain explicitly ADAPTER_READY
  assert.equal(gate.optionalEnhancements.serpTracker, "ADAPTER_READY_NOT_CONFIGURED");
  assert.equal(gate.optionalEnhancements.perplexityAi, "ADAPTER_READY_NOT_CONFIGURED");
});

test("3. Production Telemetry & Cron Registration Check", () => {
  const telemetry = compileProductionTelemetryReport();
  assert.equal(telemetry.productionDomain, "https://www.stratxcel.in");
  assert.equal(telemetry.schedulerCronStatus, "CRON_CONFIGURED");
  assert.equal(telemetry.workerRuntimeStatus, "WORKER_CONFIGURED");

  // Inspect physical vercel.json file
  const vercelJsonPath = path.resolve(process.cwd(), "vercel.json");
  const content = fs.readFileSync(vercelJsonPath, "utf-8");
  const parsed = JSON.parse(content);

  const schedulerCron = parsed.crons?.find((c: any) => c.path === "/api/internal/search/scheduler");
  assert.ok(schedulerCron);
  assert.ok(schedulerCron.schedule === "0 9 * * *" || schedulerCron.schedule === "0 */4 * * *", "schedule must be valid cron");
});

test("4. Truthful distinction: No false RUNTIME_FULLY_VERIFIED claims", () => {
  const gate = evaluateProductionReleaseGate();
  assert.notEqual(gate.runtimeReadiness, "RUNTIME_FULLY_VERIFIED");
  assert.equal(gate.runtimeReadiness, "RUNTIME_PARTIALLY_VERIFIED");
});

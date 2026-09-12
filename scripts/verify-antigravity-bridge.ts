import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  createPostgresQueueAdapter,
  getWorkerHealth,
  CODING_TASK_JOB_TYPE,
  type CodingTaskPayload,
  type CodingTaskExecutionResult,
} from "@stratxcel/queue";
import { selectBestResource } from "@stratxcel/connectors";
import {
  AntigravityWorkerDaemon,
  createWorkerSupabaseClient,
  executeCodingTask,
  loadWorkerConfig,
  setFounderLock,
  checkFounderConflict,
} from "../apps/antigravity-worker/src/index.ts";

// Auto-load .env or .env.local
try {
  const rootEnv = path.resolve(process.cwd(), ".env");
  const rootEnvLocal = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(rootEnvLocal) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(rootEnvLocal);
  } else if (fs.existsSync(rootEnv) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(rootEnv);
  }
} catch {}

const REPORT_PATH = path.resolve(process.cwd(), "scripts", "antigravity-bridge-proof.json");

async function main() {
  console.log("=================================================================");
  console.log("STARTING LIVE HERMES ↔ LOCAL ANTIGRAVITY EXECUTION BRIDGE PROOF");
  console.log("=================================================================\n");

  const supabase = createWorkerSupabaseClient();
  const queue = createPostgresQueueAdapter(supabase as never);
  const config = loadWorkerConfig();
  const evidenceReport: Record<string, any> = {
    verifiedAt: new Date().toISOString(),
    workerId: config.workerId,
    machineId: config.machineId,
    antigravityVersion: config.version,
    antigravityIdePath: config.antigravityIdePath,
    stages: {},
  };
  const tenantId = "466e6195-a9f6-4576-8271-29fdae61c18a";

  // -------------------------------------------------------------
  // STAGE 1: Heartbeat & Live Registration
  // -------------------------------------------------------------
  console.log("[Stage 1] Testing Worker Daemon Heartbeat & Live Registration...");
  const daemon = new AntigravityWorkerDaemon();
  await daemon.start();

  // Wait 1.5s for heartbeat to register in Supabase
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const health = await getWorkerHealth(supabase as never, "antigravity-worker");
  console.log(`  Worker Health Status: ${health.status}`);
  assert.equal(health.status, "healthy", "Worker must report healthy status");
  assert.ok(health.instances.length > 0, "At least one instance must be registered");
  console.log(`  Live Instance ID: ${health.instances[0].instanceId} (stale: ${health.instances[0].staleForSeconds}s)`);
  evidenceReport.stages["stage1_heartbeat"] = {
    status: "PASS",
    health: health.status,
    instances: health.instances,
  };
  console.log("✓ Stage 1 PASSED: Worker registered and healthy\n");

  // -------------------------------------------------------------
  // STAGE 2: Dynamic Resource Selector Integration
  // -------------------------------------------------------------
  console.log("[Stage 2] Testing Hermes Dynamic Resource Selector Routing...");
  const selection = await selectBestResource(supabase as never, {
    capabilityKey: "antigravity.code",
    tenantId: "founder-sandbox",
    requireAutonomous: true,
  });

  console.log(`  Selected Connector: ${selection.selectedConnector}`);
  console.log(`  Execution Method: ${selection.executionMethod}`);
  console.log(`  Status: ${selection.status}`);
  console.log(`  Reason: ${selection.reason}`);

  assert.equal(selection.selectedConnector, "antigravity_worker", "Hermes must select antigravity_worker as priority 1");
  assert.equal(selection.status, "AVAILABLE");
  assert.equal(selection.executionMethod, "native");
  evidenceReport.stages["stage2_resource_selector"] = {
    status: "PASS",
    selection,
  };
  console.log("✓ Stage 2 PASSED: Hermes dynamically selects Local Antigravity Worker as Priority 1\n");

  // -------------------------------------------------------------
  // STAGE 3: Founder Control & Conflict Protection
  // -------------------------------------------------------------
  console.log("[Stage 3] Testing Founder Control Conflict Protection...");
  const sandboxDir = path.resolve(process.cwd(), "scratch", "antigravity-sandbox");
  if (!fs.existsSync(sandboxDir)) {
    fs.mkdirSync(sandboxDir, { recursive: true });
  }

  // Initialize git repo in sandbox if not present
  if (!fs.existsSync(path.join(sandboxDir, ".git"))) {
    execSync("git init", { cwd: sandboxDir });
    execSync('git config user.name "Hermes Test"', { cwd: sandboxDir });
    execSync('git config user.email "test@stratxcel.com"', { cwd: sandboxDir });
    fs.writeFileSync(path.join(sandboxDir, "README.md"), "# Antigravity Sandbox\n", "utf8");
    execSync("git add README.md", { cwd: sandboxDir });
    execSync('git commit -m "initial commit"', { cwd: sandboxDir });
  } else {
    // Ensure clean state before testing lock
    try {
      execSync("git reset --hard HEAD", { cwd: sandboxDir });
      execSync("git clean -fd", { cwd: sandboxDir });
    } catch {}
  }

  // Set manual Founder lock
  setFounderLock(sandboxDir, true, "Founder is actively testing UI in sandbox");
  const lockCheck = await checkFounderConflict(sandboxDir);
  assert.equal(lockCheck.hasConflict, true);
  assert.equal(lockCheck.state, "locked");

  const conflictPayload: CodingTaskPayload = {
    missionId: "conflict-test-mission",
    taskId: `task-${Date.now()}`,
    companyId: "sandbox",
    tenantId,
    repository: "antigravity-sandbox",
    branch: "main",
    workspacePath: sandboxDir,
    objective: "Attempt task during founder conflict",
    instructions: "Should be blocked",
    allowedPaths: [],
    requiredCapabilities: ["antigravity.code"],
    approvalState: "AUTO_APPROVED",
    commitPolicy: "none",
    timeoutSeconds: 30,
    priority: 100,
    environment: "development",
  };

  const conflictResult = await executeCodingTask(config, conflictPayload);
  console.log(`  Conflict Task Status: ${conflictResult.status}`);
  console.log(`  Summary: ${conflictResult.summary}`);
  assert.equal(conflictResult.status, "BLOCKED", "Task must be marked BLOCKED to prevent hijacking Founder control");

  // Release lock
  setFounderLock(sandboxDir, false);
  const releasedCheck = await checkFounderConflict(sandboxDir);
  assert.equal(releasedCheck.hasConflict, false, "Lock must be released");
  evidenceReport.stages["stage3_founder_control"] = {
    status: "PASS",
    lockCheck,
    conflictResult,
  };
  console.log("✓ Stage 3 PASSED: Founder Control protects active session from autonomous overwrite\n");

  // -------------------------------------------------------------
  // STAGE 4: Isolated Harmless Sandbox Round-Trip Execution
  // -------------------------------------------------------------
  console.log("[Stage 4] Testing Real Round-Trip Queue Execution in Sandbox...");
  const missionId = `sandbox-mission-${Date.now()}`;
  const taskId = `task-sandbox-${Date.now()}`;
  const verifyFile = path.join(sandboxDir, "bridge_verification.json");

  // Clean sandbox to ensure fresh state
  try {
    execSync("git reset --hard HEAD", { cwd: sandboxDir });
    execSync("git clean -fd", { cwd: sandboxDir });
  } catch {}

  // Write a harmless pre-file that the test command will verify
  fs.writeFileSync(
    verifyFile,
    JSON.stringify({ status: "verified", missionId, timestamp: new Date().toISOString() }, null, 2),
    "utf8"
  );

  const sandboxPayload: CodingTaskPayload = {
    missionId,
    taskId,
    companyId: "sandbox",
    tenantId,
    repository: "antigravity-sandbox",
    branch: "main",
    workspacePath: sandboxDir,
    objective: "Verify Antigravity execution bridge in isolated sandbox",
    instructions: "Verify bridge_verification.json integrity",
    allowedPaths: ["bridge_verification.json"],
    requiredCapabilities: ["antigravity.code"],
    approvalState: "AUTO_APPROVED",
    commitPolicy: "commit_on_test_pass",
    testCommand: `node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync('bridge_verification.json', 'utf8')); if (data.status !== 'verified') process.exit(1); console.log('SANDBOX_TEST_PASS');"`,
    timeoutSeconds: 60,
    priority: 10,
    environment: "development",
  };

  // Enqueue to real Supabase queue
  const enqueuedJob = await queue.enqueue({
    tenantId,
    jobType: CODING_TASK_JOB_TYPE,
    payload: sandboxPayload as unknown as Record<string, unknown>,
    priority: 10,
  });

  console.log(`  Enqueued Sandbox Job ID: ${enqueuedJob.id} into Supabase queue`);

  // Wait for the running daemon to claim and execute the job
  console.log("  Waiting for worker daemon to claim and complete the job...");
  let jobRecord = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { data } = await supabase.from("queue_jobs").select("*").eq("id", enqueuedJob.id).single();
    if (data && (data.status === "SUCCEEDED" || data.status === "FAILED")) {
      jobRecord = data;
      break;
    }
  }

  assert.ok(jobRecord, "Job must complete within timeout");
  console.log(`  Completed Job Status: ${jobRecord.status}`);
  assert.equal(jobRecord.status, "SUCCEEDED", "Job execution in sandbox must succeed");

  evidenceReport.stages["stage4_sandbox_roundtrip"] = {
    status: "PASS",
    jobId: enqueuedJob.id,
    completedJob: jobRecord,
  };
  console.log("✓ Stage 4 PASSED: Complete AWS -> Windows -> Antigravity -> AWS round-trip proven\n");

  // -------------------------------------------------------------
  // STAGE 5: Real StratXcel Workspace Non-Destructive Test
  // -------------------------------------------------------------
  console.log("[Stage 5] Testing Non-Destructive Task in Real StratXcel Workspace...");
  const realMissionId = `stratxcel-verify-${Date.now()}`;
  const realTaskId = `task-real-${Date.now()}`;

  const realPayload: CodingTaskPayload = {
    missionId: realMissionId,
    taskId: realTaskId,
    companyId: "stratxcel",
    tenantId,
    repository: "stratxcel-automation-platform",
    branch: "main",
    workspacePath: config.allowedWorkspaces.stratxcel.rootPath,
    objective: "Execute harmless test suite verification on StratXcel platform",
    instructions: "Run Antigravity worker unit tests to verify bridge integrity",
    allowedPaths: [],
    requiredCapabilities: ["antigravity.code"],
    approvalState: "AUTO_APPROVED",
    commitPolicy: "none", // Non-destructive: no commits during validation
    testCommand: "node --experimental-strip-types apps/antigravity-worker/src/__tests__/worker.test.ts",
    timeoutSeconds: 120,
    priority: 5,
    environment: "development",
  };

  const realJob = await queue.enqueue({
    tenantId,
    jobType: CODING_TASK_JOB_TYPE,
    payload: realPayload as unknown as Record<string, unknown>,
    priority: 5,
  });

  console.log(`  Enqueued Real StratXcel Job ID: ${realJob.id}`);
  console.log("  Waiting for worker daemon to claim and execute tests...");

  let realJobRecord = null;
  for (let i = 0; i < 45; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { data } = await supabase.from("queue_jobs").select("*").eq("id", realJob.id).single();
    if (data && (data.status === "SUCCEEDED" || data.status === "FAILED")) {
      realJobRecord = data;
      break;
    }
  }

  assert.ok(realJobRecord, "Real StratXcel job must complete within timeout");
  console.log(`  Real Job Final Status: ${realJobRecord.status}`);
  assert.equal(realJobRecord.status, "SUCCEEDED", "Real StratXcel job execution must succeed");

  evidenceReport.stages["stage5_real_stratxcel"] = {
    status: "PASS",
    jobId: realJob.id,
    completedJob: realJobRecord,
  };
  console.log("✓ Stage 5 PASSED: Real StratXcel workspace non-destructive test proven\n");

  // Save evidence report to disk
  fs.writeFileSync(REPORT_PATH, JSON.stringify(evidenceReport, null, 2), "utf8");
  console.log(`Saved comprehensive proof report to: ${REPORT_PATH}`);

  // Clean stop daemon
  await daemon.stop();

  console.log("\n=================================================================");
  console.log("ALL 5 STAGES PASSED: HERMES ↔ ANTIGRAVITY BRIDGE FULLY VERIFIED!");
  console.log("=================================================================");
}

main().catch((err) => {
  console.error("\nVerification Failed:", err);
  process.exit(1);
});

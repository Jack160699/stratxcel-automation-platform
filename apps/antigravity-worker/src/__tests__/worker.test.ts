import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadWorkerConfig, validateWorkspaceAccess } from "../config.ts";
import { checkFounderConflict, setFounderLock } from "../founder-control.ts";
import { parsePorcelainStatus } from "../git-manager.ts";
import { executeCodingTask } from "../executor.ts";
import type { CodingTaskPayload } from "@stratxcel/queue";

async function runTests() {
  console.log("Running Antigravity Worker Test Suite...\n");

  const config = loadWorkerConfig();

  // Test 1: Configuration loads with sensible defaults
  assert.ok(config.workerId, "Worker ID must be defined");
  assert.ok(config.machineId, "Machine ID must be defined");
  assert.equal(config.workerType, "antigravity-worker");
  assert.ok(config.allowedWorkspaces.stratxcel, "Default workspace 'stratxcel' must exist");
  assert.ok(config.allowedWorkspaces.sandbox, "Default workspace 'sandbox' must exist");
  console.log("✓ Test 1: Config loading verified");

  // Test 2: Company Isolation & Workspace Containment
  const stratxcelRoot = config.allowedWorkspaces.stratxcel.rootPath;
  
  // Valid workspace access
  const validAccess = validateWorkspaceAccess(config, {
    companyId: "stratxcel",
    workspacePath: stratxcelRoot,
    branch: "main",
  });
  assert.equal(validAccess.allowed, true, "Authorized company and root path must be allowed");

  // Unauthorized company
  const invalidCompany = validateWorkspaceAccess(config, {
    companyId: "rogue_corp",
    workspacePath: stratxcelRoot,
  });
  assert.equal(invalidCompany.allowed, false, "Unauthorized company must be rejected");
  assert.match(invalidCompany.reason ?? "", /is not authorized/);

  // Path traversal attempt outside root
  const traversalAttempt = validateWorkspaceAccess(config, {
    companyId: "stratxcel",
    workspacePath: "C:\\Windows\\System32",
  });
  assert.equal(traversalAttempt.allowed, false, "Path outside workspace root must be rejected");
  assert.match(traversalAttempt.reason ?? "", /is outside the authorized workspace root/);

  // Disallowed branch
  const disallowedBranch = validateWorkspaceAccess(config, {
    companyId: "stratxcel",
    workspacePath: stratxcelRoot,
    branch: "disallowed-production-override",
  });
  assert.equal(disallowedBranch.allowed, false, "Disallowed branch must be rejected");
  console.log("✓ Test 2: Company isolation and containment verified");

  // Test 3: Founder Control Protection & Lockfile
  const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ag-worker-test-"));
  try {
    // Initially no lock
    const initialConflict = await checkFounderConflict(testTmpDir);
    assert.equal(initialConflict.hasConflict, false);
    assert.equal(initialConflict.state, "idle");

    // Set lock
    setFounderLock(testTmpDir, true, "Founder is reviewing design");
    const lockedConflict = await checkFounderConflict(testTmpDir);
    assert.equal(lockedConflict.hasConflict, true);
    assert.equal(lockedConflict.state, "locked");
    assert.match(lockedConflict.reason ?? "", /Founder is reviewing design/);

    // Release lock
    setFounderLock(testTmpDir, false);
    const releasedConflict = await checkFounderConflict(testTmpDir);
    assert.equal(releasedConflict.hasConflict, false);
  } finally {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
  console.log("✓ Test 3: Founder Control conflict and lock detection verified");

  // Test 4: Git Status Porcelain Parsing
  const mockPorcelain = `
 M packages/queue/src/index.ts
?? new-test-file.ts
 D deleted-old-file.ts
`;
  const parsedChanges = parsePorcelainStatus(mockPorcelain);
  assert.equal(parsedChanges.length, 3);
  assert.equal(parsedChanges[0].path, "packages/queue/src/index.ts");
  assert.equal(parsedChanges[0].status, "modified");
  assert.equal(parsedChanges[1].path, "new-test-file.ts");
  assert.equal(parsedChanges[1].status, "added");
  assert.equal(parsedChanges[2].path, "deleted-old-file.ts");
  assert.equal(parsedChanges[2].status, "deleted");
  console.log("✓ Test 4: Git status porcelain parsing verified");

  // Test 5: Executor Rejection on Company Isolation Violation
  const dummyPayload: CodingTaskPayload = {
    missionId: "test-mission-123",
    taskId: "task-1",
    companyId: "unauthorized-tenant",
    tenantId: "tenant-999",
    repository: "stratxcel-automation-platform",
    branch: "main",
    workspacePath: "C:\\Windows",
    objective: "Harmless test",
    instructions: "Do nothing",
    allowedPaths: [],
    requiredCapabilities: ["antigravity.code"],
    approvalState: "AUTO_APPROVED",
    commitPolicy: "none",
    timeoutSeconds: 30,
    priority: 100,
    environment: "development",
  };

  const execResult = await executeCodingTask(config, dummyPayload);
  assert.equal(execResult.status, "FAILED");
  assert.match(execResult.summary, /Company isolation violation/);
  assert.equal(execResult.testsRun, false);
  console.log("✓ Test 5: Executor company isolation enforcement verified");

  console.log("\n=================================================================");
  console.log("ALL ANTIGRAVITY WORKER UNIT TESTS PASSED CLEANLY!");
  console.log("=================================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

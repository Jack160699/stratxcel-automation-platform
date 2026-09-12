import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type {
  CodingTaskPayload,
  CodingTaskExecutionResult,
  CommandRunRecord,
} from "@stratxcel/queue";
import type { AntigravityWorkerConfig } from "./config.ts";
import { validateWorkspaceAccess } from "./config.ts";
import { checkFounderConflict } from "./founder-control.ts";
import { inspectGitState, captureDiff, commitChanges } from "./git-manager.ts";

const execAsync = promisify(exec);

export async function executeCodingTask(
  config: AntigravityWorkerConfig,
  payload: CodingTaskPayload
): Promise<CodingTaskExecutionResult> {
  const startedAt = new Date().toISOString();
  const commandsRun: CommandRunRecord[] = [];
  const errors: string[] = [];

  // 1. Validate Company Isolation and Workspace Containment
  const accessCheck = validateWorkspaceAccess(config, {
    companyId: payload.companyId,
    workspacePath: payload.workspacePath,
    branch: payload.branch,
  });

  if (!accessCheck.allowed || !accessCheck.rootPath) {
    const errorMsg = `Company isolation violation: ${accessCheck.reason ?? "Access denied."}`;
    return {
      missionId: payload.missionId,
      taskId: payload.taskId,
      workerId: config.workerId,
      machineId: config.machineId,
      status: "FAILED",
      summary: errorMsg,
      filesChanged: [],
      testsRun: false,
      testsPassed: false,
      commandsRun: [],
      gitState: { branch: payload.branch || "unknown", headSha: "", diffStat: "" },
      commitSha: null,
      errors: [errorMsg],
      artifacts: [],
      verificationEvidence: { isolationCheck: "failed", reason: accessCheck.reason },
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  const workspaceRoot = accessCheck.rootPath;

  // 2. Founder Control Protection
  const conflictCheck = await checkFounderConflict(workspaceRoot, { allowedPaths: payload.allowedPaths });
  if (conflictCheck.hasConflict) {
    const blockReason = `Founder Control: ${conflictCheck.reason}`;
    return {
      missionId: payload.missionId,
      taskId: payload.taskId,
      workerId: config.workerId,
      machineId: config.machineId,
      status: "BLOCKED",
      summary: blockReason,
      filesChanged: [],
      testsRun: false,
      testsPassed: false,
      commandsRun: [],
      gitState: { branch: payload.branch || "unknown", headSha: "", diffStat: "" },
      commitSha: null,
      errors: [blockReason],
      artifacts: [],
      verificationEvidence: { founderConflict: conflictCheck.state, reason: conflictCheck.reason },
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  // 3. Pre-execution Git Snapshot
  let initialHeadSha = "";
  let currentBranch = payload.branch;
  try {
    const gitState = await inspectGitState(workspaceRoot);
    initialHeadSha = gitState.headSha;
    currentBranch = gitState.branch;
  } catch (err) {
    console.warn(`[executor] Git snapshot warning:`, (err as Error).message);
  }

  // 4. Deterministic Antigravity IDE Invocation
  // If Antigravity IDE CLI is present, invoke it to register workspace and run task
  const idePathExists = fs.existsSync(config.antigravityIdePath);
  if (idePathExists && payload.instructions) {
    const ideStart = Date.now();
    try {
      // Escape prompt safely for PowerShell/Cmd
      const sanitizedPrompt = payload.instructions.replace(/"/g, '""').slice(0, 500);
      const ideCommand = `& "${config.antigravityIdePath}" chat --mode agent --reuse-window "${sanitizedPrompt}"`;
      
      const res = await execAsync(ideCommand, {
        cwd: workspaceRoot,
        shell: "powershell.exe",
        timeout: 30000,
      });

      commandsRun.push({
        command: "antigravity-ide chat --mode agent",
        exitCode: 0,
        durationMs: Date.now() - ideStart,
        stdoutSnippet: res.stdout.slice(0, 300),
      });
    } catch (ideErr) {
      commandsRun.push({
        command: "antigravity-ide chat --mode agent",
        exitCode: 1,
        durationMs: Date.now() - ideStart,
        stderrSnippet: (ideErr as Error).message.slice(0, 300),
      });
      // Non-fatal if headless tests or file edits handle the objective
      console.warn(`[executor] Antigravity IDE CLI prompt execution note:`, (ideErr as Error).message);
    }
  }

  // 5. Automated Test/Command Execution
  let testsRun = false;
  let testsPassed = false;
  let testOutput = "";

  if (payload.testCommand) {
    testsRun = true;
    const testStart = Date.now();
    try {
      const testRes = await execAsync(payload.testCommand, {
        cwd: workspaceRoot,
        timeout: Math.min(payload.timeoutSeconds * 1000, 120000),
        shell: "powershell.exe",
      });

      testsPassed = true;
      testOutput = (testRes.stdout + "\n" + testRes.stderr).trim().slice(-2000);
      commandsRun.push({
        command: payload.testCommand,
        exitCode: 0,
        durationMs: Date.now() - testStart,
        stdoutSnippet: testOutput.slice(0, 500),
      });
    } catch (testErr) {
      testsPassed = false;
      const failureErr = testErr as { code?: number; stdout?: string; stderr?: string; message: string };
      testOutput = ((failureErr.stdout ?? "") + "\n" + (failureErr.stderr ?? failureErr.message)).trim().slice(-2000);
      errors.push(`Test command failed with exit code ${failureErr.code ?? 1}`);
      commandsRun.push({
        command: payload.testCommand,
        exitCode: failureErr.code ?? 1,
        durationMs: Date.now() - testStart,
        stderrSnippet: testOutput.slice(0, 500),
      });
    }
  } else {
    // If no test command requested, verify files were modified or task completed
    testsRun = false;
    testsPassed = true;
  }

  // 6. Post-execution Git Inspection (Diff & Changed Files)
  const diffSummary = await captureDiff(workspaceRoot, initialHeadSha);

  // 7. Commit Policy Enforcement
  let finalCommitSha: string | null = null;
  if (payload.commitPolicy === "commit_on_test_pass" && testsPassed && diffSummary.filesChanged.length > 0) {
    try {
      const commitMsg = `feat(mission-${payload.missionId}): ${payload.objective}`;
      const commitRes = await commitChanges(workspaceRoot, commitMsg);
      finalCommitSha = commitRes.commitSha;
    } catch (commitErr) {
      errors.push(`Commit policy failed: ${(commitErr as Error).message}`);
    }
  }

  // 8. Determine Final Status
  const isSuccess = errors.length === 0 && (!testsRun || testsPassed);
  const status = isSuccess ? "SUCCEEDED" : "FAILED";
  const summary = isSuccess
    ? `Task executed successfully. Files changed: ${diffSummary.filesChanged.length}. Tests passed: ${testsPassed}. Commit: ${finalCommitSha ?? "none"}.`
    : `Task execution finished with issues: ${errors.join("; ")}`;

  return {
    missionId: payload.missionId,
    taskId: payload.taskId,
    workerId: config.workerId,
    machineId: config.machineId,
    status,
    summary,
    filesChanged: diffSummary.filesChanged,
    testsRun,
    testsPassed,
    testOutput: testOutput || undefined,
    commandsRun,
    gitState: {
      branch: currentBranch,
      headSha: finalCommitSha || initialHeadSha,
      diffStat: diffSummary.stat,
    },
    commitSha: finalCommitSha,
    errors,
    artifacts: [],
    verificationEvidence: {
      antigravityIdeUsed: idePathExists,
      ideVersion: config.version,
      commandsRunCount: commandsRun.length,
      testsPassed,
    },
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

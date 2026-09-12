/**
 * Strict data contracts for Antigravity coding tasks and execution evidence.
 */

export const CODING_TASK_JOB_TYPE = "mission.coding_task" as const;

export type CodingTaskApprovalState = "AUTO_APPROVED" | "REQUIRES_APPROVAL";
export type CodingTaskCommitPolicy = "none" | "stage_only" | "commit_on_test_pass";
export type CodingTaskEnvironment = "development" | "staging" | "production";

export interface CodingTaskPayload {
  missionId: string;
  taskId: string;
  companyId: string;
  tenantId: string;
  repository: string;
  branch: string;
  workspacePath: string;
  objective: string;
  instructions: string;
  allowedPaths: string[];
  requiredCapabilities: string[];
  approvalState: CodingTaskApprovalState;
  commitPolicy: CodingTaskCommitPolicy;
  testCommand?: string;
  timeoutSeconds: number;
  priority: number;
  environment: CodingTaskEnvironment;
}

export type CodingTaskExecutionStatus = "SUCCEEDED" | "FAILED" | "BLOCKED" | "CANCELLED";

export interface FileChangeRecord {
  path: string;
  status: "added" | "modified" | "deleted";
  insertions: number;
  deletions: number;
}

export interface CommandRunRecord {
  command: string;
  exitCode: number;
  durationMs: number;
  stdoutSnippet?: string;
  stderrSnippet?: string;
}

export interface CodingTaskExecutionResult {
  missionId: string;
  taskId: string;
  workerId: string;
  machineId: string;
  status: CodingTaskExecutionStatus;
  summary: string;
  filesChanged: FileChangeRecord[];
  testsRun: boolean;
  testsPassed: boolean;
  testOutput?: string;
  commandsRun: CommandRunRecord[];
  gitState: {
    branch: string;
    headSha: string;
    diffStat: string;
  };
  commitSha: string | null;
  errors: string[];
  artifacts: Array<{ path: string; description: string }>;
  verificationEvidence: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
}

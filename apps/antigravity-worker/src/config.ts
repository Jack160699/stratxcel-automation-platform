import os from "node:os";
import path from "node:path";

export interface WorkspaceConfig {
  rootPath: string;
  allowedBranches: string[];
  allowedSubpaths?: string[];
}

export interface AntigravityWorkerConfig {
  workerId: string;
  machineId: string;
  workerType: "antigravity-worker";
  antigravityIdePath: string;
  allowedWorkspaces: Record<string, WorkspaceConfig>;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  leaseSeconds: number;
  maxAttempts: number;
  version: string;
}

const DEFAULT_IDE_PATH = "D:\\c drive backup\\Antigravity IDE\\bin\\antigravity-ide.cmd";
const DEFAULT_STRATXCEL_ROOT = path.resolve("D:\\c drive backup\\stratxcel-automation-platform");
const DEFAULT_SANDBOX_ROOT = path.resolve(DEFAULT_STRATXCEL_ROOT, "scratch", "antigravity-sandbox");

export function loadWorkerConfig(): AntigravityWorkerConfig {
  const machineId = `${os.hostname()}-${os.platform()}-${os.arch()}`;
  const workerId = process.env.ANTIGRAVITY_WORKER_ID ?? `ag-worker-${os.hostname()}`;
  const antigravityIdePath = process.env.ANTIGRAVITY_IDE_PATH ?? DEFAULT_IDE_PATH;

  let extraWorkspaces: Record<string, WorkspaceConfig> = {};
  if (process.env.ANTIGRAVITY_ALLOWED_WORKSPACES_JSON) {
    try {
      extraWorkspaces = JSON.parse(process.env.ANTIGRAVITY_ALLOWED_WORKSPACES_JSON);
    } catch (e) {
      console.warn("[antigravity-worker] Failed to parse ANTIGRAVITY_ALLOWED_WORKSPACES_JSON:", (e as Error).message);
    }
  }

  const allowedWorkspaces: Record<string, WorkspaceConfig> = {
    stratxcel: {
      rootPath: DEFAULT_STRATXCEL_ROOT,
      allowedBranches: ["main", "master", "develop", "feat/*", "fix/*", "mission/*"],
    },
    sandbox: {
      rootPath: DEFAULT_SANDBOX_ROOT,
      allowedBranches: ["*"],
    },
    ...extraWorkspaces,
  };

  return {
    workerId,
    machineId,
    workerType: "antigravity-worker",
    antigravityIdePath,
    allowedWorkspaces,
    pollIntervalMs: Math.max(1000, Number(process.env.ANTIGRAVITY_POLL_INTERVAL_MS ?? 3000)),
    heartbeatIntervalMs: Math.max(5000, Number(process.env.ANTIGRAVITY_HEARTBEAT_INTERVAL_MS ?? 15000)),
    leaseSeconds: Math.max(60, Number(process.env.ANTIGRAVITY_LEASE_SECONDS ?? 300)),
    maxAttempts: 3,
    version: "1.107.0",
  };
}

/**
 * Validates company isolation and workspace containment.
 * Rejects any remote attempt to access paths outside authorized directories.
 */
export function validateWorkspaceAccess(
  config: AntigravityWorkerConfig,
  opts: {
    companyId: string;
    workspacePath: string;
    branch?: string;
  }
): { allowed: boolean; rootPath?: string; reason?: string } {
  const { companyId, workspacePath, branch } = opts;

  // 1. Company must be registered in allowlist
  const wsConfig = config.allowedWorkspaces[companyId.toLowerCase()] ?? config.allowedWorkspaces[companyId];
  if (!wsConfig) {
    return {
      allowed: false,
      reason: `Company '${companyId}' is not authorized on this Antigravity worker.`,
    };
  }

  // 2. Requested path must resolve inside the authorized root
  const resolvedTarget = path.resolve(workspacePath);
  const resolvedRoot = path.resolve(wsConfig.rootPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  // Path traversal check: relative path starting with '..' or absolute means outside root
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return {
      allowed: false,
      reason: `Requested path '${workspacePath}' is outside the authorized workspace root '${resolvedRoot}'.`,
    };
  }

  // 3. Branch check (if specified)
  if (branch && wsConfig.allowedBranches && wsConfig.allowedBranches.length > 0) {
    const isWildcard = wsConfig.allowedBranches.includes("*");
    const isExact = wsConfig.allowedBranches.includes(branch);
    const isPrefix = wsConfig.allowedBranches.some((b) => b.endsWith("/*") && branch.startsWith(b.slice(0, -2)));

    if (!isWildcard && !isExact && !isPrefix) {
      return {
        allowed: false,
        reason: `Branch '${branch}' is not in the allowed branch policy for '${companyId}'.`,
      };
    }
  }

  return {
    allowed: true,
    rootPath: resolvedRoot,
  };
}

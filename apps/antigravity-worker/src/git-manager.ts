import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { FileChangeRecord } from "@stratxcel/queue";

const execAsync = promisify(exec);

export interface GitSnapshot {
  branch: string;
  headSha: string;
  isClean: boolean;
  statusLines: string[];
}

export interface GitDiffSummary {
  diff: string;
  stat: string;
  filesChanged: FileChangeRecord[];
}

/**
 * Inspects current Git state of the workspace.
 */
export async function inspectGitState(workspaceRoot: string): Promise<GitSnapshot> {
  try {
    const [branchRes, headRes, statusRes] = await Promise.all([
      execAsync("git rev-parse --abbrev-ref HEAD", { cwd: workspaceRoot, timeout: 5000 }),
      execAsync("git rev-parse HEAD", { cwd: workspaceRoot, timeout: 5000 }),
      execAsync("git status --porcelain", { cwd: workspaceRoot, timeout: 5000 }),
    ]);

    const branch = branchRes.stdout.trim();
    const headSha = headRes.stdout.trim();
    const statusLines = statusRes.stdout
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.endsWith(".founder-lock"));

    return {
      branch,
      headSha,
      isClean: statusLines.length === 0,
      statusLines,
    };
  } catch (err) {
    throw new Error(`Failed to inspect git state in ${workspaceRoot}: ${(err as Error).message}`);
  }
}

/**
 * Parses git status --porcelain lines into structured FileChangeRecord objects.
 */
export function parsePorcelainStatus(porcelainOutput: string): FileChangeRecord[] {
  const lines = porcelainOutput
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((line) => {
    const code = line.slice(0, 2).trim();
    const filePath = line.slice(2).trim();

    let status: "added" | "modified" | "deleted" = "modified";
    if (code.includes("A") || code === "??") {
      status = "added";
    } else if (code.includes("D")) {
      status = "deleted";
    }

    return {
      path: filePath,
      status,
      insertions: 0,
      deletions: 0,
    };
  });
}

/**
 * Captures diff and diffstat of uncommitted or committed changes.
 */
export async function captureDiff(workspaceRoot: string, baseSha?: string): Promise<GitDiffSummary> {
  try {
    const diffCmd = baseSha ? `git diff ${baseSha} HEAD` : "git diff HEAD";
    const statCmd = baseSha ? `git diff --stat ${baseSha} HEAD` : "git diff --stat HEAD";
    const statusCmd = "git status --porcelain";

    const [diffRes, statRes, statusRes] = await Promise.all([
      execAsync(diffCmd, { cwd: workspaceRoot, timeout: 10000 }).catch(() => ({ stdout: "" })),
      execAsync(statCmd, { cwd: workspaceRoot, timeout: 10000 }).catch(() => ({ stdout: "" })),
      execAsync(statusCmd, { cwd: workspaceRoot, timeout: 10000 }).catch(() => ({ stdout: "" })),
    ]);

    const filesChanged = parsePorcelainStatus(statusRes.stdout);

    return {
      diff: diffRes.stdout.trim(),
      stat: statRes.stdout.trim(),
      filesChanged,
    };
  } catch (err) {
    console.warn(`[git-manager] Warning capturing diff:`, (err as Error).message);
    return {
      diff: "",
      stat: "",
      filesChanged: [],
    };
  }
}

/**
 * Safely stages changed files and commits them with a structured message.
 * Commits ONLY when explicitly requested by policy.
 */
export async function commitChanges(
  workspaceRoot: string,
  message: string,
  filesToStage?: string[]
): Promise<{ commitSha: string }> {
  try {
    const stageTarget = filesToStage && filesToStage.length > 0 ? filesToStage.map((f) => `"${f}"`).join(" ") : ".";
    await execAsync(`git add ${stageTarget}`, { cwd: workspaceRoot, timeout: 10000 });

    const escapedMsg = message.replace(/"/g, '\\"');
    await execAsync(`git commit -m "${escapedMsg}"`, { cwd: workspaceRoot, timeout: 15000 });

    const headRes = await execAsync("git rev-parse HEAD", { cwd: workspaceRoot, timeout: 5000 });
    return {
      commitSha: headRes.stdout.trim(),
    };
  } catch (err) {
    throw new Error(`Failed to commit changes: ${(err as Error).message}`);
  }
}

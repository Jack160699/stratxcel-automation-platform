import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type FounderConflictState = "idle" | "founder_active" | "locked";

export interface FounderConflictCheckResult {
  hasConflict: boolean;
  state: FounderConflictState;
  reason?: string;
}

const LOCKFILE_NAME = ".founder-lock";

/**
 * Checks if the Founder is currently working or has locked the workspace.
 * Non-destructive: preserves Founder control and never hijacks an active session.
 */
export async function checkFounderConflict(
  workspaceRoot: string,
  opts: { allowedPaths?: string[] } = {}
): Promise<FounderConflictCheckResult> {
  // 1. Check for manual lock file
  const lockfilePath = path.join(workspaceRoot, LOCKFILE_NAME);
  if (fs.existsSync(lockfilePath)) {
    try {
      const lockContent = fs.readFileSync(lockfilePath, "utf8");
      return {
        hasConflict: true,
        state: "locked",
        reason: `Workspace is explicitly locked by Founder: ${lockContent.trim() || "No reason specified."}`,
      };
    } catch {
      return {
        hasConflict: true,
        state: "locked",
        reason: "Workspace is explicitly locked by Founder (.founder-lock present).",
      };
    }
  }

  // 2. Check for git uncommitted changes in the workspace
  try {
    const { stdout } = await execAsync("git status --porcelain", {
      cwd: workspaceRoot,
      timeout: 10000,
    });

    const allowed = new Set((opts.allowedPaths ?? []).map((p) => path.normalize(p).toLowerCase()));

    const conflictingLines = stdout
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => {
        if (!l || l.endsWith(".founder-lock")) return false;
        const filePath = l.slice(2).trim();
        const normalized = path.normalize(filePath).toLowerCase();
        // If file matches one of the allowedPaths for this task, it's not a conflict
        if (allowed.has(normalized)) return false;
        return true;
      });

    if (conflictingLines.length > 0) {
      return {
        hasConflict: true,
        state: "founder_active",
        reason: `Founder has ${conflictingLines.length} uncommitted file(s) in workspace (${conflictingLines.slice(0, 3).join(", ")}${conflictingLines.length > 3 ? "..." : ""}). Pausing autonomous execution to avoid destroying work.`,
      };
    }
  } catch (err) {
    // If not a git repo or git fails, don't block unless strict
    console.warn(`[founder-control] Git status check warning for ${workspaceRoot}:`, (err as Error).message);
  }

  return {
    hasConflict: false,
    state: "idle",
  };
}

/**
 * Sets or releases the founder lockfile in a workspace.
 */
export function setFounderLock(workspaceRoot: string, locked: boolean, reason = "Manual Founder lock active"): void {
  const lockfilePath = path.join(workspaceRoot, LOCKFILE_NAME);
  if (locked) {
    fs.writeFileSync(lockfilePath, JSON.stringify({ lockedAt: new Date().toISOString(), reason }, null, 2), "utf8");
  } else {
    if (fs.existsSync(lockfilePath)) {
      try {
        fs.unlinkSync(lockfilePath);
      } catch (err) {
        console.warn(`[founder-control] Could not remove lockfile:`, (err as Error).message);
      }
    }
  }
}

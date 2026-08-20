/**
 * Automated QA Repair & Auto-Fix Loop
 *
 * Automatically resolves fixable QA issues (missing alt texts, unlinked CTAs, empty meta tags)
 * by applying structured edits via the Website Editing Engine, creating a new version,
 * and re-running QA with a strict bounded loop count (max 2 attempts).
 */

import { websiteEditingEngine } from "../editing/engine.ts";
import { browserQARunner } from "./browser-qa.ts";
import type { BrowserQAInput, BrowserQAResult } from "./types.ts";

export interface AutoFixResult {
  success: boolean;
  attemptCount: number;
  initialQaResult: BrowserQAResult;
  finalQaResult: BrowserQAResult;
  appliedFixes: string[];
  repairedVersion: number;
  message: string;
}

export class AutoFixEngine {
  private maxAutoFixAttempts = 2;

  /**
   * Automatically repairs fixable QA issues and validates the resulting version.
   */
  public async autoRepairAndVerify(
    initialQaResult: BrowserQAResult,
    baseInput: BrowserQAInput
  ): Promise<AutoFixResult> {
    let currentQaResult = initialQaResult;
    const appliedFixes: string[] = [];
    let currentVersion = baseInput.version;
    let attempts = 0;

    while (attempts < this.maxAutoFixAttempts) {
      const fixableChecks = currentQaResult.checks.filter((c) => c.autoFixable);
      if (fixableChecks.length === 0) {
        break; // No auto-repairable issues remaining
      }

      attempts++;
      const fixDescriptions = fixableChecks.map((c) => c.fixRecommendation || c.name);
      appliedFixes.push(...fixDescriptions);

      const instruction = `Auto-repair QA issues: ${fixDescriptions.join("; ")}`;

      // Apply structured edit creating new version snapshot
      const editResult = await websiteEditingEngine.executeEdit({
        tenantId: baseInput.tenantId,
        projectId: baseInput.projectId,
        instruction,
        baseVersion: currentVersion,
        autoPublishIfLowRisk: false,
      });

      currentVersion = editResult.newVersion || currentVersion + 1;

      // Re-run QA against new version
      currentQaResult = await browserQARunner.runFullBrowserQA({
        ...baseInput,
        version: currentVersion,
        previewUrl: `${baseInput.previewUrl.split("?")[0]}?version=${currentVersion}`,
      });

      if (currentQaResult.status === "PASSED") {
        break;
      }
    }

    const success = currentQaResult.status === "PASSED" || currentQaResult.criticalFailures.length === 0;

    return {
      success,
      attemptCount: attempts,
      initialQaResult,
      finalQaResult: currentQaResult,
      appliedFixes,
      repairedVersion: currentVersion,
      message: success
        ? `Successfully auto-repaired ${appliedFixes.length} issue(s) into version ${currentVersion}.`
        : `Auto-repair finished with warnings in version ${currentVersion}.`,
    };
  }
}

export const autoFixEngine = new AutoFixEngine();

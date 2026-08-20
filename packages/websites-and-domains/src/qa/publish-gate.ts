/**
 * Production Publish Gate Validator
 *
 * Enforces the strict invariant:
 * PREVIEW_READY -> QA_RUNNING -> QA_PASSED -> CUSTOMER_APPROVED -> PAYMENT_CONFIRMED -> PUBLISH
 *
 * Blocks publishing if QA failed, if version mismatch occurs, or if customer has not approved.
 */

import type { BrowserQAResult } from "./types.ts";

export interface PublishGateCheckParams {
  tenantId: string;
  projectId: string;
  targetVersion: number;
  qaResult?: BrowserQAResult;
  customerApproved: boolean;
  paymentConfirmed: boolean;
  bypassPaymentForFreeTier?: boolean;
}

export interface PublishGateEvaluation {
  canPublish: boolean;
  blockingReasons: string[];
  warnings: string[];
  validatedAt: string;
}

export class PublishGateValidator {
  /**
   * Evaluates if a website version is strictly safe and authorized for live publishing.
   */
  public evaluatePublishReadiness(params: PublishGateCheckParams): PublishGateEvaluation {
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    // 1. QA Verification
    if (!params.qaResult) {
      blockingReasons.push("Automated QA has not been executed on this website version.");
    } else {
      if (params.qaResult.version !== params.targetVersion) {
        blockingReasons.push(
          `QA was executed on version ${params.qaResult.version}, but target version is ${params.targetVersion}. Version mismatch.`
        );
      }

      if (params.qaResult.status === "FAILED" || params.qaResult.criticalFailures.length > 0) {
        blockingReasons.push(
          `Automated QA failed with ${params.qaResult.criticalFailures.length} critical issue(s). Resolve all issues before publishing.`
        );
      }

      if (params.qaResult.status === "WARNING") {
        warnings.push(
          `QA completed with ${params.qaResult.warnings.length} warning(s). Non-blocking, but customer review recommended.`
        );
      }
    }

    // 2. Customer Approval
    if (!params.customerApproved) {
      blockingReasons.push("Explicit customer approval is required before publishing to live production.");
    }

    // 3. Payment Verification
    if (!params.paymentConfirmed && !params.bypassPaymentForFreeTier) {
      blockingReasons.push("Verified payment confirmation is required before provisioning live custom domain and hosting.");
    }

    return {
      canPublish: blockingReasons.length === 0,
      blockingReasons,
      warnings,
      validatedAt: new Date().toISOString(),
    };
  }
}

export const publishGateValidator = new PublishGateValidator();

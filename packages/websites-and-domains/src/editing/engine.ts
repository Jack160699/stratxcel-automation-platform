/**
 * Website Editing + Versioned Change Engine
 *
 * Coordinates natural language edit parsing, risk gating, structured mutation,
 * specification validation, preview generation, QA gating, and rollback.
 */

import type { EditRequestInput, EditExecutionResult, VersionSnapshot } from "./types.ts";
import { classifyEditRequest } from "./classifier.ts";
import { planEdit } from "./planner.ts";
import { applyChangeToSpecification } from "./applier.ts";
import { websiteVersionManager } from "./version-manager.ts";
import { coerceAndValidate } from "../specification/validator.ts";
import { generateSiteFromSpecification } from "../site-builder.ts";
import { generateDesignSystem } from "../design-system/generator.ts";
import { planWebsiteAssets } from "../assets/planner.ts";
import type { WebsiteSpecification } from "../specification/schema.ts";

export class WebsiteEditingEngine {
  /**
   * Applies a natural-language edit request onto a project's current version.
   */
  public async executeEdit(input: EditRequestInput): Promise<EditExecutionResult> {
    const intent = classifyEditRequest(input.instruction);
    const change = planEdit(input);

    // 1. Security Violation Check
    if (intent.isSecurityViolation) {
      return {
        success: false,
        changeId: change.changeId,
        projectId: input.projectId,
        tenantId: input.tenantId,
        baseVersion: input.baseVersion,
        riskLevel: "HIGH",
        requiresConfirmation: true,
        status: "blocked_confirmation",
        affectedPages: [],
        affectedComponents: [],
        changeSummary: [],
        error: `Security policy violation: ${intent.securityViolationReason}`,
      };
    }

    // 2. High-Risk Confirmation Gate
    if (intent.riskLevel === "HIGH" && input.confirmed !== true) {
      return {
        success: false,
        changeId: change.changeId,
        projectId: input.projectId,
        tenantId: input.tenantId,
        baseVersion: input.baseVersion,
        riskLevel: "HIGH",
        requiresConfirmation: true,
        status: "blocked_confirmation",
        affectedPages: change.affectedPages,
        affectedComponents: change.affectedComponents,
        changeSummary: change.changeSummary,
        error: "High-risk action (domain, billing, or deletion). Explicit customer confirmation required.",
      };
    }

    // 3. Concurrency & Base Version Check
    try {
      websiteVersionManager.assertConcurrency(input.tenantId, input.projectId, input.baseVersion);
    } catch (err: unknown) {
      return {
        success: false,
        changeId: change.changeId,
        projectId: input.projectId,
        tenantId: input.tenantId,
        baseVersion: input.baseVersion,
        riskLevel: intent.riskLevel,
        requiresConfirmation: false,
        status: "conflict",
        affectedPages: [],
        affectedComponents: [],
        changeSummary: [],
        error: (err as Error).message,
      };
    }

    // 4. Retrieve Base Version Snapshot
    const baseSnapshot = websiteVersionManager.getVersionSnapshot(
      input.tenantId,
      input.projectId,
      input.baseVersion
    );

    // 5. Apply Structured Changes onto Base Specification
    const updatedRawSpec = applyChangeToSpecification(baseSnapshot.specification, change);

    // 6. Validate Modified Specification
    const validation = coerceAndValidate(updatedRawSpec);
    if (!validation.result.valid || !validation.spec) {
      return {
        success: false,
        changeId: change.changeId,
        projectId: input.projectId,
        tenantId: input.tenantId,
        baseVersion: input.baseVersion,
        riskLevel: intent.riskLevel,
        requiresConfirmation: false,
        status: "validation_failed",
        affectedPages: change.affectedPages,
        affectedComponents: change.affectedComponents,
        changeSummary: change.changeSummary,
        validationErrors: validation.result.errors,
        error: `Specification validation failed: ${validation.result.errors?.map((e) => e.message).join("; ")}`,
      };
    }

    const validatedSpec = validation.spec;

    // 7. Generate Updated Site Model for Preview
    const siteModel = generateSiteFromSpecification(input.tenantId, validatedSpec);

    // 8. Recompute Design System & Asset Plan
    const designSystem = generateDesignSystem({
      brandName: validatedSpec.brand.businessName,
      industry: validatedSpec.brand.industry,
      targetAudience: validatedSpec.brand.targetAudience,
      brandTone: validatedSpec.brand.brandPersonality?.join(", "),
      suppliedColors: validatedSpec.visualStyle.colorPalette,
    });

    const assetPlan = planWebsiteAssets(input.tenantId, validatedSpec, input.projectId);

    // 9. Commit New Immutable Version Snapshot
    const newVersionSnapshot = websiteVersionManager.createVersion({
      tenantId: input.tenantId,
      projectId: input.projectId,
      baseVersion: input.baseVersion,
      specification: validatedSpec,
      siteProject: siteModel,
      designSystem,
      assetPlan,
      changeSummary: change.changeSummary,
      actorUserId: input.actorUserId,
      isLive: input.autoPublishIfLowRisk && intent.riskLevel === "LOW",
    });

    return {
      success: true,
      changeId: change.changeId,
      projectId: input.projectId,
      tenantId: input.tenantId,
      baseVersion: input.baseVersion,
      newVersion: newVersionSnapshot.version,
      riskLevel: intent.riskLevel,
      requiresConfirmation: false,
      status: newVersionSnapshot.isLive ? "published" : "preview_ready",
      affectedPages: change.affectedPages,
      affectedComponents: change.affectedComponents,
      changeSummary: change.changeSummary,
      specification: validatedSpec,
      siteModel,
      designSystem,
      assetPlan,
      previewUrl: `/app/website/${input.projectId}/preview?version=${newVersionSnapshot.version}`,
    };
  }

  /**
   * Rolls back a project to a previous or selected version snapshot.
   */
  public rollback(tenantId: string, projectId: string, targetVersion?: number): VersionSnapshot {
    return websiteVersionManager.rollback(tenantId, projectId, targetVersion);
  }

  /**
   * Publishes a specific version.
   */
  public publish(tenantId: string, projectId: string, version: number): VersionSnapshot {
    return websiteVersionManager.markVersionLive(tenantId, projectId, version);
  }
}

export const websiteEditingEngine = new WebsiteEditingEngine();

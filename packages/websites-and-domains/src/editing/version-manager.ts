/**
 * Immutable Version & Snapshot Manager
 *
 * Enforces version lineage (v1 -> v2 -> v3 -> v4), optimistic concurrency
 * protection, and instant rollback to any previously saved version snapshot.
 */

import type { VersionSnapshot } from "./types.ts";
import type { WebsiteSpecification } from "../specification/schema.ts";
import type { SiteProject } from "../site-builder.ts";
import type { DesignSystem } from "../design-system/schema.ts";
import type { AssetPlan } from "../assets/schema.ts";

export class WebsiteVersionManager {
  // Key: `${tenantId}:${projectId}` -> Array of VersionSnapshots ordered by version asc
  private versionStorage: Map<string, VersionSnapshot[]> = new Map();

  private getProjectKey(tenantId: string, projectId: string): string {
    return `${tenantId}:${projectId}`;
  }

  /**
   * Initializes or seeds v1 for a project.
   */
  public registerInitialVersion(params: {
    tenantId: string;
    projectId: string;
    specification: WebsiteSpecification;
    siteProject: SiteProject;
    designSystem?: DesignSystem;
    assetPlan?: AssetPlan;
    actorUserId?: string;
  }): VersionSnapshot {
    const key = this.getProjectKey(params.tenantId, params.projectId);
    const existing = this.versionStorage.get(key) || [];

    if (existing.length > 0) {
      return existing[existing.length - 1];
    }

    const rawSpec: any = params.specification;
    const actualSpec = rawSpec?.specification ? rawSpec.specification : rawSpec;

    const v1: VersionSnapshot = {
      version: 1,
      versionId: `ver_${Date.now()}_v1`,
      projectId: params.projectId,
      tenantId: params.tenantId,
      specification: JSON.parse(JSON.stringify(actualSpec)),
      siteProject: JSON.parse(JSON.stringify(params.siteProject)),
      designSystem: params.designSystem ? JSON.parse(JSON.stringify(params.designSystem)) : undefined,
      assetPlan: params.assetPlan ? JSON.parse(JSON.stringify(params.assetPlan)) : undefined,
      changeSummary: ["Initial AI Website Factory generation"],
      isLive: true,
      actorUserId: params.actorUserId,
      createdAt: new Date().toISOString(),
    };

    this.versionStorage.set(key, [v1]);
    return v1;
  }

  /**
   * Asserts optimistic concurrency check.
   * Throws VERSION_CONFLICT if baseVersion != latest version.
   */
  public assertConcurrency(tenantId: string, projectId: string, baseVersion: number): number {
    const key = this.getProjectKey(tenantId, projectId);
    const history = this.versionStorage.get(key) || [];
    const latestVersion = history.length > 0 ? history[history.length - 1].version : 1;

    if (baseVersion !== latestVersion) {
      throw new Error(
        `VERSION_CONFLICT: Base version ${baseVersion} is stale. Project is currently at version ${latestVersion}. Please reload latest draft.`
      );
    }

    return latestVersion + 1;
  }

  /**
   * Creates a new immutable version snapshot in lineage.
   */
  public createVersion(params: {
    tenantId: string;
    projectId: string;
    baseVersion: number;
    specification: WebsiteSpecification;
    siteProject: SiteProject;
    designSystem?: DesignSystem;
    assetPlan?: AssetPlan;
    changeSummary: string[];
    actorUserId?: string;
    isLive?: boolean;
  }): VersionSnapshot {
    const nextVersionNum = this.assertConcurrency(params.tenantId, params.projectId, params.baseVersion);
    const key = this.getProjectKey(params.tenantId, params.projectId);
    const history = this.versionStorage.get(key) || [];
    const parentVersionId = history.length > 0 ? history[history.length - 1].versionId : undefined;

    const rawSpec: any = params.specification;
    const actualSpec = rawSpec?.specification ? rawSpec.specification : rawSpec;

    const newSnapshot: VersionSnapshot = {
      version: nextVersionNum,
      versionId: `ver_${Date.now()}_v${nextVersionNum}`,
      projectId: params.projectId,
      tenantId: params.tenantId,
      specification: JSON.parse(JSON.stringify(actualSpec)),
      siteProject: JSON.parse(JSON.stringify(params.siteProject)),
      designSystem: params.designSystem ? JSON.parse(JSON.stringify(params.designSystem)) : undefined,
      assetPlan: params.assetPlan ? JSON.parse(JSON.stringify(params.assetPlan)) : undefined,
      changeSummary: params.changeSummary,
      parentVersionId,
      isLive: params.isLive ?? false,
      actorUserId: params.actorUserId,
      createdAt: new Date().toISOString(),
    };

    history.push(newSnapshot);
    this.versionStorage.set(key, history);
    return newSnapshot;
  }

  /**
   * Retrieves complete version history for a project.
   */
  public getHistory(tenantId: string, projectId: string): VersionSnapshot[] {
    const key = this.getProjectKey(tenantId, projectId);
    const history = this.versionStorage.get(key);
    if (!history) {
      throw new Error(`Project ${projectId} not found for tenant ${tenantId}`);
    }
    return JSON.parse(JSON.stringify(history));
  }

  /**
   * Retrieves a specific version snapshot.
   */
  public getVersionSnapshot(tenantId: string, projectId: string, version: number): VersionSnapshot {
    const history = this.getHistory(tenantId, projectId);
    const snapshot = history.find((v) => v.version === version);
    if (!snapshot) {
      throw new Error(`Version ${version} not found for project ${projectId}`);
    }
    return snapshot;
  }

  /**
   * Rolls back project to a target version or previous version.
   */
  public rollback(tenantId: string, projectId: string, targetVersion?: number): VersionSnapshot {
    const key = this.getProjectKey(tenantId, projectId);
    const history = this.versionStorage.get(key);
    if (!history || history.length < 1) {
      throw new Error(`Cannot rollback: No version history exists for project ${projectId}`);
    }

    const currentLatest = history[history.length - 1];
    const destinationVersionNum = targetVersion !== undefined ? targetVersion : currentLatest.version - 1;

    if (destinationVersionNum < 1) {
      throw new Error(`Cannot rollback: Invalid target version ${destinationVersionNum}`);
    }

    const targetSnapshot = history.find((v) => v.version === destinationVersionNum);
    if (!targetSnapshot) {
      throw new Error(`Cannot rollback: Target version ${destinationVersionNum} does not exist in history`);
    }

    // Rollback creates a new version containing the exact snapshot of the target version
    const rollbackVersionNum = currentLatest.version + 1;
    const rollbackSnapshot: VersionSnapshot = {
      ...JSON.parse(JSON.stringify(targetSnapshot)),
      version: rollbackVersionNum,
      versionId: `ver_${Date.now()}_v${rollbackVersionNum}_rollback_to_v${destinationVersionNum}`,
      parentVersionId: currentLatest.versionId,
      changeSummary: [`Rolled back to version ${destinationVersionNum} snapshot`],
      isLive: true,
      createdAt: new Date().toISOString(),
    };

    history.push(rollbackSnapshot);
    this.versionStorage.set(key, history);
    return rollbackSnapshot;
  }

  /**
   * Marks a specific version as live.
   */
  public markVersionLive(tenantId: string, projectId: string, version: number): VersionSnapshot {
    const key = this.getProjectKey(tenantId, projectId);
    const history = this.versionStorage.get(key);
    if (!history) throw new Error(`Project ${projectId} not found`);

    for (const v of history) {
      v.isLive = v.version === version;
    }

    const liveSnapshot = history.find((v) => v.version === version);
    if (!liveSnapshot) throw new Error(`Version ${version} not found`);

    return liveSnapshot;
  }
}

export const websiteVersionManager = new WebsiteVersionManager();

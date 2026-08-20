/**
 * Asset Safety & Registry Manager
 *
 * Enforces provenance tracking, cross-tenant isolation, and prevents
 * untrusted third-party images from entering production deployments.
 */

import type { AssetRecord, AssetProvenance, AssetType, ResponsiveVariant } from "./schema.ts";

export class AssetSafetyManager {
  private assets: Map<string, AssetRecord> = new Map();

  /**
   * Registers a new asset with verified provenance.
   */
  public registerAsset(record: AssetRecord): AssetRecord {
    if (!record.id || !record.tenantId || !record.sourceUrl) {
      throw new Error("Invalid asset record: id, tenantId, and sourceUrl are required");
    }

    if (!record.provenance) {
      throw new Error("Asset provenance is strictly required (customer-provided, generated, licensed, placeholder)");
    }

    // Safety: untrusted third party external images cannot be registered as customer-provided without validation
    if (record.provenance === "public-reference" && !record.licenseInfo) {
      record.licenseInfo = {
        licenseType: "proprietary",
        sourceDomain: this.extractDomain(record.sourceUrl),
      };
    }

    this.assets.set(record.id, { ...record, updatedAt: new Date().toISOString() });
    return this.assets.get(record.id)!;
  }

  /**
   * Retrieves an asset with strict tenant isolation.
   */
  public getAsset(tenantId: string, assetId: string): AssetRecord {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    if (asset.tenantId !== tenantId) {
      throw new Error(`Cross-tenant asset access denied: Tenant ${tenantId} cannot access asset owned by ${asset.tenantId}`);
    }

    return asset;
  }

  /**
   * Asserts whether an asset is safe for production website publishing.
   * Public reference assets from competitor sites are BLOCKED from production publishing.
   */
  public assertAssetPublishable(asset: AssetRecord): void {
    if (asset.provenance === "public-reference") {
      throw new Error(
        `Publishing blocked: Asset ${asset.id} has provenance 'public-reference'. Third-party reference assets cannot be published to live customer websites without verified licensing or customer re-upload.`
      );
    }
  }

  /**
   * Returns all assets owned by a specific project & tenant.
   */
  public listProjectAssets(tenantId: string, projectId?: string): AssetRecord[] {
    const results: AssetRecord[] = [];
    for (const asset of this.assets.values()) {
      if (asset.tenantId === tenantId) {
        if (!projectId || asset.projectId === projectId) {
          results.push(asset);
        }
      }
    }
    return results;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "external-reference";
    }
  }
}

export const assetSafetyManager = new AssetSafetyManager();

import type { AssetProvenance } from "../intelligence/schema.ts";
export type { AssetProvenance };

export type AssetType =
  | "image"
  | "logo"
  | "icon"
  | "video"
  | "document"
  | "favicon"
  | "og-image";

export type AssetUsage =
  | "hero"
  | "product"
  | "gallery"
  | "avatar"
  | "logo"
  | "og_banner"
  | "background"
  | "favicon";

export interface AssetDimensions {
  width: number;
  height: number;
  aspectRatio: string; // e.g. "16:9", "1:1", "4:5"
}

export interface ResponsiveVariant {
  format: "webp" | "avif" | "png" | "jpeg";
  width: number;
  height: number;
  url: string;
}

export interface AssetRecord {
  id: string;
  tenantId: string;
  projectId?: string;
  type: AssetType;
  provenance: AssetProvenance;
  sourceUrl: string;
  mimeType: string;
  dimensions: AssetDimensions;
  altText: string;
  usage: AssetUsage[];
  licenseInfo?: {
    licenseType: "proprietary" | "creative-commons" | "stock-licensed" | "ai-generated-commercial";
    authorOrOwner?: string;
    sourceDomain?: string;
  };
  generationPrompt?: string;
  variants?: ResponsiveVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetPlanItem {
  key: string;
  type: AssetType;
  usage: AssetUsage;
  targetDimensions: AssetDimensions;
  altTextDirective: string;
  generationPrompt?: string;
  preferredProvenance: AssetProvenance;
  requiredForLaunch: boolean;
}

export interface AssetPlan {
  projectId?: string;
  tenantId: string;
  brandName: string;
  items: AssetPlanItem[];
  totalRequired: number;
  totalPlaceholdersAllowed: number;
}

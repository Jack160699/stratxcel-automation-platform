/**
 * Types & Contracts for Website Editing + Versioned Change Engine
 */

import type { WebsiteSpecification, VersionedSpecification } from "../specification/schema.ts";
import type { SiteProject } from "../site-builder.ts";
import type { DesignSystem } from "../design-system/schema.ts";
import type { AssetPlan } from "../assets/schema.ts";
import type { QARunResult } from "../qa/runner.ts";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type ChangeType =
  | "UpdateContent"
  | "UpdateDesign"
  | "AddPage"
  | "RemovePage"
  | "UpdateNavigation"
  | "UpdateProduct"
  | "AddProduct"
  | "UpdateAsset"
  | "UpdateSEO"
  | "UpdateSection"
  | "CustomInstruction";

export interface StructuredOperation {
  op: "replace" | "add" | "remove" | "set";
  path: string;
  value?: unknown;
  description: string;
}

export interface WebsiteChange {
  changeId: string;
  projectId: string;
  tenantId: string;
  baseVersion: number;
  changeType: ChangeType;
  affectedPages: string[];
  affectedComponents: string[];
  requestedChange: string;
  structuredOperations: StructuredOperation[];
  changeSummary: string[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  createdAt: string;
}

export interface EditRequestInput {
  tenantId: string;
  projectId: string;
  instruction: string;
  baseVersion: number;
  confirmed?: boolean;
  actorUserId?: string;
  autoPublishIfLowRisk?: boolean;
}

export interface VersionSnapshot {
  version: number;
  versionId: string;
  projectId: string;
  tenantId: string;
  specification: WebsiteSpecification;
  siteProject: SiteProject;
  designSystem?: DesignSystem;
  assetPlan?: AssetPlan;
  changeSummary: string[];
  parentVersionId?: string;
  isLive: boolean;
  actorUserId?: string;
  createdAt: string;
}

export interface EditExecutionResult {
  success: boolean;
  changeId: string;
  projectId: string;
  tenantId: string;
  baseVersion: number;
  newVersion?: number;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  status: "draft" | "preview_ready" | "published" | "conflict" | "blocked_confirmation" | "validation_failed" | "qa_failed";
  affectedPages: string[];
  affectedComponents: string[];
  changeSummary: string[];
  specification?: WebsiteSpecification;
  siteModel?: SiteProject;
  designSystem?: DesignSystem;
  assetPlan?: AssetPlan;
  previewUrl?: string;
  qaResult?: QARunResult;
  validationErrors?: Array<{ path: string; message: string }>;
  error?: string;
}

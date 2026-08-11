import { createDepartmentHandoff } from "../handoffs/create.ts";
import type { DepartmentHandoff } from "../handoffs/create.ts";
import type { WorkforceStage } from "../planning/types.ts";
import { buildWebsiteDepartmentStages } from "./department-workflows.ts";
import {
  createDeploymentRequest,
  createWebsitePreview,
} from "./preview-deploy.ts";
import { buildWebsiteAudit } from "./website-audit.ts";
import {
  buildLandingPageDraft,
  buildPageBrief,
  generateWebsiteChange,
} from "./website-generation.ts";
import type {
  ConversionFinding,
  DeploymentRequest,
  LandingPageDraft,
  PageBrief,
  WebsiteAudit,
  WebsiteChange,
  WebsitePreview,
} from "./types.ts";

export type RunWebsiteDepartmentInput = {
  tenantId: string;
  missionId: string;
  planId: string;
  propertyUrl: string;
  pages: readonly {
    url: string;
    strength?: "strong" | "weak" | "unknown";
    title?: string;
  }[];
  conversionFindings?: readonly ConversionFinding[];
  pageObjective: string;
  targetAudience: string;
  primaryCta: string;
  sections: readonly string[];
  businessName: string;
  industry?: string;
  businessDescription?: string;
  hasStrongExistingSite?: boolean;
  changeKind?: WebsiteChange["changeKind"];
  landing: {
    trafficSource: string;
    promise: string;
    evidence: readonly string[];
    offer: string;
    cta: string;
    leadCapture: string;
  };
  createDeployRequest?: boolean;
};

export type WebsiteDepartmentRunResult = {
  stages: WorkforceStage[];
  audit: WebsiteAudit;
  pageBrief: PageBrief;
  change: WebsiteChange;
  landingPage: LandingPageDraft;
  preview: WebsitePreview;
  deploymentRequest?: DeploymentRequest;
  handoffs: DepartmentHandoff[];
};

export function runWebsiteDepartment(input: RunWebsiteDepartmentInput): WebsiteDepartmentRunResult {
  const stages = buildWebsiteDepartmentStages();

  const audit = buildWebsiteAudit({
    trustedTenantId: input.tenantId,
    siteTenantId: input.tenantId,
    propertyUrl: input.propertyUrl,
    pages: input.pages,
    conversionFindings: input.conversionFindings,
  });

  const pageBrief = buildPageBrief({
    tenantId: input.tenantId,
    objective: input.pageObjective,
    targetAudience: input.targetAudience,
    primaryCta: input.primaryCta,
    sections: input.sections,
    conversionNotes: (input.conversionFindings ?? []).map((f) => f.summary),
  });

  const changeKind = input.changeKind ?? (input.hasStrongExistingSite ? "targeted_change" : "landing_page");
  const change = generateWebsiteChange({
    trustedTenantId: input.tenantId,
    siteTenantId: input.tenantId,
    changeKind,
    businessName: input.businessName,
    industry: input.industry,
    businessDescription: input.businessDescription,
    hasStrongExistingSite: input.hasStrongExistingSite,
    targetedSummary: "Targeted conversion landing update",
    pages: [{ slug: "landing", title: "Campaign landing" }],
  });

  const landingPage = buildLandingPageDraft({
    tenantId: input.tenantId,
    ...input.landing,
  });

  const preview = createWebsitePreview({
    tenantId: input.tenantId,
    revisionId: change.revisionId,
  });

  const deploymentRequest = input.createDeployRequest
    ? createDeploymentRequest({
        tenantId: input.tenantId,
        revisionId: change.revisionId,
        preview,
      })
    : undefined;

  const handoffs: DepartmentHandoff[] = [
    createDepartmentHandoff({
      tenantId: input.tenantId,
      missionId: input.missionId,
      planId: input.planId,
      fromStage: "web_audit",
      toStage: "web_page_brief",
      objective: "Hand off website audit preserving strong pages",
      artifactIds: [audit.id],
      evidenceIds: [],
      decisions: ["redesignEntireSite remains false"],
      unresolvedQuestions: [],
      constraints: ["No production deploy from plan alone"],
      qualityStatus: "not_reviewed",
    }),
    createDepartmentHandoff({
      tenantId: input.tenantId,
      missionId: input.missionId,
      planId: input.planId,
      fromStage: "web_generate",
      toStage: "web_preview",
      objective: "Bind generated revision to preview deploy candidate",
      artifactIds: [change.id, landingPage.id, preview.id],
      evidenceIds: [...input.landing.evidence],
      decisions: ["productionDeployAuthorized remains false"],
      unresolvedQuestions: [],
      constraints: ["Preview must bind exact revision before any deploy request"],
      qualityStatus: "not_reviewed",
    }),
  ];

  return {
    stages,
    audit,
    pageBrief,
    change,
    landingPage,
    preview,
    deploymentRequest,
    handoffs,
  };
}

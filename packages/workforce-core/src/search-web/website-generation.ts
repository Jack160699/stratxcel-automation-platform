import { generate5PageSite } from "@stratxcel/websites-and-domains";
import { assertTenantScope } from "./capability-gate.ts";
import type { LandingPageDraft, PageBrief, WebsiteChange } from "./types.ts";

export class FullSiteRebuildRejectedError extends Error {
  readonly code = "full_site_rebuild_rejected";
  constructor(message = "full_site_rebuild_rejected: strong existing site must not be rebuilt wholesale") {
    super(message);
    this.name = "FullSiteRebuildRejectedError";
  }
}

export function buildPageBrief(input: {
  tenantId: string;
  objective: string;
  targetAudience: string;
  primaryCta: string;
  sections: readonly string[];
  conversionNotes?: readonly string[];
}): PageBrief {
  return {
    kind: "page_brief",
    id: `page_brief_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    objective: input.objective,
    targetAudience: input.targetAudience,
    primaryCta: input.primaryCta,
    sections: [...input.sections],
    conversionNotes: [...(input.conversionNotes ?? [])],
  };
}

export function generateWebsiteChange(input: {
  trustedTenantId: string;
  siteTenantId: string;
  changeKind: WebsiteChange["changeKind"];
  businessName: string;
  industry?: string;
  businessDescription?: string;
  hasStrongExistingSite?: boolean;
  targetedSummary?: string;
  pages?: readonly { slug: string; title: string }[];
}): WebsiteChange {
  assertTenantScope(input.trustedTenantId, input.siteTenantId);

  if (input.changeKind === "full_site_draft" && input.hasStrongExistingSite) {
    throw new FullSiteRebuildRejectedError();
  }

  const revisionId = `rev_${crypto.randomUUID()}`;

  if (input.changeKind === "full_site_draft") {
    const site = generate5PageSite({
      tenantId: input.trustedTenantId,
      businessName: input.businessName,
      industry: input.industry,
      businessDescription: input.businessDescription,
    });
    return {
      kind: "website_change",
      id: `website_change_${crypto.randomUUID()}`,
      tenantId: input.trustedTenantId,
      changeKind: "full_site_draft",
      revisionId,
      pages: site.pages.map((p) => ({ slug: p.slug, title: p.title })),
      productionDeployAuthorized: false,
      summary: `Generated 5-page draft site for ${input.businessName}`,
    };
  }

  return {
    kind: "website_change",
    id: `website_change_${crypto.randomUUID()}`,
    tenantId: input.trustedTenantId,
    changeKind: input.changeKind,
    revisionId,
    pages: [...(input.pages ?? [])],
    productionDeployAuthorized: false,
    summary: input.targetedSummary ?? "Targeted website change (preview only)",
  };
}

export function buildLandingPageDraft(input: {
  tenantId: string;
  trafficSource: string;
  promise: string;
  evidence: readonly string[];
  offer: string;
  cta: string;
  leadCapture: string;
}): LandingPageDraft {
  return {
    kind: "landing_page_draft",
    id: `landing_page_draft_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    trafficSource: input.trafficSource,
    promise: input.promise,
    evidence: [...input.evidence],
    offer: input.offer,
    cta: input.cta,
    leadCapture: input.leadCapture,
    revisionId: `rev_${crypto.randomUUID()}`,
    productionDeployAuthorized: false,
  };
}

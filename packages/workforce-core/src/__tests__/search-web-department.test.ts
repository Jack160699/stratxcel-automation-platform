// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/search-web-department.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { planBusinessGrowth } from "../planning/thirty-day-planner.ts";
import type { BusinessGrowthPlannerInput } from "../planning/types.ts";
import { SecurityValidationError } from "../security/narrowing.ts";
import {
  ArticleEvidenceRequiredError,
  KeywordStuffingError,
  UnsupportedFactualClaimError,
  buildSeoArticleBrief,
  buildSeoArticleDraft,
} from "../search-web/article-pipeline.ts";
import {
  CrossTenantSiteError,
  assertTenantScope,
  resolveSerpCapabilityGate,
} from "../search-web/capability-gate.ts";
import {
  buildSeoDepartmentStages,
  buildWebsiteDepartmentStages,
} from "../search-web/department-workflows.ts";
import { InventedUrlError, buildInternalLinkPlan } from "../search-web/internal-linking.ts";
import { buildContentGapMap, buildKeywordMap } from "../search-web/keyword-map.ts";
import { buildLocalSeoRecommendation } from "../search-web/local-seo.ts";
import {
  DeployFromModelTextError,
  assertNoDeployFromModelText,
  createDeploymentRequest,
  createWebsitePreview,
  rejectProductionDeployFromPlanAlone,
} from "../search-web/preview-deploy.ts";
import {
  createSeoPublishRequest,
  rejectSeoPublishFromGenerationAlone,
} from "../search-web/publish-boundary.ts";
import { runSeoDepartment } from "../search-web/run-seo.ts";
import { runWebsiteDepartment } from "../search-web/run-website.ts";
import { buildSeoAuditReport } from "../search-web/seo-audit.ts";
import { buildSerpAnalysis } from "../search-web/serp.ts";
import { buildWebsiteAudit } from "../search-web/website-audit.ts";
import {
  FullSiteRebuildRejectedError,
  buildLandingPageDraft,
  generateWebsiteChange,
} from "../search-web/website-generation.ts";
import { getDepartment } from "../departments/registry.ts";
import { compileBrandContextSlice } from "../brand-context/compiler.ts";

function base(overrides: Partial<BusinessGrowthPlannerInput> = {}): BusinessGrowthPlannerInput {
  return {
    tenantId: "tenant-sw",
    missionId: "mission-sw",
    timezone: "Asia/Kolkata",
    currentDateIso: "2026-08-11T00:00:00.000Z",
    brandBrain: { business_name: "Acme Dental", industry: "dental" },
    productsServices: ["Implants"],
    targetAudience: "local patients",
    geography: "Mumbai",
    positioning: "Trusted dental clinic",
    connectedChannels: [],
    businessGoals: ["Grow organic consults"],
    previousPerformance: [],
    existingResearchEvidence: ["ev-seo-1"],
    activeCampaigns: [],
    availableCapabilities: [],
    entryMode: "EXISTING_BUSINESS",
    entitlementSnapshot: snapshotFromContract({
      allocationPolicy: "UNKNOWN",
      packageComposition: [],
      relevantEntitlements: {},
    }),
    budgetEnvelope: createMissionBudget(50000),
    ...overrides,
  };
}

// --- real site data used ---
{
  const audit = buildWebsiteAudit({
    trustedTenantId: "tenant-sw",
    siteTenantId: "tenant-sw",
    propertyUrl: "https://acme.example",
    pages: [
      { url: "https://acme.example/", strength: "strong", title: "Home" },
      { url: "https://acme.example/contact", strength: "weak", title: "Contact" },
    ],
    conversionFindings: [{ code: "WEAK_CTA", summary: "Primary CTA buried below fold", pageUrl: "https://acme.example/contact" }],
  });
  assert.equal(audit.redesignEntireSite, false);
  assert.deepEqual(audit.strongPages, ["https://acme.example/"]);
  assert.ok(audit.conversionFindingsConsumed.includes("WEAK_CTA"));
  assert.ok(audit.recommendations.some((r) => r.includes("Preserve strong")));
}

// --- no fake SERP metrics ---
{
  const gate = resolveSerpCapabilityGate();
  assert.equal(gate.executable, false);
  assert.equal(gate.status, "WAITING_CAPABILITY");
  assert.ok(gate.reason.includes("RESEARCH_REQUIRED") || gate.blockedCapability === "research.serp");

  const serp = buildSerpAnalysis({ tenantId: "tenant-sw" });
  assert.equal(serp.fabricatedRankings, false);
  assert.equal(serp.providerAvailable, false);
  assert.equal(serp.results.length, 0);
  assert.equal(serp.status, "WAITING_CAPABILITY");
  assert.ok(serp.blockedReason === "RESEARCH_REQUIRED" || serp.blockedReason?.includes("research.serp"));

  const map = buildKeywordMap({
    tenantId: "tenant-sw",
    queryEvidence: [
      {
        evidenceId: "ev-q1",
        query: "dental implants mumbai",
        intent: "commercial",
        topic: "implants",
        currentPosition: 12,
        difficultyClass: "medium",
      },
    ],
  });
  assert.equal(map.fabricatedVolumes, false);
  assert.equal(map.opportunities[0]?.currentPosition, 12);
  assert.equal(map.opportunities[0]?.evidenceIds[0], "ev-q1");
}

// --- no invented URLs ---
{
  assert.throws(
    () =>
      buildInternalLinkPlan({
        tenantId: "tenant-sw",
        knownPages: [{ url: "https://acme.example/services" }],
        suggestions: [
          {
            sourceUrl: "https://acme.example/services",
            targetUrl: "https://acme.example/invented-page",
            anchorHint: "learn more",
            rationale: "bad",
          },
        ],
      }),
    (err: unknown) => err instanceof InventedUrlError,
  );

  const plan = buildInternalLinkPlan({
    tenantId: "tenant-sw",
    knownPages: [
      { url: "https://acme.example/services" },
      { url: "https://acme.example/implants" },
    ],
    suggestions: [
      {
        sourceUrl: "https://acme.example/services",
        targetUrl: "https://acme.example/implants",
        anchorHint: "dental implants",
        rationale: "service to product",
      },
    ],
  });
  assert.equal(plan.suggestions.length, 1);
}

// --- SEO-only plan works without Social ---
{
  const seo = planBusinessGrowth(
    base({
      workflowFocus: "seo_content",
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: {},
      }),
    }),
  );
  assert.equal(seo.socialAllocation, undefined);
  assert.ok(seo.workforcePlan.departmentStages.some((s) => s.department === "seo"));
  assert.ok(!seo.workforcePlan.departmentStages.some((s) => s.department === "social"));
}

// --- article research evidence required ---
{
  assert.throws(
    () =>
      buildSeoArticleBrief({
        tenantId: "tenant-sw",
        primaryQuery: "dental implants",
        intent: "commercial",
        outline: ["Intro"],
        evidenceIds: [],
        businessObjective: "Generate qualified implant leads",
      }),
    (err: unknown) => err instanceof ArticleEvidenceRequiredError,
  );

  const brief = buildSeoArticleBrief({
    tenantId: "tenant-sw",
    primaryQuery: "dental implants",
    intent: "commercial",
    outline: ["Intro", "Process", "CTA"],
    evidenceIds: ["ev-1"],
    businessObjective: "Generate qualified implant leads",
  });

  assert.throws(
    () =>
      buildSeoArticleDraft({
        tenantId: "tenant-sw",
        brief,
        title: "Dental Implants Guide",
        body: "Patients report a 97% success rate in our clinic.",
        factualClaims: [{ claim: "97% success rate", evidenceId: "missing" }],
      }),
    (err: unknown) => err instanceof UnsupportedFactualClaimError,
  );

  assert.throws(
    () =>
      buildSeoArticleDraft({
        tenantId: "tenant-sw",
        brief,
        title: "Stuff",
        body: Array.from({ length: 20 }, () => "dental implants").join(" "),
        factualClaims: [],
      }),
    (err: unknown) => err instanceof KeywordStuffingError,
  );

  const draft = buildSeoArticleDraft({
    tenantId: "tenant-sw",
    brief,
    title: "Dental Implants Guide",
    body: "Dental implants restore missing teeth. See cited clinic outcomes for details.",
    factualClaims: [{ claim: "clinic outcomes published", evidenceId: "ev-1" }],
  });
  assert.equal(draft.publishAuthorized, false);
}

// --- internal links point to known pages ---
{
  const gaps = buildContentGapMap({
    tenantId: "tenant-sw",
    services: ["implants", "whitening"],
    locations: ["Mumbai"],
    existingPages: [{ url: "https://acme.example/implants", title: "Implants Mumbai", topics: ["implants", "mumbai"] }],
  });
  assert.ok(gaps.gaps.some((g) => g.serviceOrTopic === "whitening" && g.gap === "missing_page"));
  assert.ok(gaps.gaps.some((g) => g.serviceOrTopic === "implants" && g.gap === "covered"));
}

// --- existing strong site not unnecessarily rebuilt ---
{
  assert.throws(
    () =>
      generateWebsiteChange({
        trustedTenantId: "tenant-sw",
        siteTenantId: "tenant-sw",
        changeKind: "full_site_draft",
        businessName: "Acme Dental",
        hasStrongExistingSite: true,
      }),
    (err: unknown) => err instanceof FullSiteRebuildRejectedError,
  );

  const targeted = generateWebsiteChange({
    trustedTenantId: "tenant-sw",
    siteTenantId: "tenant-sw",
    changeKind: "targeted_change",
    businessName: "Acme Dental",
    hasStrongExistingSite: true,
    pages: [{ slug: "contact", title: "Contact" }],
  });
  assert.equal(targeted.productionDeployAuthorized, false);
  assert.equal(targeted.changeKind, "targeted_change");
}

// --- targeted conversion landing page possible ---
{
  const landing = buildLandingPageDraft({
    tenantId: "tenant-sw",
    trafficSource: "google_ads",
    promise: "Same-week dental implant consult",
    evidence: ["ev-case-1"],
    offer: "Free consult + treatment plan",
    cta: "Book consult",
    leadCapture: "Name + phone form",
  });
  assert.equal(landing.trafficSource, "google_ads");
  assert.equal(landing.promise.length > 0, true);
  assert.equal(landing.offer.length > 0, true);
  assert.equal(landing.cta.length > 0, true);
  assert.equal(landing.leadCapture.length > 0, true);
  assert.equal(landing.productionDeployAuthorized, false);
}

// --- preview binds exact deploy candidate ---
{
  const revisionId = "rev_abc123";
  const preview = createWebsitePreview({ tenantId: "tenant-sw", revisionId });
  assert.equal(preview.boundDeployCandidateId, `deploy_candidate_${revisionId}`);
  const deployReq = createDeploymentRequest({
    tenantId: "tenant-sw",
    revisionId,
    preview,
  });
  assert.equal(deployReq.boundDeployCandidateId, preview.boundDeployCandidateId);
  assert.equal(deployReq.productionDeployAuthorized, false);
}

// --- no deploy from model text ---
{
  assert.throws(
    () => assertNoDeployFromModelText("Please deploy to production now"),
    (err: unknown) => err instanceof DeployFromModelTextError,
  );
  assert.doesNotThrow(() => assertNoDeployFromModelText("Create a preview for review"));
  assert.throws(
    () => rejectProductionDeployFromPlanAlone(),
    (err: unknown) => err instanceof SecurityValidationError && err.code === "external_mutation_not_authorized",
  );
}

// --- no SEO publish from generation alone ---
{
  const brief = buildSeoArticleBrief({
    tenantId: "tenant-sw",
    primaryQuery: "invisalign mumbai",
    intent: "commercial",
    outline: ["Intro"],
    evidenceIds: ["ev-2"],
    businessObjective: "Book aligner consults",
  });
  const draft = buildSeoArticleDraft({
    tenantId: "tenant-sw",
    brief,
    title: "Invisalign in Mumbai",
    body: "A practical guide for local patients seeking clear aligners.",
    factualClaims: [],
  });
  const pub = createSeoPublishRequest({ tenantId: "tenant-sw", articleDraft: draft });
  assert.equal(pub.productionPublishAuthorized, false);
  assert.throws(
    () => rejectSeoPublishFromGenerationAlone(),
    (err: unknown) => err instanceof SecurityValidationError && err.code === "external_mutation_not_authorized",
  );
}

// --- cross-tenant site rejected ---
{
  assert.throws(
    () => assertTenantScope("tenant-a", "tenant-b"),
    (err: unknown) => err instanceof CrossTenantSiteError && err.code === "cross_tenant_site_rejected",
  );
  assert.throws(
    () =>
      buildSeoAuditReport({
        trustedTenantId: "tenant-a",
        siteTenantId: "tenant-b",
        propertyUrl: "https://other.example",
        pages: [{ url: "https://other.example/", title: "Home", h1Count: 1 }],
        site: { https: true, robotsPresent: true, sitemapPresent: true },
      }),
    (err: unknown) => err instanceof CrossTenantSiteError,
  );
}

// --- unavailable search capability blocks safely ---
{
  const stages = buildSeoDepartmentStages();
  const serpStage = stages.find((s) => s.stageId === "seo_serp");
  assert.ok(serpStage);
  assert.ok(serpStage!.allowedCapabilityClasses.includes("research.serp"));
  assert.equal(serpStage!.state, "WAITING_CAPABILITY");
  assert.equal(serpStage!.blockedCapability, "research.serp");
  assert.ok(!stages.some((s) => s.allowedCapabilityClasses.includes("seo.publish")));

  const webStages = buildWebsiteDepartmentStages();
  assert.ok(webStages.every((s) => !s.allowedCapabilityClasses.includes("website.deploy")));
  assert.ok(webStages.some((s) => s.allowedCapabilityClasses.includes("website.generate")));
  assert.ok(!webStages.some((s) => s.allowedCapabilityClasses.includes("conversion.audit")));
}

// --- local SEO gbpConnected only when true ---
{
  const local = buildLocalSeoRecommendation({
    tenantId: "tenant-sw",
    services: ["implants"],
    cities: ["Mumbai"],
    gbpConnected: false,
  });
  assert.equal(local.gbpConnected, false);
  assert.ok(local.serviceCityPages[0]?.suggestedPath.includes("implants"));
  assert.ok(local.gbpRecommendation);
}

// --- SEO audit classifications from real technical engine ---
{
  const report = buildSeoAuditReport({
    trustedTenantId: "tenant-sw",
    siteTenantId: "tenant-sw",
    propertyUrl: "https://acme.example",
    pages: [
      {
        url: "https://acme.example/services",
        title: "",
        h1Count: 0,
        indexable: false,
        robots: "noindex",
      },
    ],
    site: { https: false, robotsPresent: false, sitemapPresent: false },
  });
  assert.ok(report.findings.length > 0);
  assert.ok(report.findings.some((f) => f.classification === "technical" || f.classification === "trust"));
  assert.ok(report.findings.some((f) => f.classification === "indexation"));
  assert.ok(report.findings.some((f) => f.classification === "on_page"));
}

// --- orchestrators + handoff API ---
{
  const seoRun = runSeoDepartment({
    tenantId: "tenant-sw",
    missionId: "mission-sw",
    planId: "plan-sw",
    businessObjective: "Grow implant consults from organic search",
    targetTopics: ["dental implants"],
    queryEvidence: [
      {
        evidenceId: "ev-q1",
        query: "dental implants mumbai",
        intent: "commercial",
        topic: "implants",
      },
    ],
    evidenceIds: ["ev-q1"],
    propertyUrl: "https://acme.example",
    pages: [{ url: "https://acme.example/", title: "Home", h1Count: 1 }],
    site: { https: true, robotsPresent: true, sitemapPresent: true },
    services: ["implants"],
    existingPages: [{ url: "https://acme.example/", title: "Home" }],
    knownPages: [
      { url: "https://acme.example/" },
      { url: "https://acme.example/services" },
    ],
    linkSuggestions: [
      {
        sourceUrl: "https://acme.example/",
        targetUrl: "https://acme.example/services",
        anchorHint: "our services",
        rationale: "home to services",
      },
    ],
    articleOutline: ["Intro", "Benefits", "CTA"],
    articleTitle: "Dental Implants in Mumbai",
    articleBody: "A practical overview of implant consults for local patients.",
    factualClaims: [{ claim: "local consult pathway", evidenceId: "ev-q1" }],
    local: { services: ["implants"], cities: ["Mumbai"], gbpConnected: false },
  });
  assert.equal(seoRun.articleDraft.publishAuthorized, false);
  assert.equal(seoRun.publishRequest.productionPublishAuthorized, false);
  assert.equal(seoRun.serpAnalysis.fabricatedRankings, false);
  assert.ok(seoRun.handoffs[0]?.fromStage);
  assert.ok(seoRun.handoffs[0]?.toStage);
  assert.ok(Array.isArray(seoRun.handoffs[0]?.artifactIds));
  assert.ok(Array.isArray(seoRun.handoffs[0]?.evidenceIds));

  const webRun = runWebsiteDepartment({
    tenantId: "tenant-sw",
    missionId: "mission-sw",
    planId: "plan-sw",
    propertyUrl: "https://acme.example",
    pages: [
      { url: "https://acme.example/", strength: "strong" },
      { url: "https://acme.example/contact", strength: "weak" },
    ],
    conversionFindings: [{ code: "WEAK_FORM", summary: "Form has too many fields" }],
    pageObjective: "Improve contact conversion",
    targetAudience: "Local dental patients",
    primaryCta: "Book consult",
    sections: ["Hero", "Proof", "Form"],
    businessName: "Acme Dental",
    hasStrongExistingSite: true,
    changeKind: "targeted_change",
    landing: {
      trafficSource: "seo",
      promise: "Faster booking",
      evidence: ["ev-form"],
      offer: "Same-day callback",
      cta: "Request callback",
      leadCapture: "Phone form",
    },
    createDeployRequest: true,
  });
  assert.equal(webRun.audit.redesignEntireSite, false);
  assert.equal(webRun.preview.boundDeployCandidateId, `deploy_candidate_${webRun.change.revisionId}`);
  assert.equal(webRun.deploymentRequest?.productionDeployAuthorized, false);
}

// --- registry artifact classes + brand slices ---
{
  const seoDept = getDepartment("seo");
  assert.ok(seoDept?.outputArtifactClasses.includes("seo_research_brief"));
  assert.ok(seoDept?.outputArtifactClasses.includes("serp_analysis"));
  assert.ok(seoDept?.outputArtifactClasses.includes("seo_publish_request"));
  const webDept = getDepartment("website");
  assert.ok(webDept?.outputArtifactClasses.includes("website_audit"));
  assert.ok(webDept?.outputArtifactClasses.includes("website_preview"));
  assert.ok(webDept?.outputArtifactClasses.includes("deployment_request"));

  const slice = compileBrandContextSlice({
    department: "seo",
    role: "seo_writer",
    brandBrain: {
      business_name: "Acme",
      tone_of_voice: "calm",
      products: [{ name: "implants", description: "Dental implants" }],
    },
    campaignObjective: "organic leads",
    approvedClaims: ["Licensed clinic"],
  });
  assert.ok(slice.keys.includes("voice"));
  assert.ok(slice.keys.includes("approved_claims"));
}

console.log("search-web-department.test.ts: all assertions passed");

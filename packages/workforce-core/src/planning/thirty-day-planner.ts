import { randomUUID } from "node:crypto";
import { enforceSocialAllocation } from "./allocation.ts";
import { assertValidWorkforcePlan } from "./validator.ts";
import { diagnoseBusinessGrowth, deriveBottlenecks, resolveEntryMode } from "./diagnosis.ts";
import { buildGrowthRecommendations, buildPlanRecommendations } from "./recommendations.ts";
import { buildWeeklyStrategy, buildWorkflowStages, resolveWorkflowFocus } from "./workflows.ts";
import type {
  BusinessGrowthPlan,
  BusinessGrowthPlannerInput,
  FunnelPurpose,
  PlannedDeliverable,
  PlannedWorkItem,
  SocialSubPlan,
  ThirtyDayPlan,
  ThirtyDayPlanRevisionInput,
  ThirtyDayPlannerInput,
  WorkforcePlan,
} from "./types.ts";
import { AllocationPolicyError } from "./types.ts";

const FUNNEL_ROTATION: FunnelPurpose[] = [
  "awareness",
  "authority",
  "education",
  "proof",
  "offer",
  "conversion",
];

function needsSocialSubplan(input: BusinessGrowthPlannerInput): boolean {
  const focus = input.workflowFocus;
  if (focus && focus !== "auto" && focus !== "social_package" && focus !== "mixed_package") {
    return false;
  }
  const composition = input.entitlementSnapshot.packageComposition;
  const socialPosts = input.entitlementSnapshot.relevantEntitlements.social_posts ?? 0;
  const flexible = input.entitlementSnapshot.relevantEntitlements.social_content_units ?? 0;
  return composition.length > 0 || socialPosts > 0 || flexible > 0;
}

function buildSocialWorkItems(
  input: BusinessGrowthPlannerInput,
  allocation: { images: number; reels: number; carousels: number; stories: number },
): { workItems: PlannedWorkItem[]; deliverables: PlannedDeliverable[]; socialPlan: SocialSubPlan } {
  const channelStatus =
    input.connectedChannels.length === 0 ? ("NO_CONNECTED_CHANNEL" as const) : ("CONNECTED" as const);
  // Never fabricate Instagram — channel may be null / SETUP_REQUIRED
  const channels = input.connectedChannels;
  const themes = [
    input.positioning || "Brand clarity",
    `${input.brandBrain.industry ?? "services"} expertise`,
    "Local trust and proof",
    "Educational value",
    "Offer clarity",
    "Clear next step",
  ];

  const workItems: PlannedWorkItem[] = [];
  const deliverables: PlannedDeliverable[] = [];
  let id = 0;

  const add = (mediaType: "image" | "reel", count: number) => {
    for (let i = 0; i < count; i++) {
      const week = Math.min(Math.floor(i / 3) + 1, 4);
      const day = (i % 7) + 1;
      const purpose = FUNNEL_ROTATION[i % FUNNEL_ROTATION.length]!;
      const channel = channels.length > 0 ? channels[i % channels.length]! : null;
      const itemId = `work-${++id}`;
      const status =
        channelStatus === "NO_CONNECTED_CHANNEL"
          ? ("NO_CONNECTED_CHANNEL" as const)
          : mediaType === "reel"
            ? ("BLOCKED_CAPABILITY" as const)
            : ("PLANNED" as const);
      workItems.push({
        id: itemId,
        serviceDomain: "social",
        department: mediaType === "reel" ? "media" : "content",
        capability: mediaType === "reel" ? "media.video_generation" : "media.image_generation",
        deliverableKind: mediaType === "reel" ? "reel_candidate" : "image_final",
        objective: `${purpose}: ${themes[i % themes.length]}`,
        funnelPurpose: purpose,
        week,
        day,
        channel,
        quantity: 1,
        entitlementClass: "social_posts",
        status,
        blockedReason:
          status === "NO_CONNECTED_CHANNEL"
            ? "NO_CONNECTED_CHANNEL"
            : mediaType === "reel"
              ? "media.video_generation:UNAVAILABLE"
              : undefined,
        social: {
          mediaType,
          platform: channel ?? undefined,
          contentObjective: purpose,
        },
      });
      deliverables.push({
        id: `del-${id}`,
        week,
        day,
        mediaType,
        funnelPurpose: purpose,
        channel: channel ?? "SETUP_REQUIRED",
        theme: themes[i % themes.length]!,
        objective: input.businessGoals[0] ?? "Allocate purchased units to priority growth work",
        workItemId: itemId,
      });
    }
  };

  add("image", allocation.images);
  add("reel", allocation.reels);

  return {
    workItems,
    deliverables,
    socialPlan: {
      allocation: {
        images: allocation.images,
        reels: allocation.reels,
        carousels: allocation.carousels,
        stories: allocation.stories,
        totalUnits: allocation.images + allocation.reels + allocation.carousels + allocation.stories,
      },
      connectedChannels: channels,
      channelStatus,
      plannedUnits: workItems,
    },
  };
}

function buildNonSocialWorkItems(
  focus: ReturnType<typeof resolveWorkflowFocus>,
  input: BusinessGrowthPlannerInput,
): PlannedWorkItem[] {
  switch (focus) {
    case "audit_diagnosis":
      return [
        {
          id: "work-audit-1",
          serviceDomain: "audit",
          department: "reporting",
          capability: "report.generate",
          deliverableKind: "audit_report",
          objective: "Evidence-backed business growth audit report",
          week: 4,
          status: "PLANNED",
        },
      ];
    case "crm_whatsapp_conversion":
      return [
        {
          id: "work-crm-1",
          serviceDomain: "crm",
          department: "crm",
          capability: "crm.followup_plan",
          deliverableKind: "crm_followup_plan",
          objective: "CRM follow-up workflow addressing response delay",
          week: 2,
          crm: { workflowKind: "follow_up" },
          status: "PLANNED",
          entitlementClass: "whatsapp_contacts",
        },
        {
          id: "work-wa-1",
          serviceDomain: "whatsapp",
          department: "whatsapp",
          capability: "whatsapp.followup_plan",
          deliverableKind: "whatsapp_followup_plan",
          objective: "WhatsApp follow-up plan (planning only — no autonomous send)",
          week: 2,
          status: "PLANNED",
          entitlementClass: "whatsapp_contacts",
        },
      ];
    case "website_conversion":
      return [
        {
          id: "work-web-1",
          serviceDomain: "website",
          department: "website",
          capability: "website.generate",
          deliverableKind: "website_draft",
          objective: "Conversion/lead-capture website improvements (preview)",
          week: 3,
          website: { pageType: "landing", changeKind: "conversion_fix" },
          entitlementClass: "website_maintenance",
          status: "PLANNED",
        },
      ];
    case "seo_content":
      return [
        {
          id: "work-seo-1",
          serviceDomain: "seo",
          department: "seo",
          capability: "seo.article",
          deliverableKind: "seo_article_draft",
          objective: "SEO article draft grounded in SERP evidence",
          week: 3,
          seoArticle: { topic: input.businessGoals[0] ?? "Category education" },
          status: "PLANNED",
        },
      ];
    case "foundation_new_business":
      return [
        {
          id: "work-found-1",
          serviceDomain: "website",
          department: "website",
          capability: "website.generate",
          deliverableKind: "website_draft",
          objective: "Digital foundation plan",
          week: 2,
          funnelPurpose: "foundation",
          status: input.entitlementSnapshot.relevantEntitlements.website_maintenance ? "PLANNED" : "SETUP_REQUIRED",
          entitlementClass: "website_maintenance",
        },
      ];
    default:
      return [];
  }
}

function buildWorkforcePlan(
  input: BusinessGrowthPlannerInput,
  stages: ReturnType<typeof buildWorkflowStages>,
  meta: {
    version: number;
    previousPlanId?: string;
    businessObjective: string;
    businessOutcomeTarget: string;
    positioningContext: string;
    revisionReason?: string;
    revisionEvidenceIds?: readonly string[];
  },
): WorkforcePlan {
  const dependencies: Record<string, string[]> = {};
  for (const s of stages) dependencies[s.stageId] = [...s.dependencies];

  const plan: WorkforcePlan = {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    version: meta.version,
    previousPlanId: meta.previousPlanId,
    objective: meta.businessObjective,
    businessOutcome: meta.businessOutcomeTarget,
    businessObjective: meta.businessObjective,
    businessOutcomeTarget: meta.businessOutcomeTarget,
    positioningContext: meta.positioningContext,
    planningHorizon: "business_growth",
    entitlementSnapshot: input.entitlementSnapshot,
    capabilitySnapshot: [...input.availableCapabilities],
    departmentStages: stages,
    dependencies,
    expectedDeliverables: stages.map((s) => s.outputKind),
    qualityPolicyId: "default",
    revisionPolicyId: "default",
    budgetEnvelope: input.budgetEnvelope,
    approvalPolicyId: "default",
    createdAtIso: input.currentDateIso,
    status: "DRAFT",
    revisionReason: meta.revisionReason ?? null,
    revisionEvidenceIds: meta.revisionEvidenceIds,
  };

  return assertValidWorkforcePlan(plan);
}

/** Canonical entry: Business Growth Plan with 30-day execution horizon. */
export function planBusinessGrowth(input: BusinessGrowthPlannerInput): BusinessGrowthPlan {
  const entryMode = resolveEntryMode(input);
  const diagnosis = diagnoseBusinessGrowth(input);
  const bottlenecks = deriveBottlenecks(diagnosis);
  const recommendations = buildGrowthRecommendations({
    bottlenecks,
    entitlementSnapshot: input.entitlementSnapshot,
  });
  const planRecommendations = buildPlanRecommendations({
    recommendations,
    bottlenecks,
    entitlementSnapshot: input.entitlementSnapshot,
    entryMode,
  });

  const focus = resolveWorkflowFocus(input, bottlenecks);

  let socialPlan: SocialSubPlan | undefined;
  let socialAllocation: BusinessGrowthPlan["socialAllocation"];
  let plannedDeliverables: PlannedDeliverable[] = [];
  let plannedWorkItems: PlannedWorkItem[] = buildNonSocialWorkItems(focus, input);

  if (needsSocialSubplan(input) || focus === "social_package" || focus === "mixed_package") {
    try {
      const allocation = enforceSocialAllocation(input.entitlementSnapshot, {});
      const built = buildSocialWorkItems(input, allocation);
      socialPlan = built.socialPlan;
      socialAllocation = built.socialPlan.allocation;
      plannedDeliverables = built.deliverables;
      plannedWorkItems = [...plannedWorkItems, ...built.workItems];
    } catch (err) {
      if (err instanceof AllocationPolicyError && focus !== "social_package" && focus !== "mixed_package") {
        // Non-social plans may omit social allocation even if policy is UNKNOWN
      } else {
        throw err;
      }
    }
  }

  // Social-package focus with UNKNOWN and no composition still fails closed via enforce above.
  if ((focus === "social_package" || focus === "mixed_package") && !socialAllocation) {
    socialAllocation = enforceSocialAllocation(input.entitlementSnapshot, {});
  }

  const stages = buildWorkflowStages({
    focus,
    allocation: socialAllocation ?? null,
    availableCapabilities: input.availableCapabilities,
    proposedStages: input.proposedStages,
  });

  const businessName = input.brandBrain.business_name ?? "the business";
  const businessObjective = input.businessGoals[0] ?? "Improve priority growth systems within purchased entitlements";
  const businessOutcomeTarget =
    bottlenecks[0]?.code === "SLOW_LEAD_RESPONSE" || bottlenecks[0]?.code === "WEAK_FOLLOW_UP"
      ? "reduce lead-response delay and strengthen follow-up"
      : bottlenecks[0]?.code === "WEAK_WEBSITE_CONVERSION" || bottlenecks[0]?.code === "POOR_LEAD_CAPTURE"
        ? "improve inquiry capture"
        : bottlenecks[0]?.code === "WEAK_SEARCH_VISIBILITY" || bottlenecks[0]?.code === "LOW_DISCOVERY"
          ? "improve qualified discovery"
          : entryMode === "NEW_BUSINESS"
            ? "establish digital foundation"
            : "improve priority growth outcomes supported by evidence";

  const weeklyStrategy = buildWeeklyStrategy({
    focus,
    proposed: input.proposedWeeklyStrategy,
    businessName,
  });

  const workforcePlan = buildWorkforcePlan(input, stages, {
    version: 1,
    businessObjective,
    businessOutcomeTarget,
    positioningContext: input.positioning,
  });

  const knowledgeClaims = [
    ...diagnosis.findings
      .filter((f) => f.status === "RESEARCH_REQUIRED" || f.status === "KNOWN")
      .map((f) => ({
        claim: f.finding,
        status: f.status,
        evidenceIds: f.evidenceIds,
      })),
    {
      claim: `Local demand patterns in ${input.geography}`,
      status: input.existingResearchEvidence.length > 0 ? ("KNOWN" as const) : ("RESEARCH_REQUIRED" as const),
      evidenceIds: input.existingResearchEvidence,
    },
  ];

  // Unpurchased execution must not be implied for audit-only
  if (entryMode === "AUDIT_ONLY") {
    plannedWorkItems = plannedWorkItems.map((w) =>
      w.serviceDomain === "audit" || w.deliverableKind.includes("audit") || w.deliverableKind.includes("report")
        ? w
        : { ...w, status: "SETUP_REQUIRED" as const, blockedReason: "unpurchased_execution_blocked" },
    );
  }

  const topOpportunity = bottlenecks[0]?.description ?? "Continue evidence-based optimization";

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    version: 1,
    entryMode,
    strategicThesis: `${businessName}: ${diagnosis.executiveSummary}`,
    businessObjective,
    businessOutcomeTarget,
    positioningContext: input.positioning,
    primaryObjective: businessObjective,
    secondaryObjectives: input.businessGoals.slice(1),
    targetSegments: [input.targetAudience],
    messagingThemes: [input.positioning, `${input.brandBrain.industry ?? "services"} expertise`].filter(Boolean),
    funnelMap: weeklyStrategy.map((w) => w.focus),
    channelRoles: Object.fromEntries(input.connectedChannels.map((c) => [c, "connected_execution_channel"])),
    weeklyStrategy,
    plannedWorkItems,
    plannedDeliverables,
    researchTasks: diagnosis.researchGaps,
    knowledgeClaims,
    diagnosis,
    bottlenecks,
    recommendations,
    planRecommendations,
    socialPlan,
    socialAllocation,
    strategicHorizon: {
      nowDiagnosis: diagnosis.executiveSummary,
      first30Days: weeklyStrategy.map((w) => `W${w.week}: ${w.focus}`).join(" · "),
      days31to60Direction:
        planRecommendations[0] && entryMode === "AUDIT_ONLY"
          ? `Recommended direction only (not purchased): ${planRecommendations[0].recommendedOption}`
          : "Replan from measured signals — do not fabricate unpurchased work",
      days61to90Direction: "Optimization roadmap pending measurement evidence",
    },
    customerFacing: {
      yourBusiness: businessName,
      yourCurrentPosition: diagnosis.executiveSummary,
      whatsWorking: diagnosis.strongestAssets,
      biggestGrowthOpportunities: bottlenecks.slice(0, 3).map((b) => b.description),
      thirtyDayPlanSummary: businessOutcomeTarget,
      thisWeekFocus: weeklyStrategy[0]?.focus ?? "Diagnosis",
      workInProgress: stages.filter((s) => s.state === "READY" || s.state === "RUNNING").map((s) => s.objective),
      whatNeedsYou: [
        ...(input.connectedChannels.length === 0 && needsSocialSubplan(input) ? ["Connect social channels"] : []),
        ...stages.filter((s) => s.state === "WAITING_APPROVAL").map((s) => s.objective),
      ],
      results: [],
      nextRecommendation: planRecommendations[0]?.recommendedOption ?? topOpportunity,
    },
    planningContext: {
      brandBrain: input.brandBrain,
      brandBrainVersion: input.brandBrainVersion ?? null,
      productsServices: [...input.productsServices],
      targetAudience: input.targetAudience,
      geography: input.geography,
      positioning: input.positioning,
      timezone: input.timezone,
      connectedChannels: [...input.connectedChannels],
      businessGoals: [...input.businessGoals],
    },
    workforcePlan,
    createdAtIso: input.currentDateIso,
  };
}

/** Backward-compatible alias. */
export function planThirtyDayGrowth(input: ThirtyDayPlannerInput): ThirtyDayPlan {
  return planBusinessGrowth(input);
}

export function reviseThirtyDayPlan(
  current: ThirtyDayPlan,
  revision: ThirtyDayPlanRevisionInput,
): ThirtyDayPlan {
  if (revision.evidenceIds.length === 0) {
    throw new Error("revision_requires_evidence");
  }

  // Preserve original planning snapshot — never replace with empty Brand Brain / UTC defaults
  const ctx = current.planningContext;
  const nextInput: BusinessGrowthPlannerInput = {
    tenantId: current.tenantId,
    missionId: current.missionId,
    timezone: ctx.timezone,
    currentDateIso: current.createdAtIso,
    brandBrain: ctx.brandBrain,
    brandBrainVersion: ctx.brandBrainVersion,
    productsServices: ctx.productsServices,
    targetAudience: ctx.targetAudience,
    geography: ctx.geography,
    positioning: ctx.positioning,
    connectedChannels: ctx.connectedChannels,
    businessGoals: [revision.patch.primaryObjective ?? current.primaryObjective, ...(revision.patch.secondaryObjectives ?? current.secondaryObjectives)],
    previousPerformance: [],
    existingResearchEvidence: [...revision.evidenceIds],
    activeCampaigns: [],
    availableCapabilities: current.workforcePlan.capabilitySnapshot,
    entitlementSnapshot: current.workforcePlan.entitlementSnapshot,
    budgetEnvelope: current.workforcePlan.budgetEnvelope,
    entryMode: current.entryMode,
    businessSignals: undefined,
    proposedWeeklyStrategy: revision.patch.weeklyStrategy ?? current.weeklyStrategy,
  };

  const rebuilt = planBusinessGrowth(nextInput);
  const nextVersion = current.version + 1;

  return {
    ...rebuilt,
    id: current.id,
    version: nextVersion,
    messagingThemes: revision.patch.messagingThemes ?? current.messagingThemes,
    primaryObjective: revision.patch.primaryObjective ?? current.primaryObjective,
    secondaryObjectives: revision.patch.secondaryObjectives ?? current.secondaryObjectives,
    businessOutcomeTarget: revision.patch.businessOutcomeTarget ?? current.businessOutcomeTarget,
    diagnosis: current.diagnosis,
    bottlenecks: current.bottlenecks,
    planningContext: current.planningContext,
    workforcePlan: {
      ...rebuilt.workforcePlan,
      version: nextVersion,
      previousPlanId: current.workforcePlan.id,
      revisionReason: revision.revisionReason,
      revisionEvidenceIds: revision.evidenceIds,
    },
    createdAtIso: new Date().toISOString(),
  };
}

export { resolveEntryMode, resolveWorkflowFocus };

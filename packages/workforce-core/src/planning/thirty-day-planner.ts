import { randomUUID } from "node:crypto";
import { enforceSocialAllocation } from "./allocation.ts";
import { assertValidWorkforcePlan } from "./validator.ts";
import type {
  FunnelPurpose,
  PlannedDeliverable,
  ThirtyDayPlan,
  ThirtyDayPlannerInput,
  ThirtyDayPlanRevisionInput,
  WorkforcePlan,
  WorkforceStage,
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

function buildStages(allocation: { images: number; reels: number }): WorkforceStage[] {
  const stages: WorkforceStage[] = [
    {
      stageId: "s_research_audience",
      department: "research",
      specialistRole: "audience_researcher",
      objective: "Profile target audience needs and language",
      dependencies: [],
      inputs: ["research_brief"],
      requiredEvidence: [],
      outputKind: "research_summary",
      allowedCapabilityClasses: ["research.web"],
      budgetCents: 500,
      qualityGate: ["evidence_sufficiency"],
      maxAttempts: 2,
      state: "PENDING",
    },
    {
      stageId: "s_research_competitor",
      department: "research",
      specialistRole: "competitor_researcher",
      objective: "Analyze competitor positioning",
      dependencies: [],
      inputs: ["competitor_list"],
      requiredEvidence: [],
      outputKind: "research_summary",
      allowedCapabilityClasses: ["research.web"],
      budgetCents: 500,
      qualityGate: ["evidence_sufficiency"],
      maxAttempts: 2,
      state: "PENDING",
    },
    {
      stageId: "s_research",
      department: "research",
      specialistRole: "market_researcher",
      objective: "Synthesize market context",
      dependencies: ["s_research_audience", "s_research_competitor"],
      inputs: ["research_brief"],
      requiredEvidence: [],
      outputKind: "research_summary",
      allowedCapabilityClasses: ["research.web"],
      budgetCents: 500,
      qualityGate: ["evidence_sufficiency"],
      maxAttempts: 2,
      state: "PENDING",
    },
    {
      stageId: "s_strategy",
      department: "strategy",
      specialistRole: "growth_strategist",
      objective: "Define 30-day growth strategy",
      dependencies: ["s_research"],
      inputs: ["research_summary"],
      requiredEvidence: [],
      outputKind: "strategy_memo",
      allowedCapabilityClasses: ["analytics.read"],
      budgetCents: 800,
      qualityGate: ["strategic_alignment"],
      maxAttempts: 3,
      state: "PENDING",
    },
    {
      stageId: "s_content",
      department: "content",
      specialistRole: "copywriter",
      objective: "Draft social copy aligned to strategy",
      dependencies: ["s_strategy"],
      inputs: ["content_brief"],
      requiredEvidence: [],
      outputKind: "caption_set",
      allowedCapabilityClasses: ["content.shortform"],
      budgetCents: 1200,
      qualityGate: ["brand_fit"],
      maxAttempts: 4,
      state: "PENDING",
    },
    {
      stageId: "s_media",
      department: "media",
      specialistRole: "image_producer",
      objective: `Produce ${allocation.images} images and ${allocation.reels} reels`,
      dependencies: ["s_content"],
      inputs: ["art_direction"],
      requiredEvidence: [],
      outputKind: "image_final",
      allowedCapabilityClasses: ["media.image_generation"],
      budgetCents: 2000,
      qualityGate: ["visual_quality"],
      maxAttempts: 4,
      state: "PENDING",
    },
    {
      stageId: "s_quality",
      department: "quality",
      specialistRole: "creative_critic",
      objective: "Review deliverables before release",
      dependencies: ["s_media"],
      inputs: ["caption_set"],
      requiredEvidence: [],
      outputKind: "qa_report",
      allowedCapabilityClasses: [],
      budgetCents: 300,
      qualityGate: ["brand_fit"],
      maxAttempts: 2,
      state: "PENDING",
    },
  ];

  const dependencies: Record<string, string[]> = {};
  for (const stage of stages) {
    dependencies[stage.stageId] = [...stage.dependencies];
  }

  return stages;
}

function buildDeliverables(
  input: ThirtyDayPlannerInput,
  allocation: { images: number; reels: number; carousels: number; stories: number },
): PlannedDeliverable[] {
  const deliverables: PlannedDeliverable[] = [];
  let id = 0;
  const channels = input.connectedChannels.length > 0 ? input.connectedChannels : ["Instagram"];
  const themes = [
    "Local brand awareness",
    "Expert authority",
    "Educational tips",
    "Customer proof",
    "Limited offer",
    "Conversion push",
  ];

  const addItems = (mediaType: "image" | "reel", count: number) => {
    for (let i = 0; i < count; i++) {
      const week = Math.floor(i / 3) + 1;
      const day = (i % 7) + 1;
      deliverables.push({
        id: `del-${++id}`,
        week: Math.min(week, 4),
        day,
        mediaType,
        funnelPurpose: FUNNEL_ROTATION[i % FUNNEL_ROTATION.length]!,
        channel: channels[i % channels.length]!,
        theme: themes[i % themes.length]!,
        objective: input.businessGoals[0] ?? "Grow qualified leads",
      });
    }
  };

  addItems("image", allocation.images);
  addItems("reel", allocation.reels);
  return deliverables;
}

function buildWorkforcePlan(
  input: ThirtyDayPlannerInput,
  allocation: ReturnType<typeof enforceSocialAllocation>,
  version: number,
  previousPlanId?: string,
): WorkforcePlan {
  const stages = buildStages(allocation);
  const dependencies: Record<string, string[]> = {};
  for (const stage of stages) dependencies[stage.stageId] = [...stage.dependencies];

  const plan: WorkforcePlan = {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    version,
    previousPlanId,
    objective: input.businessGoals[0] ?? "30-day growth",
    businessOutcome: input.positioning,
    planningHorizon: "30_day",
    entitlementSnapshot: input.entitlementSnapshot,
    capabilitySnapshot: [...input.availableCapabilities],
    departmentStages: stages,
    dependencies,
    expectedDeliverables: ["social_plan", "caption_set", "image_final", "reel_candidate"],
    qualityPolicyId: "default",
    revisionPolicyId: "default",
    budgetEnvelope: input.budgetEnvelope,
    approvalPolicyId: "default",
    createdAtIso: input.currentDateIso,
    status: "DRAFT",
  };

  return assertValidWorkforcePlan(plan);
}

export function planThirtyDayGrowth(input: ThirtyDayPlannerInput): ThirtyDayPlan {
  let allocation;
  try {
    allocation = enforceSocialAllocation(input.entitlementSnapshot, {});
  } catch (err) {
    if (err instanceof AllocationPolicyError) {
      throw err;
    }
    throw err;
  }

  const businessName = input.brandBrain.business_name ?? "the business";
  const workforcePlan = buildWorkforcePlan(input, allocation, 1);

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    version: 1,
    strategicThesis: `${businessName} will grow in ${input.geography} through varied funnel content within purchased package limits.`,
    primaryObjective: input.businessGoals[0] ?? "Grow qualified leads",
    secondaryObjectives: input.businessGoals.slice(1),
    targetSegments: [input.targetAudience],
    messagingThemes: [
      input.positioning,
      `${input.brandBrain.industry ?? "services"} expertise`,
      "Local trust and proof",
    ],
    funnelMap: ["awareness", "education", "proof", "conversion"],
    channelRoles: Object.fromEntries(input.connectedChannels.map((c) => [c, "primary reach"])),
    weeklyStrategy: [
      { week: 1, focus: "Research and awareness", objectives: ["Validate audience", "Launch awareness content"] },
      { week: 2, focus: "Education and authority", objectives: ["Teach value", "Build authority"] },
      { week: 3, focus: "Proof and trust", objectives: ["Show results", "Handle objections"] },
      { week: 4, focus: "Offer and conversion", objectives: ["Drive action", "Prepare next cycle"] },
    ],
    plannedDeliverables: buildDeliverables(input, allocation),
    researchTasks: [
      "Validate local competitor positioning",
      "Confirm audience language on connected channels",
    ],
    knowledgeClaims: [
      {
        claim: `Local demand patterns in ${input.geography}`,
        status: input.existingResearchEvidence.length > 0 ? "KNOWN" : "RESEARCH_REQUIRED",
        evidenceIds: input.existingResearchEvidence,
      },
      {
        claim: "Competitor pricing benchmarks",
        status: "RESEARCH_REQUIRED",
      },
      {
        claim: input.positioning,
        status: "KNOWN",
      },
    ],
    socialAllocation: allocation,
    workforcePlan,
    createdAtIso: input.currentDateIso,
  };
}

export function reviseThirtyDayPlan(
  current: ThirtyDayPlan,
  revision: ThirtyDayPlanRevisionInput,
): ThirtyDayPlan {
  if (revision.evidenceIds.length === 0) {
    throw new Error("revision_requires_evidence");
  }

  const nextVersion = current.version + 1;
  const workforcePlan = buildWorkforcePlan(
    {
      tenantId: current.tenantId,
      missionId: current.missionId,
      timezone: "UTC",
      currentDateIso: current.createdAtIso,
      brandBrain: {},
      productsServices: [],
      targetAudience: current.targetSegments[0] ?? "local",
      geography: "local",
      positioning: current.strategicThesis,
      connectedChannels: Object.keys(current.channelRoles),
      businessGoals: [current.primaryObjective, ...current.secondaryObjectives],
      previousPerformance: [],
      existingResearchEvidence: [...revision.evidenceIds],
      activeCampaigns: [],
      availableCapabilities: current.workforcePlan.capabilitySnapshot,
      entitlementSnapshot: current.workforcePlan.entitlementSnapshot,
      budgetEnvelope: current.workforcePlan.budgetEnvelope,
    },
    current.socialAllocation,
    nextVersion,
    current.workforcePlan.id,
  );

  return {
    ...current,
    version: nextVersion,
    messagingThemes: revision.patch.messagingThemes ?? current.messagingThemes,
    primaryObjective: revision.patch.primaryObjective ?? current.primaryObjective,
    secondaryObjectives: revision.patch.secondaryObjectives ?? current.secondaryObjectives,
    workforcePlan,
    createdAtIso: new Date().toISOString(),
  };
}

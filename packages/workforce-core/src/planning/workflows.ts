import type { CapabilityKey } from "../capabilities/types.ts";
import { getCapability } from "../capabilities/registry.ts";
import type {
  BusinessGrowthPlannerInput,
  SocialAllocation,
  WeeklyStrategy,
  WorkforceStage,
  WorkflowFocus,
} from "./types.ts";
import type { GrowthBottleneck } from "./growth-types.ts";
import { resolveEntryMode } from "./diagnosis.ts";

export function resolveWorkflowFocus(
  input: BusinessGrowthPlannerInput,
  bottlenecks: readonly GrowthBottleneck[],
): Exclude<WorkflowFocus, "auto"> {
  if (input.workflowFocus && input.workflowFocus !== "auto") return input.workflowFocus;

  const entry = resolveEntryMode(input);
  if (entry === "AUDIT_ONLY") return "audit_diagnosis";
  if (entry === "NEW_BUSINESS") return "foundation_new_business";

  const top = bottlenecks[0];
  if (top) {
    if (top.code === "SLOW_LEAD_RESPONSE" || top.code === "WEAK_FOLLOW_UP" || top.code === "LOW_QUALIFICATION") {
      return "crm_whatsapp_conversion";
    }
    if (top.code === "WEAK_WEBSITE_CONVERSION" || top.code === "POOR_LEAD_CAPTURE") {
      return "website_conversion";
    }
    if (top.code === "WEAK_SEARCH_VISIBILITY") return "seo_content";
    if (top.code === "MISSING_DIGITAL_FOUNDATION") return "foundation_new_business";
    if (top.code === "LOW_DISCOVERY" && (input.businessSignals?.hasAds || (input.entitlementSnapshot.relevantEntitlements.meta_ad_campaigns ?? 0) > 0)) {
      return "paid_acquisition_readiness";
    }
  }

  const hasSocial =
    input.entitlementSnapshot.packageComposition.length > 0 ||
    (input.entitlementSnapshot.relevantEntitlements.social_posts ?? 0) > 0;
  if (hasSocial) return "social_package";
  return "mixed_package";
}

function stage(
  partial: Omit<WorkforceStage, "state" | "maxAttempts" | "qualityGate" | "budgetCents" | "inputs" | "requiredEvidence" | "allowedCapabilityClasses"> &
    Partial<WorkforceStage>,
): WorkforceStage {
  const caps = partial.allowedCapabilityClasses ?? [];
  const blocked = caps.map((c) => ({ c, status: getCapability(c)?.status })).find((x) => x.status === "UNAVAILABLE" || x.status === "NOT_CONFIGURED");
  return {
    inputs: [],
    requiredEvidence: [],
    budgetCents: 500,
    qualityGate: ["strategic_fit"],
    maxAttempts: 3,
    ...partial,
    allowedCapabilityClasses: caps,
    state: blocked ? "WAITING_CAPABILITY" : (partial.state ?? "PENDING"),
    blockedCapability: blocked?.c ?? partial.blockedCapability ?? null,
  };
}

export function buildWorkflowStages(input: {
  focus: Exclude<WorkflowFocus, "auto">;
  allocation?: SocialAllocation | null;
  availableCapabilities: readonly CapabilityKey[];
  proposedStages?: readonly WorkforceStage[];
}): WorkforceStage[] {
  if (input.proposedStages?.length) {
    return input.proposedStages.map((s) => {
      const blocked = s.allowedCapabilityClasses
        .map((c) => ({ c, status: getCapability(c)?.status }))
        .find((x) => x.status === "UNAVAILABLE" || x.status === "NOT_CONFIGURED");
      return {
        ...s,
        state: blocked ? ("WAITING_CAPABILITY" as const) : s.state,
        blockedCapability: blocked?.c ?? s.blockedCapability ?? null,
      };
    });
  }

  switch (input.focus) {
    case "audit_diagnosis":
      return [
        stage({
          stageId: "s_exec",
          department: "executive",
          specialistRole: "mission_coordinator",
          objective: "Scope audit against customer goals",
          dependencies: [],
          outputKind: "mission_charter",
          allowedCapabilityClasses: ["brand.audit"],
        }),
        stage({
          stageId: "s_research",
          department: "research",
          specialistRole: "evidence_reviewer",
          objective: "Collect and cite diagnostic evidence",
          dependencies: ["s_exec"],
          outputKind: "research_summary",
          allowedCapabilityClasses: ["research.web"],
          requiredEvidence: ["audit_evidence"],
        }),
        stage({
          stageId: "s_strategy",
          department: "strategy",
          specialistRole: "growth_strategist",
          objective: "Prioritize bottlenecks and recommendations",
          dependencies: ["s_research"],
          outputKind: "strategy_memo",
        }),
        stage({
          stageId: "s_report",
          department: "reporting",
          specialistRole: "executive_summarizer",
          objective: "Produce evidence-backed audit report",
          dependencies: ["s_strategy"],
          outputKind: "audit_report",
          allowedCapabilityClasses: ["report.generate"],
        }),
        stage({
          stageId: "s_quality",
          department: "quality",
          specialistRole: "final_reviewer",
          objective: "QA audit claims against evidence",
          dependencies: ["s_report"],
          outputKind: "qa_report",
        }),
      ];

    case "crm_whatsapp_conversion":
      return [
        stage({
          stageId: "s_research",
          department: "research",
          specialistRole: "audience_researcher",
          objective: "Confirm inquiry and response evidence",
          dependencies: [],
          outputKind: "research_summary",
          allowedCapabilityClasses: ["analytics.read"],
          requiredEvidence: ["response_evidence"],
        }),
        stage({
          stageId: "s_crm",
          department: "crm",
          specialistRole: "lead_lifecycle_specialist",
          objective: "Design CRM follow-up and qualification workflows",
          dependencies: ["s_research"],
          outputKind: "crm_followup_plan",
          allowedCapabilityClasses: ["crm.followup_plan", "crm.read"],
        }),
        stage({
          stageId: "s_whatsapp",
          department: "whatsapp",
          specialistRole: "followup_specialist",
          objective: "Design WhatsApp response/follow-up plan (no autonomous send)",
          dependencies: ["s_crm"],
          outputKind: "whatsapp_followup_plan",
          allowedCapabilityClasses: ["whatsapp.followup_plan"],
        }),
        stage({
          stageId: "s_sales",
          department: "sales",
          specialistRole: "sales_strategist",
          objective: "Align sales handoff with faster response",
          dependencies: ["s_whatsapp"],
          outputKind: "sales_analysis",
          allowedCapabilityClasses: ["sales.analyze"],
        }),
        stage({
          stageId: "s_conversion",
          department: "conversion",
          specialistRole: "cro_specialist",
          objective: "Tighten post-contact conversion path",
          dependencies: ["s_sales"],
          outputKind: "conversion_audit_report",
          allowedCapabilityClasses: ["conversion.audit"],
        }),
        stage({
          stageId: "s_analytics",
          department: "analytics",
          specialistRole: "performance_analyst",
          objective: "Define response-time and follow-up measurement checkpoints",
          dependencies: ["s_conversion"],
          outputKind: "metric_snapshot",
          allowedCapabilityClasses: ["analytics.read", "analytics.attribution"],
        }),
        stage({
          stageId: "s_quality",
          department: "quality",
          specialistRole: "final_reviewer",
          objective: "Review conversion workflows before any live mutation",
          dependencies: ["s_analytics"],
          outputKind: "qa_report",
        }),
      ];

    case "website_conversion":
      return [
        stage({
          stageId: "s_research",
          department: "research",
          specialistRole: "audience_researcher",
          objective: "Evidence website conversion friction",
          dependencies: [],
          outputKind: "research_summary",
          allowedCapabilityClasses: ["website.audit"],
        }),
        stage({
          stageId: "s_website",
          department: "website",
          specialistRole: "ux_architect",
          objective: "Propose conversion/lead-capture website changes (preview only)",
          dependencies: ["s_research"],
          outputKind: "website_draft",
          allowedCapabilityClasses: ["website.generate", "conversion.audit"],
        }),
        stage({
          stageId: "s_conversion",
          department: "conversion",
          specialistRole: "cro_specialist",
          objective: "Prioritize conversion fixes",
          dependencies: ["s_website"],
          outputKind: "conversion_audit_report",
          allowedCapabilityClasses: ["conversion.audit"],
        }),
        stage({
          stageId: "s_quality",
          department: "quality",
          specialistRole: "final_reviewer",
          objective: "QA website recommendations",
          dependencies: ["s_conversion"],
          outputKind: "qa_report",
        }),
      ];

    case "seo_content":
      return [
        stage({
          stageId: "s_research",
          department: "seo",
          specialistRole: "serp_researcher",
          objective: "SERP/demand research with citations",
          dependencies: [],
          outputKind: "serp_evidence",
          allowedCapabilityClasses: ["research.serp", "seo.audit"],
          requiredEvidence: ["serp_evidence"],
        }),
        stage({
          stageId: "s_seo",
          department: "seo",
          specialistRole: "seo_writer",
          objective: "Plan SEO article/on-page work within entitlements",
          dependencies: ["s_research"],
          outputKind: "seo_article_draft",
          allowedCapabilityClasses: ["seo.article", "content.longform"],
        }),
        stage({
          stageId: "s_content",
          department: "content",
          specialistRole: "longform_writer",
          objective: "Draft long-form search content",
          dependencies: ["s_seo"],
          outputKind: "longform_draft",
          allowedCapabilityClasses: ["content.longform"],
        }),
        stage({
          stageId: "s_quality",
          department: "quality",
          specialistRole: "final_reviewer",
          objective: "QA SEO content for brand and factuality",
          dependencies: ["s_content"],
          outputKind: "qa_report",
        }),
      ];

    case "foundation_new_business":
      return [
        stage({
          stageId: "s_brand",
          department: "brand",
          specialistRole: "brand_strategist",
          objective: "Confirm positioning and offer clarity",
          dependencies: [],
          outputKind: "brand_audit_report",
          allowedCapabilityClasses: ["brand.audit"],
        }),
        stage({
          stageId: "s_website",
          department: "website",
          specialistRole: "ux_architect",
          objective: "Plan digital foundation / landing presence",
          dependencies: ["s_brand"],
          outputKind: "website_draft",
          allowedCapabilityClasses: ["website.generate"],
        }),
        stage({
          stageId: "s_crm",
          department: "crm",
          specialistRole: "lead_lifecycle_specialist",
          objective: "Design initial lead capture and CRM skeleton",
          dependencies: ["s_website"],
          outputKind: "crm_followup_plan",
          allowedCapabilityClasses: ["crm.followup_plan"],
        }),
        stage({
          stageId: "s_strategy",
          department: "strategy",
          specialistRole: "channel_strategist",
          objective: "Recommend future channels without fabricating connections",
          dependencies: ["s_crm"],
          outputKind: "channel_plan",
        }),
        stage({
          stageId: "s_quality",
          department: "quality",
          specialistRole: "final_reviewer",
          objective: "QA foundation roadmap",
          dependencies: ["s_strategy"],
          outputKind: "qa_report",
        }),
      ];

    case "paid_acquisition_readiness":
      return [
        stage({
          stageId: "s_research",
          department: "research",
          specialistRole: "audience_researcher",
          objective: "Validate acquisition readiness evidence",
          dependencies: [],
          outputKind: "research_summary",
          allowedCapabilityClasses: ["ads.audit"],
        }),
        stage({
          stageId: "s_ads",
          department: "advertising",
          specialistRole: "media_planner",
          objective: "Plan paid acquisition (no spend from planning alone)",
          dependencies: ["s_research"],
          outputKind: "ads_plan",
          allowedCapabilityClasses: ["ads.plan"],
        }),
        stage({
          stageId: "s_quality",
          department: "quality",
          specialistRole: "final_reviewer",
          objective: "QA ads plan before any publish",
          dependencies: ["s_ads"],
          outputKind: "qa_report",
        }),
      ];

    case "social_package":
    case "mixed_package":
    default: {
      const allocation = input.allocation ?? { images: 0, reels: 0, carousels: 0, stories: 0, totalUnits: 0 };
      const stages: WorkforceStage[] = [
        stage({
          stageId: "s_research_audience",
          department: "research",
          specialistRole: "audience_researcher",
          objective: "Profile target audience needs and language",
          dependencies: [],
          outputKind: "research_summary",
          allowedCapabilityClasses: ["research.web"],
        }),
        stage({
          stageId: "s_research_competitor",
          department: "research",
          specialistRole: "competitor_researcher",
          objective: "Analyze competitor positioning with citations",
          dependencies: [],
          outputKind: "research_summary",
          allowedCapabilityClasses: ["research.web"],
        }),
        stage({
          stageId: "s_strategy",
          department: "strategy",
          specialistRole: "growth_strategist",
          objective: "Allocate purchased units to highest-priority growth work",
          dependencies: ["s_research_audience", "s_research_competitor"],
          outputKind: "strategy_memo",
          allowedCapabilityClasses: ["analytics.read"],
        }),
        stage({
          stageId: "s_content",
          department: "content",
          specialistRole: "copywriter",
          objective: "Draft copy for planned social units",
          dependencies: ["s_strategy"],
          outputKind: "caption_set",
          allowedCapabilityClasses: ["content.shortform"],
        }),
      ];

      if (allocation.images > 0) {
        stages.push(
          stage({
            stageId: "s_media_images",
            department: "media",
            specialistRole: "image_producer",
            objective: `Produce ${allocation.images} image creatives`,
            dependencies: ["s_content"],
            outputKind: "image_final",
            allowedCapabilityClasses: ["media.image_generation"],
            budgetCents: 1500,
          }),
        );
      }

      if (allocation.reels > 0) {
        stages.push(
          stage({
            stageId: "s_media_reels",
            department: "media",
            specialistRole: "reel_producer",
            objective: `Produce ${allocation.reels} reel/video creatives`,
            dependencies: ["s_content"],
            outputKind: "reel_candidate",
            allowedCapabilityClasses: ["media.video_generation"],
            budgetCents: 2000,
          }),
        );
      }

      const mediaDeps = [
        ...(allocation.images > 0 ? ["s_media_images"] : []),
        ...(allocation.reels > 0 ? ["s_media_reels"] : []),
        ...(allocation.images === 0 && allocation.reels === 0 ? ["s_content"] : []),
      ];

      stages.push(
        stage({
          stageId: "s_quality",
          department: "quality",
          specialistRole: "creative_critic",
          objective: "Independent critique before any publish path",
          dependencies: mediaDeps,
          outputKind: "qa_report",
        }),
        stage({
          stageId: "s_compliance",
          department: "compliance",
          specialistRole: "policy_checker",
          objective: "Claim and policy compliance before Social execution",
          dependencies: ["s_quality"],
          outputKind: "compliance_report",
          qualityGate: ["claim_accuracy", "policy_compliance"],
        }),
        stage({
          stageId: "s_social_adapt",
          department: "social",
          specialistRole: "social_strategist",
          objective: "Adapt upstream final creative into platform-specific Social release artifacts",
          dependencies: ["s_compliance"],
          outputKind: "social_final",
          qualityGate: ["brand_fit", "platform_compliance"],
        }),
        stage({
          stageId: "s_social_schedule",
          department: "social",
          specialistRole: "scheduling_specialist",
          objective: "Schedule approved Social release artifacts with real timezone timestamps",
          dependencies: ["s_social_adapt"],
          outputKind: "schedule_receipt",
          allowedCapabilityClasses: ["social.schedule"],
          qualityGate: ["timing_fit"],
        }),
        stage({
          stageId: "s_social_publish",
          department: "social",
          specialistRole: "community_manager",
          objective: "Publish via explicit approval or package standing authorization (Shadow-safe)",
          dependencies: ["s_social_schedule"],
          outputKind: "publish_receipt",
          allowedCapabilityClasses: ["social.publish"],
          qualityGate: ["platform_compliance"],
        }),
      );

      return stages;
    }
  }
}

/**
 * Dynamic weekly phases — NOT a universal hardcoded marketing template.
 * CEO/context may override via proposedWeeklyStrategy.
 */
export function buildWeeklyStrategy(input: {
  focus: Exclude<WorkflowFocus, "auto">;
  proposed?: readonly WeeklyStrategy[];
  businessName: string;
}): WeeklyStrategy[] {
  if (input.proposed?.length) return [...input.proposed];

  switch (input.focus) {
    case "audit_diagnosis":
      return [
        { week: 1, focus: "Evidence collection", objectives: ["Gather sources", "Map assets"] },
        { week: 2, focus: "Diagnosis synthesis", objectives: ["Rank bottlenecks", "Draft findings"] },
        { week: 3, focus: "Recommendations", objectives: ["Commercial fit", "Roadmap"] },
        { week: 4, focus: "Delivery & next step", objectives: ["Finalize report", "Customer decision"] },
      ];
    case "crm_whatsapp_conversion":
      return [
        { week: 1, focus: "Response baseline", objectives: ["Measure response delay", "Map CRM gaps"] },
        { week: 2, focus: "Follow-up design", objectives: ["Workflow drafts", "Consent checks"] },
        { week: 3, focus: "Sales alignment", objectives: ["Handoff rules", "Qualification"] },
        { week: 4, focus: "Measurement", objectives: ["Response KPIs", "Iterate"] },
      ];
    case "website_conversion":
      return [
        { week: 1, focus: "Conversion audit", objectives: ["Identify friction"] },
        { week: 2, focus: "Capture fixes", objectives: ["Lead forms / CTAs"] },
        { week: 3, focus: "Preview changes", objectives: ["Draft updates"] },
        { week: 4, focus: "Validation", objectives: ["QA", "Approval path"] },
      ];
    case "seo_content":
      return [
        { week: 1, focus: "Demand research", objectives: ["Evidence keywords/SERP"] },
        { week: 2, focus: "Content architecture", objectives: ["Topics", "Internal links"] },
        { week: 3, focus: "Draft production", objectives: ["Long-form drafts"] },
        { week: 4, focus: "QA", objectives: ["Brand/fact checks"] },
      ];
    case "foundation_new_business":
      return [
        { week: 1, focus: "Positioning & offer", objectives: ["Brand clarity"] },
        { week: 2, focus: "Digital foundation", objectives: ["Website plan", "Lead capture"] },
        { week: 3, focus: "CRM skeleton", objectives: ["Inquiry handling"] },
        { week: 4, focus: "Channel readiness", objectives: ["Setup checklist — no fabricated connections"] },
      ];
    case "social_package":
    case "mixed_package":
    default:
      // Package customers: weekly phase follows diagnosed priority, not a fixed funnel sermon.
      return [
        { week: 1, focus: `Priority work for ${input.businessName}`, objectives: ["Align units to bottleneck"] },
        { week: 2, focus: "Production & critique", objectives: ["Specialist creation", "Independent review"] },
        { week: 3, focus: "Refinement", objectives: ["Revise", "Brand/fact QA"] },
        { week: 4, focus: "Safe execution prep & learning", objectives: ["Approvals", "Measurement"] },
      ];
  }
}

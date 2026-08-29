import type { ServiceClient } from "@stratxcel/whatsapp";

/**
 * HERMES AUTONOMOUS SOCIAL AUTOPILOT mission (Sections 2-5, 44, 77, 79):
 * the canonical specialist-role taxonomy and task/handoff ledger for the
 * Social Autopilot generation pipeline.
 *
 * This module does NOT replace prepareNearTermPackageItems
 * (lib/social/package-autopilot.ts) -- that pipeline is real, extensively
 * tested, and revenue-critical (Mission Section 2: "Do NOT build a second
 * orchestration framework unless the existing architecture genuinely cannot
 * support the required behavior"). What was actually missing was not a new
 * engine -- it was a way to see, per post, which of the pipeline's real
 * stages ran, what each one produced, and whether it passed, instead of
 * only ever observing the pipeline's final side effects (a queue item row,
 * a content_variant row). This module is that instrumentation layer:
 *
 * - HERMES_SOCIAL_SPECIALIST_ROLES names the 14 real stages the pipeline
 *   already performs (research, brand reading, strategy planning, creative
 *   brief, treatment, copy, visual generation, logo compositing, quality
 *   gating, publishing) -- it is the exact CHECK-constrained taxonomy on
 *   the social_autopilot_campaign_tasks table
 *   (supabase/migrations/20260830070000_hermes_social_autopilot_campaign_tasks.sql).
 * - recordCampaignTask() is the one write path onto that ledger --
 *   best-effort, never load-bearing, same discipline as recordAudit().
 * - SocialAutopilotCampaignContext is the canonical, real-data-sourced
 *   per-post context shape (Section 5) -- every field already exists
 *   somewhere inside prepareNearTermPackageItems today; this just names
 *   and groups it so callers stop passing an ad hoc bag of loose variables.
 * - buildCustomerPsychologyProfile() is the one genuinely NEW piece of
 *   structuring logic this mission actually required: real audience
 *   pain-point data (brandProfile.audiences[].pain_points, a field
 *   customers already fill in on /app/brand) was captured but never
 *   surfaced to the generation stages as its own structured signal.
 */
export const HERMES_SOCIAL_SPECIALIST_ROLES = [
  "research",
  "brand_intelligence",
  "customer_psychology",
  "market_trend_intelligence",
  "strategy_director",
  "creative_brief",
  "creative_director",
  "copywriter",
  "visual_generation",
  "brand_logo_guardian",
  "fact_claim_safety",
  "diversity_editor",
  "final_quality_director",
  "publishing_scheduling",
] as const;

export type HermesSocialSpecialistRole = (typeof HERMES_SOCIAL_SPECIALIST_ROLES)[number];

export type CampaignTaskStatus = "STARTED" | "COMPLETED" | "FAILED";

export interface RecordCampaignTaskInput {
  authorizationId: string;
  tenantId: string;
  queueItemId?: string | null;
  agentRole: HermesSocialSpecialistRole;
  status: CampaignTaskStatus;
  attempt?: number;
  inputRef?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  quality?: Record<string, unknown> | null;
  failureReason?: string | null;
}

/**
 * Best-effort task/handoff ledger write. Never throws and never blocks the
 * real pipeline it's observing -- a failure to WRITE this observability
 * record must never fail the real generation it describes, the same
 * "additive, never load-bearing" discipline recordAudit() already uses
 * throughout this codebase. Call sites in package-autopilot.ts fire this
 * immediately after each real, already-existing pipeline stage completes
 * (or throws), so this instruments the proven pipeline rather than adding a
 * second one beside it.
 */
export async function recordCampaignTask(service: ServiceClient, input: RecordCampaignTaskInput): Promise<void> {
  try {
    await service.from("social_autopilot_campaign_tasks").insert({
      authorization_id: input.authorizationId,
      tenant_id: input.tenantId,
      queue_item_id: input.queueItemId ?? null,
      agent_role: input.agentRole,
      status: input.status,
      attempt: input.attempt ?? 1,
      input_ref: input.inputRef ?? null,
      output: input.output ?? null,
      quality: input.quality ?? null,
      failure_reason: input.failureReason ?? null,
    });
  } catch {
    // Observability must never take down the real pipeline it's watching.
  }
}

/**
 * Canonical, per-post campaign context (Hermes mission Section 5). Every
 * field is sourced from data the real pipeline ALREADY computes inside
 * prepareNearTermPackageItems -- this type names and groups that real data;
 * it does not invent fields the pipeline doesn't already have.
 *
 * businessIdentity and targetAudience are deliberately two separate,
 * non-overlapping fields, not a flat bag of strings -- this is the
 * structural half of the same contamination boundary
 * checkTargetIndustryContamination (lib/social/industry-taxonomy.ts)
 * already enforces at the copy layer: the business's own identity is
 * locked per campaign (read once from Brand Brain -- the same
 * brandProfile.identity every item in this authorization shares) and must
 * never be described using another industry's identity-claiming language,
 * while the target audience is expected to vary per post/pillar and
 * describes WHO the post is speaking to, never WHAT the business is.
 */
export interface SocialAutopilotCampaignContext {
  authorizationId: string;
  tenantId: string;
  queueItemId: string;
  /** 1-based day index within the service period (item.package_sequence-derived). */
  campaignDay: number;
  platform: string;
  mediaType: string;
  /** Locked per campaign -- read once from Brand Brain, identical for every post in this authorization. */
  businessIdentity: {
    name: string;
    industry: string;
    description: string | null;
  };
  /** Varies per post -- who THIS post speaks to; never a restatement of the business's own identity. */
  targetAudience: {
    label: string | null;
    painPoints: string | null;
  };
  contentPillar: string;
  objective: string;
  concept: string;
  qualityScore: number | null;
  qualityPassed: boolean | null;
  mediaAssetId: string | null;
  logoAssetId: string | null;
}

export interface CustomerPsychologyProfile {
  audienceLabel: string;
  painPoints: string[];
  description: string | null;
}

/**
 * Customer Psychology specialist stage (Hermes mission Section 3): real
 * structuring of the tenant's OWN Brand Brain audience data
 * (brandProfile.audiences[].pain_points, a real field customers fill in on
 * /app/brand -- never fabricated) into a form downstream creative-brief and
 * copy stages can reason about explicitly, instead of pain points sitting
 * unused inside an audience record that today is only ever read for its
 * .name. An audience with no pain_points text yields an empty array, never
 * an invented one.
 */
export function buildCustomerPsychologyProfile(
  audiences: Array<{ name: string; description?: string; pain_points?: string }>
): CustomerPsychologyProfile[] {
  return audiences
    .filter((audience) => audience.name?.trim())
    .map((audience) => ({
      audienceLabel: audience.name.trim(),
      painPoints: (audience.pain_points ?? "")
        .split(/[.\n;]+/)
        .map((point) => point.trim())
        .filter(Boolean),
      description: audience.description?.trim() || null,
    }));
}

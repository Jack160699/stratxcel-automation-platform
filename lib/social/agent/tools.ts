import { runHealthChecks } from "../health";
import { listAccounts } from "../repositories/accounts";
import { listJobs, listDeadLetters } from "../repositories/publishing";
import { listRecentMetrics, listCostEvents } from "../repositories/analytics";
import { listCampaigns, createCampaign } from "../repositories/campaigns";
import { getBrandProfile } from "../repositories/brand";
import { BRAND_SECTIONS, selectBrandSection, type BrandSection } from "./brand-sections";
import { createContentMaster, createContentVariant, listContentMaster } from "../repositories/content";
import { scheduleJob, cancelJob } from "../repositories/publishing";
import { upsertAutomationSettings } from "../repositories/automation";
import { createSupabaseServiceClient } from "../../supabase/service";
import type { OwnerContext } from "../db-context";
import type { ToolSchema } from "./provider";
import { CONTENT_OBJECTIVE_VALUES, platformsMatch } from "../content-options";
import {
  attachMediaToMaster,
  attachMediaToVariant,
  ingestAttachmentMedia,
  inspectContentMedia,
  updateContentVariant,
} from "../repositories/media-assets";
import { executePrivateYoutubeVerification, executeYoutubeVerification } from "../verification-publish";
import { requireUuid, optionalUuid } from "./id-validation";
import { assertAttachmentSlot, asMediaAssetId } from "./media-identity";
import { buildVariantGenerationKey } from "./variant-idempotency";
import { validateProposedScheduleAction } from "../workforce/schedule.ts";
import { requestGenerateImage } from "./generate-image-capability";
import { runPublishNow } from "./publish-outcome";
import { getImageProvider, BlockedImageProvider } from "@stratxcel/creative-studio";
import { resolveImageGenerationRuntimeStatus } from "./capability-evidence";
import { evaluateBrandTrustHardGate } from "./trust-hard-gate";

export interface AgentTool {
  schema: ToolSchema;
  /** True for anything that mutates data or would touch an external account — gates approval. */
  mutating: boolean;
  /** Overrides the orchestrator's default tool-output character budget for this tool specifically. */
  outputBudget?: number;
  execute(ctx: OwnerContext, args: Record<string, unknown>): Promise<unknown>;
}

function str(args: Record<string, unknown>, key: string, fallback = ""): string {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
}
function arr(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  return Array.isArray(v) ? v.map(String) : [];
}

const inspectHealth: AgentTool = {
  schema: {
    name: "inspect_health",
    description: "Check the health of connected social accounts, AI providers, and the publishing worker.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => runHealthChecks(ctx),
};

const inspectJobs: AgentTool = {
  schema: {
    name: "inspect_jobs",
    description: "List recent publishing jobs and their status (scheduled, running, failed).",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => listJobs(ctx),
};

const inspectDeadLetters: AgentTool = {
  schema: {
    name: "inspect_dead_letters",
    description: "List permanently-failed publishing jobs that exhausted their retry budget.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => listDeadLetters(ctx),
};

const inspectAccounts: AgentTool = {
  schema: {
    name: "inspect_accounts",
    description: "List connected social accounts, their status, and token health. Never returns tokens.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => listAccounts(ctx),
};

const getPerformance: AgentTool = {
  schema: {
    name: "get_performance",
    description: "Summarize recent content metrics (reach, engagement) and AI/media cost events.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => ({ metrics: await listRecentMetrics(ctx), costs: await listCostEvents(ctx, 20) }),
};

const listCampaignsTool: AgentTool = {
  schema: {
    name: "list_campaigns",
    description: "List existing campaigns with status and platforms.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => listCampaigns(ctx),
};

const inspectBrand: AgentTool = {
  schema: {
    name: "inspect_brand",
    description:
      'Read Brand Brain: company identity, products, audiences, voice, content pillars, knowledge sources, and rules — ' +
      "use this to ground any generated content. Pass `section` for just the part you need " +
      '("identity" | "products" | "audiences" | "pillars" | "sources" | "rules"), omit it (or pass "summary") ' +
      'for an overview with counts of everything, or pass "all" for the complete profile in one call.',
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", enum: [...BRAND_SECTIONS], description: 'Defaults to "summary" if omitted.' },
      },
    },
  },
  mutating: false,
  // Brand Brain is the Agent's grounding source of truth — give it more room
  // than the default budget so a section (or "all") isn't cut mid-list. Sized
  // against the real current profile (~18 products/9 audiences/9 pillars/
  // 7 sources/20 rules is ~25KB) with headroom to grow before the generic
  // truncation safety net in serializeToolOutput would ever need to engage.
  outputBudget: 40000,
  execute: async (ctx, args) => {
    const profile = await getBrandProfile(ctx);
    const section = (str(args, "section", "summary") || "summary") as BrandSection;
    return selectBrandSection(profile, section);
  },
};

const createCampaignTool: AgentTool = {
  schema: {
    name: "create_campaign",
    description: "Create a new campaign.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, goal: { type: "string" }, platforms: { type: "array", items: { type: "string" } } },
      required: ["name", "goal"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => createCampaign(ctx, { name: str(args, "name"), goal: str(args, "goal"), platforms: arr(args, "platforms") }),
};

const createContentItem: AgentTool = {
  schema: {
    name: "create_content_item",
    description: "Create a content master idea (cross-platform concept) ready to generate platform variants from.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        masterIdea: { type: "string" },
        objective: { type: "string", enum: [...CONTENT_OBJECTIVE_VALUES] },
        contentPillar: { type: "string" },
        campaignId: { type: "string" },
      },
      required: ["title", "masterIdea", "objective", "contentPillar"],
    },
  },
  mutating: true,
  execute: async (ctx, args) =>
    createContentMaster(ctx, {
      title: str(args, "title"),
      masterIdea: str(args, "masterIdea"),
      objective: str(args, "objective"),
      contentPillar: str(args, "contentPillar"),
      // Optional relationship: omit/null rather than a fabricated campaign name.
      campaignId: optionalUuid(args.campaignId, "campaignId"),
    }),
};

const createVariant: AgentTool = {
  schema: {
    name: "create_content_variant",
    description: "Create a platform-specific variant (caption, hashtags, media) for an existing content master idea.",
    parameters: {
      type: "object",
      properties: {
        masterId: { type: "string" },
        platform: { type: "string" },
        format: { type: "string" },
        objective: { type: "string", enum: [...CONTENT_OBJECTIVE_VALUES] },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        mediaUrls: { type: "array", items: { type: "string" } },
        generationKey: { type: "string", description: "Optional deterministic generation identity for idempotent reuse." },
        contentSlot: { type: "string" },
        briefVersion: { type: "string" },
        revision: { type: "number" },
        missionId: { type: "string" },
        sessionId: { type: "string" },
      },
      required: ["masterId", "platform", "format", "objective", "caption"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => {
    const masterId = requireUuid(args.masterId, "masterId");
    const platform = str(args, "platform");
    const format = str(args, "format");
    const caption = str(args, "caption");
    const brand = await getBrandProfile(ctx);
    const trust = evaluateBrandTrustHardGate({
      caption,
      blockedPhrases: brand.voice?.blocked_phrases ?? [],
      forbiddenClaims: brand.voice?.forbidden_claims ?? [],
      isSelfMarketing: /\bstratxcel\b/i.test(caption),
    });
    if (trust.decision === "BLOCK" || trust.decision === "REVISE") {
      throw new Error(`Brand/Trust gate: ${trust.decision}. ${trust.reasons.join("; ") || "Caption requires revision before READY."}`);
    }
    const revision = typeof args.revision === "number" ? args.revision : Number(args.revision) || 1;
    const generationKey =
      str(args, "generationKey") ||
      (str(args, "sessionId") && str(args, "missionId")
        ? buildVariantGenerationKey({
            tenantId: ctx.ownerId,
            missionId: str(args, "missionId"),
            sessionId: str(args, "sessionId"),
            contentSlot: str(args, "contentSlot") || `${platform}:${format}`,
            masterId,
            platform,
            format,
            briefVersion: str(args, "briefVersion") || "v1",
            revision,
          })
        : null);
    return createContentVariant(ctx, {
      masterId,
      platform,
      format,
      objective: str(args, "objective"),
      caption,
      hashtags: arr(args, "hashtags"),
      mediaUrls: arr(args, "mediaUrls"),
      generationKey,
      creativeSpec: { trustDecision: trust.decision },
    });
  },
};

const schedulePost: AgentTool = {
  schema: {
    name: "schedule_post",
    description:
      "Schedule an existing content variant to publish from a connected account. " +
      "For \"post it\"/\"post now\" omit scheduledAt (defaults to now). " +
      "For week-planning requests, scheduledAt is REQUIRED and must be a concrete future ISO timestamp from the server week planner — never invent times and never omit them for weekly plans.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Optional trusted account ID from an internal workflow." },
        platform: { type: "string", description: "Use this to let the server resolve the connected account locally." },
        recommendationTier: { type: "string", enum: ["recommended", "optional"], description: "Creative fit for this destination." },
        recommendationReason: { type: "string", description: "Short user-facing reason based on Brand Brain, the creative, and platform style." },
        variantId: { type: "string" },
        scheduledAt: { type: "string" },
        timeZone: { type: "string" },
        wallClockLabel: { type: "string" },
        scheduleSource: { type: "string", enum: ["USER_SPECIFIED", "TENANT_PREFERENCE", "PACKAGE_PLAN", "SYSTEM_DEFAULT"] },
        reviewId: { type: "string" },
        revision: { type: "number" },
        missionId: { type: "string" },
        contentMasterId: { type: "string" },
        requiresFutureSchedule: { type: "boolean" },
      },
      required: ["variantId"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => {
    const variantId = requireUuid(args.variantId, "variantId");
    const { data: variant } = await ctx.supabase.from("content_variants").select("id, platform").eq("id", variantId).maybeSingle();
    if (!variant) throw new Error("Content variant is not available to this owner.");
    const requestedAccountId = optionalUuid(args.accountId, "accountId");
    const requestedPlatform = str(args, "platform") || variant.platform;
    let accountQuery = ctx.supabase
      .from("social_accounts")
      .select("id, platform, username, display_name")
      .eq("status", "CONNECTED");
    accountQuery = requestedAccountId
      ? accountQuery.eq("id", requestedAccountId)
      : accountQuery.ilike("platform", requestedPlatform);
    const { data: candidateAccounts } = await accountQuery.limit(2);
    if (!requestedAccountId && (candidateAccounts?.length ?? 0) > 1) {
      throw new Error(`Multiple connected ${requestedPlatform} accounts are available; choose one locally before publishing.`);
    }
    const account = candidateAccounts?.[0] ?? null;
    const accountId = account?.id ?? "";
    if (!account || !variant) throw new Error("Account or content variant is not available to this owner.");
    if (!platformsMatch(account.platform, variant.platform)) {
      throw new Error("The account platform must match the content variant platform.");
    }
    const requiresFuture = args.requiresFutureSchedule === true;
    if (requiresFuture) {
      const timeZone = str(args, "timeZone") || "Asia/Kolkata";
      validateProposedScheduleAction({
        requiresFutureDate: true,
        scheduledAt: str(args, "scheduledAt") || null,
        timeZone,
      });
    }
    const service = createSupabaseServiceClient();
    const scheduledAt = str(args, "scheduledAt") || new Date().toISOString();
    const jobId = await scheduleJob(service, { accountId, variantId, scheduledAt });
    return runPublishNow(service, jobId, scheduledAt, ctx.ownerId, {
      platform: account.platform,
      accountLabel: account.display_name || account.username,
    });
  },
};

const cancelScheduledPost: AgentTool = {
  schema: {
    name: "cancel_scheduled_post",
    description: "Cancel a pending scheduled publishing job.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  mutating: true,
  execute: async (ctx, args) => {
    const id = requireUuid(args.id, "id");
    const { data: ownedJob } = await ctx.supabase.from("social_publishing_jobs").select("id").eq("id", id).maybeSingle();
    if (!ownedJob) throw new Error("Publishing job not found or owned by another account.");
    const service = createSupabaseServiceClient();
    return cancelJob(service, id);
  },
};

const setOperatingMode: AgentTool = {
  schema: {
    name: "set_operating_mode",
    description: "Change the Agent's autonomy level: MANUAL, SUPERVISED, or AUTOPILOT.",
    parameters: { type: "object", properties: { mode: { type: "string", enum: ["MANUAL", "SUPERVISED", "AUTOPILOT"] } }, required: ["mode"] },
  },
  mutating: true,
  execute: async (ctx, args) => {
    const mode = str(args, "mode");
    if (!["MANUAL", "SUPERVISED", "AUTOPILOT"].includes(mode)) throw new Error("Invalid autonomy level");
    await upsertAutomationSettings(ctx, { autonomy_level: mode as "MANUAL" | "SUPERVISED" | "AUTOPILOT" });
    return { autonomy_level: mode };
  },
};

const listContentTool: AgentTool = {
  schema: {
    name: "list_content",
    description: "List recent content master ideas and their status.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => listContentMaster(ctx),
};

const ingestMedia: AgentTool = {
  schema: {
    name: "ingest_media",
    description:
      "Resolve an uploaded Copilot media attachment into its canonical owner-scoped media asset. " +
      "Use the exact attachmentId shown in the attachment context. This operation is idempotent. " +
      "Never pass mediaAssetId here — attachmentId and mediaAssetId are different identities.",
    parameters: {
      type: "object",
      properties: { attachmentId: { type: "string" } },
      required: ["attachmentId"],
    },
  },
  // Finalization normally creates the asset before the Agent runs; this is an
  // idempotent identity/access operation, not an external or content mutation.
  mutating: false,
  execute: async (ctx, args) => ingestAttachmentMedia(ctx, assertAttachmentSlot(args)),
};

const generateImageTool: AgentTool = {
  schema: {
    name: "generate_image",
    description:
      "Request fresh image generation for the current Social mission via media.image_generation. " +
      "Returns NOT_CONFIGURED when no real image provider is available — never invents an image. " +
      "Successful candidates require selection before becoming READY media assets.",
    parameters: {
      type: "object",
      properties: {
        brief: { type: "string" },
        missionId: { type: "string" },
        sessionId: { type: "string" },
        referenceMediaAssetIds: { type: "array", items: { type: "string" } },
        candidateCount: { type: "number" },
      },
      required: ["brief"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => {
    const { resolveCurrentTenant } = await import("../../tenants/current-tenant.ts");
    const tenantResolution = await resolveCurrentTenant(ctx.supabase, ctx.ownerId);
    const tenantId = tenantResolution.active?.tenantId;
    if (!tenantId) {
      return {
        outcome: "FAILED",
        runtimeStatus: "NOT_CONFIGURED",
        candidates: [],
        selectedCandidateId: null,
        reason: "tenant_required_for_billable_ai",
        capability: "media.image_generation",
        persistedMediaAssetIds: [] as string[],
        uiState: "setup_required",
      };
    }
    const provider = getImageProvider();
    const runtime = resolveImageGenerationRuntimeStatus({
      providerConfigured: Boolean(provider) && !(provider instanceof BlockedImageProvider),
      storageReady: false,
      tenantAuthorized: true,
    });
    const result = await requestGenerateImage({
      tenantId,
      missionId: str(args, "missionId") || `mission_${tenantId}`,
      sessionId: str(args, "sessionId") || `session_${tenantId}`,
      briefText: str(args, "brief"),
      referenceMediaAssetIds: arr(args, "referenceMediaAssetIds"),
      candidateCount: typeof args.candidateCount === "number" ? args.candidateCount : 2,
    });
    return {
      ...result,
      capability: "media.image_generation",
      runtimeStatus: result.runtimeStatus || runtime,
      // Explicit: no social_media_assets row is created until a real selected candidate is persisted.
      persistedMediaAssetIds: [] as string[],
      uiState: result.outcome === "NOT_CONFIGURED" || result.outcome === "WAITING_CONFIGURATION" ? "setup_required" : "candidates_ready",
    };
  },
};

const inspectContentMediaTool: AgentTool = {
  schema: {
    name: "inspect_content_media",
    description:
      "Inspect a content master and its variants plus their exact attached media assets. " +
      "Provide masterId, variantId, or the exact content title.",
    parameters: {
      type: "object",
      properties: {
        masterId: { type: "string" },
        variantId: { type: "string" },
        title: { type: "string" },
      },
    },
  },
  mutating: false,
  execute: async (ctx, args) => inspectContentMedia(ctx, {
    masterId: optionalUuid(args.masterId, "masterId") ?? undefined,
    variantId: optionalUuid(args.variantId, "variantId") ?? undefined,
    title: str(args, "title") || undefined,
  }),
};

const attachMediaToContentTool: AgentTool = {
  schema: {
    name: "attach_media_to_content",
    description:
      "Attach owned canonical media assets to an existing content master or variant. " +
      "Set replace=true to make these assets the exact media selection.",
    parameters: {
      type: "object",
      properties: {
        masterId: { type: "string" },
        variantId: { type: "string" },
        assetIds: { type: "array", items: { type: "string" } },
        replace: { type: "boolean" },
      },
      required: ["assetIds"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => {
    const masterId = optionalUuid(args.masterId, "masterId");
    const variantId = optionalUuid(args.variantId, "variantId");
    if (Boolean(masterId) === Boolean(variantId)) throw new Error("Provide exactly one of masterId or variantId.");
    const assetIds = arr(args, "assetIds").map((id) => asMediaAssetId(id, "assetIds"));
    // Reject accidental attachmentId misuse in the media-asset slot.
    if (Object.hasOwn(args, "attachmentId") && !Object.hasOwn(args, "assetIds") && !Object.hasOwn(args, "mediaAssetIds")) {
      throw new Error("mediaAssetId_required_attachmentId_rejected");
    }
    const replace = args.replace === true;
    return masterId
      ? attachMediaToMaster(ctx, masterId, assetIds, replace)
      : attachMediaToVariant(ctx, variantId as string, assetIds, replace);
  },
};

const updateContentVariantTool: AgentTool = {
  schema: {
    name: "update_content_variant",
    description:
      "Safely update an existing owned platform variant, including replacing attached media and preserving exact YouTube visibility.",
    parameters: {
      type: "object",
      properties: {
        variantId: { type: "string" },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        format: { type: "string" },
        mediaAssetIds: { type: "array", items: { type: "string" } },
        youtubePrivacyStatus: { type: "string", enum: ["private", "unlisted", "public"] },
      },
      required: ["variantId"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => updateContentVariant(ctx, {
    variantId: requireUuid(args.variantId, "variantId"),
    ...(typeof args.caption === "string" ? { caption: args.caption } : {}),
    ...(Array.isArray(args.hashtags) ? { hashtags: arr(args, "hashtags") } : {}),
    ...(typeof args.format === "string" ? { format: args.format } : {}),
    ...(Array.isArray(args.mediaAssetIds) ? { mediaAssetIds: arr(args, "mediaAssetIds").map((id) => requireUuid(id, "mediaAssetIds")) } : {}),
    ...(args.youtubePrivacyStatus === "private" || args.youtubePrivacyStatus === "unlisted" || args.youtubePrivacyStatus === "public"
      ? { youtubePrivacyStatus: args.youtubePrivacyStatus }
      : {}),
  }),
};

const executeYoutubeVerificationTool: AgentTool = {
  schema: {
    name: "execute_youtube_verification",
    description:
      "One-time, explicitly approved Google verification path: attach one owned MP4 to one existing owned YouTube variant, " +
      "set PRIVATE or UNLISTED visibility, create one exact publishing job for one connected YouTube account, and run only that job. " +
      "Global SHADOW remains enabled and no unrelated job can be released.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        variantId: { type: "string" },
        assetId: { type: "string" },
        privacyStatus: { type: "string", enum: ["private", "unlisted"] },
      },
      required: ["accountId", "variantId", "assetId", "privacyStatus"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => executeYoutubeVerification(ctx, {
    accountId: requireUuid(args.accountId, "accountId"),
    variantId: requireUuid(args.variantId, "variantId"),
    assetId: requireUuid(args.assetId, "assetId"),
    privacyStatus: str(args, "privacyStatus") as "private" | "unlisted",
  }),
};

const executePrivateYoutubeVerificationTool: AgentTool = {
  schema: {
    name: "execute_private_youtube_verification",
    description:
      "One-time, explicitly approved Google verification path: attach one owned MP4 to one existing owned YouTube variant, " +
      "force PRIVATE visibility, create one exact publishing job for one connected YouTube account, and run only that job. " +
      "Global SHADOW remains enabled and no unrelated job can be released.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        variantId: { type: "string" },
        assetId: { type: "string" },
      },
      required: ["accountId", "variantId", "assetId"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => executePrivateYoutubeVerification(ctx, {
    accountId: requireUuid(args.accountId, "accountId"),
    variantId: requireUuid(args.variantId, "variantId"),
    assetId: requireUuid(args.assetId, "assetId"),
  }),
};

export const AGENT_TOOLS: AgentTool[] = [
  inspectHealth,
  inspectJobs,
  inspectDeadLetters,
  inspectAccounts,
  getPerformance,
  listCampaignsTool,
  inspectBrand,
  listContentTool,
  ingestMedia,
  generateImageTool,
  inspectContentMediaTool,
  createCampaignTool,
  createContentItem,
  createVariant,
  attachMediaToContentTool,
  updateContentVariantTool,
  schedulePost,
  executeYoutubeVerificationTool,
  executePrivateYoutubeVerificationTool,
  cancelScheduledPost,
  setOperatingMode,
];

export function getTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.schema.name === name);
}

export function toolSchemas(): ToolSchema[] {
  return AGENT_TOOLS.map((t) => t.schema);
}

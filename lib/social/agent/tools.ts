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
import { runPublishNow } from "./publish-outcome";

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
      },
      required: ["masterId", "platform", "format", "objective", "caption"],
    },
  },
  mutating: true,
  execute: async (ctx, args) =>
    createContentVariant(ctx, {
      masterId: requireUuid(args.masterId, "masterId"),
      platform: str(args, "platform"),
      format: str(args, "format"),
      objective: str(args, "objective"),
      caption: str(args, "caption"),
      hashtags: arr(args, "hashtags"),
      mediaUrls: arr(args, "mediaUrls"),
    }),
};

const schedulePost: AgentTool = {
  schema: {
    name: "schedule_post",
    description:
      "Schedule an existing content variant to publish from a connected account. Omit scheduledAt entirely " +
      "for \"post it\"/\"post now\"/\"publish this\" or when no time was requested — it defaults to right now, " +
      "which runs publishing synchronously and returns the real terminal status (published/failed/still queued); " +
      "never assume success. Only pass scheduledAt (ISO 8601) when the user explicitly requested a future date/time — " +
      "never invent one.",
    parameters: {
      type: "object",
      properties: { accountId: { type: "string" }, variantId: { type: "string" }, scheduledAt: { type: "string" } },
      required: ["accountId", "variantId"],
    },
  },
  mutating: true,
  execute: async (ctx, args) => {
    const accountId = requireUuid(args.accountId, "accountId");
    const variantId = requireUuid(args.variantId, "variantId");
    const [{ data: account }, { data: variant }] = await Promise.all([
      ctx.supabase.from("social_accounts").select("id, platform, username, display_name").eq("id", accountId).maybeSingle(),
      ctx.supabase.from("content_variants").select("id, platform").eq("id", variantId).maybeSingle(),
    ]);
    if (!account || !variant) throw new Error("Account or content variant is not available to this owner.");
    // Canonical-to-canonical comparison — immune to "THREADS" vs "threads"
    // casing on either side, including legacy rows written before
    // normalization existed. See lib/social/content-options.ts.
    if (!platformsMatch(account.platform, variant.platform)) {
      throw new Error("The account platform must match the content variant platform.");
    }
    const service = createSupabaseServiceClient();
    // "Post it now" is the default: an omitted/empty scheduledAt means right
    // now, not a guessed clock time. This is the actual fix for the model
    // inventing an arbitrary future timestamp for a plain "post it" request
    // — making "now" the easy, argument-free path removes the temptation to
    // synthesize one at all (see Section 2 of the live-progress cleanup brief).
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
      "Use the exact attachmentId shown in the attachment context. This operation is idempotent.",
    parameters: {
      type: "object",
      properties: { attachmentId: { type: "string" } },
      required: ["attachmentId"],
    },
  },
  // Finalization normally creates the asset before the Agent runs; this is an
  // idempotent identity/access operation, not an external or content mutation.
  mutating: false,
  execute: async (ctx, args) => ingestAttachmentMedia(ctx, requireUuid(args.attachmentId, "attachmentId")),
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
    const assetIds = arr(args, "assetIds").map((id) => requireUuid(id, "assetIds"));
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

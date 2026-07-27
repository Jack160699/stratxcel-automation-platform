import { runHealthChecks } from "../health";
import { listAccounts } from "../repositories/accounts";
import { listJobs, listDeadLetters } from "../repositories/publishing";
import { listRecentMetrics, listCostEvents } from "../repositories/analytics";
import { listCampaigns, createCampaign } from "../repositories/campaigns";
import { getBrandProfile } from "../repositories/brand";
import { createContentMaster, createContentVariant, listContentMaster } from "../repositories/content";
import { scheduleJob, cancelJob } from "../repositories/publishing";
import { upsertAutomationSettings } from "../repositories/automation";
import { createSupabaseServiceClient } from "../../supabase/service";
import type { OwnerContext } from "../db-context";
import type { ToolSchema } from "./provider";

export interface AgentTool {
  schema: ToolSchema;
  /** True for anything that mutates data or would touch an external account — gates approval. */
  mutating: boolean;
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
  execute: async () => runHealthChecks(),
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
    description: "Read Brand Brain: company identity, products, audiences, voice, pillars, and rules — use this to ground any generated content.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  execute: async (ctx) => getBrandProfile(ctx),
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
        objective: { type: "string" },
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
      campaignId: str(args, "campaignId") || null,
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
        objective: { type: "string" },
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
      masterId: str(args, "masterId"),
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
    description: "Schedule an existing content variant to publish from a connected account at a specific time (ISO 8601).",
    parameters: {
      type: "object",
      properties: { accountId: { type: "string" }, variantId: { type: "string" }, scheduledAt: { type: "string" } },
      required: ["accountId", "variantId", "scheduledAt"],
    },
  },
  mutating: true,
  execute: async (_ctx, args) => {
    const service = createSupabaseServiceClient();
    return scheduleJob(service, { accountId: str(args, "accountId"), variantId: str(args, "variantId"), scheduledAt: str(args, "scheduledAt") });
  },
};

const cancelScheduledPost: AgentTool = {
  schema: {
    name: "cancel_scheduled_post",
    description: "Cancel a pending scheduled publishing job.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  mutating: true,
  execute: async (_ctx, args) => {
    const service = createSupabaseServiceClient();
    return cancelJob(service, str(args, "id"));
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
    await upsertAutomationSettings(ctx, { autonomy_level: mode });
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

export const AGENT_TOOLS: AgentTool[] = [
  inspectHealth,
  inspectJobs,
  inspectDeadLetters,
  inspectAccounts,
  getPerformance,
  listCampaignsTool,
  inspectBrand,
  listContentTool,
  createCampaignTool,
  createContentItem,
  createVariant,
  schedulePost,
  cancelScheduledPost,
  setOperatingMode,
];

export function getTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.schema.name === name);
}

export function toolSchemas(): ToolSchema[] {
  return AGENT_TOOLS.map((t) => t.schema);
}

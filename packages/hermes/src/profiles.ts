import type { ProfileName } from "@stratxcel/hermes-contract";
import type { ToolName } from "./types.ts";
import { STRATXCEL_CONTROLLED_TOOLS } from "./tools/contracts.ts";

export type ModelTier = "cheapest" | "mid" | "strong-writing" | "strong-coding" | "highest-reasoning";

/**
 * Structural policy for one Hermes-native profile, matching
 * docs/hermes/PROFILE_AND_TOOL_POLICY.md. `stratxcelTools.allowed` is a
 * subset of the 12-tool closed union in ./tools/contracts.ts — the same
 * set apps/hermes-gateway already enforces at dispatch — so a profile
 * cannot be granted a tool the gateway wouldn't recognize. Tools listed in
 * `stratxcelTools.requiresApproval` are allowed but always create an
 * ApprovalRequest instead of executing directly, per
 * docs/hermes/APPROVAL_AND_HANDOFF.md; this mirrors, and does not replace,
 * the gateway's own server-side `sensitive: true` enforcement — belt and
 * suspenders, not the only check.
 *
 * Not yet wired into ./context.ts's compileMissionContext (which still
 * uses one flat DEFAULT_TOOL_ALLOWLIST for every mission) — that
 * per-profile rewiring is a follow-up once a mission's Hermes-native
 * profile (as opposed to the coarser `missions.hermes_profile` label) is
 * actually threaded through submitMission().
 */
export interface ProfilePolicy {
  profile: ProfileName;
  purpose: string;
  builtinToolsets: {
    allowed: string[];
    forbidden: string[];
  };
  stratxcelTools: {
    allowed: ToolName[];
    requiresApproval: ToolName[];
  };
  approvalBoundary: string;
  modelTier: ModelTier;
}

const NEVER_ALLOWED_BUILTIN = ["terminal", "process", "execute_code"] as const;

function minimalSafeDefault(profile: ProfileName, purpose: string): ProfilePolicy {
  return {
    profile,
    purpose,
    builtinToolsets: { allowed: ["memory"], forbidden: [...NEVER_ALLOWED_BUILTIN, "browser_*"] },
    stratxcelTools: { allowed: ["update_mission_progress"], requiresApproval: [] },
    approvalBoundary: "No write-capable tool granted in this first pass; anything beyond progress reporting requires a follow-up policy change, not a prompt change.",
    modelTier: "mid",
  };
}

export const PROFILE_POLICIES: Record<ProfileName, ProfilePolicy> = {
  orchestrator: {
    profile: "orchestrator",
    purpose: "Decomposes an incoming mission, delegates to other profiles, aggregates results.",
    builtinToolsets: { allowed: ["delegate_task", "todo", "clarify", "memory"], forbidden: [...NEVER_ALLOWED_BUILTIN, "browser_*"] },
    stratxcelTools: { allowed: ["get_service_definition", "update_mission_progress"], requiresApproval: [] },
    approvalBoundary: "None directly — orchestrator never executes; each delegated sub-mission carries its own approval boundary.",
    modelTier: "highest-reasoning",
  },

  research: {
    profile: "research",
    purpose: "Market/competitor/SEO/general research; read-only reports.",
    builtinToolsets: { allowed: ["web_search", "web_extract", "browser_navigate", "browser_snapshot", "memory"], forbidden: [...NEVER_ALLOWED_BUILTIN] },
    stratxcelTools: { allowed: ["get_brand_context", "create_draft_artifact", "attach_research_evidence", "update_mission_progress"], requiresApproval: [] },
    approvalBoundary: "None — read-only by construction, nothing to approve.",
    modelTier: "mid",
  },

  content: {
    profile: "content",
    purpose: "Drafts marketing/social/blog copy for review.",
    builtinToolsets: { allowed: ["web_search", "memory"], forbidden: [...NEVER_ALLOWED_BUILTIN, "browser_*"] },
    stratxcelTools: {
      allowed: ["get_brand_context", "create_draft_artifact", "update_mission_progress", "request_approval", "get_approval_status"],
      requiresApproval: [],
    },
    approvalBoundary: "Publishing is a separate, later, human-triggered action in the existing Social Autopilot UI — this profile never calls a publish tool itself.",
    modelTier: "strong-writing",
  },

  social: {
    profile: "social",
    purpose: "Drafts platform-specific social posts (captions, hooks, hashtag sets) into the existing, live Social Autopilot content pipeline.",
    builtinToolsets: { allowed: ["web_search", "memory"], forbidden: [...NEVER_ALLOWED_BUILTIN, "browser_*"] },
    stratxcelTools: {
      allowed: ["get_brand_context", "create_draft_artifact", "update_mission_progress", "request_approval", "get_approval_status"],
      requiresApproval: [],
    },
    approvalBoundary: "Publishing is a separate, later, human-triggered action in the existing Social Autopilot UI — this profile never calls a publish tool itself, structurally, matching content's boundary.",
    modelTier: "strong-writing",
  },

  seo: {
    profile: "seo",
    purpose: "Technical SEO audits, on-page recommendations, structured reports.",
    builtinToolsets: { allowed: ["web_search", "web_extract", "browser_navigate", "browser_snapshot"], forbidden: [...NEVER_ALLOWED_BUILTIN] },
    stratxcelTools: {
      allowed: ["get_brand_context", "get_service_definition", "create_draft_artifact", "attach_research_evidence", "update_mission_progress"],
      requiresApproval: [],
    },
    approvalBoundary: "None — read-only; nothing this profile does writes to a live site.",
    modelTier: "mid",
  },

  "website-development": {
    profile: "website-development",
    purpose: "Code changes to a client website in a branch/preview, never directly to production.",
    builtinToolsets: { allowed: ["terminal", "read_file", "patch", "execute_code"], forbidden: [] },
    stratxcelTools: {
      allowed: ["get_brand_context", "create_website_change_request", "create_draft_artifact", "update_mission_progress", "request_approval", "get_approval_status"],
      requiresApproval: ["create_website_change_request"],
    },
    approvalBoundary: "Production promotion is always gated behind an ApprovalRequest. Branch creation and preview deploys are reversible/low-risk and do not require pre-approval, only post-hoc audit logging — but create_website_change_request is still routed through request_approval in this first pass rather than executing directly, since no production-promotion tool is implemented yet to enforce the split.",
    modelTier: "strong-coding",
  },

  crm: {
    profile: "crm",
    purpose: "Lead/contact enrichment, pipeline notes, follow-up drafting.",
    builtinToolsets: { allowed: ["web_search"], forbidden: [...NEVER_ALLOWED_BUILTIN, "browser_*"] },
    stratxcelTools: { allowed: ["create_crm_lead", "update_mission_progress", "request_approval", "get_approval_status"], requiresApproval: [] },
    approvalBoundary: "Any outbound message to a real client's customer is an ApprovalRequest, no exceptions — no send-capable tool is granted to this profile at all in this first pass.",
    modelTier: "cheapest",
  },

  proposal: {
    profile: "proposal",
    purpose: "Drafts client proposals/quotes from a brief + Brand Brain + pricing rules.",
    builtinToolsets: { allowed: ["web_search", "memory"], forbidden: [...NEVER_ALLOWED_BUILTIN, "browser_*"] },
    stratxcelTools: {
      allowed: ["get_brand_context", "create_draft_artifact", "update_mission_progress", "request_approval", "get_approval_status"],
      requiresApproval: [],
    },
    approvalBoundary: "Sending a proposal to a client, or any pricing deviating from the configured floor, is an ApprovalRequest — no send-capable or payment-adjacent tool is granted.",
    modelTier: "strong-writing",
  },

  media: {
    profile: "media",
    purpose: "Image/video asset generation and light editing for campaigns.",
    builtinToolsets: { allowed: ["vision_analyze", "image_generate", "text_to_speech"], forbidden: [...NEVER_ALLOWED_BUILTIN] },
    stratxcelTools: { allowed: ["get_brand_context", "create_draft_artifact", "update_mission_progress"], requiresApproval: [] },
    approvalBoundary: "None for generation itself (reversible, no external effect); use of the asset in a published post is gated by content/social's publish approval boundary, not duplicated here.",
    modelTier: "mid",
  },

  operations: minimalSafeDefault("operations", "Internal Stratxcel/agency operations — status rollups, reminders, light scheduling, cron-driven recurring reports."),
};

export function getProfilePolicy(profile: ProfileName): ProfilePolicy {
  return PROFILE_POLICIES[profile];
}

export function isStratxcelToolAllowedForProfile(profile: ProfileName, tool: ToolName): boolean {
  return PROFILE_POLICIES[profile].stratxcelTools.allowed.includes(tool);
}

export function doesStratxcelToolRequireApproval(profile: ProfileName, tool: ToolName): boolean {
  const policy = PROFILE_POLICIES[profile];
  return policy.stratxcelTools.requiresApproval.includes(tool) || STRATXCEL_CONTROLLED_TOOLS.includes(tool);
}

/**
 * `missions.hermes_profile` (set by the compiler from the service
 * catalogue) is the coarser six-value StratExcel-side label
 * (`stratxcel-content`, `stratxcel-admin-growth`, ...), not a Hermes-native
 * profile `hermes --profile <name>` actually runs — this is the lookup
 * docs/hermes/PROFILE_AND_TOOL_POLICY.md's reconciliation section names as
 * "a future integration layer owns." service_key is checked first since
 * it's more precise (e.g. `social_campaign` -> `social`, not the coarser
 * `stratxcel-content` -> `content`); the coarse-label table is the
 * fallback for any service_key this map doesn't yet know about.
 */
const SERVICE_KEY_TO_PROFILE: Record<string, ProfileName> = {
  brand_audit: "research",
  social_campaign: "social",
  content_calendar: "content",
  website_landing_page: "website-development",
  seo_audit: "seo",
  proposal: "proposal",
  report: "research",
  custom_mission: "orchestrator",
};

const COARSE_LABEL_TO_PROFILE: Record<string, ProfileName> = {
  "stratxcel-orchestrator": "orchestrator",
  "stratxcel-research": "research",
  "stratxcel-content": "content",
  "stratxcel-developer": "website-development",
  "stratxcel-seo": "seo",
  "stratxcel-admin-growth": "operations",
};

/** Resolves a mission's Hermes-native profile from its service_key (precise) or hermes_profile coarse label (fallback), defaulting to `orchestrator` — the one profile safe to hand anything unrecognized, since it never executes anything itself. */
export function resolveHermesNativeProfile(mission: { service_key: string | null; hermes_profile: string | null }): ProfileName {
  if (mission.service_key && SERVICE_KEY_TO_PROFILE[mission.service_key]) {
    return SERVICE_KEY_TO_PROFILE[mission.service_key];
  }
  if (mission.hermes_profile && COARSE_LABEL_TO_PROFILE[mission.hermes_profile]) {
    return COARSE_LABEL_TO_PROFILE[mission.hermes_profile];
  }
  return "orchestrator";
}

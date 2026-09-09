import { z } from "zod";
import type { ToolName } from "../types.ts";

/**
 * Runtime schema validation for the 12 tool contracts in contracts.ts.
 * contracts.ts is compile-time-only (a TypeScript interface) — nothing
 * stops a network caller (Hermes, over MCP) from sending whatever shape it
 * wants. These Zod schemas are the actual enforcement point at the MCP
 * network boundary (see apps/hermes-gateway/src/mcp-server.ts), checked
 * BEFORE invokeTool() ever runs. `.strict()` on every object rejects any
 * property not explicitly listed — in particular, a caller cannot smuggle
 * a `tenantId` or `missionId` field into a tool call's business arguments;
 * those come exclusively from the verified mission token, never from here.
 *
 * Kept as one file, one schema per tool name, so it's structurally
 * impossible for a tool to exist in ToolContractMap without a matching
 * runtime schema (or vice versa) without TypeScript noticing — see the
 * exhaustiveness check at the bottom.
 */

const metadataField = z.record(z.string(), z.unknown()).optional();

export const TOOL_INPUT_SCHEMAS = {
  get_brand_context: z.object({}).strict(),
  get_service_definition: z.object({}).strict(),
  create_draft_artifact: z
    .object({
      kind: z.string().min(1),
      storageRef: z.string().min(1),
      metadata: metadataField,
    })
    .strict(),
  update_mission_progress: z
    .object({
      message: z.string().min(1),
      data: metadataField,
    })
    .strict(),
  request_approval: z
    .object({
      kind: z.enum(["content_publish", "spend", "deploy", "other"]),
      subject: z.record(z.string(), z.unknown()),
    })
    .strict(),
  get_approval_status: z
    .object({
      approvalId: z.string().min(1),
    })
    .strict(),
  create_human_handoff: z
    .object({
      reason: z.string().min(1),
      contextSnapshot: z.record(z.string(), z.unknown()),
    })
    .strict(),
  query_publication_status: z
    .object({
      reference: z.string().min(1),
    })
    .strict(),
  // submit_publish_request / create_website_change_request intentionally
  // have NO schema here — they are StratExcel-controlled and never exposed
  // as MCP tools (see STRATXCEL_CONTROLLED_TOOLS in contracts.ts and the
  // hard-coded exclusion in mcp-server.ts's tool registration list, which
  // does not iterate this object for those two names).
  create_crm_lead: z
    .object({
      contactName: z.string().min(1).optional(),
      contactPhone: z.string().min(1).optional(),
      contactEmail: z.string().email().optional(),
      metadata: metadataField,
    })
    .strict(),
  attach_research_evidence: z
    .object({
      artifactId: z.string().min(1),
      sourceUrl: z.string().url().optional(),
      summary: z.string().min(1),
    })
    .strict(),
  check_growth_status: z.object({}).strict(),
  check_website_status: z.object({}).strict(),
  create_website: z
    .object({
      businessName: z.string().optional(),
      purpose: z.string().optional(),
      designPreference: z.string().optional(),
      domain: z.string().optional(),
    })
    .strict(),
  list_leads: z
    .object({
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  get_lead: z
    .object({
      leadId: z.string().min(1),
    })
    .strict(),
  generate_image: z
    .object({
      brief: z.string().min(1),
      aspectRatio: z.string().optional(),
    })
    .strict(),
  check_domain_status: z
    .object({
      domain: z.string().min(1),
    })
    .strict(),
  // Bounds match agent_memories' own real CHECK constraints
  // (agent_memories_memory_key_check / _memory_value_check) exactly, so an
  // over-length value fails here with a clear reason instead of a raw
  // Postgres constraint-violation error.
  remember_company_fact: z
    .object({
      key: z.string().min(1).max(120),
      value: z.string().min(1).max(1200),
      confidence: z.enum(["FACT", "VERIFIED", "OBSERVATION", "INFERENCE", "PREFERENCE", "EXPERIMENT", "UNKNOWN"]).optional(),
    })
    .strict(),
  recall_company_memory: z.object({}).strict(),
  update_lead_status: z
    .object({
      leadId: z.string().min(1),
      status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"]),
    })
    .strict(),
  browser_navigate: z
    .object({
      url: z.string().min(1),
      sessionKey: z.string().optional(),
      timeoutMs: z.number().optional(),
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
    })
    .strict(),
  browser_click: z
    .object({
      selector: z.string().optional(),
      coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
      button: z.enum(["left", "right", "middle"]).optional(),
      clickCount: z.number().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_type: z
    .object({
      selector: z.string().optional(),
      text: z.string().min(1),
      delayMs: z.number().optional(),
      clearExisting: z.boolean().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_key: z
    .object({
      key: z.string().min(1),
      count: z.number().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_scroll: z
    .object({
      direction: z.enum(["up", "down", "top", "bottom"]),
      amount: z.number().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_select: z
    .object({
      selector: z.string().min(1),
      value: z.string(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_wait: z
    .object({
      condition: z.enum(["selector", "navigation", "timeout", "network_idle"]),
      target: z.string().optional(),
      timeoutMs: z.number().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_read: z
    .object({
      selector: z.string().optional(),
      mode: z.enum(["text", "html", "structured"]).optional(),
      maxChars: z.number().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_screenshot: z
    .object({
      fullPage: z.boolean().optional(),
      selector: z.string().optional(),
      quality: z.number().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_upload: z
    .object({
      selector: z.string().min(1),
      fileRef: z.string().min(1),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_download: z
    .object({
      triggerSelector: z.string().min(1),
      destinationPath: z.string().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  browser_tabs: z
    .object({
      action: z.enum(["list", "new", "close", "switch"]),
      tabIndex: z.number().optional(),
      url: z.string().optional(),
      sessionKey: z.string().optional(),
    })
    .strict(),
  computer_open_app: z
    .object({
      appName: z.string().min(1),
      args: z.string().optional(),
    })
    .strict(),
  computer_click: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      selector: z.string().optional(),
      button: z.enum(["left", "right", "middle"]).optional(),
    })
    .strict(),
  computer_type: z
    .object({
      text: z.string().min(1),
    })
    .strict(),
  computer_key: z
    .object({
      key: z.string().min(1),
      modifiers: z.array(z.string()).optional(),
    })
    .strict(),
  computer_screenshot: z
    .object({
      fullScreen: z.boolean().optional(),
    })
    .strict(),
  computer_wait: z
    .object({
      ms: z.number().min(1),
    })
    .strict(),
  discover_capabilities: z
    .object({
      providerFilter: z.string().optional(),
      refresh: z.boolean().optional(),
      liveProbe: z.boolean().optional(),
    })
    .strict(),
  get_capability_status: z
    .object({
      capabilityKey: z.string().min(1),
      connectorKey: z.string().optional(),
    })
    .strict(),
  select_best_resource: z
    .object({
      capabilityKey: z.string().min(1),
      requireAutonomous: z.boolean().optional(),
    })
    .strict(),
  execute_capability: z
    .object({
      capabilityKey: z.string().min(1),
      payload: z.record(z.string(), z.unknown()).optional(),
      connectorKey: z.string().optional(),
    })
    .strict(),
  get_resource_health: z
    .object({
      connectorKey: z.string().min(1),
    })
    .strict(),
} as const satisfies Partial<Record<ToolName, z.ZodTypeAny>>;

/** The exact set of tool names an MCP caller may ever validate/invoke through this map. */
export type McpCallableToolName = keyof typeof TOOL_INPUT_SCHEMAS;

export function isMcpCallableTool(tool: string): tool is McpCallableToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_INPUT_SCHEMAS, tool);
}

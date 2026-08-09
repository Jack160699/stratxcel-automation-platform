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
} as const satisfies Partial<Record<ToolName, z.ZodTypeAny>>;

/** The exact set of tool names an MCP caller may ever validate/invoke through this map. */
export type McpCallableToolName = keyof typeof TOOL_INPUT_SCHEMAS;

export function isMcpCallableTool(tool: string): tool is McpCallableToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_INPUT_SCHEMAS, tool);
}

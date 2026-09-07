import type { ToolName } from "../types.ts";

/**
 * JSON-Schema-shaped `parameters` for each tool in context.ts's
 * DEFAULT_TOOL_ALLOWLIST, for real LLM function-calling (see
 * native-adapter.ts). Hand-kept in sync with tools/schemas.ts's Zod
 * validators — this file only shapes what the MODEL sees when deciding
 * what to call; tools/schemas.ts's TOOL_INPUT_SCHEMAS remains the actual
 * runtime enforcement point at the MCP boundary (apps/hermes-gateway), and
 * apps/hermes-gateway/src/tool-handlers.ts's TOOL_HANDLERS is what actually
 * runs. A drifted description here is a model-usability bug, never a
 * security gap: native-adapter.ts's invokeTool call is exactly the same
 * function the MCP path calls, with exactly the same server-side checks.
 *
 * submit_publish_request / create_website_change_request are intentionally
 * absent — StratExcel-controlled, never offered to Hermes as a callable
 * tool (see STRATXCEL_CONTROLLED_TOOLS in tools/contracts.ts).
 */
export const TOOL_PARAMETER_SCHEMAS: Partial<Record<ToolName, Record<string, unknown>>> = {
  get_brand_context: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  get_service_definition: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  create_draft_artifact: {
    type: "object",
    properties: {
      kind: { type: "string", description: "Artifact kind, e.g. 'research_summary', 'supplier_comparison'." },
      storageRef: { type: "string", description: "Where this artifact's content is stored." },
      metadata: { type: "object", description: "Optional structured metadata." },
    },
    required: ["kind", "storageRef"],
    additionalProperties: false,
  },
  update_mission_progress: {
    type: "object",
    properties: {
      message: { type: "string", description: "Human-readable progress update." },
      data: { type: "object", description: "Optional structured data." },
    },
    required: ["message"],
    additionalProperties: false,
  },
  request_approval: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["content_publish", "spend", "deploy", "other"] },
      subject: { type: "object", description: "What needs approval." },
    },
    required: ["kind", "subject"],
    additionalProperties: false,
  },
  get_approval_status: {
    type: "object",
    properties: {
      approvalId: { type: "string" },
    },
    required: ["approvalId"],
    additionalProperties: false,
  },
  create_human_handoff: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why this mission needs a human." },
      contextSnapshot: { type: "object", description: "Relevant context for the human." },
    },
    required: ["reason", "contextSnapshot"],
    additionalProperties: false,
  },
  query_publication_status: {
    type: "object",
    properties: {
      reference: { type: "string" },
    },
    required: ["reference"],
    additionalProperties: false,
  },
  create_crm_lead: {
    type: "object",
    properties: {
      contactName: { type: "string" },
      contactPhone: { type: "string" },
      contactEmail: { type: "string" },
      metadata: { type: "object" },
    },
    additionalProperties: false,
  },
  attach_research_evidence: {
    type: "object",
    properties: {
      artifactId: { type: "string" },
      sourceUrl: { type: "string" },
      summary: { type: "string" },
    },
    required: ["artifactId", "summary"],
    additionalProperties: false,
  },
  check_growth_status: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  check_website_status: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  list_leads: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Max leads to return, 1-50. Defaults to 20." },
    },
    additionalProperties: false,
  },
  get_lead: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "A real crm_leads id from a prior list_leads or create_crm_lead result." },
    },
    required: ["leadId"],
    additionalProperties: false,
  },
  generate_image: {
    type: "object",
    properties: {
      brief: { type: "string", description: "What the image should show, in enough detail to generate it well." },
      aspectRatio: { type: "string", description: "e.g. 1:1, 4:5, 9:16. Defaults to 1:1." },
    },
    required: ["brief"],
    additionalProperties: false,
  },
  check_domain_status: {
    type: "object",
    properties: {
      domain: { type: "string", description: "The domain to check, e.g. www.example.com. Usually the custom_domain from a prior check_website_status result." },
    },
    required: ["domain"],
    additionalProperties: false,
  },
  remember_company_fact: {
    type: "object",
    properties: {
      key: { type: "string", description: "A short, stable identifier for this fact, e.g. 'verified_supplier_1'. Max 120 chars." },
      value: { type: "string", description: "The real, verified fact itself. Max 1200 chars." },
    },
    required: ["key", "value"],
    additionalProperties: false,
  },
  recall_company_memory: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

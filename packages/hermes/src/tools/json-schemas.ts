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
      value: { type: "string", description: "The fact itself. Max 1200 chars." },
      confidence: {
        type: "string",
        enum: ["FACT", "VERIFIED", "OBSERVATION", "INFERENCE", "PREFERENCE", "EXPERIMENT", "UNKNOWN"],
        description: "How sure this actually is -- never omit this to make a guess look like a verified fact. Defaults to UNKNOWN if omitted.",
      },
    },
    required: ["key", "value"],
    additionalProperties: false,
  },
  recall_company_memory: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  update_lead_status: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "A real crm_leads id from a prior list_leads or get_lead result." },
      status: { type: "string", enum: ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"], description: "The new pipeline status." },
    },
    required: ["leadId", "status"],
    additionalProperties: false,
  },
  browser_navigate: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to navigate the Founder Computer browser to." },
      sessionKey: { type: "string", description: "Optional session key." },
      timeoutMs: { type: "integer", description: "Navigation timeout in milliseconds." },
      waitUntil: { type: "string", enum: ["load", "domcontentloaded", "networkidle"] },
    },
    required: ["url"],
    additionalProperties: false,
  },
  browser_click: {
    type: "object",
    properties: {
      selector: { type: "string", description: "CSS selector of the element to click." },
      coordinates: {
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" } },
        required: ["x", "y"],
      },
      button: { type: "string", enum: ["left", "right", "middle"] },
      clickCount: { type: "integer" },
      sessionKey: { type: "string" },
    },
    additionalProperties: false,
  },
  browser_type: {
    type: "object",
    properties: {
      selector: { type: "string", description: "Target input CSS selector." },
      text: { type: "string", description: "Text content to type. Never use for passwords." },
      delayMs: { type: "integer" },
      clearExisting: { type: "boolean" },
      sessionKey: { type: "string" },
    },
    required: ["text"],
    additionalProperties: false,
  },
  browser_key: {
    type: "object",
    properties: {
      key: { type: "string", description: "Keyboard key to press, e.g. Enter, Tab, Escape." },
      count: { type: "integer" },
      sessionKey: { type: "string" },
    },
    required: ["key"],
    additionalProperties: false,
  },
  browser_scroll: {
    type: "object",
    properties: {
      direction: { type: "string", enum: ["up", "down", "top", "bottom"] },
      amount: { type: "integer" },
      sessionKey: { type: "string" },
    },
    required: ["direction"],
    additionalProperties: false,
  },
  browser_select: {
    type: "object",
    properties: {
      selector: { type: "string", description: "Dropdown selector." },
      value: { type: "string", description: "Option value to select." },
      sessionKey: { type: "string" },
    },
    required: ["selector", "value"],
    additionalProperties: false,
  },
  browser_wait: {
    type: "object",
    properties: {
      condition: { type: "string", enum: ["selector", "navigation", "timeout", "network_idle"] },
      target: { type: "string" },
      timeoutMs: { type: "integer" },
      sessionKey: { type: "string" },
    },
    required: ["condition"],
    additionalProperties: false,
  },
  browser_read: {
    type: "object",
    properties: {
      selector: { type: "string", description: "Optional CSS selector to extract from the page." },
      mode: { type: "string", enum: ["text", "html", "structured"] },
      maxChars: { type: "integer" },
      sessionKey: { type: "string", description: "Optional session key." },
    },
    additionalProperties: false,
  },
  browser_screenshot: {
    type: "object",
    properties: {
      fullPage: { type: "boolean" },
      selector: { type: "string" },
      quality: { type: "integer" },
      sessionKey: { type: "string", description: "Optional session key." },
    },
    additionalProperties: false,
  },
  browser_upload: {
    type: "object",
    properties: {
      selector: { type: "string", description: "File input selector." },
      fileRef: { type: "string", description: "Path or reference to file." },
      sessionKey: { type: "string" },
    },
    required: ["selector", "fileRef"],
    additionalProperties: false,
  },
  browser_download: {
    type: "object",
    properties: {
      triggerSelector: { type: "string", description: "Selector that triggers download." },
      destinationPath: { type: "string" },
      sessionKey: { type: "string" },
    },
    required: ["triggerSelector"],
    additionalProperties: false,
  },
  browser_tabs: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "new", "close", "switch"] },
      tabIndex: { type: "integer" },
      url: { type: "string" },
      sessionKey: { type: "string" },
    },
    required: ["action"],
    additionalProperties: false,
  },
  computer_open_app: {
    type: "object",
    properties: {
      appName: { type: "string" },
      args: { type: "string" },
    },
    required: ["appName"],
    additionalProperties: false,
  },
  computer_click: {
    type: "object",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      selector: { type: "string" },
      button: { type: "string", enum: ["left", "right", "middle"] },
    },
    additionalProperties: false,
  },
  computer_type: {
    type: "object",
    properties: {
      text: { type: "string" },
    },
    required: ["text"],
    additionalProperties: false,
  },
  computer_key: {
    type: "object",
    properties: {
      key: { type: "string" },
      modifiers: { type: "array", items: { type: "string" } },
    },
    required: ["key"],
    additionalProperties: false,
  },
  computer_screenshot: {
    type: "object",
    properties: {
      fullScreen: { type: "boolean" },
    },
    additionalProperties: false,
  },
  computer_wait: {
    type: "object",
    properties: {
      ms: { type: "integer" },
    },
    required: ["ms"],
    additionalProperties: false,
  },
  discover_capabilities: {
    type: "object",
    properties: {
      providerFilter: { type: "string" },
      refresh: { type: "boolean" },
      liveProbe: { type: "boolean", description: "When true, navigates the Founder Browser to each Google service URL and classifies capability state from real DOM (read-only probe, never submits forms)." },
    },
    additionalProperties: false,
  },
  get_capability_status: {
    type: "object",
    properties: {
      capabilityKey: { type: "string" },
      connectorKey: { type: "string" },
    },
    required: ["capabilityKey"],
    additionalProperties: false,
  },
  select_best_resource: {
    type: "object",
    properties: {
      capabilityKey: { type: "string" },
      requireAutonomous: { type: "boolean" },
    },
    required: ["capabilityKey"],
    additionalProperties: false,
  },
  execute_capability: {
    type: "object",
    properties: {
      capabilityKey: { type: "string" },
      payload: { type: "object" },
      connectorKey: { type: "string" },
    },
    required: ["capabilityKey"],
    additionalProperties: false,
  },
  get_resource_health: {
    type: "object",
    properties: {
      connectorKey: { type: "string" },
    },
    required: ["connectorKey"],
    additionalProperties: false,
  },
};

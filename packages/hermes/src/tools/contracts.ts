import type { ToolName } from "../types.ts";

/**
 * Input/output shapes for the 12 restricted tools apps/hermes-gateway
 * exposes. These are contracts (types only, checked by the gateway's
 * request handlers) rather than a runtime schema validator — a follow-up
 * could generate/validate against a JSON Schema derived from these, but
 * for this phase the gateway's own handlers are the enforcement point.
 */
export interface ToolContractMap {
  get_brand_context: {
    input: Record<string, never>;
    output: { brandBrain: Record<string, unknown> | null; brandBrainVersion: number | null };
  };
  get_service_definition: {
    input: Record<string, never>;
    output: { serviceKey: string | null; label: string | null; description: string | null } | null;
  };
  create_draft_artifact: {
    input: { kind: string; storageRef: string; metadata?: Record<string, unknown> };
    output: { artifactId: string };
  };
  update_mission_progress: {
    input: { message: string; data?: Record<string, unknown> };
    output: { recorded: true };
  };
  request_approval: {
    input: { kind: "content_publish" | "spend" | "deploy" | "other"; subject: Record<string, unknown> };
    output: { approvalId: string; status: "PENDING" };
  };
  get_approval_status: {
    input: { approvalId: string };
    output: { status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" };
  };
  create_human_handoff: {
    input: { reason: string; contextSnapshot: Record<string, unknown> };
    output: { handoffId: string };
  };
  query_publication_status: {
    input: { reference: string };
    output: { status: "unknown" };
  };
  submit_publish_request: {
    input: { platform: string; content: Record<string, unknown> };
    output: { requestId: string; status: "requires_approval" };
  };
  create_website_change_request: {
    input: { description: string; changes: Record<string, unknown> };
    output: { requestId: string; status: "requires_approval" };
  };
  create_crm_lead: {
    input: { contactName?: string; contactPhone?: string; contactEmail?: string; metadata?: Record<string, unknown> };
    output: { leadId: string };
  };
  attach_research_evidence: {
    input: { artifactId: string; sourceUrl?: string; summary: string };
    output: { recorded: true };
  };
  check_growth_status: {
    input: Record<string, never>;
    output: {
      projects: unknown[];
      runs: unknown[];
      opportunities: unknown[];
      recommendations: unknown[];
      actions: unknown[];
      snapshots: unknown[];
    };
  };
  check_website_status: {
    input: Record<string, never>;
    output: { sites: unknown[] };
  };
  create_website: {
    input: { businessName?: string; purpose?: string; designPreference?: string; domain?: string };
    output: Record<string, unknown>;
  };
  list_leads: {
    input: { limit?: number };
    output: { leads: unknown[] };
  };
  get_lead: {
    input: { leadId: string };
    output: { found: boolean; lead?: unknown };
  };
  generate_image: {
    input: { brief: string; aspectRatio?: string };
    output: Record<string, unknown>;
  };
  check_domain_status: {
    input: { domain: string };
    output: { domain: string; dns: unknown; vercel: unknown };
  };
  remember_company_fact: {
    input: { key: string; value: string; confidence?: "FACT" | "VERIFIED" | "OBSERVATION" | "INFERENCE" | "PREFERENCE" | "EXPERIMENT" | "UNKNOWN" };
    output: { remembered: true; confidence: string };
  };
  recall_company_memory: {
    input: Record<string, never>;
    output: { memories: unknown[] };
  };
  update_lead_status: {
    input: { leadId: string; status: "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST" };
    output: { updated: boolean; lead?: unknown };
  };
  browser_navigate: {
    input: { url: string; sessionKey?: string; timeoutMs?: number; waitUntil?: "load" | "domcontentloaded" | "networkidle" };
    output: { success: boolean; title?: string; url?: string; jobId?: string };
  };
  browser_click: {
    input: { selector?: string; coordinates?: { x: number; y: number }; button?: "left" | "right" | "middle"; clickCount?: number; sessionKey?: string };
    output: { success: boolean; action: string; selector?: string };
  };
  browser_type: {
    input: { selector?: string; text: string; delayMs?: number; clearExisting?: boolean; sessionKey?: string };
    output: { success: boolean; action: string; typedLength: number };
  };
  browser_key: {
    input: { key: string; count?: number; sessionKey?: string };
    output: { success: boolean; action: string; key: string };
  };
  browser_scroll: {
    input: { direction: "up" | "down" | "top" | "bottom"; amount?: number; sessionKey?: string };
    output: { success: boolean; action: string; direction: string };
  };
  browser_select: {
    input: { selector: string; value: string; sessionKey?: string };
    output: { success: boolean; action: string; value: string };
  };
  browser_wait: {
    input: { condition: "selector" | "navigation" | "timeout" | "network_idle"; target?: string; timeoutMs?: number; sessionKey?: string };
    output: { success: boolean; action: string };
  };
  browser_read: {
    input: { selector?: string; mode?: "text" | "html" | "structured"; maxChars?: number; sessionKey?: string };
    output: { success: boolean; text?: string; totalLength?: number };
  };
  browser_screenshot: {
    input: { fullPage?: boolean; selector?: string; quality?: number; sessionKey?: string };
    output: { success: boolean; screenshotRef?: string; bytes?: number; base64Thumbnail?: string };
  };
  browser_upload: {
    input: { selector: string; fileRef: string; sessionKey?: string };
    output: { success: boolean; action: string; fileRef: string };
  };
  browser_download: {
    input: { triggerSelector: string; destinationPath?: string; sessionKey?: string };
    output: { success: boolean; action: string; filename?: string };
  };
  browser_tabs: {
    input: { action: "list" | "new" | "close" | "switch"; tabIndex?: number; url?: string; sessionKey?: string };
    output: { success: boolean; action: string; tabs?: unknown[]; index?: number };
  };
  computer_open_app: {
    input: { appName: string; args?: string };
    output: { success: boolean; appName: string };
  };
  computer_click: {
    input: { x?: number; y?: number; selector?: string; button?: "left" | "right" | "middle" };
    output: { success: boolean; action: string };
  };
  computer_type: {
    input: { text: string };
    output: { success: boolean; typedLength: number };
  };
  computer_key: {
    input: { key: string; modifiers?: string[] };
    output: { success: boolean; key: string };
  };
  computer_screenshot: {
    input: { fullScreen?: boolean };
    output: { success: boolean; screenshotRef?: string; bytes?: number };
  };
  computer_wait: {
    input: { ms: number };
    output: { success: boolean; ms: number };
  };
  discover_capabilities: {
    input: { providerFilter?: string; refresh?: boolean };
    output: { capabilities: Array<Record<string, unknown>> };
  };
  get_capability_status: {
    input: { capabilityKey: string; connectorKey?: string };
    output: { status: string; capability: Record<string, unknown> | null };
  };
  select_best_resource: {
    input: { capabilityKey: string; requireAutonomous?: boolean };
    output: { selected: Record<string, unknown> | null; alternatives: unknown[]; reason: string };
  };
  execute_capability: {
    input: { capabilityKey: string; payload?: Record<string, unknown>; connectorKey?: string };
    output: Record<string, unknown>;
  };
  get_resource_health: {
    input: { connectorKey: string };
    output: { connectorKey: string; status: string; health: Record<string, unknown> };
  };
}

export const ALL_TOOL_NAMES: ToolName[] = [
  "get_brand_context",
  "get_service_definition",
  "create_draft_artifact",
  "update_mission_progress",
  "request_approval",
  "get_approval_status",
  "create_human_handoff",
  "query_publication_status",
  "submit_publish_request",
  "create_website_change_request",
  "create_crm_lead",
  "attach_research_evidence",
  "check_growth_status",
  "check_website_status",
  "create_website",
  "list_leads",
  "get_lead",
  "generate_image",
  "check_domain_status",
  "remember_company_fact",
  "recall_company_memory",
  "update_lead_status",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_key",
  "browser_scroll",
  "browser_select",
  "browser_wait",
  "browser_read",
  "browser_screenshot",
  "browser_upload",
  "browser_download",
  "browser_tabs",
  "computer_open_app",
  "computer_click",
  "computer_type",
  "computer_key",
  "computer_screenshot",
  "computer_wait",
  "discover_capabilities",
  "get_capability_status",
  "select_best_resource",
  "execute_capability",
  "get_resource_health",
];

/**
 * The two tools this platform's own business rules keep out of Hermes's
 * hands by default (see context.ts's DEFAULT_TOOL_ALLOWLIST) — publishing
 * and website changes stay StratExcel-controlled actions per the master
 * brief, surfaced here as a named constant so the gateway can double-check
 * against it even if a future context-compilation change accidentally
 * widens the default allowlist.
 */
export const STRATXCEL_CONTROLLED_TOOLS: ToolName[] = ["submit_publish_request", "create_website_change_request"];

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

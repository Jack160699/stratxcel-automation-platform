import { createServiceClient as createBrandBrainClient, getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { createServiceClient as createMissionsClient, appendMissionEvent, getServiceCatalogueEntry } from "@stratxcel/missions";
import { createServiceClient as createApprovalsClient, requestApproval, listPendingApprovals } from "@stratxcel/approvals";
import { createServiceClient as createHandoffClient, createHumanHandoff } from "@stratxcel/human-handoff";
import { createServiceClient as createCrmClient, createLead } from "@stratxcel/leads-and-crm";
import { recordAuditEvent, createServiceClient as createAuditClient } from "@stratxcel/audit";
import type { ToolName } from "@stratxcel/hermes";
import { STRATXCEL_CONTROLLED_TOOLS } from "@stratxcel/hermes";

export interface ToolCallContext {
  missionId: string;
  tenantId: string;
  correlationId: string;
}

export class ToolNotAvailableError extends Error {
  constructor(tool: string) {
    super(`Tool '${tool}' is StratExcel-controlled and is not callable by Hermes`);
    this.name = "ToolNotAvailableError";
  }
}

type ToolHandler = (ctx: ToolCallContext, input: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * One handler per restricted tool, each constructing only the package
 * client(s) it needs and scoping every read/write to ctx.tenantId (never
 * trusting an input field for tenant identity — the tenant comes from the
 * verified mission token, not from the request body). submit_publish_request
 * and create_website_change_request are intentionally NOT registered here:
 * calling either throws ToolNotAvailableError regardless of what the
 * token's allowedTools says, a second enforcement layer on top of
 * context.ts's default allowlist already excluding them.
 */
export const TOOL_HANDLERS: Partial<Record<ToolName, ToolHandler>> = {
  async get_brand_context(ctx) {
    const supabase = createBrandBrainClient();
    const current = await getCurrentBrandBrain(supabase, ctx.tenantId);
    return { brandBrain: current?.content ?? null, brandBrainVersion: current?.current_version ?? null };
  },

  async get_service_definition(ctx) {
    const supabase = createMissionsClient();
    const { data: mission } = await supabase.from("missions").select("service_key").eq("id", ctx.missionId).maybeSingle();
    const entry = mission?.service_key ? getServiceCatalogueEntry(mission.service_key) : null;
    if (!entry) return { serviceKey: null, label: null, description: null };
    return { serviceKey: entry.key, label: entry.label, description: entry.description };
  },

  async create_draft_artifact(ctx, input) {
    const supabase = createMissionsClient();
    const { data, error } = await supabase
      .from("mission_artifacts")
      .insert({
        mission_id: ctx.missionId,
        kind: input.kind as string,
        storage_ref: input.storageRef as string,
        metadata: (input.metadata as Record<string, unknown>) ?? {},
      })
      .select("id")
      .single();
    if (error) throw new Error(`create_draft_artifact: ${error.message}`);
    return { artifactId: data.id as string };
  },

  async update_mission_progress(ctx, input) {
    const supabase = createMissionsClient();
    await appendMissionEvent(supabase, {
      missionId: ctx.missionId,
      eventType: "hermes_progress",
      payload: { message: input.message as string, data: input.data ?? {} },
    });
    return { recorded: true };
  },

  async request_approval(ctx, input) {
    const supabase = createApprovalsClient();
    const approval = await requestApproval(supabase, {
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      kind: input.kind as "content_publish" | "spend" | "deploy" | "other",
      subject: (input.subject as Record<string, unknown>) ?? {},
      requestedBy: "hermes",
    });
    return { approvalId: approval.id, status: "PENDING" };
  },

  async get_approval_status(ctx, input) {
    const supabase = createApprovalsClient();
    const pending = await listPendingApprovals(supabase, ctx.tenantId);
    const match = pending.find((a) => a.id === input.approvalId);
    return { status: match ? match.status : "EXPIRED" };
  },

  async create_human_handoff(ctx, input) {
    const supabase = createHandoffClient();
    const handoff = await createHumanHandoff(supabase, {
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      reason: input.reason as string,
      contextSnapshot: (input.contextSnapshot as Record<string, unknown>) ?? {},
    });
    return { handoffId: handoff.id };
  },

  async query_publication_status() {
    // No publishing pipeline is wired to Hermes yet (submit_publish_request
    // is StratExcel-controlled and not registered below) — always
    // "unknown" until that pipeline exists, rather than fabricating a status.
    return { status: "unknown" };
  },

  async create_crm_lead(ctx, input) {
    const supabase = createCrmClient();
    const lead = await createLead(supabase, {
      tenantId: ctx.tenantId,
      source: "manual",
      contactName: input.contactName as string | undefined,
      contactPhone: input.contactPhone as string | undefined,
      contactEmail: input.contactEmail as string | undefined,
      metadata: (input.metadata as Record<string, unknown>) ?? {},
    });
    return { leadId: lead.id };
  },

  async attach_research_evidence(ctx, input) {
    const supabase = createMissionsClient();
    await appendMissionEvent(supabase, {
      missionId: ctx.missionId,
      eventType: "research_evidence",
      payload: { artifactId: input.artifactId, sourceUrl: input.sourceUrl ?? null, summary: input.summary },
    });
    return { recorded: true };
  },
};

export async function invokeTool(tool: ToolName, ctx: ToolCallContext, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (STRATXCEL_CONTROLLED_TOOLS.includes(tool)) throw new ToolNotAvailableError(tool);

  const handler = TOOL_HANDLERS[tool];
  if (!handler) throw new ToolNotAvailableError(tool);

  const result = await handler(ctx, input);

  const auditClient = createAuditClient();
  await recordAuditEvent(auditClient, {
    tenantId: ctx.tenantId,
    actorKind: "hermes",
    action: `hermes.tool_call.${tool}`,
    targetType: "mission",
    targetId: ctx.missionId,
    metadata: { correlationId: ctx.correlationId },
  });

  return result;
}

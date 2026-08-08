import { updateLeadStatus, updateLead, type LeadStatus } from "@stratxcel/leads-and-crm";
import { setConversationAutomationMode, type WhatsAppConversationRow } from "@stratxcel/whatsapp";
import { scheduleFollowUp } from "@stratxcel/whatsapp";
import { requestAppointment } from "@stratxcel/whatsapp";
import { createAndEstimateMission } from "@stratxcel/missions";
import { createHumanHandoff } from "@stratxcel/human-handoff";
import type { AgentTool } from "../contract.ts";

const LEAD_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

type ConversationAutomationMode = WhatsAppConversationRow["automation_mode"];
const CONVERSATION_AUTOMATION_MODES: ConversationAutomationMode[] = ["paused", "automated", "human_only", "handoff"];

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !v) throw new Error(`${key} is required`);
  return v;
}

/**
 * Every mutation tool here wraps an existing, already-implemented repository
 * function (see PHASE 8 in the build brief: "Do not invent backend
 * capabilities that don't exist"). None of these execute() calls do
 * anything the orchestrator/channel policy hasn't already decided is safe to
 * run for this principal+channel (see policy/channel-policy.ts) — this file
 * only implements what the action DOES once policy has cleared it.
 */
export const ADMIN_MUTATION_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "update_lead_status",
      description: "Update a lead's pipeline status.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string" },
          status: { type: "string", enum: LEAD_STATUSES },
        },
        required: ["leadId", "status"],
      },
    },
    mutating: true,
    risk: "low_mutation",
    requiredPermission: "agent:mutate:leads",
    async execute(ctx, args) {
      const leadId = requireString(args, "leadId");
      const status = requireString(args, "status") as LeadStatus;
      if (!LEAD_STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
      const lead = await updateLeadStatus(ctx.supabase, { leadId, status });
      return { lead };
    },
  },
  {
    schema: {
      name: "assign_lead",
      description: "Assign a lead to a staff user.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, leadId: { type: "string" }, assignedTo: { type: "string" } },
        required: ["tenantId", "leadId", "assignedTo"],
      },
    },
    mutating: true,
    risk: "low_mutation",
    requiredPermission: "agent:mutate:leads",
    async execute(ctx, args) {
      const tenantId = requireString(args, "tenantId");
      const leadId = requireString(args, "leadId");
      const assignedTo = requireString(args, "assignedTo");
      const lead = await updateLead(ctx.supabase, { leadId, tenantId, assignedTo });
      return { lead };
    },
  },
  {
    schema: {
      name: "set_conversation_automation_mode",
      description: "Set a WhatsApp conversation's automation mode (paused, automated, human_only, or handoff).",
      parameters: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          conversationId: { type: "string" },
          mode: { type: "string", enum: CONVERSATION_AUTOMATION_MODES },
        },
        required: ["tenantId", "conversationId", "mode"],
      },
    },
    mutating: true,
    risk: "low_mutation",
    requiredPermission: "agent:mutate:conversations",
    async execute(ctx, args) {
      const tenantId = requireString(args, "tenantId");
      const conversationId = requireString(args, "conversationId");
      const modeArg = requireString(args, "mode");
      if (!CONVERSATION_AUTOMATION_MODES.includes(modeArg as ConversationAutomationMode)) {
        throw new Error(`invalid mode: ${modeArg}`);
      }
      const mode = modeArg as ConversationAutomationMode;
      const conversation = await setConversationAutomationMode(ctx.supabase, { tenantId, conversationId, mode });
      return { conversation };
    },
  },
  {
    schema: {
      name: "create_follow_up",
      description: "Schedule a CRM follow-up for a lead.",
      parameters: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          leadId: { type: "string" },
          nextAction: { type: "string" },
          dueAtIso: { type: "string", description: "ISO 8601 datetime" },
        },
        required: ["tenantId", "leadId", "nextAction", "dueAtIso"],
      },
    },
    mutating: true,
    risk: "low_mutation",
    requiredPermission: "agent:mutate:leads",
    async execute(ctx, args) {
      const tenantId = requireString(args, "tenantId");
      const leadId = requireString(args, "leadId");
      const nextAction = requireString(args, "nextAction");
      const dueAt = new Date(requireString(args, "dueAtIso"));
      if (Number.isNaN(dueAt.getTime())) throw new Error("dueAtIso is not a valid date");
      const followUp = await scheduleFollowUp(ctx.supabase, { tenantId, leadId, nextAction, dueAt });
      return { followUp };
    },
  },
  {
    schema: {
      name: "schedule_appointment",
      description: "Request/schedule a CRM appointment for a lead.",
      parameters: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          leadId: { type: "string" },
          requestedForIso: { type: "string", description: "ISO 8601 datetime, optional" },
          notes: { type: "string" },
        },
        required: ["tenantId", "leadId"],
      },
    },
    mutating: true,
    risk: "external_mutation",
    requiredPermission: "agent:mutate:leads",
    async execute(ctx, args) {
      const tenantId = requireString(args, "tenantId");
      const leadId = requireString(args, "leadId");
      const requestedFor = typeof args.requestedForIso === "string" ? new Date(args.requestedForIso) : null;
      const notes = typeof args.notes === "string" ? args.notes : null;
      const appointment = await requestAppointment(ctx.supabase, { tenantId, leadId, requestedFor, notes });
      return { appointment };
    },
  },
  {
    schema: {
      name: "create_mission",
      description: "Compile a goal into a mission and estimate cost.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, goalText: { type: "string" } },
        required: ["tenantId", "goalText"],
      },
    },
    mutating: true,
    risk: "external_mutation",
    requiredPermission: "agent:mutate:missions",
    async execute(ctx, args) {
      const tenantId = requireString(args, "tenantId");
      const goalText = requireString(args, "goalText");
      const mission = await createAndEstimateMission(ctx.supabase, {
        tenantId,
        createdBy: ctx.principal.authUserId,
        goalText,
      });
      return { mission };
    },
  },
  {
    schema: {
      name: "create_handoff",
      description: "Create a human handoff for a tenant/mission.",
      parameters: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          missionId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["tenantId", "reason"],
      },
    },
    mutating: true,
    risk: "low_mutation",
    requiredPermission: "agent:mutate:handoffs",
    async execute(ctx, args) {
      const tenantId = requireString(args, "tenantId");
      const reason = requireString(args, "reason");
      const missionId = typeof args.missionId === "string" ? args.missionId : undefined;
      const handoff = await createHumanHandoff(ctx.supabase, {
        tenantId,
        missionId,
        reason,
        contextSnapshot: { source: "agent_core", channel: ctx.principal.channel },
      });
      return { handoff };
    },
  },
];

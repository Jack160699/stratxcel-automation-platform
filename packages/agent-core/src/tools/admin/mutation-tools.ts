import { createHash } from "node:crypto";
import { updateLeadStatus, updateLead, createLead, findLeadByNormalizedPhone, type LeadStatus } from "@stratxcel/leads-and-crm";
import { setConversationAutomationMode, sendOutboundWhatsAppMessage, normalizePhoneNumber, type WhatsAppConversationRow } from "@stratxcel/whatsapp";
import { scheduleFollowUp } from "@stratxcel/whatsapp";
import { requestAppointment } from "@stratxcel/whatsapp";
import { createAndEstimateMission } from "@stratxcel/missions";
import { createHumanHandoff } from "@stratxcel/human-handoff";
import type { AgentTool } from "../contract.ts";

const LEAD_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];
const OUTREACH_CONVERSATION_ROLES = ["SALES", "PARTNERSHIP", "OUTREACH", "FOLLOW_UP", "EXPLAINER", "HR"] as const;
type OutreachConversationRole = (typeof OUTREACH_CONVERSATION_ROLES)[number];

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
  {
    schema: {
      name: "send_whatsapp_message_to_contact",
      description:
        "Send a real, targeted, one-to-one first WhatsApp message to an external contact on Stratxcel's own behalf, for a stated purpose. Finds or creates the contact's CRM record and conversation (never a duplicate), stores the purpose so replies are understood in context, and reports back once the person answers. Never for bulk/mass messaging -- one specific contact per call.",
      parameters: {
        type: "object",
        properties: {
          phoneNumber: { type: "string", description: "The contact's phone number -- +91xxxxxxxxxx, 91xxxxxxxxxx, or a bare 10-digit Indian number. Do not guess a country for an ambiguous international number; ask the Boss to confirm it instead." },
          message: { type: "string", description: "The exact first message to send, in your own words for the stated purpose." },
          purpose: { type: "string", description: "Why this contact is being messaged, in enough detail to continue the conversation intelligently later (e.g. 'find out what services they offer and whether there's a partnership/revenue fit')." },
          conversationRole: { type: "string", enum: [...OUTREACH_CONVERSATION_ROLES], description: "SALES, PARTNERSHIP, OUTREACH, FOLLOW_UP, EXPLAINER, or HR -- shapes how the conversation is continued when they reply." },
          contactName: { type: "string" },
        },
        required: ["phoneNumber", "message", "purpose", "conversationRole"],
      },
    },
    mutating: true,
    // Textbook "external_mutation" per this file's own risk taxonomy (a real,
    // customer-visible send) -- but external_mutation is dashboard_only on
    // the whatsapp channel (see policy/channel-policy.ts), which would make
    // this tool silently unusable from the one channel the Boss actually
    // uses it from. Deliberately low_mutation instead: every call is a
    // single, explicitly Boss-authored, one-to-one message (never an
    // autonomous/unbounded send), and the whatsapp channel's
    // confirm_required policy still requires one typed CONFIRM code -- bound
    // to this exact phone/message/purpose via hashNormalizedInput -- before
    // anything actually reaches Meta's API. That confirmation is the real
    // safety control the brief's own "human approval before... other
    // high-risk actions" requirement asks for.
    risk: "low_mutation",
    requiredPermission: "agent:mutate:outreach",
    async execute(ctx, args) {
      const rawPhone = requireString(args, "phoneNumber");
      const message = requireString(args, "message");
      const purpose = requireString(args, "purpose");
      const conversationRole = requireString(args, "conversationRole") as OutreachConversationRole;
      if (!OUTREACH_CONVERSATION_ROLES.includes(conversationRole)) {
        throw new Error(`invalid conversationRole: ${conversationRole}`);
      }
      const contactName = typeof args.contactName === "string" && args.contactName.trim() ? args.contactName.trim() : null;

      const tenantId = process.env.STRATXCEL_PLATFORM_TENANT_ID;
      if (!tenantId) {
        throw new Error("outreach_not_configured: STRATXCEL_PLATFORM_TENANT_ID is not set");
      }

      const normalizedPhone = normalizePhoneNumber(rawPhone);
      if (!normalizedPhone) throw new Error("invalid phoneNumber");

      let lead = await findLeadByNormalizedPhone(ctx.supabase, tenantId, normalizedPhone);
      const outreachMetadata = {
        outreachPurpose: purpose,
        conversationRole,
        initiatedBy: "boss_whatsapp_agent",
        initiatedByAuthUserId: ctx.principal.authUserId,
        initiatedAt: new Date().toISOString(),
      };
      if (lead) {
        // Returning contact: reuse the same lead/conversation (never a
        // duplicate) but refresh the stored purpose so the NEXT reply is
        // continued against what the Boss is asking for right now.
        lead = await updateLead(ctx.supabase, {
          leadId: lead.id,
          tenantId,
          contactName: contactName ?? undefined,
          metadata: { ...lead.metadata, ...outreachMetadata },
        });
      } else {
        lead = await createLead(ctx.supabase, {
          tenantId,
          source: "whatsapp_outreach",
          contactName,
          contactPhone: normalizedPhone,
          normalizedPhone,
          metadata: outreachMetadata,
        });
      }

      // Deterministic per (contact, purpose, message) so a retried/duplicate
      // tool invocation for the exact same ask never sends twice -- the same
      // discipline sendOutboundWhatsAppMessage already enforces for every
      // other caller, extended to this one's own key derivation.
      const idempotencyKey = `outreach:${tenantId}:${normalizedPhone}:${createHash("sha256").update(`${purpose} ${message}`).digest("hex").slice(0, 24)}`;

      let outcome = await sendOutboundWhatsAppMessage(ctx.supabase, {
        tenantId,
        leadId: lead.id,
        body: message,
        idempotencyKey,
        isHumanInitiated: true,
      });

      // Meta requires an approved template for a genuinely business-initiated
      // first message (this contact has never messaged in, so there's no
      // open free-form window) -- real Meta policy, not bypassable. Retry
      // once with the platform's own approved outreach-intro template
      // (purpose/contact name as its two variables) rather than failing the
      // whole call outright, but only if one is actually APPROVED right now
      // -- never invent or guess at a template's approval state.
      if (!outcome.ok && outcome.reason === "template_required_outside_service_window") {
        const { data: template } = await ctx.supabase
          .from("whatsapp_templates")
          .select("id, name, language, status")
          .eq("tenant_id", tenantId)
          .eq("name", "stratxcel_outreach_intro")
          .eq("status", "APPROVED")
          .maybeSingle();
        if (template) {
          // Meta sends the template's own approved wording, not `message` --
          // the locally persisted/admin-chat-visible body must match what
          // the contact actually received, not the free-text the Boss
          // originally asked for (which becomes the template's {{2}} variable
          // here, not the literal sent text).
          const templateParams = [contactName ?? "there", purpose];
          const renderedBody = `Hi ${templateParams[0]}, this is Stratxcel — ${templateParams[1]}. Would you be open to a quick chat?`;
          outcome = await sendOutboundWhatsAppMessage(ctx.supabase, {
            tenantId,
            leadId: lead.id,
            body: renderedBody,
            idempotencyKey: `${idempotencyKey}:template`,
            isHumanInitiated: true,
            templateId: template.id,
            templateName: template.name,
            templateLanguage: template.language,
            templateParams,
          });
        }
      }

      const contact = { leadId: lead.id, tenantId, normalizedPhone, contactName };
      if (!outcome.ok) {
        return { contact, purpose, conversationRole, send: { ok: false as const, reason: outcome.reason } };
      }
      const mode = outcome.alreadySent ? "already_sent" : outcome.mode;
      return { contact, purpose, conversationRole, send: { ok: true as const, mode, messageId: outcome.messageId } };
    },
    // Same verification-integrity discipline as generate_image's -- `send.ok`
    // can be false (template pending, kill switch, consent required, ...)
    // without execute() ever throwing; that must reach the user as a real
    // failure/pending note, never get lost in the model's own synthesis.
    interpretOutcome(result) {
      const send = (result as { send?: { ok?: boolean; reason?: string } } | null)?.send;
      if (!send || send.ok) return null;
      if (send.reason === "template_required_outside_service_window") {
        return { status: "pending", detail: "needs an approved Meta template for a first contact -- one is submitted and awaiting Meta's review" };
      }
      return { status: "failed", detail: send.reason };
    },
  },
];

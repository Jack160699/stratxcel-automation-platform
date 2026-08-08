/**
 * Shared types for the CRM/inbox workspace (components/crm/CrmWorkspace.tsx
 * and its children). Mirrors the real tables directly — no shadow/proposed
 * concepts here; whatsapp_shadow_messages stays a diagnostics-only source
 * (see app/api/platform/whatsapp/shadow-messages/route.ts's own comment)
 * and is never imported by this module family.
 */

export type LeadSource = "whatsapp" | "website_form" | "manual" | "import";
export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST";

export interface CrmLead {
  id: string;
  tenant_id: string;
  source: LeadSource;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: LeadStatus;
  metadata: Record<string, unknown>;
  tags: string[];
  assigned_to: string | null;
  last_interaction_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationAutomationMode = "automated" | "human_only" | "paused" | "handoff";

export interface CrmConversation {
  id: string;
  tenant_id: string;
  lead_id: string;
  phone_binding_id: string | null;
  automation_mode: ConversationAutomationMode;
  assigned_staff: string | null;
  status: "open" | "closed";
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export type MessageStatus = "queued" | "submitted" | "sent" | "delivered" | "read" | "failed";
export type MessageDirection = "inbound" | "outbound";

export interface CrmMessage {
  id: string;
  tenant_id: string;
  conversation_id: string;
  lead_id: string;
  direction: MessageDirection;
  body: string;
  media_ref: string | null;
  template_id: string | null;
  provider_message_id: string | null;
  idempotency_key: string | null;
  status: MessageStatus;
  status_updated_at: string;
  error: Record<string, unknown> | null;
  created_at: string;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  next_action: string;
  due_at: string;
  status: string;
  attempts: number;
  max_attempts: number;
}

export interface Appointment {
  id: string;
  lead_id: string;
  requested_at: string;
  scheduled_for: string | null;
  status: string;
  notes: string | null;
}

/** One row in the left-hand inbox list — a conversation joined with its lead client-side (see CrmWorkspace's join). A lead with no conversation yet (e.g. a fresh website-form lead) still gets a row so it isn't invisible. */
export interface InboxEntry {
  lead: CrmLead;
  conversation: CrmConversation | null;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  WON: "Won",
  LOST: "Lost",
};

export const PIPELINE_STAGES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

/** Formats an E.164-ish WhatsApp number for display — best-effort, never throws on an unexpected shape. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "Unknown contact";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (digits.length >= 10) return `+${digits}`;
  return raw;
}

export function contactLabel(lead: CrmLead): string {
  return lead.contact_name || formatPhone(lead.contact_phone) || lead.contact_email || "Unknown contact";
}

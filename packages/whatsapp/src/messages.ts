import type { ServiceClient } from "./db.ts";

export type WhatsAppMessageStatus = "queued" | "submitted" | "sent" | "delivered" | "read" | "failed";
export type WhatsAppMessageDirection = "inbound" | "outbound";

export interface WhatsAppConversationRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  phone_binding_id: string | null;
  automation_mode: "automated" | "human_only" | "paused" | "handoff";
  assigned_staff: string | null;
  status: "open" | "closed";
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessageRow {
  id: string;
  tenant_id: string;
  conversation_id: string;
  lead_id: string;
  direction: WhatsAppMessageDirection;
  body: string;
  media_ref: string | null;
  template_id: string | null;
  provider_message_id: string | null;
  idempotency_key: string | null;
  status: WhatsAppMessageStatus;
  status_updated_at: string;
  error: Record<string, unknown> | null;
  created_at: string;
}

/** Idempotent by provider_message_id (inbound) or idempotency_key (outbound) — see the RPC's own dedupe. */
export async function recordWhatsAppMessage(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    leadId: string;
    phoneBindingId: string | null;
    direction: WhatsAppMessageDirection;
    body: string;
    providerMessageId?: string | null;
    idempotencyKey?: string | null;
    mediaRef?: string | null;
    templateId?: string | null;
    status?: WhatsAppMessageStatus;
  }
): Promise<{ success: boolean; alreadyRecorded?: boolean; messageId?: string; conversationId?: string; reason?: string }> {
  const { data, error } = await supabase.rpc("record_whatsapp_message", {
    p_tenant_id: input.tenantId,
    p_lead_id: input.leadId,
    p_phone_binding_id: input.phoneBindingId,
    p_direction: input.direction,
    p_body: input.body,
    p_provider_message_id: input.providerMessageId ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_media_ref: input.mediaRef ?? null,
    p_template_id: input.templateId ?? null,
    p_status: input.status ?? "queued",
  });
  if (error) throw new Error(`recordWhatsAppMessage: ${error.message}`);
  const result = data as { success: boolean; already_recorded?: boolean; message_id?: string; conversation_id?: string; reason?: string };
  return { success: result.success, alreadyRecorded: result.already_recorded, messageId: result.message_id, conversationId: result.conversation_id, reason: result.reason };
}

/**
 * Strict status transition rules to prevent race conditions and regressions:
 * 1. read: terminal success state, cannot transition to anything.
 * 2. delivered: can only transition to read. DELIVERED CAN NEVER BE OVERWRITTEN BY FAILED!
 * 3. failed: terminal failure, cannot regress to queued, submitted, or sent.
 * 4. queued/submitted/sent: can progress forward or transition to failed.
 */
export function canTransitionWhatsAppStatus(
  currentStatus: WhatsAppMessageStatus,
  newStatus: WhatsAppMessageStatus
): boolean {
  if (currentStatus === newStatus) return false;
  if (currentStatus === "read") return false;
  if (currentStatus === "delivered") {
    return newStatus === "read";
  }
  if (currentStatus === "failed") {
    return newStatus === "delivered" || newStatus === "read";
  }

  const rank: Record<WhatsAppMessageStatus, number> = {
    queued: 0,
    submitted: 1,
    sent: 2,
    delivered: 3,
    read: 4,
    failed: 99,
  };

  if (newStatus === "failed") {
    return currentStatus === "queued" || currentStatus === "submitted" || currentStatus === "sent";
  }

  return (rank[newStatus] ?? 0) > (rank[currentStatus] ?? 0);
}

/** Tolerates out-of-order delivery — enforces strict no-regression status guards and error persistence. */
export async function updateWhatsAppMessageStatus(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    providerMessageId: string;
    status: WhatsAppMessageStatus;
    error?: Record<string, unknown> | null;
  }
): Promise<{ success: boolean; updated?: boolean; reason?: string }> {
  const { data: currentMsg, error: fetchErr } = await supabase
    .from("whatsapp_messages")
    .select("id, status")
    .eq("tenant_id", input.tenantId)
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();

  if (fetchErr) throw new Error(`updateWhatsAppMessageStatus fetch: ${fetchErr.message}`);
  if (!currentMsg) {
    return { success: false, reason: "message_not_found" };
  }

  if (!canTransitionWhatsAppStatus(currentMsg.status as WhatsAppMessageStatus, input.status)) {
    return { success: true, updated: false, reason: "transition_disallowed_or_stale" };
  }

  const updatePayload: Record<string, unknown> = {
    status: input.status,
    status_updated_at: new Date().toISOString(),
  };
  if (input.error !== undefined) {
    updatePayload.error = input.error;
  }

  const { error } = await supabase
    .from("whatsapp_messages")
    .update(updatePayload)
    .eq("id", currentMsg.id);

  if (error) throw new Error(`updateWhatsAppMessageStatus: ${error.message}`);
  return { success: true, updated: true };
}

/**
 * Delivery/read status correlation for WhatsApp Agent replies (see
 * agent_channel_messages, the channel-principal counterpart to
 * whatsapp_messages). Enforces identical strict transition guards.
 */
export async function updateAgentChannelMessageStatus(
  supabase: ServiceClient,
  input: { providerMessageId: string; status: WhatsAppMessageStatus }
): Promise<{ success: boolean; updated?: boolean; reason?: string }> {
  const { data: existing, error: readError } = await supabase
    .from("agent_channel_messages")
    .select("id, status")
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();
  if (readError) throw new Error(`updateAgentChannelMessageStatus: ${readError.message}`);
  if (!existing) return { success: true, updated: false, reason: "not_found" };

  if (!canTransitionWhatsAppStatus(existing.status as WhatsAppMessageStatus, input.status)) {
    return { success: true, updated: false, reason: "stale_or_disallowed_status" };
  }

  const { error: updateError } = await supabase
    .from("agent_channel_messages")
    .update({ status: input.status, status_updated_at: new Date().toISOString() })
    .eq("id", existing.id as string);
  if (updateError) throw new Error(`updateAgentChannelMessageStatus: ${updateError.message}`);
  return { success: true, updated: true };
}

/**
 * Updates audit_delivery_events when a Meta WhatsApp delivery receipt
 * (sent/delivered/read/failed) arrives for an outbound Audit delivery.
 */
export async function updateAuditDeliveryEventStatus(
  supabase: ServiceClient,
  input: { providerMessageId: string; status: WhatsAppMessageStatus }
): Promise<{ success: boolean; updated?: boolean; reason?: string }> {
  const { data: existing, error: readError } = await supabase
    .from("audit_delivery_events")
    .select("id, status")
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();

  if (readError) throw new Error(`updateAuditDeliveryEventStatus: ${readError.message}`);
  if (!existing) return { success: true, updated: false, reason: "not_found" };

  const validStatuses: Record<WhatsAppMessageStatus, string> = {
    queued: "queued",
    submitted: "sending",
    sent: "sent",
    delivered: "delivered",
    read: "delivered",
    failed: "failed",
  };

  const nextStatus = validStatuses[input.status] ?? "delivered";
  if (existing.status === "delivered" && nextStatus === "sent") {
    return { success: true, updated: false, reason: "stale_status" };
  }

  const { error: updateError } = await supabase
    .from("audit_delivery_events")
    .update({
      status: nextStatus,
      detail: `provider_receipt:${input.status}`,
    })
    .eq("id", existing.id as string);

  if (updateError) throw new Error(`updateAuditDeliveryEventStatus: ${updateError.message}`);
  return { success: true, updated: true };
}

export async function listConversationsForTenant(supabase: ServiceClient, tenantId: string, limit = 100): Promise<WhatsAppConversationRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`listConversationsForTenant: ${error.message}`);
  return (data ?? []) as WhatsAppConversationRow[];
}

/** Central Admin CRM's aggregate read -- see listLeadsForTenants. */
export async function listConversationsForTenants(supabase: ServiceClient, tenantIds: string[], limit = 300): Promise<WhatsAppConversationRow[]> {
  if (tenantIds.length === 0) return [];
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .in("tenant_id", tenantIds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`listConversationsForTenants: ${error.message}`);
  return (data ?? []) as WhatsAppConversationRow[];
}

export async function listMessagesForConversation(supabase: ServiceClient, tenantId: string, conversationId: string, limit = 200): Promise<WhatsAppMessageRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listMessagesForConversation: ${error.message}`);
  return (data ?? []) as WhatsAppMessageRow[];
}

export async function setConversationAutomationMode(
  supabase: ServiceClient,
  input: { tenantId: string; conversationId: string; mode: WhatsAppConversationRow["automation_mode"]; assignedStaff?: string | null }
): Promise<WhatsAppConversationRow> {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .update({ automation_mode: input.mode, assigned_staff: input.assignedStaff ?? undefined, updated_at: new Date().toISOString() })
    .eq("id", input.conversationId)
    .eq("tenant_id", input.tenantId)
    .select("*")
    .single();
  if (error) throw new Error(`setConversationAutomationMode: ${error.message}`);
  return data as WhatsAppConversationRow;
}

export async function markConversationRead(supabase: ServiceClient, tenantId: string, conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`markConversationRead: ${error.message}`);
}

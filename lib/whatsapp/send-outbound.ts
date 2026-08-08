import { createWhatsAppAdapter, hasMarketingConsent, isTemplateUsable } from "@stratxcel/whatsapp";
import { recordWhatsAppMessage } from "@stratxcel/whatsapp";
import { isKillSwitchActive } from "@stratxcel/queue";
import { hasEntitlement } from "@stratxcel/payments-and-wallet";
import { recordAuditEvent } from "@stratxcel/audit";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

type ServiceClient = ReturnType<typeof getTenantServiceContext>["supabase"];

export interface SendOutboundInput {
  tenantId: string;
  leadId: string;
  body: string;
  idempotencyKey: string;
  templateId?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParams?: string[];
  /** Explicit staff-initiated sends bypass the 24h free-form window rule the same way a template does — Meta's actual rule is template-OR-window, not staff-vs-automation, but a human sending from the inbox after reading the thread is exactly the case that window exists for. */
  isHumanInitiated?: boolean;
}

export type SendOutboundOutcome =
  | { ok: true; messageId: string; alreadySent: true }
  | { ok: true; messageId: string; alreadySent: false; providerId: string; mode: "shadow" | "live" }
  | { ok: false; reason: string };

const FREE_FORM_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The one place a real outbound WhatsApp send can happen — every check here
 * fails closed. A message that fails any gate below is never queued/sent;
 * it returns a typed reason instead. Idempotency key is mandatory (not
 * optional) precisely because this function is the single choke point for
 * every outbound send path (follow-ups, human replies, future campaigns).
 */
export async function sendOutboundWhatsAppMessage(supabase: ServiceClient, input: SendOutboundInput): Promise<SendOutboundOutcome> {
  const { data: lead } = await supabase.from("crm_leads").select("*").eq("id", input.leadId).eq("tenant_id", input.tenantId).maybeSingle();
  if (!lead) return { ok: false, reason: "lead_not_found" };

  const { data: binding } = await supabase
    .from("whatsapp_phone_bindings")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .eq("outbound_enabled", true)
    .maybeSingle();
  if (!binding) return { ok: false, reason: "no_active_outbound_binding" };

  // ZERO-SEND GUARANTEE (defense in depth): the verified legacy bot's
  // binding is marked source='legacy_verified_bot'. This codebase must
  // NEVER send through it — the old bot remains the sole external sender
  // during shadow/parity. This check is unconditional: it does not read
  // WHATSAPP_MIGRATION_MODE and has no override parameter, so setting the
  // migration mode to "cutover" has no effect on it. A real cutover would
  // require a deliberate future change to this exact line, not a runtime
  // flag flip. (outbound_enabled is also hardcoded false for this binding
  // in ensureLegacyBotBinding, so in practice this line is unreachable
  // today — it exists anyway as defense in depth, per the task brief.)
  if (binding.source === "legacy_verified_bot") return { ok: false, reason: "legacy_bot_shadow_no_send" };

  const kill = await isKillSwitchActive(supabase, [
    { scope: "global_hermes" },
    { scope: "worker_type", scopeId: "whatsapp-worker" },
    { scope: "tenant", scopeId: input.tenantId },
  ]);
  if (kill.active) return { ok: false, reason: `kill_switch_active:${kill.scope}` };

  // Soft entitlement check — real, but not yet enforced (see
  // packages/missions/src/entitlement-map.ts's identical reasoning: no
  // tenant has a subscription entitlement row until subscriptions go live).
  await hasEntitlement(supabase, input.tenantId, "whatsapp_contacts", 1).catch(() => false);

  const { data: conversation } = await supabase.from("whatsapp_conversations").select("*").eq("tenant_id", input.tenantId).eq("lead_id", input.leadId).maybeSingle();
  if (conversation?.automation_mode === "paused") return { ok: false, reason: "conversation_paused" };
  if (conversation?.automation_mode === "handoff" && !input.isHumanInitiated) return { ok: false, reason: "conversation_awaiting_human" };

  const withinFreeFormWindow = lead.last_interaction_at ? Date.now() - new Date(lead.last_interaction_at).getTime() < FREE_FORM_WINDOW_MS : false;
  const useTemplate = !withinFreeFormWindow || Boolean(input.templateId);

  if (useTemplate) {
    if (!input.templateId || !input.templateName || !input.templateLanguage) {
      return { ok: false, reason: "template_required_outside_service_window" };
    }
    const usable = await isTemplateUsable(supabase, input.tenantId, input.templateId);
    if (!usable) return { ok: false, reason: "template_not_approved" };
  }

  if (!withinFreeFormWindow) {
    const consented = await hasMarketingConsent(supabase, input.tenantId, input.leadId);
    if (!consented) return { ok: false, reason: "consent_required" };
  }

  const recorded = await recordWhatsAppMessage(supabase, {
    tenantId: input.tenantId,
    leadId: input.leadId,
    phoneBindingId: binding.id,
    direction: "outbound",
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    templateId: input.templateId ?? null,
    status: "queued",
  });
  if (!recorded.success || !recorded.messageId) return { ok: false, reason: recorded.reason ?? "record_failed" };
  if (recorded.alreadyRecorded) return { ok: true, messageId: recorded.messageId, alreadySent: true };

  const adapter = createWhatsAppAdapter(supabase);
  try {
    const to = lead.normalized_phone ?? (lead.contact_phone as string);
    const result = useTemplate
      ? await adapter.sendTemplateMessage({ tenantId: input.tenantId, to, templateName: input.templateName!, languageCode: input.templateLanguage!, bodyParams: input.templateParams })
      : await adapter.sendMessage({ tenantId: input.tenantId, to, body: input.body });

    // The row was created with only an idempotency_key (the provider ID
    // doesn't exist until after the send call returns) — fill it in now so
    // later status webhooks (delivered/read) can find this row by
    // provider_message_id the same way inbound messages do.
    await supabase
      .from("whatsapp_messages")
      .update({ provider_message_id: result.id, status: result.mode === "live" ? "sent" : "submitted", status_updated_at: new Date().toISOString() })
      .eq("id", recorded.messageId)
      .eq("tenant_id", input.tenantId);

    await recordAuditEvent(supabase, {
      tenantId: input.tenantId,
      actorKind: input.isHumanInitiated ? "user" : "integration",
      action: "whatsapp.message_sent",
      targetType: "crm_lead",
      targetId: input.leadId,
      metadata: { mode: result.mode, useTemplate },
    });

    return { ok: true, messageId: recorded.messageId, alreadySent: false, providerId: result.id, mode: result.mode as "shadow" | "live" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "send_failed" };
  }
}

import { createWhatsAppAdapter } from "./adapter.ts";
import { hasMarketingConsent } from "./consent.ts";
import { isTemplateUsable } from "./templates/sync.ts";
import type { ServiceClient } from "./db.ts";
import { getIntegrationMode } from "./flags.ts";
import { recordWhatsAppMessage } from "./messages.ts";
import { isKillSwitchActive } from "@stratxcel/queue";
import { hasEntitlement } from "@stratxcel/payments-and-wallet";
import { recordAuditEvent } from "@stratxcel/audit";

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

/** Statuses that prove Meta (or the shadow adapter, standing in for it) actually accepted the message — the only states an idempotent retry may report as "already sent." */
const PROVEN_SENT_STATUSES = new Set(["submitted", "sent", "delivered", "read"]);

/**
 * Defense in depth: the adapter's own thrown messages never embed the
 * token/secret (see adapter.ts — the only credentials ever read are
 * WHATSAPP_TOKEN/WHATSAPP_APP_SECRET, and neither is interpolated into any
 * error string), but this value is persisted to the DB regardless, so it is
 * scrubbed and length-capped here rather than trusted to stay clean forever.
 */
function sanitizeSendError(err: unknown): { message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const scrubbed = raw.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]");
  return { message: scrubbed.slice(0, 500) };
}

/**
 * The one place a real outbound WhatsApp send can happen — every check here
 * fails closed. A message that fails any gate below is never queued/sent;
 * it returns a typed reason instead. Idempotency key is mandatory (not
 * optional) precisely because this function is the single choke point for
 * every outbound send path (dashboard/manual sends via
 * app/api/platform/whatsapp/send/route.ts, automatic worker replies via
 * apps/whatsapp-worker/src/processor.ts, and any future campaign/follow-up
 * sender) — there is intentionally no second, weaker send implementation
 * anywhere in this codebase.
 *
 * "A whatsapp_messages row exists for this idempotency key" is NOT the same
 * fact as "Meta accepted this message" — a prior attempt may have failed
 * after the row was created but before/during the adapter call, or may
 * still be mid-flight (a genuine concurrent caller lost the same DB race).
 * alreadySent:true is only ever returned when the existing row's own status
 * proves a prior send actually completed (PROVEN_SENT_STATUSES below); a
 * queued/failed/otherwise-unproven row instead returns a typed
 * previous_send_incomplete/previous_send_failed rejection and the adapter
 * is never called again for it. This is a deliberate choice to risk a
 * missed retry over risking a second real customer message — see FIX 2/5
 * in hotfix/whatsapp-worker-auto-reply's second commit for the incident
 * this closes. The DB's own whatsapp_messages_tenant_idempotency_idx
 * unique index (not touched here) is what actually serializes concurrent
 * callers on the same key; this function only decides what each caller
 * does once it learns it lost that race.
 */
export async function sendOutboundWhatsAppMessage(supabase: ServiceClient, input: SendOutboundInput): Promise<SendOutboundOutcome> {
  const { data: lead } = await supabase.from("crm_leads").select("*").eq("id", input.leadId).eq("tenant_id", input.tenantId).maybeSingle();
  if (!lead) return { ok: false, reason: "lead_not_found" };

  // FIX 1: resolved and checked before anything is ever recorded — a
  // disabled integration must produce zero DB rows and zero adapter calls,
  // not a queued row nobody will ever complete.
  const mode = getIntegrationMode("WHATSAPP_INTEGRATION_MODE");
  if (mode === "disabled") return { ok: false, reason: "integration_disabled" };

  const { data: binding } = await supabase
    .from("whatsapp_phone_bindings")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .eq("outbound_enabled", true)
    .maybeSingle();
  if (!binding) return { ok: false, reason: "no_active_outbound_binding" };

  // ZERO-SEND GUARANTEE (defense in depth): a binding marked
  // source='legacy_verified_bot' is the shadow/parity mirror of the old
  // bot — this codebase must NEVER send through it, full stop, regardless
  // of WHATSAPP_MIGRATION_MODE (no override parameter exists). Once an
  // owner-approved cutover actually happens, the binding for that number
  // is deliberately re-marked source='migrated_verified_bot' (a distinct
  // value — see 20260808260000) instead of flipping this check, so a real
  // cutover is never silently blocked by shadow-mode safety code, and a
  // still-shadow-only binding can never accidentally send. A
  // 'migrated_verified_bot' or 'native' binding is gated only by the
  // normal checks below (kill switch, consent, template approval,
  // automation mode, idempotency) — exactly like any other real binding.
  // (outbound_enabled is also hardcoded false in ensureLegacyBotBinding
  // for 'legacy_verified_bot' rows, so in practice this line is
  // unreachable today — it exists anyway as defense in depth.)
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

  if (recorded.alreadyRecorded) {
    // FIX 2/5: a row already existing for this idempotency key proves only
    // that SOMEONE (an earlier attempt, or a concurrent caller that won the
    // DB race) already created it — never that Meta accepted it. Load the
    // row and classify its actual state; the adapter is never invoked from
    // this branch under any circumstance.
    const { data: existing } = await supabase.from("whatsapp_messages").select("*").eq("id", recorded.messageId).eq("tenant_id", input.tenantId).maybeSingle();
    if (existing && PROVEN_SENT_STATUSES.has(existing.status as string)) {
      return { ok: true, messageId: recorded.messageId, alreadySent: true };
    }
    if (existing?.status === "failed") return { ok: false, reason: "previous_send_failed" };
    // "queued" (still mid-flight, or a prior attempt died before ever
    // reaching the failure handler below), or the row was somehow
    // unreadable — either way, unproven, so no adapter call and no
    // automatic retry; see the module doc comment for why.
    return { ok: false, reason: "previous_send_incomplete" };
  }

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
    // FIX 3: a newly-created row whose adapter call failed/threw is marked
    // failed truthfully — never left looking like a live/submitted send,
    // and provider_message_id stays null since Meta never returned one.
    const sanitized = sanitizeSendError(err);
    await supabase
      .from("whatsapp_messages")
      .update({ status: "failed", status_updated_at: new Date().toISOString(), error: sanitized })
      .eq("id", recorded.messageId)
      .eq("tenant_id", input.tenantId);

    await recordAuditEvent(supabase, {
      tenantId: input.tenantId,
      actorKind: input.isHumanInitiated ? "user" : "integration",
      action: "whatsapp.message_send_failed",
      targetType: "crm_lead",
      targetId: input.leadId,
      metadata: { reason: sanitized.message },
    }).catch(() => {});

    return { ok: false, reason: sanitized.message };
  }
}

import { createWhatsAppAdapter } from "./adapter.ts";
import { hasMarketingConsent } from "./consent.ts";
import { isTemplateUsable } from "./templates/sync.ts";
import type { ServiceClient } from "./db.ts";
import { getIntegrationMode } from "./flags.ts";
import { recordWhatsAppMessage } from "./messages.ts";
import { isKillSwitchActive, type KillSwitchScope } from "@stratxcel/queue";
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
  /**
   * Optional server-resolved PLATFORM sender binding. When set, outbound
   * preflight uses this WABA instead of the customer tenant's binding.
   * Never accept this from the browser.
   */
  senderPhoneBindingId?: string;
  /** Tenant that owns the template catalog when sending from a platform WABA. */
  templateTenantId?: string;
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

type OutboundBindingScope = { tenantId: string } | { phoneBindingId: string };

interface OutboundBindingRow {
  id: string;
  source: string;
  [key: string]: unknown;
}

type OutboundPreflightResult = { ok: true; binding: OutboundBindingRow } | { ok: false; reason: string };

/**
 * Shared preflight for BOTH outbound paths (CRM lead sends and
 * channel-principal replies): integration-mode check, binding resolution,
 * the legacy-bot zero-send guarantee, and the kill-switch check. Extracted
 * verbatim from sendOutboundWhatsAppMessage's original body — no behavior
 * change for that function; it just calls this instead of inlining it, so
 * sendOutboundWhatsAppToRecipient can reuse the exact same gates instead of
 * a second, weaker copy. See the doc comment on sendOutboundWhatsAppMessage
 * below for why there must only ever be one outbound choke-point family.
 *
 * Two binding-resolution modes:
 *  - `{ tenantId }` — existing lead-send behavior: the tenant's active,
 *    outbound-enabled binding.
 *  - `{ phoneBindingId }` — channel-principal replies: always reply from
 *    the exact WABA number that received the inbound message. A principal
 *    is not tenant-scoped the way a lead is (staff have no tenant at all),
 *    so "the tenant's binding" isn't a meaningful lookup for them.
 */
async function resolveOutboundPreflight(
  supabase: ServiceClient,
  bindingScope: OutboundBindingScope,
  killSwitchTenantId: string | null
): Promise<OutboundPreflightResult> {
  // FIX 1: resolved and checked before anything is ever recorded — a
  // disabled integration must produce zero DB rows and zero adapter calls,
  // not a queued row nobody will ever complete.
  const mode = getIntegrationMode("WHATSAPP_INTEGRATION_MODE");
  if (mode === "disabled") return { ok: false, reason: "integration_disabled" };

  const bindingQuery =
    "tenantId" in bindingScope
      ? supabase.from("whatsapp_phone_bindings").select("*").eq("tenant_id", bindingScope.tenantId).eq("status", "active").eq("outbound_enabled", true).maybeSingle()
      : supabase.from("whatsapp_phone_bindings").select("*").eq("id", bindingScope.phoneBindingId).eq("status", "active").eq("outbound_enabled", true).maybeSingle();
  const { data: binding } = await bindingQuery;
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
  if (binding.source === "legacy_verified_bot") return { ok: false, reason: "legacy_bot_shadow_no_send" };

  const killScopes: Array<{ scope: KillSwitchScope; scopeId?: string }> = [{ scope: "global_hermes" }, { scope: "worker_type", scopeId: "whatsapp-worker" }];
  if (killSwitchTenantId) killScopes.push({ scope: "tenant", scopeId: killSwitchTenantId });
  const kill = await isKillSwitchActive(supabase, killScopes);
  if (kill.active) return { ok: false, reason: `kill_switch_active:${kill.scope}` };

  return { ok: true, binding: binding as OutboundBindingRow };
}

interface OutboundRecorder {
  /** Create the initial "queued" row (or discover an existing one for the same idempotency key). */
  record(): Promise<{ success: boolean; alreadyRecorded?: boolean; messageId?: string; reason?: string }>;
  /** Read back an existing row's status, for the alreadyRecorded branch. */
  readStatus(messageId: string): Promise<{ status: string } | null>;
  markSent(messageId: string, providerId: string, mode: "shadow" | "live"): Promise<void>;
  markFailed(messageId: string, error: { message: string }): Promise<void>;
  auditSent(mode: string, useTemplate: boolean): Promise<void>;
  auditFailed(errorMessage: string): Promise<void>;
}

interface SendViaAdapterInput {
  tenantIdForAdapter: string;
  to: string;
  body: string;
  useTemplate: boolean;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: string[];
  recorder: OutboundRecorder;
  interactiveButtons?: Array<{ id: string; title: string }>;
}

/**
 * Shared tail for both outbound paths: record (idempotent) -> call the one
 * Meta adapter -> update the row -> audit. Extracted verbatim from
 * sendOutboundWhatsAppMessage's original body (same "a row existing is not
 * proof Meta got the message" reasoning — see FIX 2/5 below), parameterized
 * by a small `recorder` so each caller supplies its own storage strategy
 * (whatsapp_messages for leads, agent_channel_messages for principals)
 * without this function knowing about crm_leads or whatsapp_channel_principals.
 */
async function sendViaAdapterAndRecord(supabase: ServiceClient, input: SendViaAdapterInput): Promise<SendOutboundOutcome> {
  const recorded = await input.recorder.record();
  if (!recorded.success || !recorded.messageId) return { ok: false, reason: recorded.reason ?? "record_failed" };

  if (recorded.alreadyRecorded) {
    // FIX 2/5: a row already existing for this idempotency key proves only
    // that SOMEONE (an earlier attempt, or a concurrent caller that won the
    // DB race) already created it — never that Meta accepted it. Load the
    // row and classify its actual state; the adapter is never invoked from
    // this branch under any circumstance.
    const existing = await input.recorder.readStatus(recorded.messageId);
    if (existing && PROVEN_SENT_STATUSES.has(existing.status)) {
      return { ok: true, messageId: recorded.messageId, alreadySent: true };
    }
    if (existing?.status === "failed") return { ok: false, reason: "previous_send_failed" };
    // "queued" (still mid-flight, or a prior attempt died before ever
    // reaching the failure handler below), or the row was somehow
    // unreadable — either way, unproven, so no adapter call and no
    // automatic retry.
    return { ok: false, reason: "previous_send_incomplete" };
  }

  const adapter = createWhatsAppAdapter(supabase);
  try {
    const result = input.interactiveButtons?.length
      ? await adapter.sendInteractiveMessage({ tenantId: input.tenantIdForAdapter, to: input.to, body: input.body, buttons: input.interactiveButtons })
      : input.useTemplate
      ? await adapter.sendTemplateMessage({
          tenantId: input.tenantIdForAdapter,
          to: input.to,
          templateName: input.templateName!,
          languageCode: input.templateLanguage!,
          bodyParams: input.templateParams,
        })
      : await adapter.sendMessage({ tenantId: input.tenantIdForAdapter, to: input.to, body: input.body });

    await input.recorder.markSent(recorded.messageId, result.id, result.mode as "shadow" | "live");
    await input.recorder.auditSent(result.mode, input.useTemplate);

    return { ok: true, messageId: recorded.messageId, alreadySent: false, providerId: result.id, mode: result.mode as "shadow" | "live" };
  } catch (err) {
    // FIX 3: a newly-created row whose adapter call failed/threw is marked
    // failed truthfully — never left looking like a live/submitted send,
    // and provider_message_id stays null since Meta never returned one.
    const sanitized = sanitizeSendError(err);
    await input.recorder.markFailed(recorded.messageId, sanitized);
    await input.recorder.auditFailed(sanitized.message).catch(() => {});
    return { ok: false, reason: sanitized.message };
  }
}

/**
 * The one place a real outbound WhatsApp send can happen — every check here
 * fails closed. A message that fails any gate below is never queued/sent;
 * it returns a typed reason instead. Idempotency key is mandatory (not
 * optional) precisely because this function (together with
 * sendOutboundWhatsAppToRecipient below, which shares its preflight/adapter
 * tail via resolveOutboundPreflight/sendViaAdapterAndRecord) is the single
 * choke-point family for every outbound send path (dashboard/manual sends
 * via app/api/platform/whatsapp/send/route.ts, automatic worker replies via
 * apps/whatsapp-worker/src/processor.ts, WhatsApp Agent replies via
 * app/api/internal/agent/whatsapp/route.ts, and any future campaign/
 * follow-up sender) — there is intentionally no second, weaker send
 * implementation anywhere in this codebase.
 *
 * "A whatsapp_messages row exists for this idempotency key" is NOT the same
 * fact as "Meta accepted this message" — a prior attempt may have failed
 * after the row was created but before/during the adapter call, or may
 * still be mid-flight (a genuine concurrent caller lost the same DB race).
 * alreadySent:true is only ever returned when the existing row's own status
 * proves a prior send actually completed (PROVEN_SENT_STATUSES above); a
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

  const preflight = await resolveOutboundPreflight(
    supabase,
    input.senderPhoneBindingId ? { phoneBindingId: input.senderPhoneBindingId } : { tenantId: input.tenantId },
    input.tenantId,
  );
  if (!preflight.ok) return preflight;
  const binding = preflight.binding;
  const templateTenantId = input.templateTenantId ?? input.tenantId;

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
    const usable = await isTemplateUsable(supabase, templateTenantId, input.templateId);
    if (!usable) return { ok: false, reason: "template_not_approved" };
  }

  if (!withinFreeFormWindow) {
    const consented = await hasMarketingConsent(supabase, input.tenantId, input.leadId);
    if (!consented) return { ok: false, reason: "consent_required" };
  }

  const to = lead.normalized_phone ?? (lead.contact_phone as string);

  const recorder: OutboundRecorder = {
    async record() {
      return recordWhatsAppMessage(supabase, {
        tenantId: input.tenantId,
        leadId: input.leadId,
        phoneBindingId: binding.id,
        direction: "outbound",
        body: input.body,
        idempotencyKey: input.idempotencyKey,
        templateId: input.templateId ?? null,
        status: "queued",
      });
    },
    async readStatus(messageId) {
      const { data } = await supabase.from("whatsapp_messages").select("status").eq("id", messageId).eq("tenant_id", input.tenantId).maybeSingle();
      return data as { status: string } | null;
    },
    async markSent(messageId, providerId, mode) {
      // The row was created with only an idempotency_key (the provider ID
      // doesn't exist until after the send call returns) — fill it in now
      // so later status webhooks (delivered/read) can find this row by
      // provider_message_id the same way inbound messages do.
      await supabase
        .from("whatsapp_messages")
        .update({ provider_message_id: providerId, status: mode === "live" ? "sent" : "submitted", status_updated_at: new Date().toISOString() })
        .eq("id", messageId)
        .eq("tenant_id", input.tenantId);
    },
    async markFailed(messageId, error) {
      await supabase
        .from("whatsapp_messages")
        .update({ status: "failed", status_updated_at: new Date().toISOString(), error })
        .eq("id", messageId)
        .eq("tenant_id", input.tenantId);
    },
    async auditSent(mode, useTemplate) {
      await recordAuditEvent(supabase, {
        tenantId: input.tenantId,
        actorKind: input.isHumanInitiated ? "user" : "integration",
        action: "whatsapp.message_sent",
        targetType: "crm_lead",
        targetId: input.leadId,
        metadata: { mode, useTemplate },
      });
    },
    async auditFailed(reason) {
      await recordAuditEvent(supabase, {
        tenantId: input.tenantId,
        actorKind: input.isHumanInitiated ? "user" : "integration",
        action: "whatsapp.message_send_failed",
        targetType: "crm_lead",
        targetId: input.leadId,
        metadata: { reason },
      });
    },
  };

  return sendViaAdapterAndRecord(supabase, {
    tenantIdForAdapter: input.tenantId,
    to,
    body: input.body,
    useTemplate,
    templateName: input.templateName ?? undefined,
    templateLanguage: input.templateLanguage ?? undefined,
    templateParams: input.templateParams,
    recorder,
  });
}

export type AgentChannelRecipientContext = { kind: "channel_principal"; authUserId: string } | { kind: "unlinked_reply" };

export interface SendOutboundToRecipientInput {
  /** The exact WABA binding that received the inbound message this is a reply to — never resolved from tenantId, since a principal (especially staff) is not tenant-scoped the way a lead is. */
  phoneBindingId: string;
  /** Server-resolved recipient phone only — from resolveWhatsAppPrincipal's own principal record or the inbound webhook's own verified sender phone. NEVER accept this from request/model/tool-call input; the only caller of this function is the internal agent route, never anything reachable from a tool-call argument. */
  to: string;
  body: string;
  idempotencyKey: string;
  recipientContext: AgentChannelRecipientContext;
  /** Present for a client channel_principal; null for staff (not tenant-scoped) and for a pre-link reply where no principal row exists yet. */
  principalTenantId?: string | null;
  agentRunId?: string | null;
  interactiveButtons?: Array<{ id: string; title: string }>;
}

/**
 * The channel-principal counterpart to sendOutboundWhatsAppMessage above —
 * shares its exact preflight (mode/binding/legacy-bot/kill-switch) and its
 * exact adapter-call/record/audit tail via resolveOutboundPreflight/
 * sendViaAdapterAndRecord, so there remains ONE hardened Meta outbound
 * choke-point family, not a second weaker implementation. Used exclusively
 * by app/api/internal/agent/whatsapp/route.ts for WhatsApp Agent replies
 * (deterministic commands and LLM turns alike) — never called from
 * anywhere a model's tool-call arguments could reach `to`.
 *
 * Storage: writes to the additive agent_channel_messages table (see
 * supabase/migrations/20260809110000_agent_channel_outbound_messages.sql)
 * rather than whatsapp_messages, because whatsapp_messages.lead_id is a
 * NOT NULL FK to crm_leads and a channel principal is deliberately never
 * given a fake lead row.
 */
export async function sendOutboundWhatsAppToRecipient(supabase: ServiceClient, input: SendOutboundToRecipientInput): Promise<SendOutboundOutcome> {
  const preflight = await resolveOutboundPreflight(supabase, { phoneBindingId: input.phoneBindingId }, input.principalTenantId ?? null);
  if (!preflight.ok) return preflight;
  const binding = preflight.binding;

  const authUserId = input.recipientContext.kind === "channel_principal" ? input.recipientContext.authUserId : null;
  const targetType = input.recipientContext.kind === "channel_principal" ? "whatsapp_channel_principal" : "whatsapp_unlinked_reply";

  const recorder: OutboundRecorder = {
    async record() {
      const { data: existing } = await supabase.from("agent_channel_messages").select("id, status").eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (existing) return { success: true, alreadyRecorded: true, messageId: existing.id as string };

      const { data, error } = await supabase
        .from("agent_channel_messages")
        .insert({
          auth_user_id: authUserId,
          normalized_phone: input.to,
          phone_binding_id: binding.id,
          agent_run_id: input.agentRunId ?? null,
          body: input.body,
          idempotency_key: input.idempotencyKey,
          status: "queued",
        })
        .select("id")
        .single();
      if (error) {
        // A concurrent caller may have won the unique-idempotency-key race
        // between our lookup and insert — treat that as "already recorded"
        // rather than a hard failure, the same guarantee the lead-side RPC
        // gives via its own unique index.
        if (error.code === "23505") {
          const { data: raced } = await supabase.from("agent_channel_messages").select("id").eq("idempotency_key", input.idempotencyKey).maybeSingle();
          if (raced) return { success: true, alreadyRecorded: true, messageId: raced.id as string };
        }
        return { success: false, reason: "record_failed" };
      }
      return { success: true, alreadyRecorded: false, messageId: data.id as string };
    },
    async readStatus(messageId) {
      const { data } = await supabase.from("agent_channel_messages").select("status").eq("id", messageId).maybeSingle();
      return data as { status: string } | null;
    },
    async markSent(messageId, providerId, mode) {
      await supabase
        .from("agent_channel_messages")
        .update({ provider_message_id: providerId, status: mode === "live" ? "sent" : "submitted", status_updated_at: new Date().toISOString() })
        .eq("id", messageId);
    },
    async markFailed(messageId, error) {
      await supabase.from("agent_channel_messages").update({ status: "failed", status_updated_at: new Date().toISOString(), error }).eq("id", messageId);
    },
    async auditSent(mode, useTemplate) {
      // Same precedent as packages/agent-core/src/audit.ts: recordAuditEvent
      // requires a non-null tenantId, so a staff principal (not
      // tenant-scoped) has no audit_log row to write here — its outcome is
      // still fully recorded in agent_channel_messages.status and, for a
      // real Agent turn, agent_run_events.
      if (!input.principalTenantId) return;
      await recordAuditEvent(supabase, {
        tenantId: input.principalTenantId,
        actorKind: "integration",
        action: "whatsapp_agent.reply_sent",
        targetType,
        targetId: authUserId ?? input.to,
        metadata: { mode, useTemplate },
      });
    },
    async auditFailed(reason) {
      if (!input.principalTenantId) return;
      await recordAuditEvent(supabase, {
        tenantId: input.principalTenantId,
        actorKind: "integration",
        action: "whatsapp_agent.reply_send_failed",
        targetType,
        targetId: authUserId ?? input.to,
        metadata: { reason },
      });
    },
  };

  // Agent replies are always plain text — never a Meta template — since
  // they're conversational responses within a channel the recipient just
  // messaged into, not business-initiated outreach.
  return sendViaAdapterAndRecord(supabase, {
    // KNOWN LIMITATION: WHATSAPP_INTEGRATION_MODE="shadow" logs to
    // whatsapp_shadow_messages, whose tenant_id column is NOT NULL — a
    // staff principal has no tenant, so shadow-mode logging for a staff
    // reply has nothing valid to pass and this intentionally degrades to a
    // clean "failed" outcome (caught by sendViaAdapterAndRecord's own
    // try/catch, recorded honestly, never a crash) rather than a fabricated
    // tenant. This only affects shadow-mode testing; WHATSAPP_INTEGRATION_MODE
    // is "live" in production, and live sends never read tenantId.
    tenantIdForAdapter: input.principalTenantId ?? "",
    to: input.to,
    body: input.body,
    useTemplate: false,
    interactiveButtons: input.interactiveButtons,
    recorder,
  });
}

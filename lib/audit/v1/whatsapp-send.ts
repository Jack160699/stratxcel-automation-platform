import { createHash, randomBytes } from "node:crypto";
import {
  listTemplatesForTenant,
  sendOutboundWhatsAppMessage,
  type SendOutboundOutcome,
  type ServiceClient,
} from "@stratxcel/whatsapp";
import { maskWhatsAppNumber } from "./e164.ts";
import {
  destinationHasConsent,
  loadAuditWhatsAppDestination,
} from "./whatsapp-destination.ts";

export type AuditWhatsAppSendStatus =
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "NOT_CONFIGURED"
  | "NO_DESTINATION"
  | "NO_CONSENT";

export interface AuditWhatsAppSendResult {
  status: AuditWhatsAppSendStatus;
  message: string;
  alreadySent?: boolean;
  providerMessageId?: string | null;
  outboundMessageId?: string | null;
  destinationMasked?: string;
  blocker?: string;
}

export const AUDIT_WHATSAPP_IDEMPOTENCY_PREFIX = "audit_report_whatsapp";

export function auditWhatsAppIdempotencyKey(orderId: string, destinationDigits: string): string {
  return `${AUDIT_WHATSAPP_IDEMPOTENCY_PREFIX}:${orderId}:${destinationDigits}`;
}

export function preferredAuditWhatsAppBody(businessName: string | null, reportUrl: string): string {
  const name = (businessName ?? "").trim() || "your business";
  return `Your Stratxcel Business Growth Audit is ready.\n\n${name}\n${reportUrl}`;
}

type SendFn = typeof sendOutboundWhatsAppMessage;

function mapFailureReason(reason: string): { status: AuditWhatsAppSendStatus; message: string; blocker?: string } {
  if (reason === "consent_required") {
    return { status: "NO_CONSENT", message: "WhatsApp consent is required before we can send this Audit." };
  }
  if (
    reason === "integration_disabled" ||
    reason === "no_active_binding" ||
    reason === "legacy_verified_bot" ||
    reason === "kill_switch_active" ||
    reason === "template_required_outside_service_window" ||
    reason === "template_not_approved"
  ) {
    const blocker =
      reason === "template_required_outside_service_window" || reason === "template_not_approved"
        ? "Meta requires an approved WhatsApp template for business-initiated messages outside the 24-hour customer-service window. No usable APPROVED template is available for this workspace."
        : reason === "integration_disabled"
          ? "WhatsApp outbound is not configured for live delivery in this environment."
          : reason === "no_active_binding"
            ? "No active outbound-enabled WhatsApp Business number is bound to this workspace."
            : reason === "legacy_verified_bot"
              ? "This workspace is still on a legacy WhatsApp bot that cannot send customer Audit reports."
              : "WhatsApp sending is paused by a kill switch.";
    return { status: "NOT_CONFIGURED", message: blocker, blocker };
  }
  return { status: "FAILED", message: "WhatsApp could not send this Audit. Please try again later.", blocker: reason };
}

async function findApprovedTemplate(
  supabase: ServiceClient,
  tenantId: string,
): Promise<{ id: string; name: string; language: string } | null> {
  const templates = await listTemplatesForTenant(supabase, tenantId).catch(() => []);
  const approved = templates.filter((row) => row.status === "APPROVED");
  if (approved.length === 0) return null;
  const preferred = ["audit_report_ready", "audit_delivered", "audit_ready"];
  for (const name of preferred) {
    const match = approved.find((row) => row.name === name);
    if (match) return { id: match.id, name: match.name, language: match.language };
  }
  const utility = approved.find((row) => (row.category ?? "").toUpperCase() === "UTILITY");
  const chosen = utility ?? approved[0]!;
  return { id: chosen.id, name: chosen.name, language: chosen.language };
}

async function recordDeliveryEvent(
  supabase: ServiceClient,
  input: {
    auditOrderId: string;
    tenantId: string;
    status: string;
    detail: string;
    providerMessageId?: string | null;
    outboundMessageId?: string | null;
    destinationMasked?: string | null;
  },
): Promise<void> {
  await supabase.from("audit_delivery_events").insert({
    audit_order_id: input.auditOrderId,
    tenant_id: input.tenantId,
    channel: "whatsapp",
    status: input.status,
    detail: input.detail.slice(0, 500),
    provider_message_id: input.providerMessageId ?? null,
    outbound_message_id: input.outboundMessageId ?? null,
    destination_masked: input.destinationMasked ?? null,
  }).select("id").single();
}

async function latestWhatsAppEventStatus(
  supabase: ServiceClient,
  tenantId: string,
  orderId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("audit_delivery_events")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("audit_order_id", orderId)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.status === "string" ? data.status : null;
}

export async function sendAuditReportWhatsApp(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    orderId: string;
    businessName: string | null;
    reportUrl: string;
    qualityOutcome?: string | null;
    sendOutbound?: SendFn;
  },
): Promise<AuditWhatsAppSendResult> {
  const destination = await loadAuditWhatsAppDestination(supabase, input.tenantId);
  if (!destination) {
    await recordDeliveryEvent(supabase, {
      auditOrderId: input.orderId,
      tenantId: input.tenantId,
      status: "no_destination",
      detail: "no_permitted_destination",
    });
    return { status: "NO_DESTINATION", message: "Add your WhatsApp number to receive this Audit." };
  }

  const consented = await destinationHasConsent(supabase, input.tenantId, destination.lead_id, destination);
  if (!consented) {
    await recordDeliveryEvent(supabase, {
      auditOrderId: input.orderId,
      tenantId: input.tenantId,
      status: "no_consent",
      detail: "no_consent",
      destinationMasked: maskWhatsAppNumber(destination.e164),
    });
    return {
      status: "NO_CONSENT",
      message: "Enable WhatsApp consent to send this Audit.",
      destinationMasked: maskWhatsAppNumber(destination.e164),
    };
  }

  if (input.qualityOutcome && input.qualityOutcome !== "PASS") {
    return {
      status: "FAILED",
      message: "This Audit is not a completed PASS report, so it cannot be sent yet.",
      destinationMasked: maskWhatsAppNumber(destination.e164),
      blocker: `quality_outcome:${input.qualityOutcome}`,
    };
  }

  const digits = destination.e164.replace(/^\+/, "");
  const idempotencyKey = auditWhatsAppIdempotencyKey(input.orderId, digits);
  const template = await findApprovedTemplate(supabase, input.tenantId);
  const body = preferredAuditWhatsAppBody(input.businessName, input.reportUrl);
  const send = input.sendOutbound ?? sendOutboundWhatsAppMessage;

  const outcome: SendOutboundOutcome = await send(supabase, {
    tenantId: input.tenantId,
    leadId: destination.lead_id,
    body,
    idempotencyKey,
    templateId: template?.id ?? null,
    templateName: template?.name ?? null,
    templateLanguage: template?.language ?? null,
    templateParams: template ? [input.businessName?.trim() || "your business", input.reportUrl] : undefined,
    isHumanInitiated: true,
  });

  const masked = maskWhatsAppNumber(destination.e164);

  if (!outcome.ok) {
    const mapped = mapFailureReason(outcome.reason);
    await recordDeliveryEvent(supabase, {
      auditOrderId: input.orderId,
      tenantId: input.tenantId,
      status: mapped.status === "NOT_CONFIGURED" ? "not_configured" : mapped.status === "NO_CONSENT" ? "no_consent" : "failed",
      detail: outcome.reason,
      destinationMasked: masked,
    });
    return { ...mapped, destinationMasked: masked };
  }

  if (outcome.alreadySent) {
    const prior = await latestWhatsAppEventStatus(supabase, input.tenantId, input.orderId);
    const status: AuditWhatsAppSendStatus = prior === "delivered" ? "DELIVERED" : "SENT";
    return {
      status,
      message: status === "DELIVERED" ? "Delivered to WhatsApp." : "Already sent to WhatsApp.",
      alreadySent: true,
      outboundMessageId: outcome.messageId,
      destinationMasked: masked,
    };
  }

  const liveAccepted = outcome.mode === "live";
  const providerMessageId = outcome.providerId;
  if (!liveAccepted) {
    await recordDeliveryEvent(supabase, {
      auditOrderId: input.orderId,
      tenantId: input.tenantId,
      status: "not_configured",
      detail: `adapter_mode:${outcome.mode}`,
      providerMessageId,
      outboundMessageId: outcome.messageId,
      destinationMasked: masked,
    });
    return {
      status: "NOT_CONFIGURED",
      message: "WhatsApp outbound is not in live mode, so this Audit was not delivered to the customer number.",
      blocker: `adapter_mode:${outcome.mode}`,
      providerMessageId,
      outboundMessageId: outcome.messageId,
      destinationMasked: masked,
    };
  }

  if (!providerMessageId || providerMessageId === "unknown") {
    await recordDeliveryEvent(supabase, {
      auditOrderId: input.orderId,
      tenantId: input.tenantId,
      status: "failed",
      detail: "missing_provider_message_id",
      outboundMessageId: outcome.messageId,
      destinationMasked: masked,
    });
    return {
      status: "FAILED",
      message: "WhatsApp did not return a provider message ID, so delivery is not confirmed.",
      blocker: "missing_provider_message_id",
      outboundMessageId: outcome.messageId,
      destinationMasked: masked,
    };
  }

  await recordDeliveryEvent(supabase, {
    auditOrderId: input.orderId,
    tenantId: input.tenantId,
    status: "sent",
    detail: "provider_accepted",
    providerMessageId,
    outboundMessageId: outcome.messageId,
    destinationMasked: masked,
  });

  return {
    status: "SENT",
    message: `Sent to ${masked}`,
    alreadySent: false,
    providerMessageId,
    outboundMessageId: outcome.messageId,
    destinationMasked: masked,
  };
}

export function issueAuditShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

export function auditShareUrl(token: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://www.stratxcel.in";
  return `${origin}/audit/share/${token}`;
}

export async function createAuditShareUrl(
  supabase: ServiceClient,
  input: { tenantId: string; orderId: string; userId: string },
): Promise<string> {
  const { token, tokenHash } = issueAuditShareToken();
  await supabase.from("audit_share_tokens").insert({
    audit_order_id: input.orderId,
    tenant_id: input.tenantId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    created_by: input.userId,
  });
  await supabase.from("audit_delivery_events").insert({
    audit_order_id: input.orderId,
    tenant_id: input.tenantId,
    channel: "share",
    status: "sent",
  });
  return auditShareUrl(token);
}

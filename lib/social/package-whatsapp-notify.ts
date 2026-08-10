// Best-effort, compliant-only WhatsApp notifications for Package Autopilot
// events (Section 59 of the release-candidate brief). Never blocks
// publishing, never fakes delivery, never sends outside a compliant
// channel: reuses the SAME hardened outbound choke-point
// (sendOutboundWhatsAppToRecipient) the existing WhatsApp Social Copilot
// bridge uses — no second messaging system. If no compliant delivery path
// is available right now (no recent session activity to safely reply
// within, matching Meta's 24h free-form window; no approved proactive
// template is wired up in this pass), the event is simply recorded as
// "compliant_delivery_unavailable" and nothing is sent.
import type { ServiceClient } from "@stratxcel/whatsapp";
import { sendOutboundWhatsAppToRecipient } from "@stratxcel/whatsapp";

const FREE_FORM_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PackageNotificationEvent = "ready_for_review" | "published" | "failed";

function messageFor(event: PackageNotificationEvent, detail: { platform?: string | null; scheduledAt?: string | null; permalink?: string | null; error?: string | null }): string {
  switch (event) {
    case "ready_for_review":
      return `Your next ${detail.platform ?? "social"} post is ready for review${detail.scheduledAt ? ` — scheduled for ${new Date(detail.scheduledAt).toLocaleString()}` : ""}. Reply in the Copilot to preview, edit, or skip it.`;
    case "published":
      return `Published on ${detail.platform ?? "your account"}${detail.permalink ? `: ${detail.permalink}` : "."}`;
    case "failed":
      return `Couldn't publish your scheduled ${detail.platform ?? "social"} post. ${detail.error ?? "We'll keep the draft available."}`;
  }
}

/**
 * Fire-and-forget — always resolves, never throws, never delays the caller.
 * Only actually sends when there's a genuinely compliant path (an active
 * session-window with this tenant's linked WhatsApp principal); otherwise
 * records the attempt without pretending it was delivered.
 */
export async function notifyPackageEvent(
  service: ServiceClient,
  input: {
    tenantId: string;
    queueItemId: string;
    event: PackageNotificationEvent;
    platform?: string | null;
    scheduledAt?: string | null;
    permalink?: string | null;
    error?: string | null;
  }
): Promise<{ sent: boolean; reason: string }> {
  try {
    const { data: session } = await service
      .from("social_whatsapp_sessions")
      .select("auth_user_id, tenant_id, phone_binding_id, normalized_phone, updated_at")
      .eq("tenant_id", input.tenantId)
      .eq("principal_type", "client")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const withinWindow = session ? Date.now() - new Date(session.updated_at).getTime() <= FREE_FORM_WINDOW_MS : false;
    if (!session || !withinWindow) {
      await recordNotification(service, input, "compliant_delivery_unavailable");
      return { sent: false, reason: "compliant_delivery_unavailable" };
    }

    const body = messageFor(input.event, input);
    const outcome = await sendOutboundWhatsAppToRecipient(service, {
      to: session.normalized_phone,
      phoneBindingId: session.phone_binding_id,
      body,
      idempotencyKey: `package-notify:${input.queueItemId}:${input.event}`,
      recipientContext: { kind: "channel_principal", authUserId: session.auth_user_id },
      principalTenantId: session.tenant_id,
    });
    const sent = outcome.ok === true;
    await recordNotification(service, input, sent ? "sent" : "delivery_failed");
    return { sent, reason: sent ? "sent" : "delivery_failed" };
  } catch {
    // Never let a notification failure surface as a publishing failure.
    await recordNotification(service, input, "notification_error").catch(() => {});
    return { sent: false, reason: "notification_error" };
  }
}

async function recordNotification(
  service: ServiceClient,
  input: { queueItemId: string; event: PackageNotificationEvent },
  status: string
) {
  await service
    .from("social_autopilot_queue_items")
    .update({ last_notification: { event: input.event, status, at: new Date().toISOString() } })
    .eq("id", input.queueItemId)
    .then(
      () => {},
      () => {}
    );
}

import type { ServiceClient } from "../db.ts";
import { loadEmailRuntimeConfig } from "../config.ts";
import { enqueueTransactionalEmail } from "../outbox/enqueue.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import type { EnqueueEmailResult } from "../types.ts";
import { enqueueSupportEscalationEmailBestEffort } from "./support.ts";
import { resolveTenantOwnerEmailForNotify } from "./payments.ts";

export interface AuditNotifyOrder {
  id: string;
  tenant_id: string | null;
  guest_email?: string | null;
  claimed_by?: string | null;
  business_name?: string | null;
  status?: string | null;
}

function appAuditUrl(): string {
  const base = loadEmailRuntimeConfig().appBaseUrl.replace(/\/$/, "");
  return `${base}/app/audit`;
}

export async function resolveAuditCustomerRecipient(
  supabase: ServiceClient,
  order: AuditNotifyOrder
): Promise<{ email: string | null; ownerId: string | null }> {
  if (order.guest_email) {
    return { email: String(order.guest_email), ownerId: order.claimed_by ?? null };
  }
  if (order.tenant_id) {
    return resolveTenantOwnerEmailForNotify(supabase, order.tenant_id);
  }
  return { email: null, ownerId: null };
}

/**
 * Best-effort AUDIT_DELIVERED after authoritative completion RPC success.
 * Must never throw into Audit state machines.
 */
export async function enqueueAuditDeliveredEmail(
  supabase: ServiceClient,
  store: EmailOutboxStore,
  order: AuditNotifyOrder,
  options: { idempotencyKey?: string } = {},
): Promise<EnqueueEmailResult | null> {
  const { email, ownerId } = await resolveAuditCustomerRecipient(supabase, order);
  if (!email) return null;
  const businessName = String(order.business_name ?? "your business");
  return enqueueTransactionalEmail(store, {
    eventType: "AUDIT_DELIVERED",
    recipient: email,
    idempotencyKey: options.idempotencyKey ?? `audit_delivered:${order.id}`,
    tenantId: order.tenant_id,
    ownerId,
    correlationId: order.id,
    payload: {
      businessName,
      auditOrderId: order.id,
      reportUrl: appAuditUrl(),
    },
  });
}

export async function enqueueAuditDeliveredEmailBestEffort(
  supabase: ServiceClient,
  store: EmailOutboxStore | null,
  order: AuditNotifyOrder
): Promise<void> {
  if (!store) return;
  try {
    await enqueueAuditDeliveredEmail(supabase, store, order);
  } catch (err) {
    console.error("[Email Notifications] audit delivered enqueue failed", err instanceof Error ? err.message : err);
  }
}

/**
 * Staff/support notice when automatic Audit cannot be delivered and needs review.
 * Does not change Audit state.
 */
export async function enqueueAuditNeedsSupportEmailBestEffort(
  store: EmailOutboxStore | null,
  input: {
    auditOrderId: string;
    tenantId: string;
    businessName?: string | null;
    reason?: string | null;
  }
): Promise<void> {
  if (!store) return;
  await enqueueSupportEscalationEmailBestEffort(store, {
    handoffId: `audit-review:${input.auditOrderId}`,
    tenantId: input.tenantId,
    tenantLabel: input.businessName ?? input.tenantId,
    issueSummary: `Automatic Audit needs staff review. ${input.reason ?? "Quality or delivery checks did not pass."}`.slice(0, 500),
    priority: "high",
    adminUrl: `${loadEmailRuntimeConfig().appBaseUrl.replace(/\/$/, "")}/admin/audit-requests`,
  });
}

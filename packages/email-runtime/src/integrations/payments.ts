import type { ServiceClient } from "../db.ts";
import { enqueueTransactionalEmail } from "../outbox/enqueue.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import type { EnqueueEmailResult } from "../types.ts";
import { loadEmailRuntimeConfig } from "../config.ts";

function formatInrFromPaise(cents: number): string {
  return (cents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function resolveTenantOwnerEmail(
  supabase: ServiceClient,
  tenantId: string | null | undefined
): Promise<{ email: string | null; ownerId: string | null }> {
  if (!tenantId) return { email: null, ownerId: null };
  const { data: owner } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) return { email: null, ownerId: null };
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
    return { email: userData?.user?.email ?? null, ownerId: owner.user_id };
  } catch {
    return { email: null, ownerId: owner.user_id };
  }
}

async function resolveRecipientForCapturedOrder(
  supabase: ServiceClient,
  order: {
    id: string;
    tenant_id: string | null;
    payment_purpose: string | null;
    provider_payment_id: string | null;
    reference_id: string | null;
  }
): Promise<{ email: string | null; ownerId: string | null }> {
  // Prefer Payment Link customer email (guest audit checkout).
  if (order.provider_payment_id) {
    const { data: link } = await supabase
      .from("payment_links")
      .select("id, customer_email, created_by")
      .eq("provider_payment_id", order.provider_payment_id)
      .maybeSingle();
    if (link?.customer_email) {
      return { email: String(link.customer_email), ownerId: link.created_by ?? null };
    }
    if (link?.id && order.payment_purpose === "audit_fee") {
      const { data: audit } = await supabase
        .from("audit_orders")
        .select("guest_email, claimed_by")
        .eq("payment_link_id", link.id)
        .maybeSingle();
      if (audit?.guest_email) {
        return { email: String(audit.guest_email), ownerId: audit.claimed_by ?? null };
      }
    }
  }

  if (order.reference_id) {
    const { data: linkByRef } = await supabase
      .from("payment_links")
      .select("id, customer_email, created_by")
      .eq("reference_id", order.reference_id)
      .maybeSingle();
    if (linkByRef?.customer_email) {
      return { email: String(linkByRef.customer_email), ownerId: linkByRef.created_by ?? null };
    }
    if (linkByRef?.id && order.payment_purpose === "audit_fee") {
      const { data: audit } = await supabase
        .from("audit_orders")
        .select("guest_email, claimed_by")
        .eq("payment_link_id", linkByRef.id)
        .maybeSingle();
      if (audit?.guest_email) {
        return { email: String(audit.guest_email), ownerId: audit.claimed_by ?? null };
      }
    }
  }

  return resolveTenantOwnerEmail(supabase, order.tenant_id);
}

export interface PaymentEmailHookInput {
  orderId?: string | null;
  purpose?: string | null;
  eventType?: string;
  actionTaken?: string;
  handled?: boolean;
  subscriptionId?: string | null;
  cancelAtCycleEnd?: boolean | null;
}

/**
 * Best-effort transactional emails after authoritative payment/subscription outcomes.
 * Must never throw into payment state machines — callers wrap in try/catch.
 */
export async function enqueuePaymentOutcomeEmails(
  supabase: ServiceClient,
  store: EmailOutboxStore,
  input: PaymentEmailHookInput
): Promise<EnqueueEmailResult[]> {
  const results: EnqueueEmailResult[] = [];
  if (!input.handled) return results;

  if (input.orderId) {
    const { data: order, error } = await supabase
      .from("payment_orders")
      .select(
        "id, tenant_id, payment_purpose, amount_cents, currency, provider_payment_id, state, reference_id, updated_at"
      )
      .eq("id", input.orderId)
      .maybeSingle();

    if (error || !order) return results;

    const state = String(order.state ?? "").toUpperCase();
    if (state !== "CAPTURED") {
      // Authoritative success only — never email on CREATED/AUTHORIZED/FAILED.
      return results;
    }

    const purpose = String(input.purpose ?? order.payment_purpose ?? "");
    const { email, ownerId } = await resolveRecipientForCapturedOrder(supabase, {
      id: order.id,
      tenant_id: order.tenant_id,
      payment_purpose: purpose,
      provider_payment_id: order.provider_payment_id,
      reference_id: order.reference_id,
    });
    if (!email) return results;

    const amountLabel = formatInrFromPaise(Number(order.amount_cents ?? 0));
    const currency = String(order.currency ?? "INR");
    const paymentReference = String(order.provider_payment_id ?? order.id);
    const paidAt = String(order.updated_at ?? new Date().toISOString());

    if (purpose === "audit_fee") {
      results.push(
        await enqueueTransactionalEmail(store, {
          eventType: "AUDIT_PAYMENT_RECEIPT",
          recipient: email,
          idempotencyKey: `audit_receipt:${order.id}`,
          tenantId: order.tenant_id,
          ownerId,
          correlationId: order.id,
          payload: {
            productName: "Stratxcel Business Audit",
            amountLabel,
            currency,
            paymentReference,
            paidAt,
            nextStep: "Complete your audit questionnaire so our team can begin the review.",
          },
        })
      );
    } else if (purpose === "subscription_payment") {
      const planName = "Stratxcel subscription";
      results.push(
        await enqueueTransactionalEmail(store, {
          eventType: "SUBSCRIPTION_PAYMENT_SUCCESS",
          recipient: email,
          idempotencyKey: `sub_pay_ok:${order.id}`,
          tenantId: order.tenant_id,
          ownerId,
          correlationId: order.id,
          payload: {
            planName,
            amountLabel,
            currency,
            paymentReference,
          },
        })
      );
      if (input.actionTaken?.includes("subscription_charge")) {
        results.push(
          await enqueueTransactionalEmail(store, {
            eventType: "SUBSCRIPTION_RENEWED",
            recipient: email,
            idempotencyKey: `sub_renewed:${order.id}`,
            tenantId: order.tenant_id,
            ownerId,
            correlationId: order.id,
            payload: {
              planName,
              subscriptionId: input.subscriptionId ?? order.reference_id ?? order.id,
              periodEnd: paidAt,
            },
          })
        );
      }
    } else {
      results.push(
        await enqueueTransactionalEmail(store, {
          eventType: "INVOICE_OR_RECEIPT_READY",
          recipient: email,
          idempotencyKey: `receipt:${order.id}`,
          tenantId: order.tenant_id,
          ownerId,
          correlationId: order.id,
          payload: {
            documentLabel: "Payment receipt",
            reference: paymentReference,
          },
        })
      );
    }
  }

  if (input.subscriptionId && input.eventType) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, tenant_id, plan_tier, status, cancel_at_period_end, current_period_end")
      .eq("id", input.subscriptionId)
      .maybeSingle();

    if (sub) {
      const { email, ownerId } = await resolveTenantOwnerEmail(supabase, sub.tenant_id);
      if (email) {
        const planName = `Stratxcel ${String(sub.plan_tier ?? "plan")}`;
        if (input.eventType === "subscription.activated" || input.eventType === "subscription.authenticated") {
          results.push(
            await enqueueTransactionalEmail(store, {
              eventType: "SUBSCRIPTION_ACTIVATED",
              recipient: email,
              idempotencyKey: `sub_activated:${sub.id}`,
              tenantId: sub.tenant_id,
              ownerId,
              correlationId: sub.id,
              payload: { planName, subscriptionId: sub.id },
            })
          );
        }
        if (input.eventType === "subscription.cancelled") {
          const scheduled = input.cancelAtCycleEnd === true || sub.cancel_at_period_end === true;
          if (scheduled) {
            results.push(
              await enqueueTransactionalEmail(store, {
                eventType: "SUBSCRIPTION_CANCEL_SCHEDULED",
                recipient: email,
                idempotencyKey: `sub_cancel_sched:${sub.id}`,
                tenantId: sub.tenant_id,
                ownerId,
                correlationId: sub.id,
                payload: {
                  planName,
                  subscriptionId: sub.id,
                  effectiveDate: String(sub.current_period_end ?? "end of current period"),
                },
              })
            );
          } else {
            results.push(
              await enqueueTransactionalEmail(store, {
                eventType: "SUBSCRIPTION_CANCELLED",
                recipient: email,
                idempotencyKey: `sub_cancelled:${sub.id}`,
                tenantId: sub.tenant_id,
                ownerId,
                correlationId: sub.id,
                payload: { planName, subscriptionId: sub.id },
              })
            );
          }
        }
        if (input.eventType === "subscription.halted" || input.eventType === "subscription.pending") {
          results.push(
            await enqueueTransactionalEmail(store, {
              eventType: "SUBSCRIPTION_PAYMENT_FAILED",
              recipient: email,
              idempotencyKey: `sub_pay_fail:${sub.id}:${input.eventType}`,
              tenantId: sub.tenant_id,
              ownerId,
              correlationId: sub.id,
              payload: { planName, subscriptionId: sub.id },
            })
          );
        }
      }
    }
  }

  return results;
}

export async function issueEmailNotificationsBestEffort(
  supabase: ServiceClient,
  store: EmailOutboxStore,
  processResult: PaymentEmailHookInput
): Promise<void> {
  try {
    await enqueuePaymentOutcomeEmails(supabase, store, {
      ...processResult,
      handled: processResult.handled !== false,
    });
  } catch (err) {
    console.error("[Email Notifications] Best-effort enqueue failed", err instanceof Error ? err.message : err);
  }
}

export function appApprovalsUrl(tenantId: string, approvalId: string): string {
  const base = loadEmailRuntimeConfig().appBaseUrl.replace(/\/$/, "");
  return `${base}/app/approvals?tenant=${encodeURIComponent(tenantId)}&approval=${encodeURIComponent(approvalId)}`;
}

export async function resolveTenantOwnerEmailForNotify(
  supabase: ServiceClient,
  tenantId: string
): Promise<{ email: string | null; ownerId: string | null }> {
  return resolveTenantOwnerEmail(supabase, tenantId);
}

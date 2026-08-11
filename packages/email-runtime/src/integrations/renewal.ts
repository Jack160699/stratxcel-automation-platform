import type { ServiceClient } from "../db.ts";
import { enqueueTransactionalEmail } from "../outbox/enqueue.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import type { EnqueueEmailResult } from "../types.ts";
import { resolveTenantOwnerEmailForNotify } from "./payments.ts";

export interface RenewalUpcomingCandidate {
  id: string;
  tenant_id: string;
  plan_tier?: string | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
}

/**
 * Enqueue one upcoming-renewal notice per subscription period.
 * Skips cancel_at_period_end, cancelled/expired/paused, and missing period end.
 */
export async function enqueueSubscriptionRenewalUpcomingEmails(
  supabase: ServiceClient,
  store: EmailOutboxStore,
  candidates: RenewalUpcomingCandidate[]
): Promise<EnqueueEmailResult[]> {
  const results: EnqueueEmailResult[] = [];

  for (const sub of candidates) {
    const status = String(sub.status ?? "").toLowerCase();
    if (["cancelled", "canceled", "expired", "paused", "halted"].includes(status)) {
      continue;
    }
    if (sub.cancel_at_period_end === true) {
      continue;
    }
    if (!sub.current_period_end) {
      continue;
    }

    const { email, ownerId } = await resolveTenantOwnerEmailForNotify(supabase, sub.tenant_id);
    if (!email) continue;

    const planName = `Stratxcel ${String(sub.plan_tier ?? "plan")}`;
    results.push(
      await enqueueTransactionalEmail(store, {
        eventType: "SUBSCRIPTION_RENEWAL_UPCOMING",
        recipient: email,
        idempotencyKey: `sub_renew_upcoming:${sub.id}:${sub.current_period_end}`,
        tenantId: sub.tenant_id,
        ownerId,
        correlationId: sub.id,
        payload: {
          planName,
          renewalDate: String(sub.current_period_end),
          subscriptionId: sub.id,
        },
      })
    );
  }

  return results;
}

export async function enqueueSubscriptionRenewalUpcomingEmailsBestEffort(
  supabase: ServiceClient,
  store: EmailOutboxStore,
  candidates: RenewalUpcomingCandidate[]
): Promise<void> {
  try {
    await enqueueSubscriptionRenewalUpcomingEmails(supabase, store, candidates);
  } catch (err) {
    console.error(
      "[Email Notifications] renewal-upcoming enqueue failed",
      err instanceof Error ? err.message : err
    );
  }
}

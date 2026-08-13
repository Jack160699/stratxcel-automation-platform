import type { ServiceClient } from "../db.ts";
import { enqueueTransactionalEmail } from "../outbox/enqueue.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import type { EnqueueEmailResult } from "../types.ts";
import { resolveTenantOwnerEmailForNotify } from "./payments.ts";

/** Default upcoming-renewal reminder window (matches renew cron look-ahead). */
export const SUBSCRIPTION_RENEWAL_UPCOMING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface RenewalUpcomingCandidate {
  id: string;
  tenant_id: string;
  plan_tier?: string | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
}

/**
 * Upcoming-renewal email eligibility (stricter than payment-link processing candidates).
 * Requires: active, not cancel_at_period_end, period end in the future and within window.
 * Excludes past_due / cancelled / expired / paused / halted / already-ended periods.
 */
export function isEligibleForSubscriptionRenewalUpcomingEmail(
  sub: RenewalUpcomingCandidate,
  now: Date = new Date(),
  windowMs: number = SUBSCRIPTION_RENEWAL_UPCOMING_WINDOW_MS
): boolean {
  if (String(sub.status ?? "").toLowerCase() !== "active") return false;
  if (sub.cancel_at_period_end === true) return false;
  if (!sub.current_period_end) return false;
  const endMs = new Date(sub.current_period_end).getTime();
  if (!Number.isFinite(endMs)) return false;
  const nowMs = now.getTime();
  if (endMs <= nowMs) return false;
  if (endMs > nowMs + windowMs) return false;
  return true;
}

export function filterSubscriptionRenewalUpcomingEmailCandidates(
  candidates: RenewalUpcomingCandidate[],
  now: Date = new Date(),
  windowMs: number = SUBSCRIPTION_RENEWAL_UPCOMING_WINDOW_MS
): RenewalUpcomingCandidate[] {
  return candidates.filter((sub) => isEligibleForSubscriptionRenewalUpcomingEmail(sub, now, windowMs));
}

/**
 * Enqueue one upcoming-renewal notice per subscription period for eligible rows only.
 */
export async function enqueueSubscriptionRenewalUpcomingEmails(
  supabase: ServiceClient,
  store: EmailOutboxStore,
  candidates: RenewalUpcomingCandidate[],
  options: { now?: Date; windowMs?: number } = {}
): Promise<EnqueueEmailResult[]> {
  const results: EnqueueEmailResult[] = [];
  const eligible = filterSubscriptionRenewalUpcomingEmailCandidates(
    candidates,
    options.now ?? new Date(),
    options.windowMs ?? SUBSCRIPTION_RENEWAL_UPCOMING_WINDOW_MS
  );

  for (const sub of eligible) {
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
  candidates: RenewalUpcomingCandidate[],
  options: { now?: Date; windowMs?: number } = {}
): Promise<void> {
  try {
    await enqueueSubscriptionRenewalUpcomingEmails(supabase, store, candidates, options);
  } catch (err) {
    console.error(
      "[Email Notifications] renewal-upcoming enqueue failed",
      err instanceof Error ? err.message : err
    );
  }
}

import type { CustomerPlanSummary } from "./customer-plan.ts";
import type { PlanTier } from "@stratxcel/payments-and-wallet";

export type SubscriptionStatus = "NONE" | "ACTIVE" | "PAST_DUE" | "CANCELING" | "CANCELED";
export type PlanTierKey = "NONE" | "FREE" | "STARTER" | "GROWTH" | "BUSINESS" | "SCALE";

export interface GlobalCustomerState {
  subscriptionStatus: SubscriptionStatus;
  plan: PlanTierKey;
  planName: string;
  isSubscribed: boolean;
  walletBalanceCents: number;
  activeMissionsCount: number;
  runningServicesCount: number;
  auditStatus: "NONE" | "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED";
  connectedSourcesCount: number;
  monthlyUsagePercent: number;
  monthlyLimit: number;
  nextBillingDate: string | null;
}

export function mapPlanTierToKey(tier: PlanTier | string | null | undefined): PlanTierKey {
  if (!tier) return "NONE";
  const normalized = tier.toLowerCase();
  if (normalized === "free") return "FREE";
  if (normalized === "starter") return "STARTER";
  if (normalized === "growth") return "GROWTH";
  if (normalized === "business") return "BUSINESS";
  if (normalized === "scale") return "SCALE";
  return "NONE";
}

export function deriveGlobalCustomerState(params: {
  planSummary: CustomerPlanSummary;
  walletBalanceCents?: number;
  activeMissionsCount?: number;
  runningServicesCount?: number;
  auditStatus?: string | null;
  hasReportData?: boolean;
  connectedSourcesCount?: number;
  monthlyUsagePercent?: number;
  monthlyLimit?: number;
}): GlobalCustomerState {
  const isSubscribed = params.planSummary.activePaid;
  const statusUpper = (params.planSummary.status || "").toUpperCase();

  let subscriptionStatus: SubscriptionStatus = "NONE";
  if (isSubscribed) {
    if (statusUpper.includes("PAST_DUE") || statusUpper.includes("PAYMENT ISSUE")) {
      subscriptionStatus = "PAST_DUE";
    } else if (statusUpper.includes("CANCELING")) {
      subscriptionStatus = "CANCELING";
    } else {
      subscriptionStatus = "ACTIVE";
    }
  } else {
    if (statusUpper.includes("CANCELED") || statusUpper.includes("CANCELLED")) {
      subscriptionStatus = "CANCELED";
    } else {
      subscriptionStatus = "NONE";
    }
  }

  let auditStatus: GlobalCustomerState["auditStatus"] = "NONE";
  const rawAudit = (params.auditStatus || "").toLowerCase();
  if (params.hasReportData || rawAudit === "completed" || rawAudit === "delivered") {
    auditStatus = "COMPLETE";
  } else if (rawAudit === "queued" || rawAudit === "pending") {
    auditStatus = "QUEUED";
  } else if (rawAudit === "processing" || rawAudit === "running") {
    auditStatus = "RUNNING";
  } else if (rawAudit === "failed" || rawAudit === "error") {
    auditStatus = "FAILED";
  }

  return {
    subscriptionStatus,
    plan: isSubscribed ? mapPlanTierToKey(params.planSummary.tier) : "NONE",
    planName: isSubscribed ? params.planSummary.name : "Free",
    isSubscribed,
    walletBalanceCents: isSubscribed ? (params.walletBalanceCents ?? 0) : 0,
    activeMissionsCount: isSubscribed ? (params.activeMissionsCount ?? 0) : 0,
    runningServicesCount: isSubscribed ? (params.runningServicesCount ?? 0) : 0,
    auditStatus,
    connectedSourcesCount: params.connectedSourcesCount ?? 0,
    monthlyUsagePercent: isSubscribed ? (params.monthlyUsagePercent ?? 0) : 0,
    monthlyLimit: isSubscribed ? (params.monthlyLimit ?? 100) : 0,
    nextBillingDate: isSubscribed ? params.planSummary.nextRenewalAt : null,
  };
}

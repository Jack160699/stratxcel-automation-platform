import type {
  AdsPublishGateCode,
  AdsPublishGateResult,
  CampaignPlan,
  PaidAcquisitionReadiness,
} from "./types.ts";

export interface AdsExecutionGateInput {
  tenantId: string;
  expectedTenantId: string;
  campaignPlan?: CampaignPlan | null;
  readiness?: PaidAcquisitionReadiness | null;
  adAccountConnected?: boolean;
  entitlementRemaining?: number;
  planApproved?: boolean;
  spendAuthorized?: boolean;
  creativeApproved?: boolean;
  killSwitchEngaged?: boolean;
  providerReady?: boolean;
  budgetRemainingCents?: number;
}

/** Always DENIED for production mutations in this workstream. */
export function evaluateAdsPublishGates(input: AdsExecutionGateInput): AdsPublishGateResult {
  const failed: AdsPublishGateCode[] = [];
  const reasons: string[] = [];

  if (!input.tenantId || input.tenantId !== input.expectedTenantId) {
    failed.push("tenant");
    reasons.push("Tenant isolation check failed");
  }
  if (!input.adAccountConnected) {
    failed.push("account");
    reasons.push("No connected ad account");
  }
  if ((input.entitlementRemaining ?? 0) <= 0) {
    failed.push("entitlement");
    reasons.push("meta_ad_campaigns entitlement missing or exhausted");
  }
  if (!input.planApproved) {
    failed.push("approval");
    reasons.push("Campaign plan not approved");
  }
  if (!input.spendAuthorized) {
    failed.push("spend_authorization");
    reasons.push("Spend authorization not granted");
  }
  if ((input.budgetRemainingCents ?? 0) <= 0) {
    failed.push("budget");
    reasons.push("No remaining budget within envelope");
  }
  if (input.killSwitchEngaged === true) {
    failed.push("kill_switch");
    reasons.push("Kill switch engaged");
  }
  if (!input.providerReady) {
    failed.push("provider_readiness");
    reasons.push("Ads Marketing API provider not ready (planning-only surface)");
  }
  if (
    !input.readiness ||
    input.readiness.status === "NOT_READY" ||
    input.readiness.status === "SETUP_REQUIRED"
  ) {
    failed.push("readiness");
    reasons.push("Paid acquisition readiness blocks execution");
  }
  if (!input.creativeApproved) {
    failed.push("creative_ready");
    reasons.push("Creative not approved");
  }
  if (!input.campaignPlan) {
    failed.push("plan_approved");
    reasons.push("Campaign plan missing");
  }
  if (input.campaignPlan && input.campaignPlan.tenantId !== input.expectedTenantId) {
    if (!failed.includes("tenant")) failed.push("tenant");
    reasons.push("Campaign plan tenant mismatch");
  }

  reasons.push(
    "Acquisition department workstream forbids production campaign launch and ad spend mutation",
  );

  return {
    allowed: false,
    decision: "DENIED",
    failedGates: [...new Set(failed)],
    reasons,
    productionMutations: "NONE",
  };
}

export function refuseAdSpendMutation(): never {
  throw new Error("ad_spend_mutation_forbidden");
}

export function refuseAdAccountBillingMutation(): never {
  throw new Error("ad_account_billing_mutation_forbidden");
}

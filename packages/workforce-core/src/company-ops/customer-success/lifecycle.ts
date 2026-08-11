import { evaluateEntitlementHealth, isPlanExhausted } from "../finance/entitlement-health.ts";
import { buildOffboardingWorkflow } from "../offboarding/workflow.ts";
import { buildOnboardingReadiness } from "./readiness.ts";
import type {
  CompanyOpsContext,
  CustomerLifecycleIntelligence,
  CustomerNextAction,
  CustomerSuccessAlert,
  RenewalReadiness,
} from "../types.ts";

function buildAlerts(ctx: CompanyOpsContext): CustomerSuccessAlert[] {
  const alerts: CustomerSuccessAlert[] = [];

  if (!ctx.brandBrainComplete) {
    alerts.push({
      code: "BRAND_BRAIN_INCOMPLETE",
      severity: "warning",
      message: "Brand Brain is incomplete — customer must finish business context setup.",
    });
  }

  if (ctx.purchasedServices.includes("social_package") && ctx.integrations.social !== true) {
    alerts.push({
      code: "INSTAGRAM_DISCONNECTED",
      severity: "warning",
      message: "Social integration disconnected or missing for purchased social package.",
    });
  }

  if (ctx.approvalsWaiting > 0) {
    alerts.push({
      code: "APPROVAL_WAITING",
      severity: "warning",
      message: `${ctx.approvalsWaiting} approval(s) waiting on the customer.`,
    });
  }

  const health = evaluateEntitlementHealth(ctx.entitlementSnapshot, ctx.paymentState);
  if (health.some((h) => h.health === "LOW_REMAINING")) {
    alerts.push({
      code: "PACKAGE_NEARLY_EXHAUSTED",
      severity: "warning",
      message: "Package entitlement nearly exhausted.",
    });
  }

  if (ctx.paymentState === "failed" || ctx.paymentState === "past_due") {
    alerts.push({
      code: "PAYMENT_RECOVERY_REQUIRED",
      severity: "critical",
      message: "Payment recovery required — automation may be paused.",
    });
  }

  const blocked = ctx.missions.filter((m) =>
    m.stages.some((s) => s.state === "WAITING_CAPABILITY" || Boolean(s.blockedCapability)),
  );
  if (blocked.length > 0) {
    alerts.push({
      code: "MISSION_BLOCKED_CAPABILITY",
      severity: "warning",
      message: `${blocked.length} mission(s) blocked on unavailable capability.`,
    });
  }

  if (ctx.unresolvedHandoffs > 0) {
    alerts.push({
      code: "HUMAN_HANDOFF_REQUIRED",
      severity: "warning",
      message: `${ctx.unresolvedHandoffs} unresolved human handoff(s).`,
    });
  }

  if (ctx.openCustomerQuestions > 0) {
    alerts.push({
      code: "CUSTOMER_QUESTION_OPEN",
      severity: "info",
      message: `${ctx.openCustomerQuestions} open customer question(s).`,
    });
  }

  if (ctx.lifecyclePhase === "renewal") {
    alerts.push({
      code: "RENEWAL_SOON",
      severity: "info",
      message: "Renewal window — confirm package fit and remaining entitlements.",
    });
  }

  return alerts;
}

function pickNextAction(ctx: CompanyOpsContext, alerts: readonly CustomerSuccessAlert[]): CustomerNextAction {
  const ranked: CustomerNextAction[] = [];

  if (alerts.some((a) => a.code === "PAYMENT_RECOVERY_REQUIRED")) {
    ranked.push({
      kind: "resolve_payment",
      title: "Resolve payment",
      detail: "Update billing so purchased services can resume safely.",
      priority: 10,
    });
  }
  if (alerts.some((a) => a.code === "BRAND_BRAIN_INCOMPLETE")) {
    ranked.push({
      kind: "complete_brand_brain",
      title: "Complete Brand Brain",
      detail: "Finish business context so specialists can plan accurately.",
      priority: 9,
    });
  }
  if (alerts.some((a) => a.code === "INSTAGRAM_DISCONNECTED")) {
    ranked.push({
      kind: "connect_integration",
      title: "Connect social integration",
      detail: "Reconnect Instagram/Facebook for the purchased social package.",
      priority: 8,
    });
  }
  if (alerts.some((a) => a.code === "APPROVAL_WAITING")) {
    ranked.push({
      kind: "approve_waiting",
      title: "Review waiting approvals",
      detail: "Approve or reject pending publish/deploy/spend items.",
      priority: 7,
    });
  }
  if (alerts.some((a) => a.code === "HUMAN_HANDOFF_REQUIRED")) {
    ranked.push({
      kind: "resolve_handoff",
      title: "Respond to human handoff",
      detail: "A specialist handed off a decision that needs the customer.",
      priority: 6,
    });
  }
  if (alerts.some((a) => a.code === "MISSION_BLOCKED_CAPABILITY")) {
    ranked.push({
      kind: "review_blocked_mission",
      title: "Review blocked mission",
      detail: "A mission is waiting on a capability — expect NEEDS_ATTENTION, not fake success.",
      priority: 5,
    });
  }
  if (alerts.some((a) => a.code === "CUSTOMER_QUESTION_OPEN")) {
    ranked.push({
      kind: "answer_question",
      title: "Answer open questions",
      detail: "Respond to questions blocking plan progress.",
      priority: 4,
    });
  }
  if (alerts.some((a) => a.code === "PACKAGE_NEARLY_EXHAUSTED" || a.code === "RENEWAL_SOON")) {
    ranked.push({
      kind: "renew_package",
      title: "Review renewal options",
      detail: "Package usage is high or renewal is approaching.",
      priority: 3,
    });
  }
  if (ctx.lifecyclePhase === "onboarding") {
    ranked.push({
      kind: "finish_onboarding",
      title: "Finish onboarding",
      detail: "Complete remaining setup steps for purchased services only.",
      priority: 2,
    });
  }

  ranked.sort((a, b) => b.priority - a.priority);
  return (
    ranked[0] ?? {
      kind: "none",
      title: "No action needed",
      detail: "Account is healthy for purchased services.",
      priority: 0,
    }
  );
}

function buildRenewal(ctx: CompanyOpsContext): RenewalReadiness {
  if (ctx.lifecyclePhase === "churned" || ctx.lifecyclePhase === "offboarding") {
    return {
      status: "NOT_APPLICABLE",
      reasons: ["Account is offboarding or churned"],
      recommendedAction: null,
    };
  }
  const health = evaluateEntitlementHealth(ctx.entitlementSnapshot, ctx.paymentState);
  const reasons: string[] = [];
  if (ctx.paymentState !== "current") reasons.push("payment_not_current");
  if (isPlanExhausted(health)) reasons.push("plan_exhausted");
  if (health.some((h) => h.health === "LOW_REMAINING")) reasons.push("low_remaining");
  if (ctx.unresolvedHandoffs > 0) reasons.push("open_handoffs");

  if (reasons.includes("payment_not_current") || reasons.includes("plan_exhausted")) {
    return {
      status: "ACTION_REQUIRED",
      reasons,
      recommendedAction: "Resolve billing / renew package before next cycle",
    };
  }
  if (reasons.length > 0 || ctx.lifecyclePhase === "at_risk" || ctx.lifecyclePhase === "renewal") {
    return {
      status: "AT_RISK",
      reasons: reasons.length ? reasons : ["renewal_window"],
      recommendedAction: "Confirm package fit and remaining entitlements",
    };
  }
  return { status: "READY", reasons: [], recommendedAction: null };
}

export function buildCustomerLifecycleIntelligence(
  ctx: CompanyOpsContext,
): CustomerLifecycleIntelligence {
  const readiness = buildOnboardingReadiness(ctx);
  const alerts = buildAlerts(ctx);
  const nextAction = pickNextAction(ctx, alerts);
  const health = evaluateEntitlementHealth(ctx.entitlementSnapshot, ctx.paymentState);
  const blockedMissions = ctx.missions.filter((m) =>
    m.status === "NEEDS_ATTENTION" ||
    m.stages.some((s) =>
      s.state === "WAITING_CAPABILITY" ||
      s.state === "WAITING_APPROVAL" ||
      s.state === "FAILED",
    ),
  ).length;

  const usageParts = health.map((h) => {
    if (h.limit == null) return `${h.metric}:${h.health}`;
    return `${h.metric}:${h.used ?? 0}/${h.limit} (${h.health})`;
  });

  return {
    tenantId: ctx.tenantId,
    phase: ctx.lifecyclePhase,
    readiness,
    nextAction,
    alerts,
    renewal: buildRenewal(ctx),
    blockedMissions,
    entitlementUsageSummary: usageParts.join("; ") || "no_tracked_usage",
  };
}

/** Convenience: build safe offboarding for CS flows (no destructive auto-delete). */
export function startCustomerOffboarding(
  tenantId: string,
  trigger: "subscription_ending" | "customer_leaving" | "data_export_request" | "data_deletion_request",
) {
  return buildOffboardingWorkflow({ tenantId, trigger });
}

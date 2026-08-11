import type { OffboardingStep, OffboardingTrigger, OffboardingWorkflow } from "../types.ts";

/**
 * Safe offboarding workflow. Destructive deletion is NEVER auto-executed.
 */
export function buildOffboardingWorkflow(input: {
  tenantId: string;
  trigger: OffboardingTrigger;
}): OffboardingWorkflow {
  const steps: OffboardingStep[] = [
    {
      id: "pause_automation",
      label: "Pause automation",
      status: "READY",
      destructive: false,
      detail: "Stop new mission starts and specialist runs for this tenant.",
    },
    {
      id: "stop_scheduled_external",
      label: "Stop scheduled external actions",
      status: "READY",
      destructive: false,
      detail: "Cancel pending social publishes, WhatsApp sends, ads, and website deploys.",
    },
    {
      id: "surface_subscription_end",
      label: "Record subscription ending",
      status: input.trigger === "subscription_ending" || input.trigger === "customer_leaving" ? "READY" : "PENDING",
      destructive: false,
      detail: "Mark subscription/lifecycle state; do not charge.",
    },
  ];

  if (input.trigger === "data_export_request") {
    steps.push({
      id: "export_handoff",
      label: "Data export handoff",
      status: "HANDED_OFF",
      destructive: false,
      detail: "Hand off export fulfillment to human ops — no automated bulk dump of secrets.",
    });
  }

  if (input.trigger === "data_deletion_request" || input.trigger === "customer_leaving") {
    steps.push({
      id: "deletion_handoff",
      label: "Data deletion request handoff",
      status: "HANDED_OFF",
      destructive: true,
      detail: "Destructive deletion requires human approval and compliance review. Not auto-executed.",
    });
  }

  return {
    tenantId: input.tenantId,
    trigger: input.trigger,
    steps,
    automationPaused: true,
    scheduledExternalActionsStopped: true,
    deletionAuthority: "HUMAN_HANDOFF_ONLY",
  };
}

export function assertNoCasualDestructiveDeletion(workflow: OffboardingWorkflow): void {
  const destructive = workflow.steps.filter((s) => s.destructive);
  for (const step of destructive) {
    if (step.status === "COMPLETED") {
      throw new Error("destructive_deletion_must_not_auto_complete");
    }
  }
  if (workflow.deletionAuthority !== "HUMAN_HANDOFF_ONLY") {
    throw new Error("invalid_deletion_authority");
  }
}

/**
 * check_autonomy_decision: a real, read-only advisory consult of the new
 * autonomy decision layer (packages/workforce-core/src/autonomy/decision.ts)
 * against a real capability from the static workforce registry
 * (getCapability, listCapabilities -- same registry check_workforce_registry
 * already reads). Answers "what governance level would this action need --
 * AUTO, a lightweight LOW_RISK_APPROVAL, full OWNER_APPROVAL, or BLOCKED --
 * and why", using the capability's real, already-modeled riskLevel/
 * approvalRequired/externalMutation, combined with the caller's stated
 * confidence/reversibility/cost for the specific proposed action.
 *
 * This is a policy consult, not a live readiness check: it does not resolve
 * entitlements, integrations, or kill-switch state for a specific tenant
 * (that is resolveCapabilityReadiness's job -- check_capabilities already
 * exposes that). `executable` here reflects only the capability's own
 * static implementation status (AVAILABLE vs PLANNED/NOT_CONFIGURED/
 * UNAVAILABLE) via isStaticallyNonExecutable. Never executes anything and
 * never bypasses the real CONFIRM flow -- purely advisory, exactly as
 * decision.ts's own module doc states.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { getCapability, listCapabilities, isStaticallyNonExecutable, decideAutonomyLevel } from "@stratxcel/workforce-core";

export const AUTONOMY_DECISION_TOOL: AgentTool = {
  schema: {
    name: "check_autonomy_decision",
    description:
      "Real autonomy policy consult: given a real capability key and a stated confidence/reversibility/cost for a specific proposed action, returns whether it should run AUTO, need a lightweight LOW_RISK_APPROVAL, need full OWNER_APPROVAL, or is BLOCKED -- with the exact reason. Never executes anything and never skips the real confirmation flow; this is advisory only. Use for 'would you need my approval for this', 'what autonomy level does this action need', 'can this run automatically'.",
    parameters: {
      type: "object",
      properties: {
        capabilityKey: { type: "string", description: "A real capability key from the workforce registry (see check_workforce_registry). Required." },
        confidence: { type: "string", enum: ["low", "medium", "high"], description: "How confident you are this specific action is correct. Defaults to 'medium' if omitted." },
        reversible: { type: "boolean", description: "Can this specific action's effects be undone without lasting harm? Defaults to false (fail closed) if omitted." },
        estimatedCostCents: { type: "number", description: "Optional real cost estimate in INR cents for this specific action." },
        autoCostCeilingCents: { type: "number", description: "Optional real auto-approval cost ceiling to compare against. Omit if none is known -- cost then never blocks AUTO on its own." },
      },
      required: ["capabilityKey"],
    },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:capabilities",
  async execute(_ctx, args) {
    const capabilityKey = typeof args.capabilityKey === "string" ? args.capabilityKey : "";
    const def = getCapability(capabilityKey);
    if (!def) {
      return {
        found: false,
        reason: "unknown_capability",
        knownCapabilityKeys: listCapabilities().map((c) => c.key),
      };
    }

    const confidence = args.confidence === "low" || args.confidence === "high" ? args.confidence : "medium";
    const reversible = args.reversible === true;
    const estimatedCostCents = typeof args.estimatedCostCents === "number" ? args.estimatedCostCents : undefined;
    const autoCostCeilingCents = typeof args.autoCostCeilingCents === "number" ? args.autoCostCeilingCents : undefined;

    const notExecutable = isStaticallyNonExecutable(capabilityKey);

    const decision = decideAutonomyLevel({
      executable: !notExecutable,
      notExecutableReason: notExecutable ? `capability status is ${def.status}` : undefined,
      riskLevel: def.riskLevel,
      approvalRequired: def.approvalRequired,
      externalMutation: def.externalMutation,
      confidence,
      reversible,
      estimatedCostCents,
      autoCostCeilingCents,
    });

    return {
      capabilityKey,
      capabilityLabel: def.label,
      capabilityStatus: def.status,
      inputs: { confidence, reversible, estimatedCostCents: estimatedCostCents ?? null, autoCostCeilingCents: autoCostCeilingCents ?? null },
      decision,
    };
  },
};

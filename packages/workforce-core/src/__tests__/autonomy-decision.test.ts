// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/autonomy-decision.test.ts
import assert from "node:assert/strict";
import { decideAutonomyLevel, INTERVENTION_LEVELS } from "../autonomy/decision.ts";

function base() {
  return {
    executable: true,
    riskLevel: "low" as const,
    approvalRequired: false,
    externalMutation: false,
    confidence: "high" as const,
    reversible: true,
  };
}

function run() {
  // Not executable always wins -> BLOCKED, regardless of every other factor being favorable.
  {
    const d = decideAutonomyLevel({ ...base(), executable: false, notExecutableReason: "entitlement_exhausted" });
    assert.equal(d.level, "BLOCKED");
    assert.equal(d.reasonCode, "NOT_EXECUTABLE");
    assert.match(d.humanReason, /entitlement_exhausted/);
  }

  // Critical risk always wins over favorable confidence/reversibility/cost.
  {
    const d = decideAutonomyLevel({ ...base(), riskLevel: "critical" });
    assert.equal(d.level, "OWNER_APPROVAL");
    assert.equal(d.reasonCode, "CRITICAL_RISK");
  }

  // Irreversible -> OWNER_APPROVAL even at low risk and high confidence.
  {
    const d = decideAutonomyLevel({ ...base(), reversible: false });
    assert.equal(d.level, "OWNER_APPROVAL");
    assert.equal(d.reasonCode, "IRREVERSIBLE");
  }

  // Low confidence -> OWNER_APPROVAL even at low risk and reversible.
  {
    const d = decideAutonomyLevel({ ...base(), confidence: "low" });
    assert.equal(d.level, "OWNER_APPROVAL");
    assert.equal(d.reasonCode, "LOW_CONFIDENCE");
  }

  // High risk -> OWNER_APPROVAL.
  {
    const d = decideAutonomyLevel({ ...base(), riskLevel: "high" });
    assert.equal(d.level, "OWNER_APPROVAL");
    assert.equal(d.reasonCode, "HIGH_RISK");
  }

  // Static capability-level approvalRequired -> OWNER_APPROVAL even at low risk.
  {
    const d = decideAutonomyLevel({ ...base(), approvalRequired: true });
    assert.equal(d.level, "OWNER_APPROVAL");
    assert.equal(d.reasonCode, "CAPABILITY_APPROVAL_REQUIRED");
  }

  // Cost over a real caller-supplied ceiling -> LOW_RISK_APPROVAL, not OWNER_APPROVAL or AUTO.
  {
    const d = decideAutonomyLevel({ ...base(), estimatedCostCents: 5000, autoCostCeilingCents: 1000 });
    assert.equal(d.level, "LOW_RISK_APPROVAL");
    assert.equal(d.reasonCode, "COST_EXCEEDS_AUTO_CEILING");
  }

  // Cost within the ceiling does not block AUTO.
  {
    const d = decideAutonomyLevel({ ...base(), estimatedCostCents: 500, autoCostCeilingCents: 1000 });
    assert.equal(d.level, "AUTO");
  }

  // No ceiling supplied at all -> cost never blocks (this module has no opinion on money policy it wasn't given).
  {
    const d = decideAutonomyLevel({ ...base(), estimatedCostCents: 999999 });
    assert.equal(d.level, "AUTO");
  }

  // External mutation -> LOW_RISK_APPROVAL even at low risk, reversible, high confidence.
  {
    const d = decideAutonomyLevel({ ...base(), externalMutation: true });
    assert.equal(d.level, "LOW_RISK_APPROVAL");
    assert.equal(d.reasonCode, "EXTERNAL_MUTATION_OR_MEDIUM_RISK");
  }

  // Medium risk alone -> LOW_RISK_APPROVAL.
  {
    const d = decideAutonomyLevel({ ...base(), riskLevel: "medium" });
    assert.equal(d.level, "LOW_RISK_APPROVAL");
    assert.equal(d.reasonCode, "EXTERNAL_MUTATION_OR_MEDIUM_RISK");
  }

  // Everything favorable -> AUTO, the only path that reaches it.
  {
    const d = decideAutonomyLevel(base());
    assert.equal(d.level, "AUTO");
    assert.equal(d.reasonCode, "READY_FOR_AUTO");
  }

  // Every returned level is one of the four canonical values -- no silent fifth state.
  for (const lvl of INTERVENTION_LEVELS) {
    assert.ok(["AUTO", "LOW_RISK_APPROVAL", "OWNER_APPROVAL", "BLOCKED"].includes(lvl));
  }

  console.log("autonomy-decision.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();

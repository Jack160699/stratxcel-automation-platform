import type { MissionRow } from "@stratxcel/missions";

export interface HermesExecutionResult {
  outcome: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED" | "AWAITING_INPUT" | "AWAITING_APPROVAL" | "HUMAN_HANDOFF" | "BLOCKED";
  summary: string;
}

/**
 * The master brief's HermesRuntimeAdapter/AgentRuntimeAdapter contract,
 * scoped down to what this worker needs: hand a RUNNING mission to Hermes,
 * get back a terminal-or-waiting outcome. Real Hermes integration (signed
 * server-to-server auth, idempotent mission creation, event streaming,
 * cancellation) is master-brief Phase 6 — deliberately not built here.
 */
export interface HermesRuntimeAdapter {
  execute(mission: MissionRow): Promise<HermesExecutionResult>;
}

export class HermesNotIntegratedError extends Error {
  constructor() {
    super("Hermes runtime adapter is not implemented yet (master brief Phase 6) — missions cannot execute past QUEUED");
    this.name = "HermesNotIntegratedError";
  }
}

/**
 * Placeholder adapter so the polling loop's shape (fetch QUEUED -> RUNNING
 * -> execute -> apply outcome) is real and testable now, without pretending
 * mission execution actually works. Every mission it "executes" moves to
 * BLOCKED with a clear reason, rather than silently completing or hanging.
 */
export function createNotIntegratedHermesAdapter(): HermesRuntimeAdapter {
  return {
    async execute(): Promise<HermesExecutionResult> {
      return { outcome: "BLOCKED", summary: new HermesNotIntegratedError().message };
    },
  };
}

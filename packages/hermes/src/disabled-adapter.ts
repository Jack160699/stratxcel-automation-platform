import type { HermesRuntimeAdapter } from "./adapter.ts";
import type { HermesExecutionResult } from "./types.ts";

export class HermesNotIntegratedError extends Error {
  constructor() {
    super("Hermes is disabled (HERMES_MODE is unset or 'disabled') — missions cannot execute past QUEUED");
    this.name = "HermesNotIntegratedError";
  }
}

/**
 * The safe default: every mission it "executes" moves to BLOCKED with a
 * clear reason rather than hanging or silently completing. This is what
 * mission-worker uses whenever HERMES_MODE is unset, missing, or anything
 * other than 'mock'/'http' — a typo in the env var fails toward "nothing
 * runs" rather than toward an unintended live call.
 */
export function createDisabledHermesAdapter(): HermesRuntimeAdapter {
  return {
    mode: "disabled",
    async execute(): Promise<HermesExecutionResult> {
      return { outcome: "BLOCKED", summary: new HermesNotIntegratedError().message };
    },
    async cancel(): Promise<void> {
      // Nothing is ever running under the disabled adapter.
    },
    async healthCheck() {
      return { healthy: false, mode: "disabled", details: "Hermes integration is disabled" };
    },
  };
}

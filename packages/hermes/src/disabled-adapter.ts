import { RunStatusResponse, RuntimeHealth, type SubmitMissionResponse } from "@stratxcel/hermes-contract";
import type { AgentRuntimeAdapter } from "./adapter.ts";

export class HermesNotIntegratedError extends Error {
  constructor() {
    super("Hermes is disabled (HERMES_MODE is unset or 'disabled') — missions cannot execute past QUEUED");
    this.name = "HermesNotIntegratedError";
  }
}

/**
 * The safe default: every call fails loudly and immediately rather than
 * hanging or silently pretending to work. This is what mission-worker uses
 * whenever HERMES_MODE is unset, missing, or anything other than
 * 'mock'/'http' — a typo in the env var fails toward "nothing runs" rather
 * than toward an unintended live call.
 */
export function createDisabledHermesAdapter(): AgentRuntimeAdapter {
  const fail = (): never => {
    throw new HermesNotIntegratedError();
  };
  return {
    mode: "disabled",
    async submitMission(): Promise<SubmitMissionResponse> {
      return fail();
    },
    async getRun(): Promise<RunStatusResponse> {
      return fail();
    },
    async streamEvents(): Promise<void> {
      return fail();
    },
    async stopRun(): Promise<void> {
      return fail();
    },
    async resolveApproval(): Promise<void> {
      return fail();
    },
    async getCapabilities() {
      return fail();
    },
    async getModels() {
      return fail();
    },
    async getTranscriptBackfill() {
      return null;
    },
    async healthCheck() {
      return RuntimeHealth.parse({
        status: "down",
        checkedAt: new Date().toISOString(),
        details: "Hermes integration is disabled",
      });
    },
  };
}

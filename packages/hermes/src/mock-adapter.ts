import type { HermesRuntimeAdapter } from "./adapter.ts";
import type { HermesExecutionResult, HermesProgressEvent } from "./types.ts";

/**
 * Deterministic fake execution — no network call, no real AI work.
 * Produces a believable progress-event sequence and a COMPLETED outcome
 * for any mission whose service was recognized by the compiler
 * (context.serviceKey !== 'custom_mission'), and PARTIALLY_COMPLETED
 * otherwise (mirroring "we don't fully know what to do with this yet").
 * Exists specifically for automated preview demonstrations and local
 * development of the mission pipeline without a real Hermes instance
 * running — never used for anything a customer would treat as real work.
 */
export function createMockHermesAdapter(): HermesRuntimeAdapter {
  return {
    mode: "mock",
    async execute(_mission, context): Promise<HermesExecutionResult> {
      const now = () => new Date().toISOString();
      const progressEvents: HermesProgressEvent[] = [
        { atIso: now(), message: `Mock Hermes run started for service '${context.serviceKey ?? "unknown"}'` },
        { atIso: now(), message: "Loaded Brand Brain context", data: { brandBrainVersion: context.brandBrainVersion } },
        { atIso: now(), message: "Drafted output artifact (mock)" },
      ];

      if (!context.serviceKey || context.serviceKey === "custom_mission") {
        return {
          outcome: "PARTIALLY_COMPLETED",
          summary: "Mock Hermes could not classify this goal into a known service — partial completion only.",
          progressEvents,
        };
      }

      return {
        outcome: "COMPLETED",
        summary: `Mock Hermes completed a simulated '${context.serviceKey}' run.`,
        progressEvents,
      };
    },
    async cancel(): Promise<void> {
      // Mock runs complete synchronously within execute() — nothing to cancel.
    },
    async healthCheck() {
      return { healthy: true, mode: "mock", details: "Mock adapter is always healthy" };
    },
  };
}

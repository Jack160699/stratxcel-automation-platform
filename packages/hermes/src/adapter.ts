import type { MissionRow } from "@stratxcel/missions";
import type { HermesExecutionResult, HermesHealthStatus, MissionScopedContext } from "./types.ts";

/**
 * The HermesRuntimeAdapter / AgentRuntimeAdapter contract from the master
 * brief. execute() is intentionally the only long-running call — cancel()
 * and healthCheck() must return quickly regardless of what execute() is
 * doing, since mission-worker calls them from its own poll loop, not from
 * inside an in-flight execute().
 */
export interface HermesRuntimeAdapter {
  readonly mode: "disabled" | "mock" | "http";
  execute(mission: MissionRow, context: MissionScopedContext, missionToken: string): Promise<HermesExecutionResult>;
  cancel(hermesRunId: string): Promise<void>;
  healthCheck(): Promise<HermesHealthStatus>;
}

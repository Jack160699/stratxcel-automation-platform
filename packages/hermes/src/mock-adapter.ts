import crypto from "node:crypto";
import {
  SubmitMissionResponse,
  RunStatusResponse,
  RuntimeHealth,
  HermesExecutionEvent,
  type SubmitMissionRequest,
} from "@stratxcel/hermes-contract";
import type { AgentRuntimeAdapter, RuntimeCapabilities, RuntimeModel } from "./adapter.ts";

interface MockRun {
  status: "completed" | "partially_completed";
  createdAt: string;
  serviceKey: string | null;
}

/**
 * Deterministic fake execution — no network call, no real AI work. Produces
 * a believable event sequence (tool call, message delta, terminal event)
 * for any mission, and reports "partially completed" (surfaced as a
 * `run.failed`-shaped terminal event with a clear reason, since the real
 * Runs API has no partial-completion status) when the free-form
 * `context.serviceKey` is `"custom_mission"` — mirroring the old adapter's
 * "we don't fully know what to do with this yet" simulation. Exists
 * specifically for local development/preview of the mission pipeline
 * without a real Hermes instance running — never used for anything a
 * customer would treat as real work.
 */
export function createMockHermesAdapter(): AgentRuntimeAdapter {
  const runs = new Map<string, MockRun>();

  return {
    mode: "mock",

    async submitMission(request: SubmitMissionRequest): Promise<SubmitMissionResponse> {
      const runId = `mock_run_${crypto.randomUUID()}`;
      const serviceKey = typeof request.context.serviceKey === "string" ? request.context.serviceKey : null;
      runs.set(runId, {
        status: serviceKey === "custom_mission" ? "partially_completed" : "completed",
        createdAt: new Date().toISOString(),
        serviceKey,
      });
      return SubmitMissionResponse.parse({
        missionId: request.missionId,
        runId,
        status: "accepted",
        acceptedAt: new Date().toISOString(),
      });
    },

    async getRun(runId: string): Promise<RunStatusResponse> {
      const run = runs.get(runId);
      if (!run) throw new Error(`Mock adapter: unknown run ${runId}`);
      return RunStatusResponse.parse({
        runId,
        status: run.status === "completed" ? "completed" : "failed",
        updatedAt: new Date().toISOString(),
        createdAt: run.createdAt,
        output:
          run.status === "completed"
            ? `Mock Hermes completed a simulated '${run.serviceKey ?? "unknown"}' run.`
            : undefined,
        error: run.status === "partially_completed" ? "Mock Hermes could not classify this goal into a known service." : undefined,
        usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160 },
      });
    },

    async streamEvents(runId, context, onEvent): Promise<void> {
      const run = runs.get(runId);
      if (!run) throw new Error(`Mock adapter: unknown run ${runId}`);

      let sequence = 0;
      const base = {
        tenantId: context.tenantId,
        missionId: context.missionId,
        runId,
        receivedVia: "sse" as const,
      };
      const emit = async (event: HermesExecutionEvent) => {
        await onEvent(HermesExecutionEvent.parse({ ...event, sequence: sequence++, receivedAt: new Date().toISOString() }));
      };

      await emit({ ...base, type: "message.delta", sequence: 0, receivedAt: "", textDelta: `Starting mock run for '${run.serviceKey ?? "unknown"}'...` });
      await emit({
        ...base,
        type: "tool.started",
        sequence: 0,
        receivedAt: "",
        tool: { callId: "mock_call_1", name: "web_search", arguments: { query: "mock" }, requestedAt: new Date().toISOString() },
      });
      await emit({
        ...base,
        type: "tool.completed",
        sequence: 0,
        receivedAt: "",
        tool: { callId: "mock_call_1", name: "web_search", status: "ok", output: { results: [] }, completedAt: new Date().toISOString() },
      });

      if (run.status === "completed") {
        await emit({ ...base, type: "run.completed", sequence: 0, receivedAt: "" });
      } else {
        await emit({ ...base, type: "run.failed", sequence: 0, receivedAt: "", error: "Mock Hermes could not classify this goal into a known service." });
      }
    },

    async stopRun(): Promise<void> {
      // Mock runs complete synchronously within streamEvents() — nothing to cancel.
    },

    async resolveApproval(): Promise<void> {
      // Mock adapter never pauses for approval.
    },

    async getCapabilities(): Promise<RuntimeCapabilities> {
      return { object: "hermes.api_server.capabilities", mode: "mock" };
    },

    async getModels(): Promise<RuntimeModel[]> {
      return [{ id: "mock-model" }];
    },

    async getTranscriptBackfill() {
      return null;
    },

    async healthCheck() {
      return RuntimeHealth.parse({ status: "ok", checkedAt: new Date().toISOString(), details: "Mock adapter is always healthy" });
    },
  };
}

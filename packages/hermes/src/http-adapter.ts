import {
  SubmitMissionResponse,
  RunStatusResponse,
  HermesExecutionEvent,
  TranscriptBackfillResponse,
  RuntimeHealth,
  type SubmitMissionRequest,
  type ApprovalDecision,
} from "@stratxcel/hermes-contract";
import type { AgentRuntimeAdapter, RuntimeCapabilities, RuntimeModel } from "./adapter.ts";
import { loadHermesRuntimeConfig, type HermesRuntimeConfig } from "./config.ts";
import { parseSseStream } from "./sse.ts";
import { HermesTimeoutError, HermesUnavailableError } from "./types.ts";

/**
 * Real HTTP client for the Hermes Runs API — bearer auth, no HMAC signing
 * (real Hermes has no `X-Hermes-Signature` concept; see
 * docs/hermes/RECONCILIATION.md for what this replaces). Config is read
 * once via loadHermesRuntimeConfig(), which throws at construction time if
 * HERMES_MODE=http but required config is missing — "fail closed," not a
 * lazy per-call surprise.
 */
export function createHermesHttpAdapter(config: HermesRuntimeConfig = loadHermesRuntimeConfig()): AgentRuntimeAdapter {
  if (config.mode !== "http") {
    throw new Error(`createHermesHttpAdapter requires HERMES_MODE=http, got ${config.mode}`);
  }
  const { baseUrl, apiKey, requestTimeoutMs, sseIdleTimeoutMs, transcriptBackfillEnabled } = config;

  function authHeaders(sessionKey?: string): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    if (sessionKey) headers["X-Hermes-Session-Key"] = sessionKey;
    return headers;
  }

  async function jsonFetch(
    path: string,
    init: { method?: string; body?: unknown; sessionKey?: string; timeoutMs?: number } = {}
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? requestTimeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers: {
          ...authHeaders(init.sessionKey),
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
      if (response.status === 404) return { __notFound: true };
      if (!response.ok) {
        throw new HermesUnavailableError(`Hermes returned HTTP ${response.status} for ${path}`);
      }
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (err) {
      if (err instanceof HermesUnavailableError) throw err;
      if (err instanceof Error && err.name === "AbortError") throw new HermesTimeoutError();
      throw new HermesUnavailableError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    mode: "http",

    async submitMission(request: SubmitMissionRequest): Promise<SubmitMissionResponse> {
      const sessionKey = `${request.tenantId}:${request.profile}`;
      const raw = (await jsonFetch("/v1/runs", {
        method: "POST",
        body: { input: request.brief, ...request.context },
        sessionKey,
      })) as { run_id: string; status: string };

      return SubmitMissionResponse.parse({
        missionId: request.missionId,
        runId: raw.run_id,
        // Always "accepted" — duplicate detection is the caller's job (see adapter.ts JSDoc).
        status: "accepted",
        acceptedAt: new Date().toISOString(),
      });
    },

    async getRun(runId: string): Promise<RunStatusResponse> {
      const raw = (await jsonFetch(`/v1/runs/${encodeURIComponent(runId)}`)) as Record<string, unknown>;
      const usage = raw.usage as Record<string, unknown> | undefined;
      return RunStatusResponse.parse({
        runId,
        status: raw.status,
        updatedAt: toIso(raw.updated_at),
        createdAt: toIso(raw.created_at),
        output: typeof raw.output === "string" ? raw.output : undefined,
        error: typeof raw.error === "string" ? raw.error : undefined,
        usage: usage
          ? {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined,
      });
    },

    async streamEvents(runId, context, onEvent, options): Promise<void> {
      const controller = new AbortController();
      if (options?.signal) {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), sseIdleTimeoutMs);
      };

      resetIdleTimer();
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
      } finally {
        // Connection-establishment timeout is covered by requestTimeoutMs via
        // this same controller only if it fires before the idle timer; a
        // slow-to-establish connection is still bounded below by the idle
        // timer resetting on first byte.
      }

      if (!response.ok || !response.body) {
        clearTimeout(idleTimer);
        throw new HermesUnavailableError(`Hermes SSE stream returned HTTP ${response.status} for run ${runId}`);
      }

      let sequence = 0;
      try {
        for await (const block of parseSseStream(response.body, controller.signal)) {
          resetIdleTimer();
          if (block.isComment || !block.data) continue;

          let raw: Record<string, unknown>;
          try {
            raw = JSON.parse(block.data);
          } catch {
            continue; // malformed block — skip rather than crash the whole stream
          }

          const mapped = mapWireEventToContract(raw, context, sequence);
          if (mapped) {
            sequence += 1;
            await onEvent(mapped);
          }
        }
      } finally {
        clearTimeout(idleTimer);
      }
    },

    async stopRun(runId: string): Promise<void> {
      await jsonFetch(`/v1/runs/${encodeURIComponent(runId)}/stop`, { method: "POST", timeoutMs: 10_000 });
    },

    async resolveApproval(runId: string, decision: ApprovalDecision): Promise<void> {
      await jsonFetch(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
        method: "POST",
        body: { choice: decision.decision === "approved" ? "once" : "deny" },
        timeoutMs: 10_000,
      });
    },

    async getCapabilities(): Promise<RuntimeCapabilities> {
      return (await jsonFetch("/v1/capabilities")) as RuntimeCapabilities;
    },

    async getModels(): Promise<RuntimeModel[]> {
      const raw = (await jsonFetch("/v1/models")) as { data?: RuntimeModel[] } | RuntimeModel[];
      if (Array.isArray(raw)) return raw;
      return raw.data ?? [];
    },

    async getTranscriptBackfill(runId: string): Promise<TranscriptBackfillResponse | null> {
      if (!transcriptBackfillEnabled) return null;
      const raw = await jsonFetch(`/api/sessions/${encodeURIComponent(runId)}/messages`);
      if (raw && typeof raw === "object" && "__notFound" in raw) return null;
      try {
        return TranscriptBackfillResponse.parse(raw);
      } catch {
        // Undocumented endpoint — a shape drift must degrade to "unavailable," not crash the caller.
        return null;
      }
    },

    async healthCheck(): Promise<RuntimeHealth> {
      try {
        const raw = (await jsonFetch("/health", { timeoutMs: 5_000 })) as { status?: string };
        return RuntimeHealth.parse({
          status: raw.status === "ok" ? "ok" : "degraded",
          checkedAt: new Date().toISOString(),
        });
      } catch (err) {
        return RuntimeHealth.parse({
          status: "down",
          checkedAt: new Date().toISOString(),
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

function toIso(value: unknown): string {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

/**
 * Maps one raw Hermes SSE wire event into the contract's HermesExecutionEvent.
 * Unrecognized event types return null (skipped, not thrown) — a future
 * Hermes release adding a new event type must not take down the stream
 * consumer, per docs/hermes/EVENT_MODEL.md's "treat unrecognized as
 * informational" guidance.
 */
function mapWireEventToContract(
  raw: Record<string, unknown>,
  context: { tenantId: string; missionId: string },
  sequence: number
): HermesExecutionEvent | null {
  const base = {
    tenantId: context.tenantId,
    missionId: context.missionId,
    runId: String(raw.run_id ?? ""),
    sequence,
    receivedVia: "sse" as const,
    receivedAt: new Date().toISOString(),
  };

  const type = raw.event;
  try {
    switch (type) {
      case "message.delta":
        return HermesExecutionEvent.parse({ ...base, type, textDelta: String(raw.delta ?? "") });
      case "reasoning.available":
        return HermesExecutionEvent.parse({ ...base, type, reasoning: String(raw.reasoning ?? "") });
      case "tool.started":
        return HermesExecutionEvent.parse({
          ...base,
          type,
          tool: {
            callId: String(raw.call_id ?? raw.tool_call_id ?? ""),
            name: String(raw.tool_name ?? raw.name ?? ""),
            arguments: (raw.args as Record<string, unknown>) ?? (raw.arguments as Record<string, unknown>) ?? {},
            requestedAt: new Date().toISOString(),
          },
        });
      case "tool.completed":
        return HermesExecutionEvent.parse({
          ...base,
          type,
          tool: {
            callId: String(raw.call_id ?? raw.tool_call_id ?? ""),
            name: String(raw.tool_name ?? raw.name ?? ""),
            status: "ok",
            output: raw.result ?? raw.output,
            completedAt: new Date().toISOString(),
          },
        });
      case "approval.request":
        return HermesExecutionEvent.parse({
          ...base,
          type,
          toolName: typeof raw.tool_name === "string" ? raw.tool_name : undefined,
        });
      case "approval.responded":
        return HermesExecutionEvent.parse({
          ...base,
          type,
          choice: raw.choice ?? "once",
        });
      case "run.completed":
        return HermesExecutionEvent.parse({ ...base, type });
      case "run.failed":
        return HermesExecutionEvent.parse({ ...base, type, error: String(raw.error ?? "unknown error") });
      case "run.cancelled":
        return HermesExecutionEvent.parse({ ...base, type });
      case "subagent.start":
        return HermesExecutionEvent.parse({
          ...base,
          type,
          subagentProfile: String(raw.profile ?? "unknown"),
          subagentRunId: String(raw.subagent_run_id ?? ""),
        });
      case "subagent.complete":
        return HermesExecutionEvent.parse({
          ...base,
          type,
          subagentRunId: String(raw.subagent_run_id ?? ""),
          status: raw.status ?? "completed",
        });
      default:
        return null;
    }
  } catch {
    // Schema validation failure on a real but malformed event — skip, don't crash the stream.
    return null;
  }
}

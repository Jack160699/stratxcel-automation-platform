import type {
  SubmitMissionRequest,
  SubmitMissionResponse,
  RunStatusResponse,
  HermesExecutionEvent,
  ApprovalDecision,
  TranscriptBackfillResponse,
  RuntimeHealth,
} from "@stratxcel/hermes-contract";

/** Loose, deliberately-passthrough shape of `GET /v1/capabilities` — see docs/hermes/API_CONTRACT.md. */
export interface RuntimeCapabilities {
  [key: string]: unknown;
}

export interface RuntimeModel {
  id: string;
  [key: string]: unknown;
}

/**
 * Provider-neutral runtime interface. This is `AgentRuntimeAdapter` from the
 * master brief, shaped around the *real* Hermes Runs API contract (submit,
 * then stream/poll, then a separate stop/approval call) rather than the
 * single opaque execute() call the earlier, invented-protocol version of
 * this file used — see docs/hermes/RECONCILIATION.md for why that changed.
 *
 * Every method's parameter/return type comes from `@stratxcel/hermes-contract`
 * (already normalized, tenant-scoped where relevant) or a local
 * runtime-neutral shape (`RuntimeCapabilities`, `RuntimeModel`) — no
 * Hermes-specific wire type is exposed to callers outside this package.
 */
export interface AgentRuntimeAdapter {
  readonly mode: "disabled" | "mock" | "http";

  /**
   * Submit a mission. Always attempts the call — idempotency (returning an
   * already-known runId for a repeated idempotencyKey without calling
   * Hermes again) is the *caller's* responsibility per
   * docs/hermes/FAILURE_RETRY_IDEMPOTENCY.md, since only the caller has
   * access to Stratxcel's own dedup record. This method's `status` is
   * therefore always `"accepted"` on success; `"duplicate"` is a value the
   * caller may report after its own idempotency check, never something this
   * method infers on its own.
   */
  submitMission(request: SubmitMissionRequest): Promise<SubmitMissionResponse>;

  /** Poll current run state. The durable recovery path — see docs/hermes/EVENT_MODEL.md. */
  getRun(runId: string): Promise<RunStatusResponse>;

  /**
   * Consume the live SSE event stream for a run, calling `onEvent` for each
   * normalized event as it arrives. Resolves when the stream closes
   * (terminal event, idle timeout, or the run's own "stream closed"
   * sentinel) or rejects on a genuine transport error. Callers MUST persist
   * each event before the next `onEvent` call returns — there is no replay
   * if a disconnect happens mid-stream (see docs/hermes/EVENT_MODEL.md).
   * `signal` allows the caller to abort early (e.g. on process shutdown);
   * an aborted stream is not an error.
   */
  streamEvents(
    runId: string,
    /** Needed to construct fully-valid HermesExecutionEvent objects — the contract schema requires both on every event. */
    context: { tenantId: string; missionId: string },
    onEvent: (event: HermesExecutionEvent) => void | Promise<void>,
    options?: { signal?: AbortSignal }
  ): Promise<void>;

  /** Interrupt a running turn. Fire-and-forget-with-confirmation — see docs/hermes/FAILURE_RETRY_IDEMPOTENCY.md. */
  stopRun(runId: string): Promise<void>;

  /** Deliver a human approval decision to a paused run. */
  resolveApproval(runId: string, decision: ApprovalDecision): Promise<void>;

  getCapabilities(): Promise<RuntimeCapabilities>;

  getModels(): Promise<RuntimeModel[]>;

  /**
   * Optional, capability-gated transcript backfill — see
   * docs/hermes/API_CONTRACT.md. Returns `null` (not an error) when the
   * capability is disabled via config, unsupported by this deployment, or
   * the session has no transcript. Never assume this succeeds.
   */
  getTranscriptBackfill(runId: string): Promise<TranscriptBackfillResponse | null>;

  healthCheck(): Promise<RuntimeHealth>;
}

/** Concrete Hermes implementation of AgentRuntimeAdapter. Same type, kept as an alias for call-site clarity. */
export type HermesRuntimeAdapter = AgentRuntimeAdapter;

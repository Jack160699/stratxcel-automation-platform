import { HermesTimeoutError, HermesUnavailableError } from "./types.ts";

/**
 * Thin client for the *actual* upstream engine — NousResearch/hermes-agent's
 * self-hosted API server (`nousresearch/hermes-agent gateway run`, or
 * `hermes gateway run` outside Docker), verified against its published docs
 * on 2026-08-09 (see HERMES_SKILLS_AND_TOOLS.md for citations). This
 * replaces the fictitious `/missions/execute`-shaped contract the previous
 * version of http-adapter.ts was written against — no such contract exists
 * upstream; Hermes Agent is an OpenAI-compatible personal-agent server, not
 * a mission-execution API named after StratExcel's own vocabulary.
 *
 * Auth: a static bearer token (`API_SERVER_KEY` on the Hermes side, `apiKey`
 * here) — NOT the HMAC-signature scheme this file used to implement. That
 * scheme was invented for a Hermes contract that turned out not to exist;
 * the real server only checks `Authorization: Bearer <key>`. StratExcel's
 * own HMAC primitive (signing.ts) is unaffected — it still protects mission
 * tokens for apps/hermes-gateway's tool endpoints, a completely separate
 * boundary from this outbound client.
 *
 * VERIFIED against a live 0.20.0 instance (`stratxcel-hermes`,
 * i-044f62e461200dda9, 2026-08-10) — both by exercising the running server
 * directly and by reading its own installed source
 * (`gateway/platforms/api_server.py` inside the `nousresearch/hermes-agent`
 * image, via `docker exec` + `grep`/`sed`, not guessed from docs):
 *   POST /v1/runs                    -> { run_id, status: "started" } (202)
 *     body:  { input: string, instructions?: string, session_id?: string,
 *              model?: string, provider?: string, conversation_history?:
 *              [{role, content}], previous_response_id?: string }
 *              (`_handle_runs` in api_server.py — a top-level `metadata`
 *              field, previously sent for correlation, is accepted but
 *              silently ignored: the handler only reads the fields above)
 *   GET  /v1/runs/{run_id}           -> a `hermes.run` object:
 *              { object: "hermes.run", run_id, status, created_at,
 *                updated_at, session_id, model, last_event,
 *                output? (string, only on "completed"),
 *                usage? ({input_tokens, output_tokens, total_tokens}, only
 *                  on "completed" — note the field names, NOT OpenAI's
 *                  prompt_tokens/completion_tokens used by
 *                  /v1/chat/completions),
 *                error? (string, only on "failed") }
 *              status vocabulary (`_set_run_status` call sites, exhaustive):
 *              "queued" -> "running" -> one of "completed" | "failed" |
 *              "cancelled" | "stopping" (transient, on the way to
 *              "cancelled") | "waiting_for_approval" (only reachable if a
 *              locally-executed tool call needs dangerous-command approval —
 *              see http-adapter.ts's toolset-hardening note; unreachable
 *              once all api_server toolsets are disabled, as StratExcel's
 *              deployment does)
 *   GET  /v1/runs/{run_id}/events    -> SSE lifecycle stream (not consumed
 *                                       here; polling GET is sufficient and
 *                                       far simpler to get right first time)
 *   POST /v1/runs/{run_id}/stop      -> { run_id, status: "stopping" } (200);
 *              404 `{error:{message,code:"run_not_found"}}` for an unknown id
 *   POST /v1/runs/{run_id}/approval  -> body { choice: "once"|"session"|
 *              "always"|"deny" (aliases "approve"/"approved"/"allow" ->
 *              "once"), all?/resolve_all?: bool } -> { object:
 *              "hermes.run.approval_response", run_id, choice, resolved }
 *   GET  /v1/capabilities            -> machine-readable API surface
 *   GET  /health                     -> { status: "ok" }, no auth required
 *   GET  /health/detailed            -> authenticated deeper readiness check
 *
 * Nothing below is BEST-EFFORT anymore as of the 2026-08-10 verification —
 * see HERMES_SKILLS_AND_TOOLS.md for the fuller writeup and how this was
 * checked (source grep, not just docs).
 */

export interface HermesAgentRunRequest {
  input: string;
  instructions?: string;
  /**
   * Confirmed read by `_handle_runs` (`_resolve_route`/`_request_agent_overrides`).
   * Omitted, a run uses Hermes's own internal default routing — verified
   * live on 2026-08-10 to be `anthropic/claude-opus-4.6` via `provider:
   * "auto"`, which failed with HTTP 402 ("requested up to 128000 tokens,
   * but can only afford 1600") on the OpenRouter account funded for this
   * deployment. Every real mission would hit that same failure with no
   * override set — see HERMES_DEFAULT_MODEL/HERMES_DEFAULT_PROVIDER in
   * http-adapter.ts, which is why those exist.
   */
  model?: string;
  provider?: string;
  /**
   * Accepted by the server but not read by `_handle_runs` — confirmed from
   * source; kept here only so correlationId/missionId/tenantId travel
   * alongside the request for anyone inspecting outbound traffic (e.g. a
   * proxy log), not because the server does anything with it. Real
   * correlation is the client-set X-Correlation-Id header, independent of
   * this field. Never contains a secret — see composeRunInput in
   * http-adapter.ts.
   */
  metadata?: Record<string, string>;
}

export interface HermesAgentRun {
  run_id: string;
  /** Verified vocabulary — see the module comment above and mapRunStatus in http-adapter.ts. */
  status: string;
  output?: unknown;
  usage?: Record<string, unknown>;
  /** Only present when status is "failed" — see the module comment above. */
  error?: string;
  [key: string]: unknown;
}

export interface HermesAgentClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class HermesAgentHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HermesAgentHttpError";
    this.status = status;
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new HermesTimeoutError();
    throw new HermesUnavailableError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new HermesAgentHttpError(response.status, `Hermes Agent returned HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 500)}` : ""}`);
  }
  return response.json();
}

/** POST /v1/runs — create a run. Returns the run_id immediately (202). */
export async function createRun(
  config: HermesAgentClientConfig,
  request: HermesAgentRunRequest,
  correlationId: string,
  timeoutMs: number
): Promise<HermesAgentRun> {
  return withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${config.baseUrl}/v1/runs`, {
      method: "POST",
      headers: { ...authHeaders(config.apiKey), "X-Correlation-Id": correlationId },
      body: JSON.stringify(request),
      signal,
    });
    return (await parseJsonOrThrow(response)) as HermesAgentRun;
  });
}

/** GET /v1/runs/{run_id} — poll current run state. */
export async function getRun(config: HermesAgentClientConfig, runId: string, correlationId: string, timeoutMs: number): Promise<HermesAgentRun> {
  return withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: { ...authHeaders(config.apiKey), "X-Correlation-Id": correlationId },
      signal,
    });
    return (await parseJsonOrThrow(response)) as HermesAgentRun;
  });
}

/** POST /v1/runs/{run_id}/stop — interrupt a running agent run. */
export async function stopRun(config: HermesAgentClientConfig, runId: string, timeoutMs: number): Promise<void> {
  await withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: "POST",
      headers: authHeaders(config.apiKey),
      signal,
    });
    // A stop request against an already-finished run is not an error worth
    // surfacing to the caller — cancel() callers only care that nothing is
    // left running, and a 404/409 here already implies that.
    if (!response.ok && response.status !== 404 && response.status !== 409) {
      throw new HermesAgentHttpError(response.status, `Hermes Agent stop returned HTTP ${response.status}`);
    }
  });
}

/**
 * GET /health — liveness only, no auth required per docs. Used for the
 * adapter's healthCheck(); does not by itself prove the API server (as
 * opposed to the bare process) is reachable or that the bearer key is
 * valid — see checkHermesAgentCapabilities for that.
 */
export async function getHealth(baseUrl: string, timeoutMs: number): Promise<{ ok: boolean; details: string }> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const response = await fetch(`${baseUrl}/health`, { signal });
      return { ok: response.ok, details: `HTTP ${response.status}` };
    });
  } catch (err) {
    return { ok: false, details: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * GET /v1/capabilities — authenticated, machine-readable description of the
 * server's stable surface. Exercising this once at startup (not on every
 * mission) is the cheapest real proof that HERMES_GATEWAY_URL and the API
 * key both actually work end to end, beyond the unauthenticated /health.
 */
export async function checkHermesAgentCapabilities(config: HermesAgentClientConfig, timeoutMs: number): Promise<{ ok: boolean; details: string }> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const response = await fetch(`${config.baseUrl}/v1/capabilities`, { headers: authHeaders(config.apiKey), signal });
      const details = response.ok ? "capabilities OK" : `HTTP ${response.status}`;
      return { ok: response.ok, details };
    });
  } catch (err) {
    return { ok: false, details: err instanceof Error ? err.message : String(err) };
  }
}

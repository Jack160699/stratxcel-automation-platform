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
 * VERIFIED endpoints (docs + Docker Hub docs page, cross-checked against the
 * raw GitHub source markdown so a doc-rendering error can't fool this):
 *   POST /v1/runs                    -> { run_id } (202)
 *   GET  /v1/runs/{run_id}           -> a `hermes.run` object with a status
 *   GET  /v1/runs/{run_id}/events    -> SSE lifecycle stream (not consumed
 *                                       here; polling GET is sufficient and
 *                                       far simpler to get right first time)
 *   POST /v1/runs/{run_id}/stop      -> { status: "stopping" }
 *   GET  /v1/capabilities            -> machine-readable API surface
 *   GET  /health                     -> { status: "ok" }, no auth required
 *   GET  /health/detailed            -> authenticated deeper readiness check
 *
 * BEST-EFFORT (not published in the docs this session could reach — the
 * exact POST /v1/runs request body schema and the GET /v1/runs/{id}
 * response's status-value vocabulary are not documented anywhere public as
 * of this writing). Modeled here on the one sibling endpoint whose body IS
 * documented (`POST /v1/responses`: `model`, `input`, `instructions`,
 * `store`, `previous_response_id`) since both are described as "OpenAI-
 * compatible" surfaces from the same server. Every place this guess is load-
 * bearing is marked `BEST-EFFORT` below. Confirming/correcting this against
 * a real running instance is the first thing to do once one exists — see
 * MANUAL_SETUP_REQUIRED.md M9.
 */

export interface HermesAgentRunRequest {
  /** BEST-EFFORT field name, modeled on POST /v1/responses's `input`. */
  input: string;
  /** BEST-EFFORT field name, modeled on POST /v1/responses's `instructions`. */
  instructions?: string;
  /**
   * Opaque bag of correlation/tenant metadata. Passed through unchanged if
   * the server round-trips an unrecognized `metadata` object (the way most
   * OpenAI-compatible servers do); ignored otherwise. Never contains a
   * secret — see compileHermesRunInput in http-adapter.ts.
   */
  metadata?: Record<string, string>;
}

export interface HermesAgentRun {
  run_id: string;
  /** BEST-EFFORT — exact vocabulary unconfirmed; see mapRunStatus in http-adapter.ts. */
  status: string;
  output?: unknown;
  usage?: Record<string, unknown>;
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

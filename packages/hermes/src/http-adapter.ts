import crypto from "node:crypto";
import type { HermesRuntimeAdapter } from "./adapter.ts";
import {
  createRun,
  getRun,
  stopRun,
  getHealth,
  checkHermesAgentCapabilities,
  type HermesAgentClientConfig,
  type HermesAgentRun,
} from "./hermes-agent-client.ts";
import { resolveProfileInstructions } from "./profiles.ts";
import {
  HermesTimeoutError,
  HermesUnavailableError,
  type HermesExecutionResult,
  type HermesHealthStatus,
  type HermesOutcome,
  type HermesProgressEvent,
  type MissionScopedContext,
  type ToolName,
} from "./types.ts";
import type { MissionRow } from "@stratxcel/missions";

const REQUEST_TIMEOUT_MS = 30_000; // per HTTP call to Hermes Agent, not the whole run
const POLL_INTERVAL_MS = 3_000;
const DEFAULT_MAX_RUN_MS = 10 * 60 * 1000; // bounds one mission's Hermes run; mission-worker's lease heartbeat (worker.ts) already tolerates a run this long by renewing the queue lease on its own timer.

function getConfig(): HermesAgentClientConfig {
  const baseUrl = process.env.HERMES_GATEWAY_URL;
  const apiKey = process.env.HERMES_API_KEY;
  if (!baseUrl) throw new Error("HERMES_MODE is 'http' but HERMES_GATEWAY_URL is not set — the running Hermes Agent instance's base URL, e.g. http://<host>:8642");
  if (!apiKey) throw new Error("HERMES_MODE is 'http' but HERMES_API_KEY is not set — Hermes Agent's own API_SERVER_KEY bearer token");
  return { baseUrl, apiKey };
}

/**
 * One-line, human-readable description per restricted tool for the prompt —
 * the model has no other way to learn what these names mean, since it has
 * no native StratExcel tool/function-calling wiring (see the tool-bridge
 * note below). Kept here rather than in tools/contracts.ts because that
 * file is a compile-time type contract with no runtime values to describe.
 */
const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  get_brand_context: "Fetch this tenant's current Brand Brain (voice, offers, facts). No input.",
  get_service_definition: "Fetch this mission's service catalogue entry (label/description). No input.",
  create_draft_artifact: "Save a draft output artifact. Input: { kind, storageRef, metadata? }.",
  update_mission_progress: "Report a human-readable progress update. Input: { message, data? }.",
  request_approval: "Ask a human to approve a sensitive action before taking it. Input: { kind, subject }.",
  get_approval_status: "Check a previously requested approval's status. Input: { approvalId }.",
  create_human_handoff: "Hand this mission off to a human when blocked. Input: { reason, contextSnapshot }.",
  query_publication_status: "Check publication status of a prior submission. Input: { reference }. (Currently always returns 'unknown' — no publishing pipeline is wired yet.)",
  submit_publish_request: "Not available to Hermes — publishing stays StratExcel-controlled.",
  create_website_change_request: "Not available to Hermes — website changes stay StratExcel-controlled.",
  create_crm_lead: "Record a new CRM lead. Input: { contactName?, contactPhone?, contactEmail?, metadata? }.",
  attach_research_evidence: "Attach a cited source to this mission's research trail. Input: { artifactId, sourceUrl?, summary }.",
};

/**
 * Composes everything the run needs to act on this mission with zero
 * ambient access — no secret ever appears here. The mission token is
 * scoped to exactly this mission's tenant and tool allowlist for 15
 * minutes (token.ts); inlining it in the prompt is a deliberate, named
 * stand-in for native tool/function-calling wiring (see the module-level
 * comment on the tool bridge below), not an oversight.
 */
function composeRunInput(mission: MissionRow, context: MissionScopedContext, missionToken: string): { input: string; instructions: string } {
  const toolGatewayUrl = process.env.STRATXCEL_TOOL_GATEWAY_URL;
  const availableTools = context.allowedTools.map((tool) => `- ${tool}: ${TOOL_DESCRIPTIONS[tool]}`).join("\n");

  const toolBridgeSection = toolGatewayUrl
    ? [
        "",
        "To take any StratExcel-side action, call the matching tool via HTTP:",
        `  POST ${toolGatewayUrl}/tools/<tool_name>`,
        `  Authorization: Bearer ${missionToken}`,
        "  Content-Type: application/json",
        "  <JSON body per the tool's input, or {} if it takes none>",
        "",
        "Available tools for this mission:",
        availableTools,
        "",
        "Any tool not in this list will be rejected. Do not attempt raw database, shell, or credential access — you have none.",
      ].join("\n")
    : "\n(No tool gateway URL is configured for this deployment — this run has no StratExcel tool access at all; produce your best output from the context below only.)";

  const brandBrainSection = context.brandBrain ? JSON.stringify(context.brandBrain).slice(0, 8000) : "(none on file)";

  const input = [
    `Mission goal: ${context.goalText}`,
    `Service: ${context.serviceKey ?? "unclassified"}`,
    `Budget ceiling: ${context.budgetCents} cents (already reserved — do not exceed).`,
    `Brand Brain (version ${context.brandBrainVersion ?? "current"}): ${brandBrainSection}`,
    toolBridgeSection,
  ].join("\n");

  const instructions = resolveProfileInstructions(context.hermesProfile);

  return { input, instructions };
}

/**
 * VERIFIED status mapping — read directly from the running 0.20.0 image's
 * own `gateway/platforms/api_server.py` (`_set_run_status` call sites) on
 * 2026-08-10, not guessed. The real vocabulary `_handle_runs`/
 * `_handle_stop_run`/`_handle_run_approval` actually set is exactly:
 * "queued", "running", "completed", "failed", "cancelled", "stopping",
 * "waiting_for_approval" — the previous version of this function guessed
 * "requires_approval"/"awaiting_approval"/"approval_required"/
 * "paused_for_approval" for the approval case, none of which the real
 * server ever sends, so a real approval-pending run fell through to the
 * PENDING catch-all and polled until HermesTimeoutError instead of
 * reporting AWAITING_APPROVAL. Fixed here against the real string.
 * "started" is the literal immediate POST /v1/runs response body's status
 * (a distinct, one-time value never seen again from GET /v1/runs/{id},
 * which starts that run at "queued") — included in the PENDING set so the
 * very first loop iteration doesn't rely on the catch-all.
 */
function mapRunStatus(run: HermesAgentRun): HermesOutcome | "PENDING" {
  const status = String(run.status ?? "").toLowerCase();
  if (status === "completed") return "COMPLETED";
  if (status === "failed") return "FAILED";
  if (status === "cancelled" || status === "stopping") return "PARTIALLY_COMPLETED";
  if (status === "waiting_for_approval") return "AWAITING_APPROVAL";
  if (status === "queued" || status === "running" || status === "started") return "PENDING";
  return "PENDING"; // unrecognized status: keep polling rather than guessing terminal
}

/**
 * `run.output` (a plain string — the agent's final_response) is only ever
 * set by the server on a "completed" run; a "failed" run instead sets
 * `run.error` (also a plain string — see `_handle_runs`'s except-blocks).
 * The previous version of this function only ever looked at `run.output`,
 * so a real failure's summary was the uninformative
 * "Hermes run <id> finished with status 'failed'" instead of the actual
 * error message — fixed here to check `run.error` first.
 */
function extractSummary(run: HermesAgentRun): string {
  if (typeof run.error === "string" && run.error) return run.error.slice(0, 4000);
  if (typeof run.output === "string") return run.output.slice(0, 4000);
  if (run.output && typeof run.output === "object") {
    const maybeText = (run.output as Record<string, unknown>).text ?? (run.output as Record<string, unknown>).summary;
    if (typeof maybeText === "string") return maybeText.slice(0, 4000);
    return JSON.stringify(run.output).slice(0, 4000);
  }
  return `Hermes run ${run.run_id} finished with status '${run.status}'.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real client for the actual upstream engine: NousResearch/hermes-agent's
 * self-hosted API server (see hermes-agent-client.ts for the verified/
 * best-effort split of its wire contract). Replaces the previous version of
 * this file, which was written against a `/missions/execute`-shaped
 * contract that does not exist upstream — no live Hermes instance was ever
 * reachable to catch that, so it shipped as an honest guess (see this
 * file's git history) and is corrected here now that the real contract has
 * been read from NousResearch/hermes-agent's published docs.
 *
 * Tool bridge (Phase 4 of the integration brief) — CONFIRMED from a live
 * instance's own `/v1/capabilities` (`runtime.tool_execution: "server"`,
 * `split_runtime: false`) and its `GET /v1/toolsets` response: Hermes
 * Agent's built-in tools (terminal, file, code_execution, browser, web,
 * ...) are resolved per-installation via config.yaml's
 * `platform_toolsets.api_server` key — NOT scoped per API request, and
 * there is no split-runtime mode where a caller supplies/scopes tools on a
 * single POST /v1/runs call. This is not a documentation gap anymore; it is
 * how the shipped 0.20.0 server actually works, read from its own source
 * (`gateway/platforms/api_server.py`). Consequence: StratExcel's
 * mission-scoped `allowedTools` cannot be enforced by Hermes's own native
 * tool-calling at all. The StratExcel deployment's `platform_toolsets.
 * api_server` is therefore hardened to `[]` (verified live 2026-08-10 —
 * every one of Hermes's 27 built-in toolsets reports `enabled: false`) so
 * the model has zero local tool access, full stop — not "restricted to
 * StratExcel's 12 tools" but "none at all" until real per-mission tool
 * wiring exists. This adapter's inlined-prompt tool bridge (composeRunInput
 * above: mission token + tool list + callback URL in the prompt) therefore
 * currently has no way to actually execute — the model has no HTTP-capable
 * tool to make the call with. It is left in place as the addressed half of
 * a two-part fix (what StratExcel sends) whose other half (a way for
 * Hermes to actually reach apps/hermes-gateway per-mission — most likely a
 * real MCP server StratExcel would need to host and have each mission's
 * Hermes run connect to, since the built-in toolset path is a dead end for
 * per-mission scoping) remains unbuilt. See HERMES_SKILLS_AND_TOOLS.md.
 *
 * Still inert: HERMES_MODE stays 'disabled' in production. The engine
 * connection, auth, run lifecycle, and provider routing are now verified
 * end-to-end against a live instance (health, capabilities, toolsets,
 * chat/completions via OpenRouter, and a real /v1/runs round trip all
 * returned real, correct responses on 2026-08-10) — what remains unverified
 * is specifically the tool bridge above, not the engine connection itself.
 */
export function createHermesHttpAdapter(): HermesRuntimeAdapter {
  return {
    mode: "http",

    async execute(mission: MissionRow, context: MissionScopedContext, missionToken: string): Promise<HermesExecutionResult> {
      const config = getConfig();
      const correlationId = crypto.randomUUID();
      const { input, instructions } = composeRunInput(mission, context, missionToken);

      // Hermes's own default model/provider routing is opaque and, as
      // observed live on 2026-08-10, can require more account credit than
      // is actually funded (a real HTTP 402 from the exact same deployment
      // this adapter targets — see hermes-agent-client.ts's doc comment on
      // HermesAgentRunRequest.model). Omitted here, every mission silently
      // inherits whatever Hermes considers "default" today, which is a cost
      // and reliability decision StratExcel should control explicitly
      // rather than discover via production failures — hence these two
      // optional overrides, unset by default (preserves prior behavior
      // until an operator opts in).
      const model = process.env.HERMES_DEFAULT_MODEL || undefined;
      const provider = process.env.HERMES_DEFAULT_PROVIDER || undefined;

      const created = await createRun(
        config,
        { input, instructions, model, provider, metadata: { missionId: mission.id, tenantId: mission.tenant_id, correlationId } },
        correlationId,
        REQUEST_TIMEOUT_MS
      );
      const runId = created.run_id;
      if (!runId) throw new HermesUnavailableError("Hermes Agent did not return a run_id from POST /v1/runs");

      const progressEvents: HermesProgressEvent[] = [{ atIso: new Date().toISOString(), message: `Hermes run ${runId} created`, data: { runId } }];

      const maxRunMs = Number(process.env.HERMES_RUN_MAX_MS) || DEFAULT_MAX_RUN_MS;
      const deadline = Date.now() + maxRunMs;
      let last: HermesAgentRun = created;

      while (true) {
        const outcome = mapRunStatus(last);
        if (outcome !== "PENDING") {
          return { outcome, summary: extractSummary(last), progressEvents, hermesRunId: runId };
        }
        if (Date.now() >= deadline) {
          await stopRun(config, runId, 10_000).catch(() => {
            // Best-effort stop on timeout — a failure here must not mask the timeout itself.
          });
          throw new HermesTimeoutError(`Hermes run ${runId} did not reach a terminal status within ${maxRunMs}ms`);
        }
        await sleep(POLL_INTERVAL_MS);
        last = await getRun(config, runId, correlationId, REQUEST_TIMEOUT_MS);
      }
    },

    async cancel(hermesRunId: string): Promise<void> {
      const config = getConfig();
      await stopRun(config, hermesRunId, 10_000);
    },

    async healthCheck(): Promise<HermesHealthStatus> {
      try {
        const config = getConfig();
        const liveness = await getHealth(config.baseUrl, 5000);
        if (!liveness.ok) return { healthy: false, mode: "http", details: liveness.details };
        const capabilities = await checkHermesAgentCapabilities(config, 5000);
        return { healthy: capabilities.ok, mode: "http", details: capabilities.details };
      } catch (err) {
        return { healthy: false, mode: "http", details: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

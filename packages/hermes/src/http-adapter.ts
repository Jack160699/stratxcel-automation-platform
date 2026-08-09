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
 * BEST-EFFORT status mapping. GET /v1/runs/{id}'s exact `status` vocabulary
 * is not published anywhere this session could verify (see
 * hermes-agent-client.ts's module comment) — this recognizes the
 * status/outcome words explicit in the docs (`stopping`, and Hermes's own
 * "approval" concept from POST /v1/runs/{id}/approval) plus the obvious
 * OpenAI-convention terminal words, and treats anything else as still
 * running rather than guessing wrong in a direction that could look like a
 * false COMPLETED. Confirm/correct this against a real instance before
 * relying on it — see MANUAL_SETUP_REQUIRED.md M9.
 */
function mapRunStatus(run: HermesAgentRun): HermesOutcome | "PENDING" {
  const status = String(run.status ?? "").toLowerCase();
  if (["completed", "complete", "succeeded", "done"].includes(status)) return "COMPLETED";
  if (["failed", "error", "errored"].includes(status)) return "FAILED";
  if (["stopped", "stopping", "cancelled", "canceled", "interrupted"].includes(status)) return "PARTIALLY_COMPLETED";
  if (["requires_approval", "awaiting_approval", "approval_required", "paused_for_approval"].includes(status)) return "AWAITING_APPROVAL";
  if (["requires_input", "awaiting_input", "input_required"].includes(status)) return "AWAITING_INPUT";
  if (["queued", "running", "in_progress", "pending", "processing"].includes(status)) return "PENDING";
  return "PENDING"; // unrecognized status: keep polling rather than guessing terminal
}

function extractSummary(run: HermesAgentRun): string {
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
 * Tool bridge (Phase 4 of the integration brief): Hermes Agent's real
 * extensibility points for custom tools are MCP servers and its plugin
 * system, both configured per-installation in its own config.yaml — this
 * session could not confirm whether either supports scoping to a single
 * StratExcel mission's allowedTools on a *per-run* basis (the docs describe
 * them as install-wide, not per-request). Rather than fabricate that wiring,
 * this adapter inlines the mission token, tool list, and the callback URL
 * into the run's prompt (composeRunInput above) and relies on the model
 * making an HTTP request — which requires Hermes Agent to have some
 * general-purpose HTTP/web tool enabled, itself unconfirmed for this exact
 * use. This is a deliberately named gap: the honest, currently-buildable
 * middle ground between "no tool bridge at all" and claiming a native
 * integration this session could not verify. First thing to confirm once a
 * real instance exists — see MANUAL_SETUP_REQUIRED.md M9.
 *
 * Still inert: HERMES_MODE stays 'disabled' in production until a real
 * Hermes Agent instance, a chosen inference provider, and this adapter's
 * BEST-EFFORT fields are all confirmed against a live round trip.
 */
export function createHermesHttpAdapter(): HermesRuntimeAdapter {
  return {
    mode: "http",

    async execute(mission: MissionRow, context: MissionScopedContext, missionToken: string): Promise<HermesExecutionResult> {
      const config = getConfig();
      const correlationId = crypto.randomUUID();
      const { input, instructions } = composeRunInput(mission, context, missionToken);

      const created = await createRun(
        config,
        { input, instructions, metadata: { missionId: mission.id, tenantId: mission.tenant_id, correlationId } },
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

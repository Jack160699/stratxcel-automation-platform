import crypto from "node:crypto";
import type { HermesRuntimeAdapter } from "./adapter.ts";
import { resolveProfileInstructions } from "./profiles.ts";
import { TOOL_DESCRIPTIONS } from "./tools/descriptions.ts";
import { TOOL_PARAMETER_SCHEMAS } from "./tools/json-schemas.ts";
import { assertWithinBudget, BudgetExceededError } from "./budget.ts";
import type {
  HermesExecutionResult,
  HermesHealthStatus,
  HermesOutcome,
  HermesProgressEvent,
  MissionScopedContext,
  ToolName,
} from "./types.ts";
import type { MissionRow } from "@stratxcel/missions";

/**
 * Structural mirror of @stratxcel/agent-core's AgentLLMProvider — see that
 * package's provider.ts doc comment: "a thin adapter around the EXISTING
 * configured provider... can implement this interface without agent-core
 * importing app-side code." packages/hermes does the same thing one layer
 * further out: it never imports @stratxcel/agent-core or any app code, so
 * this stays a pure, independently-testable package with the same minimal
 * dependency footprint it already had (brand-brain, missions, zod). The
 * real object passed in at runtime (see
 * apps/mission-worker/src/worker.ts) is
 * lib/agent-core/provider-adapter.ts's createAgentCoreProviderAdapter,
 * which already routes through the real, live @stratxcel/ai-runtime — the
 * exact provider WhatsApp/Admin Copilot use today, per the master brief's
 * "DO NOT create a second unrelated Gemini client." Field names are kept
 * identical on purpose so that object satisfies this interface with zero
 * adapter code needed at the call site.
 */
export interface NativeLLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface NativeToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface NativeToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface NativeCompletionResult {
  text: string;
  toolCalls: NativeToolCallRequest[];
}

export interface NativeLLMProvider {
  isConfigured(): boolean;
  complete(messages: NativeLLMMessage[], tools: NativeToolSchema[]): Promise<NativeCompletionResult>;
}

/**
 * Structural mirror of apps/hermes-gateway/src/tool-handlers.ts's
 * ToolCallContext/invokeTool. packages/hermes never imports an app directly
 * (apps depend on packages here, never the reverse), so this stays the
 * injection seam — the real function is wired in by
 * apps/mission-worker/src/worker.ts, which is free to import across app
 * boundaries the same way apps/hermes-gateway already does (see its own
 * import of lib/social/workforce/publication-status-lookup.ts).
 */
export interface NativeToolInvocationContext {
  missionId: string;
  tenantId: string;
  correlationId: string;
  allowedTools: readonly ToolName[];
}

export type NativeToolInvoker = (
  tool: ToolName,
  ctx: NativeToolInvocationContext,
  input: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export interface NativeHermesAdapterDeps {
  /** Constructs a real, tenant-billed LLM provider for one mission run —
   *  called once per execute(), not cached, so billing always attributes to
   *  the mission's own tenant. */
  createProvider(tenantId: string): NativeLLMProvider;
  /** Executes one real, mission-scoped, already-authorized tool call —
   *  the same function apps/hermes-gateway's MCP path calls, so a native
   *  run and an MCP-driven run enforce identical server-side checks. */
  invokeTool: NativeToolInvoker;
  /** Bounded like @stratxcel/agent-core's orchestrator.ts MAX_TOOL_ROUNDS
   *  (5 for a chat turn) — a mission has more real steps than one chat
   *  reply, so this defaults higher, but stays finite: the model is never
   *  allowed to loop forever against a mission's reserved budget. */
  maxRounds?: number;
}

const DEFAULT_MAX_ROUNDS = 16;

/**
 * Real, honest per-tool-call cost estimates in cents, for the pre-call
 * budget check assertWithinBudget (budget.ts) was always meant to be wired
 * to -- "a named extension point, not a stub pretending to meter something
 * it doesn't." generate_image is the first Hermes tool with a real
 * per-call cost, so it's the first real entry here. Every other current
 * tool is free (read, or a low-mutation write with no direct AI-provider
 * spend of its own), so they're absent -- absence means $0, not "unknown."
 * Conservative: 25 cents covers every real image tier in
 * packages/ai-runtime/src/catalog/costs.ts up to and including the most
 * expensive premium-4K entry ($0.24), verified against that catalog on
 * 2026-09-07 -- revisit if the catalog's own prices change materially.
 * This is Hermes' own mission-budget pre-check, layered ON TOP OF (not
 * instead of) the tenant's real monthly AI budget gate that
 * executeGenerateImageTool already enforces internally regardless.
 */
const TOOL_COST_ESTIMATES_CENTS: Partial<Record<ToolName, number>> = {
  generate_image: 25,
};

function nowIso(): string {
  return new Date().toISOString();
}

function toolSchemasFor(allowedTools: readonly ToolName[]): NativeToolSchema[] {
  return allowedTools.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: TOOL_PARAMETER_SCHEMAS[name] ?? { type: "object", properties: {}, additionalProperties: true },
  }));
}

function buildSystemPrompt(context: MissionScopedContext): string {
  const brandBrainSection = context.brandBrain ? JSON.stringify(context.brandBrain).slice(0, 8000) : "(none on file)";
  const profileInstructions = resolveProfileInstructions(context.hermesProfile);
  return [
    profileInstructions,
    "",
    "You are executing exactly one StratExcel mission to completion. You have no shell, filesystem, browser, or raw credential access of any kind — the only way you can affect StratExcel is by calling the tools made available to you below, and only those.",
    `Mission goal: ${context.goalText}`,
    `Service: ${context.serviceKey ?? "unclassified"}`,
    `Budget ceiling: ${context.budgetCents} cents (already reserved — work efficiently within it).`,
    `Brand Brain (version ${context.brandBrainVersion ?? "current"}): ${brandBrainSection}`,
    "",
    "Call update_mission_progress periodically so a human can see what you're doing. When the mission is genuinely complete, or you've made all the real progress possible right now, stop calling tools and reply with a final plain-text summary — that text becomes the mission's result, so make it a real, evidence-based account of what you found or did, never an invented one. If the mission needs a human decision or approval before it can continue, call request_approval or create_human_handoff instead of guessing or stalling.",
  ].join("\n");
}

/**
 * The real production execution path: a bounded LLM function-calling loop
 * that runs entirely in-process inside mission-worker, calling the exact
 * same already-tested tool handlers apps/hermes-gateway exposes over MCP —
 * with zero external engine dependency and zero prompt-inlined capability
 * token. Unlike http-adapter.ts (which has to inline a mission token into
 * the prompt and hope the model constructs an HTTP call with it — a bridge
 * that adapter's own doc comment documents as currently unable to execute
 * at all, since NousResearch/hermes-agent has no per-request tool-scoping
 * mechanism regardless of hosting), this adapter's own code is what invokes
 * the tool, with a context it already verified server-side. The model only
 * ever sees tool names/schemas and gets back a JSON result — it never
 * handles a credential or token of any kind.
 *
 * mode is "native" so mission-worker's OUTCOME_TO_STATE mapping and every
 * other HermesRuntimeAdapter caller work completely unchanged — this is an
 * additive fourth mode alongside disabled/mock/http, selected the same way
 * (HERMES_MODE), never the default.
 */
export function createNativeHermesAdapter(deps: NativeHermesAdapterDeps): HermesRuntimeAdapter {
  const maxRounds = deps.maxRounds ?? DEFAULT_MAX_ROUNDS;

  return {
    mode: "native",

    async execute(mission: MissionRow, context: MissionScopedContext): Promise<HermesExecutionResult> {
      const provider = deps.createProvider(context.tenantId);
      if (!provider.isConfigured()) {
        return { outcome: "BLOCKED", summary: "Native Hermes adapter: no AI provider is configured for this tenant." };
      }

      const correlationId = crypto.randomUUID();
      const toolCtx: NativeToolInvocationContext = {
        missionId: mission.id,
        tenantId: mission.tenant_id,
        correlationId,
        allowedTools: context.allowedTools,
      };
      const tools = toolSchemasFor(context.allowedTools);
      const messages: NativeLLMMessage[] = [
        { role: "system", content: buildSystemPrompt(context) },
        { role: "user", content: context.goalText },
      ];

      const progressEvents: HermesProgressEvent[] = [
        { atIso: nowIso(), message: `Native Hermes run started for mission ${mission.id}`, data: { correlationId } },
      ];

      let outcome: HermesOutcome | null = null;
      let summary = "";
      let spentCentsSoFar = 0;

      for (let round = 0; round < maxRounds; round += 1) {
        let completion: NativeCompletionResult;
        try {
          completion = await provider.complete(messages, tools);
        } catch (err) {
          return {
            outcome: "FAILED",
            summary: `Native Hermes provider call failed: ${err instanceof Error ? err.message : String(err)}`,
            progressEvents,
          };
        }

        if (completion.toolCalls.length === 0) {
          summary = completion.text.trim() || "Mission run completed with no further actions.";
          outcome = "COMPLETED";
          break;
        }

        messages.push({ role: "assistant", content: completion.text || "" });

        let stopReason: HermesOutcome | null = null;
        for (const call of completion.toolCalls) {
          // SECURITY: only ever invoke a tool present in this mission's
          // verified allowedTools — never a bare model-supplied string,
          // regardless of what name it produced.
          if (!context.allowedTools.includes(call.name as ToolName)) {
            messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: "error: tool not in this mission's allowedTools" });
            continue;
          }
          const toolName = call.name as ToolName;

          // Pre-call budget check for tools with a real, known per-call
          // cost (currently just generate_image) — never invoke a costed
          // tool that would exceed this mission's reserved budget. Free
          // tools (no entry in TOOL_COST_ESTIMATES_CENTS) skip this
          // entirely, so every existing tool's behavior is unchanged.
          const estimatedCostCents = TOOL_COST_ESTIMATES_CENTS[toolName];
          if (estimatedCostCents) {
            try {
              assertWithinBudget(context, spentCentsSoFar, estimatedCostCents);
            } catch (err) {
              const detail = err instanceof BudgetExceededError ? err.message : "budget check failed";
              messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: `error: ${detail} — mission budget exhausted, do not retry this tool` });
              continue;
            }
          }

          let result: Record<string, unknown>;
          try {
            result = await deps.invokeTool(toolName, toolCtx, call.arguments);
          } catch (err) {
            messages.push({
              role: "tool",
              toolCallId: call.id,
              toolName: call.name,
              content: `error: ${err instanceof Error ? err.message : "tool call failed"}`,
            });
            continue;
          }
          if (estimatedCostCents) spentCentsSoFar += estimatedCostCents;
          progressEvents.push({ atIso: nowIso(), message: `Called ${toolName}`, data: { tool: toolName, estimatedCostCents: estimatedCostCents ?? 0 } });
          messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: JSON.stringify(result).slice(0, 2000) });

          if (toolName === "request_approval") stopReason = "AWAITING_APPROVAL";
          if (toolName === "create_human_handoff") stopReason = "HUMAN_HANDOFF";
        }

        if (stopReason) {
          outcome = stopReason;
          summary =
            stopReason === "AWAITING_APPROVAL"
              ? "Mission requested Founder approval before continuing."
              : "Mission was handed off to a human.";
          break;
        }
      }

      if (!outcome) {
        outcome = "PARTIALLY_COMPLETED";
        summary = `Mission did not reach a natural conclusion within ${maxRounds} tool-call rounds — partial progress only, not a failure.`;
      }

      return { outcome, summary, progressEvents };
    },

    async cancel(): Promise<void> {
      // A native run executes synchronously within one execute() call —
      // there is no separately-running upstream process to cancel, the
      // same reason mock-adapter.ts's cancel() is a no-op.
    },

    async healthCheck(): Promise<HermesHealthStatus> {
      return {
        healthy: true,
        mode: "native",
        details: "Native adapter has no standing external dependency; per-tenant AI provider configuration is checked at execute() time.",
      };
    },
  };
}

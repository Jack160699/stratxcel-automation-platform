/**
 * research.web — grounded web research via AI Runtime + search-discovery research module.
 * READ / artifact creation only — no external business mutations.
 */
import {
  runGroundedResearch,
  type ResearchAIExecutor,
  type ResearchArtifactPersister,
} from "@stratxcel/search-discovery";
import type { AIExecutionRequest, AIExecutionResult } from "@stratxcel/ai-runtime";
import {
  unknownCostUsage,
  knownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteResult,
  type ProviderReadinessProbeResult,
} from "../providers/types.ts";
import { buildCapabilityExecutionReceipt } from "./receipts.ts";
import { getCapabilityHost } from "./host.ts";

export const RESEARCH_WEB_PROVIDER_KEY = "research-grounded-web";

function researchUsage(
  usage: { inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number } | undefined,
  requests: number,
) {
  const partial = {
    requests,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
  };
  return typeof usage?.estimatedCostUsd === "number" && Number.isFinite(usage.estimatedCostUsd)
    ? knownCostUsage({
        ...partial,
        providerReportedCost: usage.estimatedCostUsd,
        currency: "USD",
      })
    : unknownCostUsage(partial);
}

function buildAiExecutorFromHost(args: {
  tenantId: string;
  missionId: string;
}): ResearchAIExecutor | null {
  const host = getCapabilityHost();
  if (host.getResearchAIExecutor) {
    return host.getResearchAIExecutor({
      tenantId: args.tenantId,
      missionId: args.missionId,
    });
  }
  return null;
}

function buildArtifactPersister(ctx: {
  tenantId: string;
  missionId: string;
}): ResearchArtifactPersister {
  const host = getCapabilityHost();
  return {
    persist: async (input) => {
      const persist = host.persistMissionArtifact;
      if (!persist) return { ok: false, errorMessage: "persistMissionArtifact_host_unbound" };
      return persist({
        tenantId: input.tenantId,
        missionId: input.missionId,
        kind: input.kind,
        storageRef: `workforce://research.web/${input.requestId}/${input.idempotencyKey}`,
        providerKey: RESEARCH_WEB_PROVIDER_KEY,
        capability: "research.web",
        requestId: input.requestId,
        metadata: input.metadata,
      });
    },
    findByIdempotencyKey: host.findResearchArtifactByIdempotencyKey
      ? (args) =>
          host.findResearchArtifactByIdempotencyKey!({
            tenantId: args.tenantId || ctx.tenantId,
            missionId: args.missionId || ctx.missionId,
            key: args.key,
          })
      : undefined,
  };
}

export function createResearchWebProvider(): CapabilityProvider {
  return {
    key: RESEARCH_WEB_PROVIDER_KEY,
    capabilityKeys: ["research.web"],
    status: "IMPLEMENTED",
    probeReadiness: (ctx): ProviderReadinessProbeResult => {
      const host = getCapabilityHost();
      if (host.getResearchAIExecutor) {
        const exec = host.getResearchAIExecutor({
          tenantId: ctx.tenantId,
          missionId: "probe",
        });
        if (exec?.isConfigured() && host.persistMissionArtifact) {
          return {
            ready: true,
            status: "IMPLEMENTED",
            reasonCode: "READY",
            details: "research-grounded-web + AI Runtime configured",
          };
        }
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: !exec?.isConfigured()
            ? "AI Runtime providers not configured for research.web"
            : "persistMissionArtifact host unbound for research.web",
        };
      }
      // Fallback env probe (no paid calls).
      const configured = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
      if (!configured) {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "GEMINI_API_KEY / OPENAI_API_KEY not configured",
        };
      }
      if (!host.persistMissionArtifact) {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "persistMissionArtifact host unbound",
        };
      }
      return {
        ready: true,
        status: "IMPLEMENTED",
        reasonCode: "READY",
        details: "research-grounded-web implementation present; AI keys detected",
      };
    },
    execute: async (input): Promise<ProviderExecuteResult> => {
      const ai = buildAiExecutorFromHost({
        tenantId: input.tenantId,
        missionId: input.missionId,
      });

      if (!ai) {
        return {
          ok: false,
          providerKey: RESEARCH_WEB_PROVIDER_KEY,
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: "research_ai_executor_unbound",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (!ai.isConfigured()) {
        return {
          ok: false,
          providerKey: RESEARCH_WEB_PROVIDER_KEY,
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: "AI Runtime not configured for research.web",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      let result;
      try {
        result = await runGroundedResearch(
          {
            ...(input.input ?? {}),
            tenantId: input.tenantId,
            missionId: input.missionId,
            requestId: input.requestId,
            question:
              typeof input.input?.question === "string"
                ? input.input.question
                : typeof input.input?.query === "string"
                  ? input.input.query
                  : "",
          },
          {
            ai,
            artifacts: buildArtifactPersister({
              tenantId: input.tenantId,
              missionId: input.missionId,
            }),
          },
        );
      } catch (err) {
        return {
          ok: false,
          providerKey: RESEARCH_WEB_PROVIDER_KEY,
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage:
            err instanceof Error ? err.message.slice(0, 240) : "research_budget_resolution_failed",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (result.status === "WAITING_CONFIGURATION") {
        return {
          ok: false,
          providerKey: RESEARCH_WEB_PROVIDER_KEY,
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: result.humanReason ?? "waiting_configuration",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (result.status === "BLOCKED") {
        const budget = result.reasonCode === "BUDGET_EXHAUSTED";
        return {
          ok: false,
          providerKey: RESEARCH_WEB_PROVIDER_KEY,
          errorCategory: budget ? "QUOTA" : "POLICY_BLOCK",
          errorMessage: result.humanReason ?? result.reasonCode ?? "blocked",
          usage: researchUsage(result.usage, 0),
        };
      }

      if (result.status !== "PASS") {
        return {
          ok: false,
          providerKey: RESEARCH_WEB_PROVIDER_KEY,
          errorCategory: "PROVIDER_FAILURE",
          errorMessage: result.humanReason ?? result.status,
          usage: researchUsage(result.usage, 1),
          // Never invent outputArtifactIds on failure.
          outputArtifactIds: [],
        };
      }

      const outputArtifactIds = [
        ...result.evidenceArtifactIds,
        ...(result.summaryArtifactId ? [result.summaryArtifactId] : []),
      ];

      const retrievalVerifiedSourceCount = result.sources.filter(
        (s) => s.verification === "verified",
      ).length;
      const receipt = buildCapabilityExecutionReceipt({
        capability: "research.web",
        providerKey: RESEARCH_WEB_PROVIDER_KEY,
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        externalMutation: false,
        externalMutationOccurred: false,
        approvalUsed:
          input.authorization?.approvalGranted === true ||
          input.authorization?.standingAuthorizationGranted === true,
        outputArtifactIds,
        detail: {
          query: result.question,
          sourceCount: result.sources.length,
          retrievalVerifiedSourceCount,
          claimSupportStatuses: result.claims.map((c) => c.sourceSupportStatus),
          evidenceArtifactIds: result.evidenceArtifactIds,
          summaryArtifactId: result.summaryArtifactId,
          provider: result.provider,
          model: result.model,
          fallbackUsed: Boolean(
            (result.selectionReceipt as { fallbackUsed?: boolean } | undefined)?.fallbackUsed,
          ),
          estimatedCostUsd: result.usage?.estimatedCostUsd ?? null,
          researchTimestamp: result.searchedAt,
          status: result.status,
        },
      });

      return {
        ok: true,
        providerKey: RESEARCH_WEB_PROVIDER_KEY,
        providerReference: result.summaryArtifactId ?? input.requestId,
        outputArtifactIds,
        usage: researchUsage(result.usage, 1),
        receipt: receipt as unknown as Record<string, unknown>,
      };
    },
  };
}

/** Helper for tests: wrap an AIRuntime-like execute into ResearchAIExecutor. */
export function researchAIExecutorFromRuntime(runtime: {
  isAnyProviderConfigured: () => boolean;
  execute: (request: AIExecutionRequest) => Promise<AIExecutionResult>;
}): ResearchAIExecutor {
  return {
    isConfigured: () => runtime.isAnyProviderConfigured(),
    execute: async (input) =>
      runtime.execute({
        tenantId: input.tenantId,
        missionId: input.missionId,
        department: "research",
        taskClass: input.taskClass,
        messages: input.messages,
        requireWebEvidence: input.requireWebEvidence,
        correlationId: input.correlationId,
        budgetEnvelope: input.budgetEnvelope,
        structuredOutputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            claims: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  text: { type: "string" },
                  statementKind: { type: "string" },
                },
              },
            },
          },
        },
      }),
  };
}

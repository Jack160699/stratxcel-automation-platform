import { evaluateBudgetGate, filterCandidatesForBudget } from "./budget/envelope.ts";
import { assertActiveModel, isForbiddenModel, resolveModelId } from "./catalog/models.ts";
import {
  AIProviderError,
  classifyProviderError,
  fallbackReasonForCategory,
  isNonHopError,
  isTransientFallbackWorthy,
  userSafeErrorMessage,
} from "./errors.ts";
import { ProviderCircuitBreaker } from "./health/circuit-breaker.ts";
import { getTaskPolicy, resolveUnknownTaskPolicy } from "./policy/task-policies.ts";
import { assessQuality, shouldEscalateForQuality } from "./quality/assess.ts";
import { GeminiTextProvider } from "./providers/gemini.ts";
import { OpenAITextProvider } from "./providers/openai.ts";
import type {
  AIExecutionRequest,
  AIExecutionResult,
  AIFallbackReason,
  AIModelAttempt,
  AIProviderId,
  AIRoutingCandidate,
  AISelectionReceipt,
  AITextProviderAdapter,
  AIUsage,
} from "./types.ts";
import type { AIUsageRecorder } from "./usage/recorder.ts";
import { safeAiLog } from "./observability.ts";

export interface AIRuntimeDeps {
  google?: AITextProviderAdapter;
  openai?: AITextProviderAdapter;
  circuitBreaker?: ProviderCircuitBreaker;
  usageRecorder?: AIUsageRecorder;
  paidFallbackEnabled?: boolean;
  routerEnabled?: boolean;
  defaultTimeoutMs?: number;
  now?: () => Date;
  qualityAssessor?: typeof assessQuality;
  /** Default session attribution for usage rows (not missions FK). */
  defaultSessionId?: string | null;
}

function emptyUsage(): AIUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

export class AIRuntime {
  private readonly google: AITextProviderAdapter;
  private readonly openai: AITextProviderAdapter;
  private readonly circuit: ProviderCircuitBreaker;
  private readonly usageRecorder?: AIUsageRecorder;
  private readonly paidFallbackEnabled: boolean;
  private readonly routerEnabled: boolean;
  private readonly defaultTimeoutMs: number;
  private readonly now: () => Date;
  private readonly qualityAssessor: typeof assessQuality;
  private readonly defaultSessionId: string | null;

  constructor(deps: AIRuntimeDeps = {}) {
    this.google = deps.google ?? new GeminiTextProvider();
    this.openai = deps.openai ?? new OpenAITextProvider();
    this.circuit = deps.circuitBreaker ?? new ProviderCircuitBreaker();
    this.usageRecorder = deps.usageRecorder;
    this.paidFallbackEnabled =
      deps.paidFallbackEnabled ??
      (process.env.AI_PAID_FALLBACK_ENABLED == null || process.env.AI_PAID_FALLBACK_ENABLED === "1");
    this.routerEnabled =
      deps.routerEnabled ?? (process.env.AI_ROUTER_ENABLED == null || process.env.AI_ROUTER_ENABLED === "1");
    this.defaultTimeoutMs = deps.defaultTimeoutMs ?? Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 45_000);
    this.now = deps.now ?? (() => new Date());
    this.qualityAssessor = deps.qualityAssessor ?? assessQuality;
    this.defaultSessionId = deps.defaultSessionId ?? null;
  }

  getCircuitBreaker(): ProviderCircuitBreaker {
    return this.circuit;
  }

  providerFor(id: AIProviderId): AITextProviderAdapter {
    return id === "google" ? this.google : this.openai;
  }

  isAnyProviderConfigured(): boolean {
    return this.google.isConfigured() || this.openai.isConfigured();
  }

  async execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
    const requestId = request.correlationId ?? crypto.randomUUID();
    const createdAt = this.now().toISOString();

    if (!this.routerEnabled) {
      return this.fail(request, requestId, createdAt, "INTERNAL_FAILURE", "AI router disabled");
    }

    if (!this.isAnyProviderConfigured()) {
      return this.fail(request, requestId, createdAt, "NOT_CONFIGURED", "No AI provider configured");
    }

    const policy =
      request.routingPolicyOverride ??
      (request.taskClass ? getTaskPolicy(request.taskClass) : resolveUnknownTaskPolicy());

    let budgetStatus = "unknown" as AISelectionReceipt["budgetStatus"];
    let candidates: AIRoutingCandidate[] = [...policy.candidates];

    if (request.budgetEnvelope) {
      const gate = evaluateBudgetGate(request.budgetEnvelope, {
        isCriticalWorkflow: Boolean(request.metadata?.critical),
        isDiscretionaryPremium: request.taskClass === "STRATEGY" || request.taskClass === "EXECUTIVE",
      });
      budgetStatus = gate.status;
      if (!gate.allowExecution) {
        return this.fail(request, requestId, createdAt, "BUDGET_EXHAUSTED", gate.reason, {
          budgetStatus,
          primary: candidates[0],
        });
      }
      candidates = filterCandidatesForBudget(candidates, gate);
    }

    // Primary + fallback only for normal attempts; escalations are separate.
    const normalPool = candidates.filter((c) => c.role === "primary" || c.role === "fallback");
    const escalationPool = candidates.filter((c) => c.role === "escalation" || c.role === "frontier");

    const attempts: AIModelAttempt[] = [];
    let fallbackUsed = false;
    let fallbackReason: AIFallbackReason = "none";
    let escalationLevel = 0;
    let lastErrorCategory: ReturnType<typeof classifyProviderError> | undefined;
    let accumulatedCostUsd = 0;

    const runCandidate = async (
      candidate: AIRoutingCandidate,
      attemptNumber: number,
      reason: AIFallbackReason,
    ): Promise<AIExecutionResult | null> => {
      if (isForbiddenModel(candidate.model)) {
        throw new AIProviderError("INVALID_INPUT", `forbidden_model:${candidate.model}`);
      }
      assertActiveModel(candidate.model);

      const adapter = this.providerFor(candidate.provider);
      if (!adapter.isConfigured()) {
        lastErrorCategory = "NOT_CONFIGURED";
        return null;
      }
      if (this.circuit.isOpen(candidate.provider, candidate.model)) {
        lastErrorCategory = "PROVIDER_FAILURE";
        fallbackReason = "provider_unhealthy";
        return null;
      }

      const started = this.now();
      try {
        const completion = await adapter.complete({
          model: candidate.model,
          messages: request.messages,
          tools: request.tools,
          reasoningLevel: candidate.reasoningLevel,
          structuredOutputSchema: request.structuredOutputSchema,
          enableWebSearch: Boolean(policy.allowWebSearch && request.requireWebEvidence),
          enableGoogleSearchGrounding: Boolean(
            policy.allowGoogleSearchGrounding && request.requireWebEvidence && candidate.provider === "google",
          ),
          timeoutMs: request.timeoutMs ?? this.defaultTimeoutMs,
          abortSignal: request.abortSignal,
        });

        const finished = this.now();
        const latencyMs = finished.getTime() - started.getTime();
        this.circuit.recordSuccess(candidate.provider, candidate.model);

        const attempt: AIModelAttempt = {
          attemptNumber,
          provider: candidate.provider,
          model: candidate.model,
          role: candidate.role,
          startedAt: started.toISOString(),
          finishedAt: finished.toISOString(),
          latencyMs,
          success: true,
          fallbackReason: reason,
          usage: completion.usage,
          providerRequestId: completion.providerRequestId,
        };
        attempts.push(attempt);

        const selection: AISelectionReceipt = {
          taskClass: request.taskClass,
          department: request.department ?? null,
          primaryProvider: (normalPool[0] ?? candidate).provider,
          primaryModel: (normalPool[0] ?? candidate).model,
          selectedProvider: candidate.provider,
          selectedModel: candidate.model,
          fallbackUsed,
          fallbackReason,
          escalationLevel,
          budgetStatus,
          estimatedCostUsd: completion.usage.estimatedCostUsd,
        };

        let result: AIExecutionResult = {
          ok: true,
          text: completion.text,
          structuredOutput: completion.structuredOutput,
          toolCalls: completion.toolCalls,
          webEvidence: completion.webEvidence,
          provider: candidate.provider,
          model: candidate.model,
          reasoningLevel: candidate.reasoningLevel,
          inputTokens: completion.usage.inputTokens,
          cachedInputTokens: completion.usage.cachedInputTokens,
          outputTokens: completion.usage.outputTokens,
          totalTokens: completion.usage.totalTokens,
          latencyMs,
          estimatedCostUsd: completion.usage.estimatedCostUsd,
          attemptNumber,
          fallbackUsed,
          fallbackReason,
          qualityScore: null,
          qualityDecision: "SKIP",
          requestId,
          providerRequestId: completion.providerRequestId,
          createdAt,
          selection,
          attempts: [...attempts],
        };

        // Every successful provider response is billable — record even if quality later fails.
        await this.persistUsage(request, {
          ...result,
          successOverride: true,
          selectionReasonOverride: `provider_ok:${candidate.model}`,
        });
        accumulatedCostUsd += completion.usage.estimatedCostUsd;

        if (
          request.requireWebEvidence &&
          (request.taskClass === "RESEARCH" || request.taskClass === "SEO_RESEARCH") &&
          (completion.webEvidence?.sources.length ?? 0) < 1
        ) {
          result = {
            ...result,
            ok: false,
            qualityScore: 0,
            qualityDecision: "FAIL",
            errorCategory: "INSUFFICIENT_EVIDENCE",
            userSafeError: "Needs human review",
            errorDetailSafe: "insufficient_web_evidence",
          };
          lastErrorCategory = "INSUFFICIENT_EVIDENCE";
          return result;
        }

        if (request.qualityTarget != null || shouldQualityCheck(request.taskClass)) {
          const assessment = this.qualityAssessor({
            taskClass: request.taskClass,
            text: completion.text,
            qualityTarget: request.qualityTarget,
            requireEvidence: request.requireWebEvidence,
            webEvidence: completion.webEvidence,
          });
          result = {
            ...result,
            qualityScore: assessment.score,
            qualityDecision: assessment.decision,
          };

          if (
            shouldEscalateForQuality(assessment, escalationLevel, policy.maxQualityEscalations) &&
            escalationPool.length > 0
          ) {
            lastErrorCategory = undefined;
            return { ...result, ok: false, errorCategory: undefined, userSafeError: undefined };
          }
        }

        safeAiLog({
          event: "ai_execution_success",
          provider: candidate.provider,
          model: candidate.model,
          taskClass: request.taskClass,
          latencyMs,
          tokens: completion.usage.totalTokens,
          estimatedCostUsd: completion.usage.estimatedCostUsd,
          fallbackUsed,
          escalationLevel,
        });
        return result;
      } catch (err) {
        const finished = this.now();
        const category = classifyProviderError(err);
        lastErrorCategory = category;
        this.circuit.recordFailure(candidate.provider, candidate.model);
        attempts.push({
          attemptNumber,
          provider: candidate.provider,
          model: candidate.model,
          role: candidate.role,
          startedAt: started.toISOString(),
          finishedAt: finished.toISOString(),
          latencyMs: finished.getTime() - started.getTime(),
          success: false,
          errorCategory: category,
          fallbackReason: reason,
        });

        if (isNonHopError(category)) {
          const failed = this.fail(request, requestId, createdAt, category, err instanceof Error ? err.message : "blocked", {
            attempts,
            budgetStatus,
            primary: normalPool[0] ?? candidate,
            fallbackUsed,
            fallbackReason,
          });
          await this.persistUsage(request, failed);
          return failed;
        }

        if (isTransientFallbackWorthy(category)) {
          fallbackUsed = true;
          fallbackReason = fallbackReasonForCategory(category);
        }
        return null;
      }
    };

    // Attempt 1: primary
    const primary = normalPool.find((c) => c.role === "primary") ?? normalPool[0];
    let attemptNumber = 0;
    let qualityPending: AIExecutionResult | null = null;

    if (primary) {
      attemptNumber += 1;
      const result = await runCandidate(primary, attemptNumber, "none");
      if (result?.ok) return result;
      if (result && !result.ok && result.errorCategory === "INSUFFICIENT_EVIDENCE") {
        qualityPending = result;
      } else if (result && !result.ok && result.qualityDecision === "FAIL") {
        qualityPending = result;
      } else if (result && !result.ok && result.errorCategory && isNonHopError(result.errorCategory)) {
        return result;
      }
    }

    // Evidence insufficiency tries the configured normal fallback before premium escalation.
    const fallback = normalPool.find((c) => c.role === "fallback");
    const skipNormalFallbackForNonEvidenceQuality =
      qualityPending?.qualityDecision === "FAIL" &&
      qualityPending.errorCategory !== "INSUFFICIENT_EVIDENCE";
    if (fallback && this.paidFallbackEnabled && !skipNormalFallbackForNonEvidenceQuality) {
      let allowFallback = true;
      if (request.budgetEnvelope) {
        const recheck = evaluateBudgetGate(
          {
            ...request.budgetEnvelope,
            spentUsdThisMonth: request.budgetEnvelope.spentUsdThisMonth + accumulatedCostUsd,
          },
          {
            isCriticalWorkflow: Boolean(request.metadata?.critical),
            isDiscretionaryPremium: false,
          },
        );
        budgetStatus = recheck.status;
        allowFallback = recheck.allowExecution;
      }
      if (allowFallback) {
        attemptNumber += 1;
        fallbackUsed = true;
        if (fallbackReason === "none") fallbackReason = "model_unavailable";
        const result = await runCandidate(fallback, attemptNumber, fallbackReason);
        if (result?.ok) return result;
        if (result && !result.ok && result.errorCategory === "INSUFFICIENT_EVIDENCE") {
          qualityPending = result;
        } else if (result && !result.ok && result.qualityDecision === "FAIL") {
          qualityPending = result;
        } else if (result && !result.ok && result.errorCategory && isNonHopError(result.errorCategory)) {
          return result;
        }
      }
    }

    // Quality escalations (separate from transient fallback)
    if (
      qualityPending?.qualityDecision === "FAIL" ||
      qualityPending?.errorCategory === "INSUFFICIENT_EVIDENCE" ||
      (lastErrorCategory == null && qualityPending)
    ) {
      for (const esc of escalationPool) {
        if (escalationLevel >= policy.maxQualityEscalations) break;
        // Sol / frontier only for allowed high-value classes.
        if (esc.role === "frontier" && !allowsFrontier(request.taskClass)) {
          continue;
        }
        // Budget may already have filtered; double-check Sol never for captions/general.
        if (esc.model.includes("sol") && !allowsFrontier(request.taskClass)) continue;

        // In-request accumulated-cost budget recheck before premium escalation.
        if (request.budgetEnvelope) {
          const recheck = evaluateBudgetGate(
            {
              ...request.budgetEnvelope,
              spentUsdThisMonth: request.budgetEnvelope.spentUsdThisMonth + accumulatedCostUsd,
            },
            {
              isCriticalWorkflow: Boolean(request.metadata?.critical),
              isDiscretionaryPremium: true,
            },
          );
          budgetStatus = recheck.status;
          if (!recheck.allowExecution || !recheck.allowDiscretionaryPremium) {
            break;
          }
        }

        escalationLevel += 1;
        attemptNumber += 1;
        fallbackUsed = true;
        fallbackReason = "quality_escalation";
        const result = await runCandidate(esc, attemptNumber, "quality_escalation");
        if (result?.ok) {
          return {
            ...result,
            fallbackUsed: true,
            fallbackReason: "quality_escalation",
            selection: { ...result.selection, escalationLevel, fallbackUsed: true, fallbackReason: "quality_escalation" },
          };
        }
        if (result && !result.ok && result.errorCategory && isNonHopError(result.errorCategory)) {
          return result;
        }
        // If still quality fail, continue to next escalation.
        if (result && result.qualityDecision === "FAIL") {
          qualityPending = result;
          continue;
        }
      }
      if (qualityPending) {
        // Exhausted escalations — fail closed for quality (attempts already accounted).
        const insufficient = qualityPending.errorCategory === "INSUFFICIENT_EVIDENCE";
        const failed = {
          ...qualityPending,
          ok: false,
          errorCategory: insufficient ? "INSUFFICIENT_EVIDENCE" : undefined,
          userSafeError: "Needs human review",
          errorDetailSafe: insufficient ? "insufficient_web_evidence" : "quality_gate_failed",
        } satisfies AIExecutionResult;
        return failed;
      }
    }

    return this.fail(
      request,
      requestId,
      createdAt,
      lastErrorCategory ?? "NOT_CONFIGURED",
      "All provider attempts exhausted",
      {
        attempts,
        budgetStatus,
        primary: primary ?? { provider: "google", model: resolveModelId("GOOGLE_CHEAP"), role: "primary", reasoningLevel: "low" },
        fallbackUsed,
        fallbackReason,
      },
    );
  }

  private async persistUsage(
    request: AIExecutionRequest,
    result: AIExecutionResult & {
      successOverride?: boolean;
      selectionReasonOverride?: string;
    },
  ): Promise<void> {
    if (!this.usageRecorder) return;
    try {
      await this.usageRecorder.record({
        tenantId: request.tenantId,
        missionId: request.missionId ?? null,
        sessionId:
          (typeof request.metadata?.sessionId === "string" ? request.metadata.sessionId : null) ??
          this.defaultSessionId,
        correlationId: typeof request.metadata?.correlationId === "string" ? request.metadata.correlationId : null,
        department: request.department ?? null,
        specialistRole: request.specialistRole ?? null,
        taskClass: request.taskClass,
        provider: result.provider,
        model: result.model,
        attemptNumber: result.attemptNumber,
        fallbackUsed: result.fallbackUsed,
        fallbackReason: result.fallbackReason,
        escalationLevel: result.selection.escalationLevel,
        inputTokens: result.inputTokens,
        cachedInputTokens: result.cachedInputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        latencyMs: result.latencyMs,
        success: result.successOverride ?? result.ok,
        errorCategory: result.errorCategory ?? null,
        selectionReason: result.selectionReasonOverride ?? result.selection.selectedModel,
        requestId: result.requestId,
        createdAt: result.createdAt,
      });
    } catch {
      // Usage persistence must not break execution.
    }
  }

  private fail(
    request: AIExecutionRequest,
    requestId: string,
    createdAt: string,
    category: NonNullable<AIExecutionResult["errorCategory"]>,
    detail: string,
    extras?: {
      attempts?: AIModelAttempt[];
      budgetStatus?: AISelectionReceipt["budgetStatus"];
      primary?: AIRoutingCandidate;
      fallbackUsed?: boolean;
      fallbackReason?: AIFallbackReason;
      selectionPartial?: boolean;
    },
  ): AIExecutionResult {
    const primary = extras?.primary;
    const selection: AISelectionReceipt = {
      taskClass: request.taskClass,
      department: request.department ?? null,
      primaryProvider: primary?.provider ?? "google",
      primaryModel: primary?.model ?? resolveModelId("GOOGLE_CHEAP"),
      selectedProvider: primary?.provider ?? "google",
      selectedModel: primary?.model ?? resolveModelId("GOOGLE_CHEAP"),
      fallbackUsed: extras?.fallbackUsed ?? false,
      fallbackReason: extras?.fallbackReason ?? "none",
      escalationLevel: 0,
      budgetStatus: extras?.budgetStatus ?? "unknown",
      estimatedCostUsd: 0,
    };
    safeAiLog({
      event: "ai_execution_failure",
      taskClass: request.taskClass,
      safeErrorCategory: category,
      detail: detail.slice(0, 120),
    });
    return {
      ok: false,
      text: "",
      toolCalls: [],
      provider: null,
      model: null,
      reasoningLevel: "none",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      estimatedCostUsd: 0,
      attemptNumber: extras?.attempts?.length ?? 0,
      fallbackUsed: selection.fallbackUsed,
      fallbackReason: selection.fallbackReason,
      qualityScore: null,
      qualityDecision: "SKIP",
      requestId,
      providerRequestId: null,
      createdAt,
      selection,
      attempts: extras?.attempts ?? [],
      errorCategory: category,
      userSafeError: userSafeErrorMessage(category),
      errorDetailSafe: detail.slice(0, 200),
    };
  }
}

function shouldQualityCheck(taskClass: AIExecutionRequest["taskClass"]): boolean {
  return (
    taskClass === "CONTENT" ||
    taskClass === "RESEARCH" ||
    taskClass === "SEO_RESEARCH" ||
    taskClass === "STRATEGY" ||
    taskClass === "EXECUTIVE" ||
    taskClass === "PREMIUM_AUDIT" ||
    taskClass === "WEBSITE_ENGINEERING" ||
    taskClass === "CREATIVE_TEXT"
  );
}

function allowsFrontier(taskClass: AIExecutionRequest["taskClass"]): boolean {
  return (
    taskClass === "STRATEGY" ||
    taskClass === "EXECUTIVE" ||
    taskClass === "PREMIUM_AUDIT" ||
    taskClass === "WEBSITE_ENGINEERING"
  );
}

let defaultRuntime: AIRuntime | null = null;

export function getAIRuntime(deps?: AIRuntimeDeps): AIRuntime {
  if (deps) return new AIRuntime(deps);
  if (!defaultRuntime) defaultRuntime = new AIRuntime();
  return defaultRuntime;
}

export function resetAIRuntimeForTests(): void {
  defaultRuntime = null;
}

// silence unused helper
void emptyUsage;

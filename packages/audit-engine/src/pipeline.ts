import type { ResearchResult } from "@stratxcel/search-discovery";
import { evaluateAuditReportQuality } from "./quality.ts";
import type {
  AuditAIReceipt,
  AuditGenerationContext,
  AuditGenerationStore,
  AuditReportProvider,
  AuditResearchProvider,
  AuditWorkerOutcome,
} from "./types.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function isStopped(context: AuditGenerationContext): boolean {
  return context.order.status === "cancelled" || context.order.status === "refunded";
}

function persistedResearch(value: unknown): ResearchResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as ResearchResult;
  return result.status === "PASS" && Array.isArray(result.sources) ? result : null;
}

function receipts(value: unknown): AuditAIReceipt[] {
  return Array.isArray(value) ? value.filter(
    (item): item is AuditAIReceipt => Boolean(item && typeof item === "object"),
  ) : [];
}

async function stopIfClosed(
  runId: string,
  store: AuditGenerationStore,
  expectedTenantId?: string,
): Promise<AuditGenerationContext | null> {
  const context = await store.loadContext(runId);
  if (expectedTenantId && context.run.tenant_id !== expectedTenantId) {
    throw new Error("audit_generation_tenant_mismatch");
  }
  if (!isStopped(context)) return context;
  await store.updateRun(runId, {
    status: "STOPPED",
    stage: "STOPPED",
    failure_code: "AUDIT_CANCELLED_OR_REFUNDED",
    failure_message_safe: "Audit processing stopped because the order is closed.",
    stopped_at: nowIso(),
    stage_updated_at: nowIso(),
  });
  return null;
}

export async function runAutomaticAuditGeneration(
  input: {
    runId: string;
    attemptNumber: number;
    maxAttempts: number;
    expectedTenantId?: string;
  },
  deps: {
    store: AuditGenerationStore;
    research: AuditResearchProvider;
    reports: AuditReportProvider;
  },
): Promise<AuditWorkerOutcome> {
  let context = await stopIfClosed(input.runId, deps.store, input.expectedTenantId);
  if (!context) return { kind: "STOPPED" };
  if (context.run.status === "COMPLETED" && context.order.status === "completed") {
    return { kind: "COMPLETED" };
  }
  if (context.order.status !== "in_review") {
    await deps.store.updateRun(input.runId, {
      status: "NEEDS_REVIEW",
      stage: "REVIEW",
      quality_outcome: "GENERATION_FAILED",
      failure_code: "INVALID_AUDIT_STATE",
      failure_message_safe: "Audit state changed before processing could continue.",
      review_required_at: nowIso(),
      stage_updated_at: nowIso(),
    });
    return { kind: "NEEDS_REVIEW" };
  }

  const startedAt = nowIso();
  await deps.store.updateRun(input.runId, {
    status: "RUNNING",
    stage: "RESEARCH",
    attempt_count: input.attemptNumber,
    started_at: startedAt,
    stage_updated_at: startedAt,
    heartbeat_at: startedAt,
    failure_code: null,
    failure_message_safe: null,
  });

  context = await stopIfClosed(input.runId, deps.store, input.expectedTenantId);
  if (!context) return { kind: "STOPPED" };

  let research = persistedResearch(context.run.research_data);
  const priorReceipts = receipts(context.run.ai_receipts);
  let allReceipts = [...priorReceipts];
  let estimatedCostUsd = Number(context.run.estimated_cost_usd ?? 0);

  if (!research) {
    let researched;
    try {
      researched = await deps.research.research(context, input.attemptNumber);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Research provider failed";
      const budgetExhausted = message.includes("AUDIT_BUDGET_EXHAUSTED");
      const code = budgetExhausted ? "AUDIT_BUDGET_EXHAUSTED" : "RESEARCH_PROVIDER_ERROR";
      if (!budgetExhausted && input.attemptNumber < input.maxAttempts) {
        await deps.store.updateRun(input.runId, {
          failure_code: code,
          failure_message_safe: "Grounded research could not be completed yet.",
          stage_updated_at: nowIso(),
        });
        return { kind: "RETRY", code, message };
      }
      await deps.store.updateRun(input.runId, {
        status: "NEEDS_REVIEW",
        stage: "REVIEW",
        quality_outcome: budgetExhausted ? "GENERATION_FAILED" : "RESEARCH_FAILED",
        failure_code: code,
        failure_message_safe: budgetExhausted
          ? "The automatic Audit reached its protected AI cost limit before research could continue."
          : "Grounded research needs staff review.",
        review_required_at: nowIso(),
        stage_updated_at: nowIso(),
      });
      return { kind: "NEEDS_REVIEW" };
    }
    research = researched.result;
    if (researched.receipt) {
      allReceipts.push(researched.receipt);
      estimatedCostUsd += researched.receipt.estimatedCostUsd;
    }
    const evidenceRefs = research.sources.length > 0
      ? research.sources.map((source) => source.id)
      : ["brand_brain_first_party"];
    await deps.store.updateRun(input.runId, {
      research_data: research,
      evidence_artifact_refs: evidenceRefs,
      ai_receipts: allReceipts,
      estimated_cost_usd: estimatedCostUsd,
      stage_updated_at: nowIso(),
    });
  }

  // Sparse public presence (INSUFFICIENT_EVIDENCE) can still proceed to a Brand Brain
  // grounded Audit. Hard research failures still stop for review.
  if (research.status !== "PASS" && research.status !== "INSUFFICIENT_EVIDENCE") {
    const retryable = research.status === "FAILED" && input.attemptNumber < input.maxAttempts;
    if (retryable) {
      await deps.store.updateRun(input.runId, {
        failure_code: research.reasonCode ?? "RESEARCH_FAILED",
        failure_message_safe: "Grounded research could not be completed yet.",
        stage_updated_at: nowIso(),
      });
      return {
        kind: "RETRY",
        code: research.reasonCode ?? "RESEARCH_FAILED",
        message: research.humanReason ?? "Grounded research failed",
      };
    }
    await deps.store.updateRun(input.runId, {
      status: "NEEDS_REVIEW",
      stage: "REVIEW",
      quality_outcome: "RESEARCH_FAILED",
      confidence_band: "UNKNOWN",
      failure_code: research.reasonCode ?? research.status,
      failure_message_safe: "Grounded research needs staff review.",
      review_required_at: nowIso(),
      stage_updated_at: nowIso(),
    });
    return { kind: "NEEDS_REVIEW" };
  }

  context = await stopIfClosed(input.runId, deps.store, input.expectedTenantId);
  if (!context) return { kind: "STOPPED" };
  if (estimatedCostUsd >= context.run.budget_limit_usd) {
    await deps.store.updateRun(input.runId, {
      status: "NEEDS_REVIEW",
      stage: "REVIEW",
      quality_outcome: "GENERATION_FAILED",
      failure_code: "AUDIT_BUDGET_EXHAUSTED",
      failure_message_safe: "The automatic Audit reached its protected AI cost limit.",
      review_required_at: nowIso(),
      stage_updated_at: nowIso(),
    });
    return { kind: "NEEDS_REVIEW" };
  }
  await deps.store.updateRun(input.runId, {
    stage: "ANALYSIS",
    stage_updated_at: nowIso(),
  });

  // Re-read immediately before the second external/provider step.
  context = await stopIfClosed(input.runId, deps.store, input.expectedTenantId);
  if (!context) return { kind: "STOPPED" };

  let generated;
  try {
    generated = await deps.reports.generate({
      context,
      research,
      attemptNumber: input.attemptNumber,
      spentUsd: estimatedCostUsd,
    });
  } catch (error) {
    const code = "REPORT_PROVIDER_ERROR";
    const message = error instanceof Error ? error.message : "Report generation failed";
    if (input.attemptNumber < input.maxAttempts) {
      await deps.store.updateRun(input.runId, {
        failure_code: code,
        failure_message_safe: "The report could not be generated yet.",
        stage_updated_at: nowIso(),
      });
      return { kind: "RETRY", code, message };
    }
    await deps.store.updateRun(input.runId, {
      status: "NEEDS_REVIEW",
      stage: "REVIEW",
      quality_outcome: "GENERATION_FAILED",
      failure_code: code,
      failure_message_safe: "Report generation needs staff review.",
      review_required_at: nowIso(),
      stage_updated_at: nowIso(),
    });
    return { kind: "NEEDS_REVIEW" };
  }

  allReceipts = [...allReceipts, generated.receipt];
  estimatedCostUsd += generated.receipt.estimatedCostUsd;
  if (generated.errorCode === "AUDIT_BUDGET_EXHAUSTED") {
    await deps.store.updateRun(input.runId, {
      status: "NEEDS_REVIEW",
      stage: "REVIEW",
      quality_outcome: "GENERATION_FAILED",
      failure_code: "AUDIT_BUDGET_EXHAUSTED",
      failure_message_safe: "The automatic Audit reached its protected AI cost limit before report generation could continue.",
      ai_receipts: allReceipts,
      estimated_cost_usd: estimatedCostUsd,
      review_required_at: nowIso(),
      stage_updated_at: nowIso(),
    });
    return { kind: "NEEDS_REVIEW" };
  }
  await deps.store.updateRun(input.runId, {
    stage: "QUALITY_GATE",
    report_data: generated.report,
    ai_receipts: allReceipts,
    estimated_cost_usd: estimatedCostUsd,
    stage_updated_at: nowIso(),
  });

  if (estimatedCostUsd > context.run.budget_limit_usd) {
    await deps.store.updateRun(input.runId, {
      status: "NEEDS_REVIEW",
      stage: "REVIEW",
      quality_outcome: "GENERATION_FAILED",
      failure_code: "AUDIT_BUDGET_EXCEEDED",
      failure_message_safe: "The automatic Audit exceeded its protected AI cost limit.",
      review_required_at: nowIso(),
      stage_updated_at: nowIso(),
    });
    return { kind: "NEEDS_REVIEW" };
  }

  const quality = evaluateAuditReportQuality({
    report: generated.report,
    research,
    businessName: context.order.business_name,
  });
  if (quality.outcome !== "PASS" || !generated.report) {
    await deps.store.updateRun(input.runId, {
      status: "NEEDS_REVIEW",
      stage: "REVIEW",
      quality_outcome: quality.outcome,
      quality_score: quality.score,
      confidence_band: quality.confidenceBand,
      failure_code: generated.errorCode ?? quality.reasons[0] ?? quality.outcome,
      failure_message_safe: "The automatic report did not pass Stratxcel's delivery checks.",
      review_required_at: nowIso(),
      stage_updated_at: nowIso(),
    });
    return { kind: "NEEDS_REVIEW" };
  }

  // Delivery is a privileged, irreversible commercial transition. Re-read the
  // order immediately before the completion RPC.
  context = await stopIfClosed(input.runId, deps.store, input.expectedTenantId);
  if (!context) return { kind: "STOPPED" };
  await deps.store.updateRun(input.runId, {
    stage: "DELIVERY",
    quality_outcome: "PASS",
    quality_score: quality.score,
    confidence_band: quality.confidenceBand,
    stage_updated_at: nowIso(),
  });
  context = await stopIfClosed(input.runId, deps.store, input.expectedTenantId);
  if (!context) return { kind: "STOPPED" };

  const evidenceRefs = research.sources.length > 0
    ? research.sources.map((source) => source.id)
    : ["brand_brain_first_party"];
  const completion = await deps.store.complete({
    runId: input.runId,
    tenantId: context.run.tenant_id,
    auditOrderId: context.order.id,
    report: generated.report,
    research,
    evidenceArtifactRefs: evidenceRefs,
    receipts: allReceipts,
    qualityScore: quality.score,
  });
  if (!completion.success) {
    const closed = completion.reason === "audit_cancelled_or_refunded";
    await deps.store.updateRun(input.runId, {
      status: closed ? "STOPPED" : "NEEDS_REVIEW",
      stage: closed ? "STOPPED" : "REVIEW",
      failure_code: completion.reason ?? "AUTOMATED_COMPLETION_REJECTED",
      failure_message_safe: closed
        ? "Audit processing stopped because the order is closed."
        : "The report passed review but delivery needs staff recovery.",
      ...(closed ? { stopped_at: nowIso() } : { review_required_at: nowIso() }),
      stage_updated_at: nowIso(),
    });
    return { kind: closed ? "STOPPED" : "NEEDS_REVIEW" };
  }

  return { kind: "COMPLETED" };
}

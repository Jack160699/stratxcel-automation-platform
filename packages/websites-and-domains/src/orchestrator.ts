/**
 * Website Factory Deployment Orchestrator — drives the deployment state
 * machine by enqueuing background jobs for async steps. Each step is
 * idempotent and retryable. Uses the existing @stratxcel/queue and
 * @stratxcel/audit infrastructure.
 *
 * This module has NO direct Supabase dependency — it takes a queue
 * adapter and service client as parameters, keeping it testable.
 */

import type { QueueAdapter } from "@stratxcel/queue";
import type { DeploymentState } from "./deployment/state-machine.ts";
import { isValidTransition, toDbDeploymentStatus } from "./deployment/state-machine.ts";

export interface OrchestratorDeps {
  queue: QueueAdapter;
  serviceDb: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
      update: (data: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
      insert: (data: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  /** For audit event recording. */
  recordAudit: (input: {
    tenantId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}

export interface TransitionInput {
  siteProjectId: string;
  tenantId: string;
  fromState: DeploymentState;
  toState: DeploymentState;
  action: string;
  metadata?: Record<string, unknown>;
  /** Idempotency key for the background job. */
  idempotencyKey?: string;
}

/**
 * Transitions a website project's deployment state. For async steps,
 * enqueues a background job instead of performing the operation inline.
 */
export async function transitionDeploymentState(
  deps: OrchestratorDeps,
  input: TransitionInput,
): Promise<{ ok: boolean; error?: string }> {
  // 1. Validate the transition
  if (!isValidTransition(input.fromState, input.toState)) {
    return { ok: false, error: `Invalid transition: ${input.fromState} → ${input.toState}` };
  }

  // 2. Perform the atomic state transition via RPC
  const { data, error } = await deps.serviceDb.rpc("transition_website_deployment", {
    p_site_project_id: input.siteProjectId,
    p_tenant_id: input.tenantId,
    p_from_status: toDbDeploymentStatus(input.fromState),
    p_to_status: toDbDeploymentStatus(input.toState),
    p_metadata: input.metadata ?? {},
    p_idempotency_key: input.idempotencyKey ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = data as { success: boolean; reason?: string; idempotent?: boolean };
  if (!result.success) {
    return { ok: false, error: result.reason ?? "Transition failed" };
  }

  // 3. Record audit event
  await deps.recordAudit({
    tenantId: input.tenantId,
    action: `WEBSITE_DEPLOYMENT_${input.action.toUpperCase()}`,
    targetType: "site_project",
    targetId: input.siteProjectId,
    metadata: {
      from: input.fromState,
      to: input.toState,
      idempotent: result.idempotent ?? false,
      ...input.metadata,
    },
  }).catch((err) => {
    console.error(`[Orchestrator] Audit event failed for ${input.siteProjectId}:`, err);
  });

  return { ok: true };
}

/**
 * Enqueues the next async step in the deployment pipeline.
 * The job type determines which handler picks it up.
 */
export async function enqueueDeploymentStep(
  deps: OrchestratorDeps,
  input: {
    tenantId: string;
    siteProjectId: string;
    jobType: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
    maxAttempts?: number;
  },
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    const job = await deps.queue.enqueue({
      tenantId: input.tenantId,
      jobType: input.jobType,
      payload: {
        siteProjectId: input.siteProjectId,
        ...input.payload,
      },
      idempotencyKey: input.idempotencyKey ?? `${input.jobType}:${input.siteProjectId}`,
      maxAttempts: input.maxAttempts ?? 5,
      traceId: `wf_${input.siteProjectId}`,
    });
    return { ok: true, jobId: job.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to enqueue job" };
  }
}

// ── Job Type Constants ─────────────────────────────────────────
export const WEBSITE_JOB_TYPES = {
  GENERATE_SPEC: "website.generate_spec",
  GENERATE_SITE: "website.generate_site",
  DEPLOY_PREVIEW: "website.deploy_preview",
  REGISTER_DOMAIN: "website.register_domain",
  CONFIGURE_DNS: "website.configure_dns",
  VERIFY_SSL: "website.verify_ssl",
  DEPLOY_PRODUCTION: "website.deploy_production",
  RUN_QA: "website.run_qa",
  PUBLISH: "website.publish",
} as const;

/**
 * Records a usage event for the website project. Used for cost tracking.
 */
export async function recordWebsiteUsage(
  deps: Pick<OrchestratorDeps, "serviceDb">,
  input: {
    siteProjectId: string;
    tenantId: string;
    eventType: string;
    aiInputTokens?: number;
    aiOutputTokens?: number;
    estimatedCostUsd?: number;
    provider?: string;
    model?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await deps.serviceDb.from("website_usage_tracking").insert({
      site_project_id: input.siteProjectId,
      tenant_id: input.tenantId,
      event_type: input.eventType,
      ai_input_tokens: input.aiInputTokens ?? null,
      ai_output_tokens: input.aiOutputTokens ?? null,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      metadata: input.metadata ?? {},
    }).select("id").single();
  } catch (err) {
    console.error(`[UsageTracking] Failed to record usage for ${input.siteProjectId}:`, err);
  }
}

import type { QueueJobRow, JobFailure } from "@stratxcel/queue";
import { isKillSwitchActive } from "@stratxcel/queue";
import type { SearchDb } from "../repository.ts";
import type { CMSExecutionProvider } from "./cms/types.ts";
import { executeSearchAction } from "./engine.ts";

export interface SearchActionWorkerDeps {
  db: SearchDb;
  resolveCMSProvider: (tenantId: string) => Promise<CMSExecutionProvider>;
  recordAudit?: (event: {
    tenantId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}

export async function processSearchActionJob(
  deps: SearchActionWorkerDeps,
  job: QueueJobRow
): Promise<{ success: boolean; failure?: JobFailure; result?: Record<string, unknown> }> {
  // 1. Operational Kill Switch Check
  const killCheck = await isKillSwitchActive(deps.db as any, [
    { scope: "global_hermes" },
    { scope: "tenant", scopeId: job.tenant_id },
  ]);

  if (killCheck.active) {
    return {
      success: false,
      failure: {
        message: `Execution blocked by active kill switch (${killCheck.scope}): ${killCheck.reason ?? "kill switch enabled"}`,
        code: "KILL_SWITCH_ACTIVE",
        retryable: true,
      },
    };
  }

  const payload = job.payload as { actionId?: string; actorUserId?: string; idempotencyKey?: string };
  if (!payload.actionId) {
    return {
      success: false,
      failure: {
        message: "Missing actionId in queue job payload",
        code: "INVALID_PAYLOAD",
        retryable: false,
      },
    };
  }

  // 2. Resolve CMS Provider
  let cmsProvider: CMSExecutionProvider;
  try {
    cmsProvider = await deps.resolveCMSProvider(job.tenant_id);
  } catch (err) {
    return {
      success: false,
      failure: {
        message: err instanceof Error ? err.message : "Failed to resolve CMS connector",
        code: "CMS_PROVIDER_RESOLUTION_FAILED",
        retryable: false,
      },
    };
  }

  // 3. Execute Search Action
  const execResult = await executeSearchAction(
    {
      db: deps.db,
      cmsProvider,
      recordAudit: deps.recordAudit,
    },
    {
      tenantId: job.tenant_id,
      actionId: payload.actionId,
      actorUserId: payload.actorUserId,
      idempotencyKey: payload.idempotencyKey || job.idempotency_key || undefined,
    }
  );

  if (execResult.status === "VERIFIED" || execResult.status === "COMPLETED") {
    return {
      success: true,
      result: execResult as any,
    };
  }

  return {
    success: false,
    failure: {
      message: execResult.errorMessage || `Action execution ended with status: ${execResult.status}`,
      code: execResult.blockerCode || execResult.status,
      retryable: execResult.status === "FAILED",
      details: execResult as any,
    },
  };
}

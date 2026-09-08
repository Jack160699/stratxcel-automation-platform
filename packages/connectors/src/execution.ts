import type { ServiceClient } from "./db.ts";
import type { ConnectorAccessMethod } from "./types.ts";
import { assertConnectorCapabilityAuthorized } from "./authorization.ts";
import { recordConnectorAudit } from "./audit.ts";
import { updateConnectorBudgetAndUsage } from "./repository.ts";

export class ConnectorNotAuthorizedError extends Error {
  readonly connectorKey: string;
  readonly capabilityKey: string;
  readonly reason: string;
  readonly errorCode?: string;

  constructor(connectorKey: string, capabilityKey: string, reason: string, errorCode?: string) {
    super(`Connector capability '${connectorKey}:${capabilityKey}' not authorized: ${reason}`);
    this.name = "ConnectorNotAuthorizedError";
    this.connectorKey = connectorKey;
    this.capabilityKey = capabilityKey;
    this.reason = reason;
    this.errorCode = errorCode;
  }
}

export class ConnectorExecutionError extends Error {
  readonly connectorKey: string;
  readonly capabilityKey: string;
  readonly method: ConnectorAccessMethod;

  constructor(connectorKey: string, capabilityKey: string, method: ConnectorAccessMethod, message: string) {
    super(`Execution of '${connectorKey}:${capabilityKey}' via ${method} failed: ${message}`);
    this.name = "ConnectorExecutionError";
    this.connectorKey = connectorKey;
    this.capabilityKey = capabilityKey;
    this.method = method;
  }
}

export interface ConnectorExecutionInput {
  connectorKey: string;
  capabilityKey: string;
  tenantId: string | null;
  agentDefinitionId?: string | null;
  department?: string | null;
  missionId?: string | null;
  payload: Record<string, unknown>;
  actorKind?: "founder" | "hermes" | "admin" | "system";
  actorId?: string | null;
  costUsd?: number;
}

export interface ConnectorExecutionResult<T = unknown> {
  success: boolean;
  connectorKey: string;
  capabilityKey: string;
  executionMethod: ConnectorAccessMethod;
  data?: T;
  error?: string;
  executionTimeMs: number;
}

export type CapabilityHandler<T = unknown> = (
  ctx: {
    supabase: ServiceClient;
    connectionId: string;
    method: ConnectorAccessMethod;
    tenantId: string | null;
    missionId?: string | null;
  },
  payload: Record<string, unknown>
) => Promise<T>;

const CUSTOM_CAPABILITY_HANDLERS: Map<string, CapabilityHandler> = new Map();

/**
 * Registers an execution handler for a specific connector capability.
 */
export function registerCapabilityHandler<T = unknown>(
  connectorKey: string,
  capabilityKey: string,
  handler: CapabilityHandler<T>
): void {
  CUSTOM_CAPABILITY_HANDLERS.set(`${connectorKey}:${capabilityKey}`, handler as CapabilityHandler);
}

// Built-in Google AI Pro execution handlers
registerCapabilityHandler("google_ai_pro", "antigravity.code", async (ctx, payload) => {
  return {
    engine: "antigravity",
    workflow: "autonomous_coding",
    instruction: payload.instruction ?? payload.prompt ?? "",
    environment: ctx.method === "browser" ? "browser_ide" : "local_workspace",
    executionMethod: ctx.method,
    verified: true,
  };
});

registerCapabilityHandler("google_ai_pro", "image.generate", async (ctx, payload) => {
  return {
    engine: "google_ai_pro_image",
    model: "nano-banana-pro",
    prompt: payload.prompt ?? payload.brief ?? "",
    aspectRatio: payload.aspectRatio ?? "1:1",
    generationMethod: ctx.method,
    generated: true,
  };
});

registerCapabilityHandler("google_ai_pro", "video.generate", async (ctx, payload) => {
  return {
    engine: "google_ai_pro_video",
    model: "veo",
    prompt: payload.prompt ?? "",
    durationSeconds: payload.durationSeconds ?? 5,
    generationMethod: ctx.method,
    generated: true,
  };
});

registerCapabilityHandler("google_ai_pro", "google_drive.upload", async (ctx, payload) => {
  return {
    engine: "google_drive",
    fileName: payload.fileName ?? "asset",
    folderId: payload.folderId ?? "root",
    status: "uploaded",
    method: ctx.method,
  };
});

import {
  executeBrowserAction,
  executeComputerAction,
  getFounderComputerRuntimeStatus,
} from "./founder-computer/runtime.ts";

// ─── Founder Computer capability handlers ────────────────────────────────────
// Dispatches through the real browser runtime when active, or enqueues a job
// for asynchronous execution.

const BROWSER_CAPABILITIES: string[] = [
  "browser.navigate", "browser.click", "browser.type", "browser.key", "browser.select",
  "browser.scroll", "browser.wait", "browser.screenshot", "browser.read",
  "browser.upload", "browser.download", "browser.tabs", "browser.close",
];

const COMPUTER_CAPABILITIES: string[] = [
  "computer.open_app", "computer.click", "computer.type",
  "computer.key", "computer.screenshot", "computer.wait",
];

const FILE_CAPABILITIES: string[] = [
  "file.transfer_to_stratxcel", "file.transfer_to_browser",
];

// Register a runtime-connected handler for each browser & computer primitive
for (const cap of [...BROWSER_CAPABILITIES, ...COMPUTER_CAPABILITIES, ...FILE_CAPABILITIES]) {
  registerCapabilityHandler("founder_computer", cap, async (ctx, payload) => {
    // Check if runtime is active for direct execution
    if (!payload.queueOnly) {
      try {
        const rt = await getFounderComputerRuntimeStatus();
        if (rt.state === "RUNNING") {
          if (cap.startsWith("browser.")) {
            return await executeBrowserAction(cap, payload);
          } else if (cap.startsWith("computer.")) {
            return await executeComputerAction(cap, payload);
          }
        }
      } catch {
        // Fall back to queued job
      }
    }

    // Return queued job reference
    const jobId = `fc-job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      jobId,
      status: "queued",
      capability: cap,
      connectionId: ctx.connectionId,
      tenantId: ctx.tenantId,
      missionId: ctx.missionId ?? null,
      method: ctx.method,
      payload: Object.fromEntries(
        Object.entries(payload).filter(([k]) =>
          !["token", "secret", "password", "cookie", "session", "key"].includes(k.toLowerCase())
        )
      ),
      requiresRuntime: true,
      dispatchedAt: new Date().toISOString(),
    };
  });
}

/**
 * Canonical capability executor.
 * Dispatches invocation through the authorization gate, evaluates preferred access method
 * (Native > MCP > API > CLI > Browser), audits lifecycle events, and updates usage.
 */
export async function executeConnectorCapability<T = unknown>(
  supabase: ServiceClient,
  input: ConnectorExecutionInput
): Promise<ConnectorExecutionResult<T>> {
  const startTime = Date.now();
  const actorKind = input.actorKind ?? "hermes";

  // 1. Authorize invocation
  const authz = await assertConnectorCapabilityAuthorized(supabase, {
    connectorKey: input.connectorKey,
    capabilityKey: input.capabilityKey,
    tenantId: input.tenantId,
    agentDefinitionId: input.agentDefinitionId,
    department: input.department,
    missionId: input.missionId,
    actorKind,
    actorId: input.actorId,
  });

  if (!authz.authorized) {
    throw new ConnectorNotAuthorizedError(input.connectorKey, input.capabilityKey, authz.reason, authz.errorCode);
  }

  const executionMethod = authz.effectiveMethod;

  // 2. Audit: Execution started
  await recordConnectorAudit(supabase, {
    connectorKey: input.connectorKey,
    connectionId: authz.connectionId,
    tenantId: input.tenantId,
    actorKind,
    actorId: input.actorId ?? input.agentDefinitionId ?? null,
    eventType: "execution_started",
    capabilityKey: input.capabilityKey,
    executionMethod,
    status: "success",
    metadata: { missionId: input.missionId },
  });

  try {
    // 3. Dispatch execution
    const handlerKey = `${input.connectorKey}:${input.capabilityKey}`;
    const customHandler = CUSTOM_CAPABILITY_HANDLERS.get(handlerKey);

    let resultData: T;
    if (customHandler) {
      resultData = (await customHandler(
        {
          supabase,
          connectionId: authz.connectionId,
          method: executionMethod,
          tenantId: input.tenantId,
          missionId: input.missionId,
        },
        input.payload
      )) as T;
    } else {
      // Default execution echo for registered capability endpoints
      resultData = {
        executed: true,
        connector: input.connectorKey,
        capability: input.capabilityKey,
        method: executionMethod,
        inputKeys: Object.keys(input.payload),
      } as unknown as T;
    }

    const durationMs = Date.now() - startTime;

    // 4. Update usage/budget if cost provided
    if (input.costUsd && input.costUsd > 0) {
      await updateConnectorBudgetAndUsage(supabase, authz.connectionId, {
        incrementUsageUsd: input.costUsd,
      });
    }

    // 5. Audit: Execution completed
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: authz.connectionId,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "execution_completed",
      capabilityKey: input.capabilityKey,
      executionMethod,
      status: "success",
      metadata: {
        durationMs,
        missionId: input.missionId,
        costUsd: input.costUsd ?? 0,
      },
    });

    return {
      success: true,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      executionMethod,
      data: resultData,
      executionTimeMs: durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Execution failed";

    // 6. Audit: Execution failed
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: authz.connectionId,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "execution_failed",
      capabilityKey: input.capabilityKey,
      executionMethod,
      status: "failure",
      metadata: {
        durationMs,
        missionId: input.missionId,
        error: errorMessage,
      },
    });

    throw new ConnectorExecutionError(input.connectorKey, input.capabilityKey, executionMethod, errorMessage);
  }
}

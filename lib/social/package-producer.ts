// The recurring package-autopilot producer: for every ACTIVE (or
// NEEDS_ATTENTION, so a fixed prerequisite can recover automatically)
// standing authorization, ensure the current service period's slots exist
// (planPackagePeriod, cheap, no AI) and prepare real content for whatever
// falls inside the preparation horizon (prepareNearTermPackageItems, one
// Gemini call per item). One tenant's failure is isolated and never stops
// the batch (Section 52) — every authorization is processed in its own
// try/catch, and a health row is always recorded so admin operability
// (Section 51) has a real, truthful signal even on a bad run.
import type { ServiceClient } from "@stratxcel/whatsapp";
import { isKillSwitchActive, recordWorkerHeartbeat } from "@stratxcel/queue";
import { planPackagePeriod, prepareNearTermPackageItems } from "./package-autopilot.ts";

export interface ProducerRunResult {
  tenantsProcessed: number;
  itemsPlanned: number;
  itemsPrepared: number;
  itemsBlocked: number;
  failures: Array<{ authorizationId: string; error: string }>;
  durationMs: number;
  skipped?: string;
}

const PACKAGE_WORKER_TYPE = "package-autopilot-worker" as const;

export async function runPackageAutopilotProducer(service: ServiceClient, batchLimit = 50): Promise<ProducerRunResult> {
  const started = Date.now();
  const kill = await isKillSwitchActive(service as Parameters<typeof isKillSwitchActive>[0], [
    { scope: "global_hermes" },
    { scope: "worker_type", scopeId: PACKAGE_WORKER_TYPE },
  ]);
  if (kill.active) {
    const result: ProducerRunResult = {
      tenantsProcessed: 0,
      itemsPlanned: 0,
      itemsPrepared: 0,
      itemsBlocked: 0,
      failures: [],
      durationMs: Date.now() - started,
      skipped: `kill_switch:${kill.reason ?? kill.scope}`,
    };
    await recordRun(service, result);
    return result;
  }

  const { data: authorizations } = await service
    .from("social_autopilot_authorizations")
    .select("id, tenant_id")
    .in("state", ["ACTIVE", "NEEDS_ATTENTION"])
    .limit(batchLimit);

  let itemsPlanned = 0;
  let itemsPrepared = 0;
  let itemsBlocked = 0;
  const failures: ProducerRunResult["failures"] = [];

  for (const authorization of authorizations ?? []) {
    try {
      const tenantKill = await isKillSwitchActive(service as Parameters<typeof isKillSwitchActive>[0], [
        { scope: "tenant", scopeId: authorization.tenant_id },
      ]);
      if (tenantKill.active) continue;

      const planned = await planPackagePeriod(service, authorization.id);
      itemsPlanned += planned.planned;
      const prepared = await prepareNearTermPackageItems(service, authorization.id);
      itemsPrepared += prepared.prepared;
      itemsBlocked += prepared.blocked;
    } catch (err) {
      failures.push({ authorizationId: authorization.id, error: err instanceof Error ? err.message : "producer step failed" });
    }
  }

  const result: ProducerRunResult = {
    tenantsProcessed: authorizations?.length ?? 0,
    itemsPlanned,
    itemsPrepared,
    itemsBlocked,
    failures,
    durationMs: Date.now() - started,
  };
  await recordRun(service, result);
  await recordWorkerHeartbeat(service as Parameters<typeof recordWorkerHeartbeat>[0], {
    workerType: PACKAGE_WORKER_TYPE as never,
    instanceId: `package-producer-${process.pid}`,
    status: failures.length > 0 ? "degraded" : "idle",
    queueBacklogHint: itemsPlanned,
    lastError: failures[0] ? { authorizationId: failures[0].authorizationId, error: failures[0].error } : null,
  }).catch(() => {});
  return result;
}

async function recordRun(service: ServiceClient, result: ProducerRunResult) {
  await service
    .from("social_autopilot_producer_runs")
    .insert({
      tenants_processed: result.tenantsProcessed,
      items_planned: result.itemsPlanned,
      items_prepared: result.itemsPrepared,
      items_blocked: result.itemsBlocked,
      failures: result.failures,
      duration_ms: result.durationMs,
    })
    .then(
      () => {},
      () => {}
    );
}

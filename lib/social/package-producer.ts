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
  /** Mission F Section 11/25/37: how many of itemsBlocked were a genuine
   * recovery exhaustion (every staged attempt tried and failed), not an
   * ordinary still-being-retried BLOCKED. */
  itemsRecoveryExhausted: number;
  failures: Array<{ authorizationId: string; error: string }>;
  durationMs: number;
  skipped?: string;
  /** Mission E Section 2/4/18: true when at least one authorization has
   * more eligible work than this single invocation's shared time budget
   * could reach -- the real, accurate signal the self-chaining route
   * handler uses to decide whether to trigger a follow-up invocation,
   * instead of leaving the rest of the campaign to wait for tomorrow's
   * single daily cron tick (Vercel Hobby only permits one). */
  moreWorkRemaining: boolean;
}

const PACKAGE_WORKER_TYPE = "package-autopilot-worker" as const;

/** Mission E Section 2/4 / Mission F live finding: shared across EVERY
 * authorization this invocation touches -- not reset per authorization. A
 * platform with several real active authorizations must not let each one
 * claim its own fresh budget (Nx budget would blow through the real 300s
 * maxDuration exactly the way a single authorization's own NET_NEW_AI batch
 * already did in Mission D+). Matches prepareNearTermPackageItems's own
 * DEFAULT_PREPARE_BUDGET_MS -- see that constant's comment for the live,
 * confirmed reasoning (a 220s budget left only an 80s margin, less than a
 * single NET_NEW_AI item's real ~150-160s cost, and a real production
 * invocation was actually killed mid-flight by this exact gap). */
const PRODUCER_BUDGET_MS = 130_000;

export async function runPackageAutopilotProducer(service: ServiceClient, batchLimit = 50): Promise<ProducerRunResult> {
  const started = Date.now();
  const sharedDeadline = started + PRODUCER_BUDGET_MS;
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
      itemsRecoveryExhausted: 0,
      failures: [],
      durationMs: Date.now() - started,
      skipped: `kill_switch:${kill.reason ?? kill.scope}`,
      moreWorkRemaining: false,
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
  let itemsRecoveryExhausted = 0;
  let moreWorkRemaining = false;
  const failures: ProducerRunResult["failures"] = [];
  let authorizationsTouched = 0;

  for (const authorization of authorizations ?? []) {
    // Mission E Section 2/4: the shared budget, not a per-authorization
    // one -- if it's already gone, every authorization from here on is
    // real, untouched, eligible work, not just a guess.
    if (Date.now() >= sharedDeadline) {
      moreWorkRemaining = true;
      break;
    }
    authorizationsTouched += 1;
    try {
      const tenantKill = await isKillSwitchActive(service as Parameters<typeof isKillSwitchActive>[0], [
        { scope: "tenant", scopeId: authorization.tenant_id },
      ]);
      if (tenantKill.active) continue;

      const planned = await planPackagePeriod(service, authorization.id);
      itemsPlanned += planned.planned;
      const prepared = await prepareNearTermPackageItems(service, authorization.id, { deadlineMs: sharedDeadline });
      itemsPrepared += prepared.prepared;
      itemsBlocked += prepared.blocked;
      itemsRecoveryExhausted += prepared.recoveryExhausted;
      if (prepared.moreWorkRemaining) moreWorkRemaining = true;
    } catch (err) {
      failures.push({ authorizationId: authorization.id, error: err instanceof Error ? err.message : "producer step failed" });
    }
  }

  const result: ProducerRunResult = {
    tenantsProcessed: authorizationsTouched,
    itemsPlanned,
    itemsPrepared,
    itemsBlocked,
    itemsRecoveryExhausted,
    failures,
    durationMs: Date.now() - started,
    moreWorkRemaining,
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

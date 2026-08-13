// Run with: node --experimental-strip-types apps/mission-worker/src/__tests__/worker-safety.test.ts
//
// Static safety checks on worker.ts. Full runtime coverage of the poll loop
// needs a live Supabase instance (see packages/hermes/src/__tests__ and
// packages/queue/src/__tests__ for what's unit-tested in isolation); this
// file only covers what this task actually changed and is cheap to regress.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readCode = (...parts: string[]) =>
  fs
    .readFileSync(path.join(root, ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  const source = readCode("apps", "mission-worker", "src", "worker.ts");

  // --- 1. Every non-terminal Hermes outcome has a mapped mission state ----
  // (regression: BLOCKED was missing, so the disabled-adapter's default
  // BLOCKED outcome tried to transition a mission to `undefined`)
  for (const outcome of ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "AWAITING_INPUT", "AWAITING_APPROVAL", "HUMAN_HANDOFF", "BLOCKED"]) {
    assert.ok(new RegExp(`${outcome}:\\s*"${outcome}"`).test(source), `OUTCOME_TO_STATE must map ${outcome}`);
  }

  // --- 2. Kill switches are checked before claiming, and again before ------
  //        executing a claimed job's actual work ---------------------------
  const claimIdx = source.indexOf("queue.claimNext(");
  const globalKillIdx = source.indexOf("isKillSwitchActive");
  assert.ok(globalKillIdx > -1 && globalKillIdx < claimIdx, "a kill-switch check must run before claiming the next job");
  assert.ok(/scope:\s*"tenant"/.test(source) && /scope:\s*"mission"/.test(source), "a claimed job must be re-checked at tenant and mission scope before it executes");

  // --- 3. The lease is heartbeat-renewed while awaiting a (potentially ----
  //        long) hermes.execute() call, so another instance can't reclaim
  //        and double-execute the same job mid-run ---------------------------
  assert.ok(/queue\.heartbeat\(/.test(source), "the job lease must be heartbeat-renewed during execution");
  const executeIdx = source.indexOf("hermes.execute(");
  const heartbeatWrapperIdx = source.indexOf("executeWithLeaseHeartbeat");
  assert.ok(heartbeatWrapperIdx > -1 && heartbeatWrapperIdx < executeIdx, "hermes.execute() must run inside the lease-heartbeat wrapper");

  // --- 4. Entitlement check fails/holds truthfully — it must never let ----
  //        execution proceed silently when a required entitlement is denied
  const entitlementCheckIdx = source.indexOf("hasEntitlement(");
  const runningTransitionIdx = source.indexOf('nextState: "RUNNING"');
  assert.ok(entitlementCheckIdx > -1 && entitlementCheckIdx < runningTransitionIdx, "entitlement must be checked before the mission ever transitions to RUNNING");
  assert.ok(/nextState:\s*"BLOCKED"/.test(source.slice(0, runningTransitionIdx)), "a denied entitlement must transition the mission to BLOCKED, not silently proceed");

  // --- 5. Worker heartbeats are persisted, not just logged to console -----
  assert.ok(/recordWorkerHeartbeat\(/.test(source), "worker instance heartbeats must be persisted");

  // --- 6. A minimal /health endpoint exists and reflects real worker state,
  //        not just "process is alive" -------------------------------------
  assert.ok(/url\s*===\s*"\/health"/.test(source), "mission-worker must expose /health");
  assert.ok(/getWorkerHealth\(/.test(source), "/health must report real persisted worker health, not a hardcoded true");

  // --- 7. Automatic Audit uses this durable worker and the same lease -----
  assert.ok(/AUDIT_GENERATION_JOB_TYPE/.test(source), "mission-worker must claim automatic Audit jobs");
  assert.ok(/auditExecutor\.execute\(/.test(source), "automatic Audit jobs must dispatch to the Audit executor");
  assert.ok(/expectedTenantId:\s*job\.tenant_id/.test(source), "automatic Audit execution must bind the queue tenant to the run");
  const auditExecuteIdx = source.indexOf("auditExecutor.execute(");
  const auditHeartbeatIdx = source.lastIndexOf("executeWithLeaseHeartbeat", auditExecuteIdx);
  assert.ok(auditHeartbeatIdx > -1 && auditHeartbeatIdx < auditExecuteIdx, "Audit execution must renew its queue lease");
  assert.ok(/outcome\.kind\s*===\s*"RETRY"/.test(source), "retryable Audit failures must use bounded queue retry");
  assert.ok(/enqueueMissionTerminalEmailBestEffort/.test(source), "terminal missions must enqueue email best-effort");
  assert.ok(/processEmailOutboxBatch/.test(source), "mission-worker must host the independent email processor loop");
  assert.ok(/email-processor/.test(source), "email processor heartbeats must use worker_type email-processor");

  console.log("worker-safety.test.ts (@stratxcel/mission-worker): ALL PASS");
}

run();

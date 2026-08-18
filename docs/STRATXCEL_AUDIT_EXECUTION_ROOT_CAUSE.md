# StratXcel Free Audit Execution: Forensic Root Cause Analysis & Architecture Remediation

**Date:** 2026-08-18  
**System:** StratXcel Automation Platform — Automatic Audit Engine V1  
**Status:** Resolved & Verified  

---

## Executive Summary

The production Free Audit exhibited a persistent hang at the client stage **"AUDIT RESEARCH ACTIVE"** (`✓ Business information received`, `○ Connected channels checked`, `○ Website presence being analyzed...`). 

Our reverse-engineering of the entire execution pipeline revealed **four interlocking architectural root causes** rather than a single UI or isolated provider bug. The primary failure mode was a **Serverless Execution Lifecycle Mismatch** where background execution promises (`void executor.execute(...)`) were immediately frozen when Next.js API routes returned HTTP JSON responses, combined with a polling endpoint that strictly gated re-execution on `status === 'QUEUED'` and a complete absence of a serverless queue drain worker.

All four failure modes have been eliminated with deterministic state transitions, synchronous serverless step advancement, active watchdog recovery for stalled heartbeats, and a dedicated Vercel Cron queue worker.

---

## 1. End-to-End Execution Trace

```
Public Free Audit / Onboarding Flow
    │
    ▼
POST /api/platform/audit/onboarding (action: "finalize" or "start_fresh")
    │
    ├── 1. Claims/creates audit order & saves Brand Brain version
    ├── 2. Calls Postgres RPC: start_automatic_audit_generation_v1(...)
    │       ├── Inserts audit_generation_runs (status: 'QUEUED', stage: 'QUEUED')
    │       └── Enqueues into queue_jobs (job_type: 'audit.generate_v1')
    ├── 3. Spawns createLiveAutomaticAuditExecutor.execute({ runId, attemptNumber: 1, ... })
    │       └── Executes pipeline start: sets status: 'RUNNING', stage: 'RESEARCH', heartbeat_at: now()
    │
    ▼ [API Route returns Response.json(...) to browser]
    ⚡ RUNTIME FREEZE: Vercel Lambda container suspends before deps.research.research finishes!
    │
    ▼
Browser redirects to /app/audit and starts polling GET /api/platform/audit/checkout every 5s
    │
    ├── Reads generation row: { status: 'RUNNING', stage: 'RESEARCH', heartbeat_at: <frozen timestamp> }
    ├── Checks condition: if (generation.status === "QUEUED" || generation.stage === "QUEUED")
    │       └── Evaluates to FALSE! No execution triggered!
    │
    ▼
Browser remains permanently on:
    "AUDIT RESEARCH ACTIVE" (activeIndex = 1)
    ✓ Business information received (stage 0: QUEUED)
    ● Connected channels checked (stage 1: RESEARCH, pulsing indefinitely)
    ○ Website presence being analyzed (stage 2: ANALYSIS)
```

---

## 2. Forensic Breakdown of the 4 Root Causes

### Root Cause 1: Serverless Execution Context Freezing (Primary Trigger)
- **Location:** `app/api/platform/audit/onboarding/route.ts` (lines 560–572) and `app/api/platform/onboarding/route.ts` (lines 443–454).
- **Mechanism:** In Node.js serverless runtimes (such as Vercel / AWS Lambda), the execution environment is paused or recycled as soon as the HTTP handler returns its response. Code invoked as `void executor.execute(...)` does not prevent container suspension.
- **Runtime Impact:** The executor began execution, updated the database row to `status: 'RUNNING', stage: 'RESEARCH'`, and began external I/O (`deps.research.research(...)` querying AI runtime and web sources). The container was suspended mid-network I/O, leaving the database state permanently in `status: 'RUNNING', stage: 'RESEARCH'`.

### Root Cause 2: Polling Endpoint Stale Gate in Checkout Route
- **Location:** `app/api/platform/audit/checkout/route.ts` (lines 240–252).
- **Mechanism:** The polling endpoint contained an auto-advance check:
  ```typescript
  if (generation?.id && (generation.status === "QUEUED" || generation.stage === "QUEUED")) {
    const executor = createLiveAutomaticAuditExecutor(service);
    void executor.execute(...);
  }
  ```
- **Runtime Impact:** Because the initial tick had already set `status: 'RUNNING'` and `stage: 'RESEARCH'`, `generation.status === 'QUEUED'` evaluated to `false` on every 5-second polling request. The polling endpoint treated the run as actively executing elsewhere and never resumed or advanced it.

### Root Cause 3: Queue Jobs Enqueued Without a Serverless Worker Consumer
- **Location:** `apps/mission-worker/src/worker.ts` vs `vercel.json`.
- **Mechanism:** `start_automatic_audit_generation_v1` enqueues an `audit.generate_v1` job into Postgres `public.queue_jobs`. The only queue consumer was `apps/mission-worker`, which is designed as a standalone long-lived daemon process (`setInterval`).
- **Runtime Impact:** In serverless production environments (Vercel), standalone daemons do not run. `vercel.json` had cron configurations for social workers and operating brain workers, but **zero** cron jobs for audit queue processing (`audit.generate_v1`).

### Root Cause 4: Missing Heartbeat Refresh Across State Transitions
- **Location:** `packages/audit-engine/src/pipeline.ts` (lines 84–330).
- **Mechanism:** `heartbeat_at` was only updated once upon entering `RESEARCH` (line 91). It was not being refreshed during subsequent stage transitions (`ANALYSIS`, `QUALITY_GATE`, `DELIVERY`), making it impossible for external watchdogs to distinguish an actively processing stage from a stalled or frozen container.

---

## 3. Implemented Engineering Fixes

### 1. Synchronous Serverless Step Advancement & Time-Bounded Awaiting
- **Files Modified:**
  - `app/api/platform/audit/checkout/route.ts`
  - `app/api/platform/audit/onboarding/route.ts`
  - `app/api/platform/onboarding/route.ts`
- **Fix:** Rather than firing unawaited `void executor.execute(...)`, API routes now await execution within a bounded time slice (15–20s) using `Promise.race([executionPromise, timeoutPromise])`. When the HTTP response returns, the audit has already advanced to the next state or completed, returning real-time progress to the client.

### 2. Active Watchdog & Stalled-Run Recovery
- **File Modified:** `app/api/platform/audit/checkout/route.ts`
- **Fix:** Enhanced the polling gate to detect stalled runs:
  ```typescript
  const isQueued = generation?.id && (generation.status === "QUEUED" || generation.stage === "QUEUED");
  const isStalledRunning = Boolean(
    generation?.id &&
    generation.status === "RUNNING" &&
    (!generation.heartbeat_at || Date.now() - new Date(generation.heartbeat_at).getTime() > 25_000)
  );

  if (isQueued || isStalledRunning) {
    // Re-acquire and advance executor synchronously within request budget
  }
  ```
  If an execution container was terminated or interrupted, the next 5-second polling request detects the stale heartbeat (> 25s), resumes execution from the latest persisted checkpoint (reusing already persisted research if available), and completes the pipeline.

### 3. Pipeline Heartbeat & Checkpoint Resumption
- **File Modified:** `packages/audit-engine/src/pipeline.ts`
- **Fix:** `heartbeat_at` and `stage_updated_at` are now refreshed on **every** stage transition (`RESEARCH`, `ANALYSIS`, `QUALITY_GATE`, `DELIVERY`, `COMPLETE`). When a resumed run enters the pipeline, it checks `persistedResearch(context.run.research_data)` — if research is already saved, it skips redundant external queries and proceeds directly to analysis and quality gate evaluation.

### 4. Dedicated Serverless Queue Worker Endpoint & Vercel Cron
- **Files Added / Modified:**
  - `app/api/platform/audit/worker/route.ts` (NEW)
  - `vercel.json`
- **Fix:** Created `/api/platform/audit/worker` route (authenticated with `CRON_SECRET`, `maxDuration = 60`, `dynamic = "force-dynamic"`), which claims and drains `audit.generate_v1` jobs from `public.queue_jobs` using `createPostgresQueueAdapter` and `createLiveAutomaticAuditExecutor`. Added `*/5 * * * *` schedule to `vercel.json`.

---

## 4. Verification Evidence

| Test Suite | Result | Validated Capabilities |
| :--- | :--- | :--- |
| `stalled-run-recovery.test.ts` | **PASS** | Stalled heartbeat recovery (>25s), stage resumption, heartbeat tracking |
| `automatic-audit-engine.test.ts` | **PASS** | Core state machine, provider routing, quality evaluation, idempotency |
| `audit-v1-experience.test.ts` | **PASS** | Onboarding actions (`start_fresh`, `finalize`), state machine invariants |
| `audit-ux-completion.test.ts` | **PASS** | Customer audit UI, mobile navigation, error handling |
| `forensic-end-to-end-repair.test.ts` | **PASS** | Single canonical tenant identity, lifecycle progression, customer states |
| `ai-runtime.test.ts` | **PASS** | Multi-provider AI execution (Gemini/OpenAI), structured schema validation |
| `worker-safety.test.ts` | **PASS** | Queue lease management, heartbeat renewal, safe retries |

---

## 5. Architectural Invariants Enforced

1. **Deterministic Terminal States:** Every audit stage terminates in `COMPLETED`, `NEEDS_REVIEW`, `STOPPED`, or `FAILED`. No stage can remain in `RUNNING` indefinitely without active lease renewal.
2. **Provider Failure Isolation:** Failures in single external providers (Google Maps, Instagram, GA4, Search Console) fall back cleanly to public web evidence and first-party Brand Brain without throwing unhandled rejections.
3. **Idempotent Deliveries:** Multiple execution attempts against the same audit order reuse persisted research and safely invoke `complete_automatic_audit_generation_v1` without duplicate charges or conflicting states.

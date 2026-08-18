import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createPostgresQueueAdapter } from "@stratxcel/queue";
import { AUDIT_GENERATION_JOB_TYPE, createLiveAutomaticAuditExecutor } from "@stratxcel/audit-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const queue = createPostgresQueueAdapter(supabase);
  const auditExecutor = createLiveAutomaticAuditExecutor(supabase);

  // Recover expired leases first
  await queue.recoverExpiredLeases().catch((err) => {
    console.warn("[audit-worker-cron] lease recovery trace:", err);
  });

  let processed = 0;
  const results: Array<{ jobId: string; runId?: string; outcome?: string; error?: string }> = [];
  const workerOwner = `cron-audit-worker-${Date.now()}`;

  while (processed < 5) {
    let job;
    try {
      job = await queue.claimNext({
        leaseOwner: workerOwner,
        jobTypes: [AUDIT_GENERATION_JOB_TYPE],
        leaseSeconds: 300,
      });
    } catch (claimErr) {
      console.warn("[audit-worker-cron] claim error:", claimErr);
      break;
    }
    if (!job) break;

    const runId = typeof job.payload?.auditGenerationRunId === "string"
      ? (job.payload.auditGenerationRunId as string)
      : "";

    if (!runId) {
      await queue.fail({
        jobId: job.id,
        leaseOwner: workerOwner,
        error: {
          message: "audit generation job missing auditGenerationRunId",
          code: "INVALID_JOB_PAYLOAD",
          retryable: false,
        },
      });
      processed++;
      results.push({ jobId: job.id, error: "missing auditGenerationRunId" });
      continue;
    }

    try {
      const outcome = await auditExecutor.execute({
        runId,
        attemptNumber: job.attempt_count,
        maxAttempts: job.max_attempts,
        expectedTenantId: job.tenant_id,
      });

      if (outcome.kind === "RETRY") {
        await queue.fail({
          jobId: job.id,
          leaseOwner: workerOwner,
          error: {
            message: outcome.message,
            code: outcome.code,
            retryable: true,
          },
        });
      } else {
        await queue.complete({ jobId: job.id, leaseOwner: workerOwner });
      }

      processed++;
      results.push({ jobId: job.id, runId, outcome: outcome.kind });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await queue.fail({
        jobId: job.id,
        leaseOwner: workerOwner,
        error: { message, retryable: true },
      });
      processed++;
      results.push({ jobId: job.id, runId, error: message });
    }
  }

  return NextResponse.json({ processed, results, timestamp: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}

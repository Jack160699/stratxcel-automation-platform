import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  createEmailProvider,
  createPostgresEmailOutboxStore,
  processEmailOutboxBatch,
} from "@stratxcel/email-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated manual/backup email outbox processor.
 *
 * Primary V1 processor is the independent poll loop inside apps/mission-worker
 * (EMAIL_PROCESSOR_MODE=mission-worker). This HTTP endpoint is intentionally
 * NOT scheduled via Vercel sub-daily cron (Hobby-incompatible). Call with
 * Authorization: Bearer $CRON_SECRET for ops recovery / external schedulers.
 *
 * Never sends unless provider is configured; never fabricates success.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase } = getTenantServiceContext();
  const store = createPostgresEmailOutboxStore(supabase);
  const provider = createEmailProvider({ forceInMemory: false });

  try {
    const result = await processEmailOutboxBatch(store, provider, {
      limit: 25,
      leaseOwner: "http-email-manual",
    });
    return Response.json({ status: "ok", ...result }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[email-processor] batch failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "email processor failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import {
  createImageGenerationJob,
  processImageGenerationJob,
  getImageGenerationJob,
} from "../../../lib/image-generation/service";

/**
 * TEMPORARY, one-off bridge for the Final Production Loop Step 5 E2E
 * staging validation. Never merged -- exists only for the duration of one
 * Preview deployment and reverted immediately after use.
 *
 * Unlike the earlier quality-campaign-bridge (which called ImageMediaRuntime
 * directly and never touched Supabase), this route calls the REAL
 * production functions from lib/image-generation/service.ts --
 * createImageGenerationJob, processImageGenerationJob, getImageGenerationJob
 * -- unmodified, so this genuinely exercises "generation -> real image
 * service -> real persistence in image_generation_jobs" end to end, not a
 * reimplementation of it. It operates ONLY on the tenantId/actorUserId
 * supplied in the request body, which the caller has already isolated to a
 * freshly-created, clearly-labeled staging tenant
 * (scripts/_e2e-staging-seed.mjs) -- this route never looks up or touches
 * any other tenant's data.
 *
 * Auth: a token generated locally, passed to THIS deployment only via
 * `vercel deploy -e SOCIAL_E2E_BRIDGE_TOKEN=...` -- never committed, never
 * derived from any Vercel-stored secret.
 */

function authorized(request: NextRequest): boolean {
  const expected = process.env.SOCIAL_E2E_BRIDGE_TOKEN;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    tenantId: string;
    actorUserId: string;
    brief: string;
    treatment: Record<string, unknown>;
    aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  };
  if (!body?.tenantId || !body?.actorUserId || !body?.brief || !body?.treatment) {
    return NextResponse.json({ error: "missing tenantId/actorUserId/brief/treatment" }, { status: 400 });
  }

  const client = createSupabaseServiceClient();
  try {
    const job = await createImageGenerationJob({
      authorizationClient: client,
      writeClient: client,
      input: {
        tenantId: body.tenantId,
        actorUserId: body.actorUserId,
        brief: body.brief,
        idempotencyKey: `e2e-staging-final-production-loop-${body.tenantId}`,
        treatment: body.treatment,
        aspectRatio: body.aspectRatio ?? "1:1",
        candidateCount: 1,
        sourceContext: "creative_studio",
      },
    });

    await processImageGenerationJob({ writeClient: client, jobId: job.id });
    const detail = await getImageGenerationJob(client, job.id);

    let signedUrl: string | null = null;
    let assetInfo: Record<string, unknown> | null = null;
    const candidate = detail.candidates[0];
    if (candidate) {
      const { data: asset } = await client
        .from("social_media_assets")
        .select("id, storage_bucket, storage_path, mime_type, size_bytes")
        .eq("id", candidate.asset_id)
        .single();
      if (asset) {
        assetInfo = asset;
        const { data: signed } = await client.storage
          .from(asset.storage_bucket as string)
          .createSignedUrl(asset.storage_path as string, 60 * 60);
        signedUrl = signed?.signedUrl ?? null;
      }
    }

    return NextResponse.json({
      jobId: job.id,
      status: detail.job.status,
      errorCode: detail.job.error_code,
      safeError: detail.job.safe_error,
      candidateCount: detail.candidates.length,
      asset: assetInfo,
      signedUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

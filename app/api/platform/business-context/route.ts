import { NextResponse, type NextRequest } from "next/server";
import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { ingestBusinessContext, RemoteEmbeddingsClient, type BusinessContextSupabaseClient } from "@stratxcel/ai-runtime";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Real, tenant-authenticated ingestion path for the RAG gap identified live
 * against ai.stratxcel.in (POST /v1/rag/query exists, no ingestion endpoint
 * does). tenant_id is re-derived from the caller's verified session via
 * requireTenantContext — never taken from the request body — matching every
 * other tenant-scoped write in this codebase. business_id defaults to the
 * tenant's own id (today's model is effectively one business per tenant);
 * an explicit business_id is accepted for a future multi-business tenant.
 *
 * Content is chunked and embedded through the remote server's real
 * /v1/embeddings, then stored in Supabase's business_context_embeddings
 * (RLS-scoped) — StratXcel remains the source of truth, only short curated
 * chunks are sent to the remote server, never a database export.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { tenantId?: string; businessId?: string; content?: string; source?: string } | null;
  if (!body?.tenantId || !body.content) {
    return NextResponse.json({ error: "tenantId and content are required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  if (body.content.length > 20_000) {
    return NextResponse.json({ error: "content too large (max 20,000 characters per ingest call)" }, { status: 413 });
  }

  // Cast: the real Supabase client's generic .from() signature is too deep
  // for TS to structurally match against this package's narrow interface
  // (matches the established `as unknown as` bridging pattern used
  // elsewhere in this codebase for the same reason, e.g. factory.ts's
  // internalWriteClient params).
  const service = createSupabaseServiceClient() as unknown as BusinessContextSupabaseClient;
  const embeddings = new RemoteEmbeddingsClient();
  if (!embeddings.isConfigured()) {
    return NextResponse.json({ error: "local_ai_not_configured" }, { status: 503 });
  }

  const result = await ingestBusinessContext(service, embeddings, {
    tenantId: ctx.tenantId,
    businessId: body.businessId ?? ctx.tenantId,
    content: body.content,
    source: body.source,
  });

  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

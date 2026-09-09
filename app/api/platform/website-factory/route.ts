/**
 * Website Factory API — the primary endpoint for the AI Website Factory.
 *
 * POST /api/platform/website-factory
 *   Creates a new website project from a natural-language prompt.
 *   Generates a structured specification using AI, validates it,
 *   generates the site pages, and creates a preview.
 *
 * GET /api/platform/website-factory?tenantId=...
 *   Lists all website projects for a tenant.
 *
 * PATCH /api/platform/website-factory
 *   Updates a website project (approve, deploy, etc.)
 */

import { requireTenantContext, requireTenantReadContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { WEBSITE_JOB_TYPES } from "@stratxcel/websites-and-domains";
import { recordAuditEvent } from "@stratxcel/audit";
import { createPostgresQueueAdapter } from "@stratxcel/queue";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createTenantWebsite } from "@/lib/websites/create-tenant-website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — Create a website project from a prompt.
 *
 * Flow:
 *   1. Authenticate + authorize tenant
 *   2. Generate structured specification from prompt (AI)
 *   3. Validate specification
 *   4. Generate site pages from specification
 *   5. Create database records (site project + initial version)
 *   6. Enqueue preview deployment job
 *   7. Return project with preview URL
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, prompt, websiteType, businessName, logoUrl, imageUrls } = body;

    if (!tenantId || !prompt) {
      return Response.json({ error: "tenantId and prompt are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const serviceDb = createSupabaseServiceClient();

    const result = await createTenantWebsite({
      supabase: serviceDb,
      tenantId,
      actorUserId: ctx.userId,
      prompt,
      websiteType,
      businessName,
      logoUrl,
      imageUrls,
    });

    switch (result.outcome) {
      case "CREATED":
        return Response.json({
          project: result.project,
          previewUrl: result.previewUrl,
          validationWarnings: result.validationWarnings,
        });
      case "NOT_ENTITLED":
        return Response.json({ error: result.reason }, { status: 403 });
      case "GENERATION_FAILED":
        return Response.json({ error: result.reason, validationErrors: result.validationErrors }, { status: 422 });
      case "RATE_LIMITED":
        return Response.json({ error: result.reason }, { status: 429 });
      case "BLOCKED":
        return Response.json({ error: result.reason }, { status: 503 });
      case "WRITE_FAILED":
        return Response.json({ error: result.reason }, { status: 500 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create website project";
    console.error("[WebsiteFactory] POST error:", err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET — List all website factory projects for a tenant.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const serviceDb = createSupabaseServiceClient();

  // Found live during E2E testing: this 500'd every load with "column
  // site_projects.framework does not exist" -- framework was never a real
  // column, and "template" should have been "template_id" (confirmed via
  // information_schema.columns on the live production table). The domains
  // select had the same drift: "domain" is really "domain_name", and
  // "verification_status"/"ssl_status" don't exist on domains at all (no
  // frontend code references either field by name, so they're dropped
  // rather than mapped to an invented substitute). domainsRes.error was
  // also silently discarded below (`domains: domainsRes.data ?? []`), so
  // this same class of bug in the second query would have stayed invisible
  // even after fixing the first.
  const [projectsRes, domainsRes] = await Promise.all([
    serviceDb
      .from("site_projects")
      .select("id, tenant_id, name, slug, status, custom_domain, template_id, created_at, updated_at, website_agents(id, name, enabled, conversation_count)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    serviceDb
      .from("domains")
      .select("id, tenant_id, domain:domain_name, status, auto_renew, expires_at, site_project_id, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
  ]);

  if (projectsRes.error) return Response.json({ error: projectsRes.error.message }, { status: 500 });
  if (domainsRes.error) return Response.json({ error: domainsRes.error.message }, { status: 500 });

  return Response.json({
    projects: projectsRes.data ?? [],
    domains: domainsRes.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PATCH — Update a website project (approve, deploy, edit).
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, projectId, action, notes, customDomain, pages } = body;

    if (!tenantId || !projectId || !action) {
      return Response.json({ error: "tenantId, projectId, and action are required" }, { status: 400 });
    }

    const validActions = ["approve", "request_revision", "deploy", "publish", "suspend", "unsuspend"];
    if (!validActions.includes(action)) {
      return Response.json({ error: `Action must be one of: ${validActions.join(", ")}` }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const serviceDb = createSupabaseServiceClient();

    // Map factory actions to the existing RPC actions
    let rpcAction: string;
    switch (action) {
      case "approve": rpcAction = "approve"; break;
      case "request_revision": rpcAction = "revision"; break;
      case "deploy": rpcAction = "mark_deploying"; break;
      case "publish": rpcAction = "mark_live"; break;
      default: rpcAction = action;
    }

    if (["approve", "request_revision"].includes(action)) {
      const { data: rpcResult, error: rpcErr } = await serviceDb.rpc("apply_site_project_version", {
        p_site_project_id: projectId,
        p_tenant_id: tenantId,
        p_action: rpcAction,
        p_pages: pages ?? null,
        p_notes: notes ?? null,
        p_custom_domain: customDomain ?? null,
        p_actor_user_id: ctx.userId,
      });

      if (rpcErr) {
        return Response.json({ error: `Failed: ${rpcErr.message}` }, { status: 500 });
      }
      const result = rpcResult as { success: boolean; reason?: string };
      if (!result.success) {
        return Response.json({ error: result.reason }, { status: 400 });
      }
    }

    // For deploy action, enqueue background jobs
    if (action === "deploy") {
      const queue = createPostgresQueueAdapter(serviceDb);

      // If custom domain specified, enqueue domain + hosting flow
      if (customDomain) {
        await queue.enqueue({
          tenantId,
          jobType: WEBSITE_JOB_TYPES.CONFIGURE_DNS,
          payload: { siteProjectId: projectId, domain: customDomain },
          idempotencyKey: `${WEBSITE_JOB_TYPES.CONFIGURE_DNS}:${projectId}`,
          maxAttempts: 5,
        });
      }

      // Enqueue QA
      await queue.enqueue({
        tenantId,
        jobType: WEBSITE_JOB_TYPES.RUN_QA,
        payload: { siteProjectId: projectId },
        idempotencyKey: `${WEBSITE_JOB_TYPES.RUN_QA}:${projectId}`,
        maxAttempts: 3,
      });
    }

    // Record audit event
    await recordAuditEvent(serviceDb, {
      tenantId,
      actorUserId: ctx.userId,
      actorKind: "user",
      action: `WEBSITE_${action.toUpperCase()}`,
      targetType: "site_project",
      targetId: projectId,
      metadata: { action, notes: notes?.substring(0, 200), customDomain },
    }).catch(() => { /* non-blocking */ });

    const { data: saved } = await serviceDb.from("site_projects").select("*").eq("id", projectId).eq("tenant_id", tenantId).single();
    return Response.json({ project: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update project";
    return Response.json({ error: msg }, { status: 400 });
  }
}

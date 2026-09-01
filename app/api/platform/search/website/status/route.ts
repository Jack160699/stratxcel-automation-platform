import { requireTenantReadContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { resolveCanonicalWebsite, matchVercelProjectToWebsite, resolveVercelWriteCapability } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/search/website/status?tenantId=...
 *
 * Real customer-facing read model for the Website connector card on
 * /app/integrations (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
 * Update 18). Deliberately does not introduce a second website record or a
 * second website-resolution rule -- website comes from the same
 * resolveCanonicalWebsite() the Search Growth dashboard uses. Platform
 * detection is never a guess: it's only ever the real framework field
 * Vercel itself reports for a project whose own discovered domain actually
 * matches the canonical website's hostname -- if no such match exists, it
 * honestly reports "unknown" rather than assuming.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "MISSING_TENANT_ID" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase } = getTenantServiceContext();

  const website = await resolveCanonicalWebsite(supabase, tenantId);

  const { data: connection } = await supabase
    .from("search_website_connections")
    .select("id, provider, external_account_name, scope, is_healthy, last_verified_at, last_error, diagnostic_state")
    .eq("tenant_id", tenantId)
    .eq("provider", "vercel")
    .maybeSingle();

  let projects: Array<{
    projectName: string;
    domains: unknown;
    framework: string | null;
    lastDeploymentState: string | null;
    lastDeploymentUrl: string | null;
  }> = [];
  if (connection) {
    const { data: projectRows } = await supabase
      .from("search_website_connection_projects")
      .select("project_name, domains, framework, last_deployment_state, last_deployment_url")
      .eq("connection_id", connection.id);
    projects = (projectRows ?? []).map((p: any) => ({
      projectName: p.project_name,
      domains: p.domains,
      framework: p.framework,
      lastDeploymentState: p.last_deployment_state,
      lastDeploymentUrl: p.last_deployment_url,
    }));
  }

  // Only ever real: a project's own reported framework, only when a domain
  // it actually owns matches the canonical website's hostname. Never a
  // fallback guess for non-Vercel or unmatched sites.
  const matchedProject = website ? matchVercelProjectToWebsite(projects, website.url) : null;
  const detectedPlatform = matchedProject?.framework ?? null;

  const writeCapability = await resolveVercelWriteCapability({
    tenantId,
    db: supabase,
    siteUrl: website?.url,
  });

  const vercelState = !connection
    ? "NOT_CONNECTED"
    : writeCapability.state === "AUTHENTICATION_FAILED" || connection.is_healthy === false
      ? "PROVIDER_ERROR"
      : writeCapability.state === "WRITE_READY" || connection.scope === "AUTONOMOUS_WRITE"
        ? "READY"
        : "AUTHORIZED";

  return Response.json(
    {
      website: website ? { url: website.url, source: website.source } : null,
      detectedPlatform,
      vercel: {
        state: vercelState,
        accountName: connection?.external_account_name ?? null,
        scope: connection?.scope ?? null,
        isHealthy: connection?.is_healthy ?? null,
        lastVerifiedAt: connection?.last_verified_at ?? null,
        lastError: connection?.last_error ?? null,
        // Update 24: the non-blocking token->team->project->domain
        // diagnosis (vercel/diagnostics.ts) -- null for a connection made
        // before this column existed, until its next connect/discover
        // refreshes it. Lets the UI distinguish "connected, project not
        // found yet" from "connected and verified" without a raw status code.
        diagnosticState: connection?.diagnostic_state ?? null,
        projects,
      },
    },
    { status: 200 }
  );
}

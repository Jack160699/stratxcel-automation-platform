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
import {
  generate5PageSite,
  generateSpecFromPrompt,
  validateWebsiteSpecification,
  WEBSITE_ENTITLEMENT_ENFORCED,
  WEBSITE_JOB_TYPES,
  type WebsiteType,
  type WebsiteSpecification,
  type SiteProjectInput,
} from "@stratxcel/websites-and-domains";
import { hasEntitlement, hasCapability, isPlanTier } from "@stratxcel/payments-and-wallet";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { createTenantAIRuntime, resolveTenantMonthSpendUsd, resolveTenantPlanTier } from "@stratxcel/ai-runtime";
import { recordAuditEvent } from "@stratxcel/audit";
import { createPostgresQueueAdapter } from "@stratxcel/queue";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

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

    // Resolve AI runtime dependencies
    const [planTier, spentUsd] = await Promise.all([
      resolveTenantPlanTier(serviceDb as any, tenantId),
      resolveTenantMonthSpendUsd(serviceDb as any, tenantId),
    ]);

    // Entitlement check — brief §1/§2/§3: website inclusion is landing_page
    // (Growth) or website_included (Business); Starter has no automatic
    // inclusion and must go through a separate paid add-on purchase. Only
    // enforced for a tenant with a real resolved plan tier (WEBSITE_ENTITLEMENT_ENFORCED
    // stays the global kill switch for the legacy free/no-subscription case
    // where no usage_entitlements rows exist at all — see entitlement.ts).
    const entitled = await hasEntitlement(serviceDb, tenantId, "website_maintenance", 1);
    const tierCapabilities = isPlanTier(planTier) ? planTier : null;
    const websiteIncludedByCapability = tierCapabilities
      ? hasCapability(tierCapabilities, "landing_page") || hasCapability(tierCapabilities, "website_included")
      : false;
    if (WEBSITE_ENTITLEMENT_ENFORCED && !entitled && !websiteIncludedByCapability) {
      return Response.json({
        error: "This plan doesn't include a website. Growth includes a landing page and Business includes a full professional website — or purchase a website as a one-time add-on.",
      }, { status: 403 });
    }

    const { runtime: aiRuntime, budgetEnvelope } = createTenantAIRuntime({
      tenantId,
      plan: planTier,
      spentUsdThisMonth: spentUsd,
      internalWriteClient: serviceDb,
    });

    // Get Brand Brain context if available
    const brandBrain = await getCurrentBrandBrain(serviceDb, tenantId).catch(() => null);
    const bbContent = (brandBrain?.content as Record<string, any>) || {};

    // Step 1: Generate specification from prompt
    const specResult = await generateSpecFromPrompt(aiRuntime, {
      prompt,
      tenantId,
      websiteType: websiteType as WebsiteType | undefined,
      knownContext: {
        businessName: businessName ?? bbContent.business_name,
        industry: bbContent.industry,
        description: bbContent.description,
        contactEmail: bbContent.contact_email,
        contactPhone: bbContent.contact_phone,
        targetAudience: bbContent.target_audience,
        toneOfVoice: bbContent.tone_of_voice,
        brandPillars: bbContent.pillars,
      },
      budgetEnvelope,
    });

    if (!specResult.ok || !specResult.specification) {
      return Response.json({
        error: specResult.userError ?? "Failed to generate website specification",
        validationErrors: specResult.validationErrors,
        validationWarnings: specResult.validationWarnings,
      }, { status: 422 });
    }

    const spec = specResult.specification.specification;

    // Step 2: Generate site pages from specification
    const siteInput: SiteProjectInput = {
      tenantId,
      businessName: spec.brand.businessName,
      industry: spec.brand.industry,
      businessDescription: spec.brand.tagline ?? spec.brand.uniqueSellingPoints?.join(". "),
      differentiators: spec.brand.uniqueSellingPoints,
      contactEmail: spec.contact.email,
      contactPhone: spec.contact.phone,
      contactAddress: spec.contact.address,
      brandBrain: brandBrain?.content
        ? { targetAudience: brandBrain.content.target_audience, toneOfVoice: brandBrain.content.tone_of_voice, pillars: brandBrain.content.pillars }
        : null,
    };

    const site = generate5PageSite(siteInput);

    // Use the AI-generated pages instead of the template pages when available
    const pages = spec.pages.length > 0 ? spec.pages : site.pages;

    // Step 3: Create database records
    const { data: dbSite, error: insertErr } = await serviceDb
      .from("site_projects")
      .insert({
        tenant_id: tenantId,
        owner_user_id: ctx.userId,
        name: spec.brand.businessName,
        slug: site.slug,
        template_id: "ai-generated",
        status: "preview_ready",
        website_type: spec.websiteType,
        generation_status: "GENERATED",
        deployment_status: "NOT_STARTED",
        preview_subdomain: site.previewSubdomain,
        pages,
        business_input: siteInput,
        generation_spec: specResult.specification,
        prompt,
        plan: spec.websiteType,
        theme_config: {
          ...spec.visualStyle,
          ...(typeof logoUrl === "string" && logoUrl ? { logoUrl } : {}),
          ...(Array.isArray(imageUrls) && imageUrls.length > 0
            ? { imageUrls: imageUrls.filter((u: unknown): u is string => typeof u === "string").slice(0, 12) }
            : {}),
        },
        custom_domain: spec.domain.requested ?? null,
      })
      .select("*")
      .single();

    if (insertErr) {
      return Response.json({ error: `Failed to create project: ${insertErr.message}` }, { status: 500 });
    }

    // Step 4: Create initial version via the atomic RPC
    const { error: rpcErr } = await serviceDb.rpc("apply_site_project_version", {
      p_site_project_id: dbSite.id,
      p_tenant_id: tenantId,
      p_action: "generate",
      p_pages: pages,
      p_notes: `AI-generated from prompt: "${prompt.substring(0, 100)}..."`,
      p_custom_domain: spec.domain.requested ?? null,
      p_actor_user_id: ctx.userId,
    });

    if (rpcErr) {
      console.error(`[WebsiteFactory] Version RPC failed for ${dbSite.id}:`, rpcErr);
    }

    // Step 5: Record usage
    try {
      await serviceDb.from("website_usage_tracking").insert({
        site_project_id: dbSite.id,
        tenant_id: tenantId,
        event_type: "ai_generation",
        ai_input_tokens: specResult.aiMetadata?.inputTokens ?? 0,
        ai_output_tokens: specResult.aiMetadata?.outputTokens ?? 0,
        estimated_cost_usd: specResult.aiMetadata?.estimatedCostUsd ?? 0,
        provider: specResult.aiMetadata?.provider ?? "unknown",
        model: specResult.aiMetadata?.model ?? "unknown",
        metadata: { prompt: prompt.substring(0, 500) },
      });
    } catch {
      // non-blocking tracking
    }

    // Step 6: Record audit event
    try {
      await recordAuditEvent(serviceDb, {
        tenantId,
        actorUserId: ctx.userId,
        actorKind: "user",
        action: "WEBSITE_CREATED",
        targetType: "site_project",
        targetId: dbSite.id,
        metadata: {
          websiteType: spec.websiteType,
          businessName: spec.brand.businessName,
          promptLength: prompt.length,
          pagesGenerated: pages.length,
        },
      });
    } catch {
      // non-blocking audit
    }

    // Step 7: If an AI agent was requested, create the agent config
    if (spec.agent.enabled) {
      try {
        await serviceDb.from("website_agents").insert({
          site_project_id: dbSite.id,
          tenant_id: tenantId,
          name: spec.agent.name ?? `${spec.brand.businessName} Assistant`,
          system_instructions: buildAgentSystemPrompt(spec),
          business_context: {
            businessName: spec.brand.businessName,
            industry: spec.brand.industry,
            targetAudience: spec.brand.targetAudience,
            uniqueSellingPoints: spec.brand.uniqueSellingPoints,
            contactEmail: spec.contact.email,
            contactPhone: spec.contact.phone,
          },
          enabled: false, // Enabled when site goes LIVE
          greeting_message: spec.agent.greetingMessage ?? `Hi! Welcome to ${spec.brand.businessName}. How can I help you today?`,
        });
      } catch {
        // non-blocking agent config
      }
    }

    // Refetch to get the final state
    const { data: finalSite } = await serviceDb.from("site_projects").select("*").eq("id", dbSite.id).single();

    return Response.json({
      project: finalSite,
      specification: specResult.specification,
      previewUrl: `/app/website/${dbSite.id}/preview`,
      entitled,
      entitlementEnforced: WEBSITE_ENTITLEMENT_ENFORCED,
      validationWarnings: specResult.validationWarnings,
    });
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

  const [projectsRes, domainsRes] = await Promise.all([
    serviceDb
      .from("site_projects")
      .select("id, tenant_id, name, slug, status, custom_domain, framework, template, created_at, updated_at, website_agents(id, name, enabled, conversation_count)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    serviceDb
      .from("domains")
      .select("id, tenant_id, domain, status, verification_status, ssl_status, auto_renew, expires_at, site_project_id, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
  ]);

  if (projectsRes.error) return Response.json({ error: projectsRes.error.message }, { status: 500 });

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

function buildAgentSystemPrompt(spec: WebsiteSpecification): string {
  return `You are the AI assistant for ${spec.brand.businessName}, a ${spec.brand.industry} business.

Your role:
- Answer questions about ${spec.brand.businessName}'s products, services, and business
- Help customers navigate the website
- Recommend products or services based on customer needs
- Capture leads by collecting contact information when appropriate
- Direct customers to checkout or contact pages when they're ready to buy or engage

Business context:
- Industry: ${spec.brand.industry}
- Target audience: ${spec.brand.targetAudience}
- Key differentiators: ${spec.brand.uniqueSellingPoints.join(", ")}
${spec.contact.email ? `- Contact email: ${spec.contact.email}` : ""}
${spec.contact.phone ? `- Contact phone: ${spec.contact.phone}` : ""}

RULES:
1. Never make up information about the business that isn't provided above.
2. Be helpful, professional, and aligned with the brand's personality.
3. If you can't answer a question, offer to connect the customer with a human representative.
4. Never share internal business data, pricing strategies, or confidential information.
5. Always be honest — if you don't know something, say so.`;
}

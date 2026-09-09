/**
 * createTenantWebsite: the single, real implementation of "create a new
 * Stratxcel website" -- extracted from app/api/platform/website-factory/route.ts's
 * POST handler (which now calls this instead of duplicating it), so the
 * dashboard route and the WhatsApp/Hermes `create_website` agent tool
 * (lib/agent-core/website-tools.ts) share exactly one code path, the same
 * precedent already set by applyTenantWebsiteEdit for `edit_website`.
 *
 * Adds three guards the dashboard route never needed (an authenticated human
 * clicking a button in their own tenant's dashboard is already rate-limited by
 * being a human): a DB-backed daily creation ceiling per tenant (multi-instance
 * safe -- counts real site_projects rows, never an in-process counter), a
 * kill-switch check (the same global_hermes/tenant scopes
 * apps/whatsapp-worker/src/processor.ts already checks), and a soft internal
 * timeout around the AI generation call so a hung provider call fails
 * gracefully with a real, honest outcome instead of running past the caller's
 * own request timeout.
 *
 * Deliberately out of scope here, unchanged: entitlement/plan gating (reused
 * as-is from the original route), production deployment, custom domain/DNS
 * (both stay on the existing PATCH deploy/publish path -- see that route),
 * and the hosting provider's own live/sandbox gate (packages/websites-and-domains'
 * config/production-gate.ts), which this function never touches or bypasses.
 */
import {
  generate5PageSite,
  generateSpecFromPrompt,
  WEBSITE_ENTITLEMENT_ENFORCED,
  type WebsiteType,
  type SiteProjectInput,
} from "@stratxcel/websites-and-domains";
import { hasEntitlement, hasCapability, isPlanTier } from "@stratxcel/payments-and-wallet";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { createTenantAIRuntime, resolveTenantMonthSpendUsd, resolveTenantPlanTier } from "@stratxcel/ai-runtime";
import { recordAuditEvent } from "@stratxcel/audit";
import { isKillSwitchActive } from "@stratxcel/queue";

const DAILY_LIMIT = Number(process.env.WHATSAPP_CREATE_WEBSITE_DAILY_LIMIT ?? 3);
const GENERATION_TIMEOUT_MS = 45_000;

export interface CreateTenantWebsiteInput {
  /** Any Supabase-shaped service client -- cross-package client type is
   *  already loosely typed (`as any`) at every call site in the original
   *  route this was extracted from; kept consistent rather than fighting it
   *  with a new shared type. */
  supabase: any;
  tenantId: string;
  actorUserId: string | null;
  prompt: string;
  websiteType?: string;
  businessName?: string;
  logoUrl?: string;
  imageUrls?: string[];
  /** Audit-trail label only -- "dashboard" (default, matches the original
   *  route's own unlabeled behavior) or "whatsapp_agent". Never used for
   *  any authorization/gating decision. */
  channel?: string;
}

export type CreateTenantWebsiteResult =
  | { outcome: "CREATED"; project: Record<string, unknown>; previewUrl: string; validationWarnings?: Array<{ path: string; message: string }> }
  | { outcome: "NOT_ENTITLED"; reason: string }
  | { outcome: "RATE_LIMITED"; reason: string }
  | { outcome: "BLOCKED"; reason: string }
  | { outcome: "GENERATION_FAILED"; reason: string; validationErrors?: unknown }
  | { outcome: "WRITE_FAILED"; reason: string };

async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutReason: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutReason)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function countRecentWebsiteCreations(supabase: any, tenantId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("site_projects")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", since);
  if (error) throw new Error(`countRecentWebsiteCreations: ${error.message}`);
  return count ?? 0;
}

export async function createTenantWebsite(input: CreateTenantWebsiteInput): Promise<CreateTenantWebsiteResult> {
  const { supabase, tenantId, actorUserId, prompt } = input;

  const kill = await isKillSwitchActive(supabase, [{ scope: "global_hermes" }, { scope: "tenant", scopeId: tenantId }]);
  if (kill.active) {
    return { outcome: "BLOCKED", reason: kill.reason ?? "website creation is temporarily paused" };
  }

  let recentCount: number;
  try {
    recentCount = await countRecentWebsiteCreations(supabase, tenantId);
  } catch (err) {
    return { outcome: "WRITE_FAILED", reason: err instanceof Error ? err.message : "rate limit check failed" };
  }
  if (recentCount >= DAILY_LIMIT) {
    return { outcome: "RATE_LIMITED", reason: `Already created ${recentCount} website(s) in the last 24 hours (limit ${DAILY_LIMIT}). Try again later or use the dashboard.` };
  }

  const [planTier, spentUsd] = await Promise.all([
    resolveTenantPlanTier(supabase, tenantId),
    resolveTenantMonthSpendUsd(supabase, tenantId),
  ]);

  // Entitlement check -- brief §1/§2/§3: same rule the dashboard route
  // enforces (website inclusion is landing_page/Growth or website_included/Business).
  const entitled = await hasEntitlement(supabase, tenantId, "website_maintenance", 1);
  const tierCapabilities = isPlanTier(planTier) ? planTier : null;
  const websiteIncludedByCapability = tierCapabilities
    ? hasCapability(tierCapabilities, "landing_page") || hasCapability(tierCapabilities, "website_included")
    : false;
  if (WEBSITE_ENTITLEMENT_ENFORCED && !entitled && !websiteIncludedByCapability) {
    return {
      outcome: "NOT_ENTITLED",
      reason: "This plan doesn't include a website. Growth includes a landing page and Business includes a full professional website -- or purchase a website as a one-time add-on.",
    };
  }

  const { runtime: aiRuntime, budgetEnvelope } = createTenantAIRuntime({
    tenantId,
    plan: planTier,
    spentUsdThisMonth: spentUsd,
    internalWriteClient: supabase,
  });

  const brandBrain = await getCurrentBrandBrain(supabase, tenantId).catch(() => null);
  const bbContent = (brandBrain?.content as Record<string, any>) || {};

  let specResult: Awaited<ReturnType<typeof generateSpecFromPrompt>>;
  try {
    specResult = await withTimeout(
      generateSpecFromPrompt(aiRuntime, {
        prompt,
        tenantId,
        websiteType: input.websiteType as WebsiteType | undefined,
        knownContext: {
          businessName: input.businessName ?? bbContent.business_name,
          industry: bbContent.industry,
          description: bbContent.description,
          contactEmail: bbContent.contact_email,
          contactPhone: bbContent.contact_phone,
          targetAudience: bbContent.target_audience,
          toneOfVoice: bbContent.tone_of_voice,
          brandPillars: bbContent.pillars,
        },
        budgetEnvelope,
      }),
      GENERATION_TIMEOUT_MS,
      "website generation timed out"
    );
  } catch (err) {
    return { outcome: "GENERATION_FAILED", reason: err instanceof Error ? err.message : "website generation timed out" };
  }

  if (!specResult.ok || !specResult.specification) {
    return {
      outcome: "GENERATION_FAILED",
      reason: specResult.userError ?? "Failed to generate website specification",
      validationErrors: specResult.validationErrors,
    };
  }

  const spec = specResult.specification.specification;

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
  const pages = spec.pages.length > 0 ? spec.pages : site.pages;

  const { data: dbSite, error: insertErr } = await supabase
    .from("site_projects")
    .insert({
      tenant_id: tenantId,
      owner_user_id: actorUserId,
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
        ...(typeof input.logoUrl === "string" && input.logoUrl ? { logoUrl: input.logoUrl } : {}),
        ...(Array.isArray(input.imageUrls) && input.imageUrls.length > 0
          ? { imageUrls: input.imageUrls.filter((u): u is string => typeof u === "string").slice(0, 12) }
          : {}),
      },
      custom_domain: spec.domain.requested ?? null,
    })
    .select("*")
    .single();

  if (insertErr) {
    return { outcome: "WRITE_FAILED", reason: `Failed to create project: ${insertErr.message}` };
  }

  const { error: rpcErr } = await supabase.rpc("apply_site_project_version", {
    p_site_project_id: dbSite.id,
    p_tenant_id: tenantId,
    p_action: "generate",
    p_pages: pages,
    p_notes: `AI-generated from prompt: "${prompt.substring(0, 100)}..."`,
    p_custom_domain: spec.domain.requested ?? null,
    p_actor_user_id: actorUserId,
  });
  if (rpcErr) {
    console.error(`[createTenantWebsite] Version RPC failed for ${dbSite.id}:`, rpcErr);
  }

  try {
    await supabase.from("website_usage_tracking").insert({
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

  try {
    await recordAuditEvent(supabase, {
      tenantId,
      actorUserId: actorUserId ?? undefined,
      actorKind: actorUserId ? "user" : "integration",
      action: "WEBSITE_CREATED",
      targetType: "site_project",
      targetId: dbSite.id,
      metadata: {
        websiteType: spec.websiteType,
        businessName: spec.brand.businessName,
        promptLength: prompt.length,
        pagesGenerated: pages.length,
        channel: input.channel ?? "dashboard",
      },
    });
  } catch {
    // non-blocking audit
  }

  if (spec.agent.enabled) {
    try {
      await supabase.from("website_agents").insert({
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
        enabled: false,
        greeting_message: spec.agent.greetingMessage ?? `Hi! Welcome to ${spec.brand.businessName}. How can I help you today?`,
      });
    } catch {
      // non-blocking agent config
    }
  }

  const { data: finalSite } = await supabase.from("site_projects").select("*").eq("id", dbSite.id).single();

  return {
    outcome: "CREATED",
    project: finalSite ?? dbSite,
    previewUrl: `/app/website/${dbSite.id}/preview`,
    validationWarnings: specResult.validationWarnings,
  };
}

/** Moved here verbatim from app/api/platform/website-factory/route.ts -- the
 *  route no longer defines its own copy, so there is exactly one. */
function buildAgentSystemPrompt(spec: { brand: { businessName: string; industry: string; targetAudience: string; uniqueSellingPoints: string[] }; contact: { email?: string; phone?: string } }): string {
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
5. Always be honest -- if you don't know something, say so.`;
}

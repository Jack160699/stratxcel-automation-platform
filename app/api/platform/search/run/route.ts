import { getTenantServiceContext, requireTenantContext } from "@/lib/tenants/tenant-context";
import { can } from "@/lib/rbac/policy";
import { isPlanTier } from "@stratxcel/payments-and-wallet";
import { runSearchAnalysis, resolveGoogleProviderStates, stableFingerprint, CRAWL_LIMITS, normalizeWebsiteInput, type RuntimePlan } from "@stratxcel/search-discovery";
import { createDevEncryptedVault } from "@stratxcel/byok";
import type { ProviderConnection } from "@stratxcel/search-discovery";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
// Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
// 17: this used to call `new URL(value)` directly on the raw customer
// input, which throws for a bare domain with no scheme -- so typing
// "stratxcel.in" (what a customer naturally types) was rejected, and only
// a fully-qualified "https://stratxcel.in" ever worked. Replaced with the
// canonical normalizeWebsiteInput() (packages/search-discovery), which
// accepts bare domains/www/non-www/mixed case/trailing slash and also
// collapses scheme/case/trailing-slash variants of the same literal domain
// to one identical stored propertyUrl -- letting the real, existing
// UNIQUE (tenant_id, property_url) constraint on search_projects actually
// prevent duplicates for those variants without new app-level dedupe logic.
export async function POST(request: Request) { const body = await request.json().catch(() => ({})) as { tenantId?: string; propertyUrl?: string; propertyName?: string }; if (!body.tenantId) return Response.json({ error: "SEARCH_INVALID_REQUEST" }, { status: 400 }); const normalizedSite = normalizeWebsiteInput(body.propertyUrl); if (!normalizedSite.ok) return Response.json({ error: "SEARCH_INVALID_REQUEST", reason: normalizedSite.reason }, { status: 400 }); const propertyUrl = normalizedSite.url; const ctx = await requireTenantContext(body.tenantId); if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status }); if (!can(ctx.role, "mission:create")) return Response.json({ error: "SEARCH_PERMISSION_DENIED" }, { status: 403 }); const { supabase } = getTenantServiceContext(); const { data: subscription } = await supabase.from("subscriptions").select("plan_tier").eq("tenant_id", body.tenantId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(); const tier = subscription?.plan_tier; const plan: RuntimePlan = isPlanTier(tier) && tier in CRAWL_LIMITS ? (tier as RuntimePlan) : "free";
  const since = new Date(Date.now() - 15 * 60_000).toISOString(); const { count } = await supabase.from("search_analysis_runs").select("id", { count: "exact", head: true }).eq("tenant_id", body.tenantId).gte("created_at", since); if ((count ?? 0) >= 3) return Response.json({ error: "SEARCH_RATE_LIMITED", retryAfterSeconds: 900 }, { status: 429, headers: { "Retry-After": "900" } }); const bucket = new Date().toISOString().slice(0, 16).replace(/\d$/, "0"); const idempotencyKey = stableFingerprint([body.tenantId, propertyUrl, "manual", bucket]);

  // Independently resolve real Google Search Console + GA4 state for this
  // tenant before running the analysis. A failure resolving one provider
  // (or Google entirely) must never abort the whole Search run — it
  // degrades to a truthful 'error'/'not_connected' state for that provider
  // only, exactly like the pre-existing GBP/Meta placeholders below.
  let googleConnections: ProviderConnection[]; let googleSnapshots: Record<string, { dimensions: unknown; values: unknown; periodStart?: string; periodEnd?: string }>;
  try {
    const vault = createDevEncryptedVault(supabase);
    const resolved = await resolveGoogleProviderStates({ db: supabase, vault, tenantId: body.tenantId });
    googleConnections = resolved.connections; googleSnapshots = resolved.snapshots;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Google provider resolution failed.";
    googleConnections = [{ provider: "search_console", state: "error", reason }, { provider: "ga4", state: "error", reason }]; googleSnapshots = {};
  }

  const providerStates: ProviderConnection[] = [...googleConnections, { provider: "google_business_profile", state: "configuration_required", reason: "Owner connection required." }, { provider: "meta", state: "permission_required", reason: "Reporting permission required." }];

  const result = await runSearchAnalysis(supabase, { tenantId: body.tenantId, actorUserId: ctx.userId, propertyUrl, propertyName: body.propertyName?.trim().slice(0, 120) || normalizedSite.hostname, plan, runType: "manual", triggerSource: "manual", idempotencyKey }, { providerStates, providerSnapshots: googleSnapshots }); return Response.json(result, { status: result.duplicate ? 200 : 201 }); }

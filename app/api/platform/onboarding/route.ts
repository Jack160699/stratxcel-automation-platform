import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";
import { getCurrentBrandBrain, saveBrandBrainVersion, type BrandBrainContent } from "@stratxcel/brand-brain";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { field } from "@/lib/audit/v1/provenance";
import { CONNECT_DISCOVER_VERSION } from "@/lib/audit/v1/onboarding-state";
import type { DiscoveredBusinessProfile } from "@/lib/audit/v1/adaptive-questions";
import { resolveAuditBudgetLimitUsd, createLiveAutomaticAuditExecutor } from "@stratxcel/audit-engine";
import { sanitizeChannels } from "@/lib/audit/v1/channels";
import { provisionTenantConnectorsFromMetadata } from "@/lib/social/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONBOARDING_METADATA_KEY = "stratxcel_onboarding_draft_v1";
const MAX_STEP = 5;

interface OnboardingRequestBody {
  business?: {
    name?: string;
    slug?: string;
    industry?: string;
    website?: string;
    googleMapsUrl?: string;
    location?: string;
    businessModel?: string;
    socials?: Array<{ platform: string; url: string; handle: string; confirmed?: boolean }>;
  };
  brand?: {
    businessName?: string;
    description?: string;
    audience?: string;
    tone?: string;
    offers?: string[];
    restrictions?: string[];
  };
  goals?: string[];
  plan?: { tier?: string; note?: string } | null;
}

interface CreatedTenant {
  id: string;
  slug: string;
  name: string;
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitizeDraft(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const account = source.account && typeof source.account === "object" ? (source.account as Record<string, unknown>) : {};
  const business = source.business && typeof source.business === "object" ? (source.business as Record<string, unknown>) : {};
  const brand = source.brand && typeof source.brand === "object" ? (source.brand as Record<string, unknown>) : {};
  const plan = source.plan && typeof source.plan === "object" ? (source.plan as Record<string, unknown>) : {};
  const rawConnections = Array.isArray(account.connections) ? account.connections : [];
  const rawSocials = Array.isArray(business.socials) ? business.socials : [];

  return {
    account: {
      connections: rawConnections
        .filter((c) => c && typeof c === "object")
        .map((c) => ({
          platform: text((c as any).platform, 40),
          handle: text((c as any).handle, 120),
          url: text((c as any).url, 500),
          displayName: text((c as any).displayName, 120),
          status: text((c as any).status, 40) || "not_connected",
          connectionType: text((c as any).connectionType, 40),
          providerAccountId: text((c as any).providerAccountId, 120),
          providerDisplayName: text((c as any).providerDisplayName, 120),
          providerLabel: text((c as any).providerLabel, 60),
          connectedAt: text((c as any).connectedAt, 60),
        })),
    },
    business: {
      name: text(business.name, 120),
      slug: text(business.slug, 80),
      slugTouched: business.slugTouched === true,
      industry: text(business.industry, 120),
      businessModel: text(business.businessModel, 120),
      website: text(business.website, 500),
      googleMapsUrl: text(business.googleMapsUrl, 500),
      location: text(business.location, 200),
      socials: rawSocials
        .filter((s) => s && typeof s === "object")
        .map((s) => ({
          platform: text((s as any).platform, 40),
          url: text((s as any).url, 500),
          handle: text((s as any).handle, 120),
          confirmed: (s as any).confirmed !== false,
        })),
    },
    goals: Array.isArray(source.goals) ? source.goals.filter((goal): goal is string => typeof goal === "string").slice(0, 12).map((goal) => goal.slice(0, 100)) : [],
    brand: {
      businessName: text(brand.businessName, 120),
      description: text(brand.description, 2_000),
      audience: text(brand.audience, 1_000),
      tone: text(brand.tone, 500),
      offers: text(brand.offers, 4_000),
      restrictions: text(brand.restrictions, 4_000),
    },
    plan: { tier: text(plan.tier, 40) || null, note: text(plan.note, 1_000) },
  };
}

async function authenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Cross-device draft recovery with verified OAuth connection rehydration. */
export async function GET() {
  const { supabase, user } = await authenticatedUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const saved = user.user_metadata?.[ONBOARDING_METADATA_KEY] ?? null;
  const oauthConnections = (user.user_metadata?.onboarding_oauth_connections ?? {}) as Record<string, any>;

  // If saved draft exists, merge verified OAuth connections into draft account connections
  if (saved?.draft && Object.keys(oauthConnections).length > 0) {
    const existingConns = Array.isArray(saved.draft.account?.connections) ? [...saved.draft.account.connections] : [];
    for (const [platform, data] of Object.entries(oauthConnections)) {
      const idx = existingConns.findIndex((c) => c.platform === platform);
      const conn = {
        platform,
        handle: data.username || undefined,
        displayName: data.displayName || data.username || platform,
        status: "connected",
        connectionType: "oauth",
        providerAccountId: data.providerAccountId,
        providerDisplayName: data.displayName || undefined,
        providerLabel: data.providerLabel || "OAuth",
        connectedAt: data.connectedAt || new Date().toISOString(),
      };
      if (idx >= 0) {
        existingConns[idx] = conn;
      } else {
        existingConns.push(conn);
      }
    }
    saved.draft.account = { ...saved.draft.account, connections: existingConns };
  }

  // Rehydrate existing Google Search / GA4 connection if tenant exists
  let googleSearchConnection: any = null;
  try {
    const userMemberships = await listMembershipsForUser(supabase, user.id);
    const activeTenantId = userMemberships[0]?.tenant_id;
    if (activeTenantId) {
      const { supabase: serviceSupabase } = getTenantServiceContext();
      const { data: gData } = await serviceSupabase
        .from("search_google_connections")
        .select("status, search_console_site_url, ga4_property_id, ga4_property_display_name")
        .eq("tenant_id", activeTenantId)
        .maybeSingle();
      if (gData && gData.status === "connected") {
        googleSearchConnection = {
          status: "connected",
          searchConsoleSiteUrl: gData.search_console_site_url,
          ga4PropertyId: gData.ga4_property_id,
          ga4PropertyDisplayName: gData.ga4_property_display_name,
        };
      }
    }
  } catch {
    // Non-fatal
  }

  const googleSearch = googleSearchConnection || oauthConnections.google_search || null;

  return Response.json({ saved, oauthConnections, googleSearch }, { headers: { "Cache-Control": "no-store" } });
}

/** Saves only bounded, non-secret setup fields in the authenticated user's metadata. */
export async function PATCH(request: Request) {
  const { supabase, user } = await authenticatedUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { step?: unknown; draft?: unknown };
  const step = typeof body.step === "number" ? Math.min(Math.max(Math.floor(body.step), 1), MAX_STEP) : 1;
  const saved = { version: 1, step, draft: sanitizeDraft(body.draft), updatedAt: new Date().toISOString() };
  const { error } = await supabase.auth.updateUser({ data: { [ONBOARDING_METADATA_KEY]: saved } });
  if (error) return Response.json({ error: "Could not save onboarding progress." }, { status: 500 });
  return Response.json({ saved }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Structured onboarding wizard's single write step. Lives outside app/app/
 * deliberately — that directory is enforced service-role-free by
 * lib/rbac/__tests__/client-app-shell.test.ts, so the tenant-creation +
 * Brand Brain seed + audit log sequence (all service-role, RLS has no
 * client insert policy for tenants/tenant_members/audit_events) has to run
 * here, same split every other tenant-scoped write in this build uses.
 *
 * Idempotency: re-derives membership from the session before creating
 * anything. A double-click or a retried response can never create a second
 * tenant for the same user — the second call just returns the tenant the
 * first call already created.
 */
export async function POST(request: Request) {
  const identity = await resolveCanonicalIdentity();
  if (identity.state === "NO_SESSION") {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (identity.state === "INTERNAL_STAFF" || identity.state === "STAFF_VIEWING_CLIENT") {
    return Response.json({ error: "Staff accounts must create clients from the Admin workspace" }, { status: 403 });
  }
  const { supabase, user } = await authenticatedUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json()) as OnboardingRequestBody;
  const name = body.business?.name?.trim();
  if (!name) return Response.json({ error: "business name is required" }, { status: 400 });

  const { supabase: serviceClient } = getTenantServiceContext();
  const existing = await listMembershipsForUser(supabase, user.id);

  let tenant: CreatedTenant;
  let created = false;

  if (existing.length > 0) {
    const first = existing[0]!;
    tenant = { id: first.tenant.id, slug: first.tenant.slug, name: first.tenant.name };
  } else {
    let slug = body.business?.slug?.trim() || "";
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 48) || "workspace";
    }

    try {
      tenant = await createTenant(serviceClient, { slug, name, ownerUserId: user.id });
      created = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("duplicate key")) {
        try {
          const uniqueSlug = `${slug.slice(0, 40)}-${Date.now().toString(36).slice(-4)}`;
          tenant = await createTenant(serviceClient, { slug: uniqueSlug, name, ownerUserId: user.id });
          created = true;
        } catch {
          return Response.json({ error: `Slug '${slug}' is already taken` }, { status: 409 });
        }
      } else {
        throw err;
      }
    }
  }

  let brandBrainSaved = false;
  let brandBrainVersion = 1;
  const content: BrandBrainContent = {};
  if (body.brand?.businessName || name) content.business_name = body.brand?.businessName || name;
  if (body.business?.website) content.website_url = body.business.website;
  if (body.business?.googleMapsUrl) (content as any).google_maps_url = body.business.googleMapsUrl;
  if (body.business?.location) content.location = body.business.location;
  if (body.business?.industry) content.industry = body.business.industry;
  if (body.business?.businessModel) (content as any).business_model = body.business.businessModel;
  if (body.brand?.description) content.description = body.brand.description;
  if (body.brand?.tone) content.tone_of_voice = body.brand.tone;
  if (body.brand?.audience) content.target_audience = body.brand.audience;
  if (body.brand?.offers?.length) content.products = body.brand.offers.map((o) => ({ name: o, description: "" }));
  if (body.brand?.restrictions?.length) content.rules = body.brand.restrictions;
  if (body.goals?.length) content.goals = body.goals;
  if (body.business?.socials && body.business.socials.length > 0) {
    const confirmed = body.business.socials.filter((s) => s.confirmed !== false);
    (content as any).verified_social_links = confirmed.map((s) => ({
      platform: s.platform,
      url: s.url,
      handle: s.handle,
    }));
  }

  if (Object.keys(content).length > 0) {
    try {
      const savedVersion = await saveBrandBrainVersion(serviceClient, { tenantId: tenant.id, content, createdBy: user.id });
      brandBrainSaved = true;
      brandBrainVersion = savedVersion.version;
    } catch (err) {
      console.error("onboarding: failed to save Brand Brain seed", err);
    }
  }

  // Sync initial CRM lead for the tenant
  try {
    const contactEmail = user.email ?? null;
    const contactName = user.user_metadata?.full_name ?? name;
    await serviceClient.from("crm_leads").insert({
      tenant_id: tenant.id,
      source: "website",
      contact_name: contactName,
      contact_email: contactEmail,
      status: "new",
      metadata: {
        kind: "CUSTOMER_ONBOARDING_PRIMARY_CONTACT",
        businessName: name,
        websiteUrl: body.business?.website ?? null,
        googleMapsUrl: body.business?.googleMapsUrl ?? null,
        location: body.business?.location ?? null,
        industry: body.business?.industry ?? null,
        businessModel: body.business?.businessModel ?? null,
        socials: body.business?.socials ?? [],
        description: body.brand?.description ?? null,
        goals: body.goals ?? [],
        planRequested: body.plan?.tier ?? null,
      },
    });
  } catch (crmErr) {
    console.warn("onboarding: non-fatal crm lead sync trace", crmErr);
  }

  // Provision canonical tenant connector records from onboarding metadata & draft connections
  try {
    const { data: userData } = await serviceClient.auth.admin.getUserById(user.id);
    const userMetadata = userData?.user?.user_metadata ?? user.user_metadata;
    await provisionTenantConnectorsFromMetadata(serviceClient, {
      tenantId: tenant.id,
      userId: user.id,
      userMetadata,
      socials: body.business?.socials,
    });
  } catch (provErr) {
    console.warn("onboarding: non-fatal connector provisioning trace", provErr);
  }

  // Seed / update verified free audit order for the tenant
  let auditOrderId: string | null = null;
  try {
    const rawChannels = [
      ...(body.business?.googleMapsUrl ? [{ id: "google_business", type: "google_business" as const, value: body.business.googleMapsUrl, notAvailable: false }] : []),
      ...(body.business?.socials ? body.business.socials.filter((s) => s.confirmed !== false).map((s) => ({
        id: s.platform,
        type: s.platform as any,
        value: s.url,
        handle: s.handle,
        notAvailable: false,
      })) : []),
    ];
    const channels = sanitizeChannels(rawChannels);

    const profile: DiscoveredBusinessProfile = {
      name: field(name, "CUSTOMER_PROVIDED", undefined, true),
      category: field(body.business?.industry || "General Business", "CUSTOMER_PROVIDED", undefined, true),
      location: body.business?.location ? field(body.business.location, "CUSTOMER_PROVIDED", undefined, true) : undefined,
      offer: body.brand?.offers?.length ? field(body.brand.offers.join("\n"), "CUSTOMER_PROVIDED", undefined, true) : undefined,
      audience: body.brand?.audience ? field(body.brand.audience, "CUSTOMER_PROVIDED", undefined, true) : undefined,
      positioning: body.brand?.description ? field(body.brand.description, "CUSTOMER_PROVIDED", undefined, true) : undefined,
      websiteUrl: body.business?.website || undefined,
    };

    const adaptiveAnswers: Record<string, string> = {
      primaryGoal: (body.goals && body.goals[0]) || "improve_google_visibility",
      biggestGrowthProblem: "lead_response_and_consistency",
      ninetyDayResult: (body.goals && body.goals[0]) || "accelerated_customer_acquisition",
      idealCustomer: body.brand?.audience || "Local customers and clients",
      priorityOffering: (body.brand?.offers && body.brand.offers[0]) || name,
    };

    const deepDiveAnswers = {
      intakeMeta: {
        questionnaireVersion: CONNECT_DISCOVER_VERSION,
        completedAt: new Date().toISOString(),
        lastStepId: "complete",
      },
      onboardingCompleted: true,
      v1Experience: {
        flowVersion: CONNECT_DISCOVER_VERSION,
        step: "complete",
        verified: true,
        completed: true,
        websiteUrl: body.business?.website || "",
        channels,
        profile,
        adaptiveAnswers,
        updatedAt: new Date().toISOString(),
      },
    };

    const { data: existingOrder } = await serviceClient
      .from("audit_orders")
      .select("id, status")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      auditOrderId = existingOrder.id;
      await serviceClient
        .from("audit_orders")
        .update({
          business_name: name,
          website_url: body.business?.website ?? null,
          industry: body.business?.industry ?? null,
          status: "in_review",
          fulfilment_source: "free_audit",
          deep_dive_answers: deepDiveAnswers,
          goals: body.goals ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", auditOrderId);
    } else {
      const { data: inserted } = await serviceClient
        .from("audit_orders")
        .insert({
          tenant_id: tenant.id,
          business_name: name,
          website_url: body.business?.website ?? null,
          industry: body.business?.industry ?? null,
          audit_fee_cents: 0,
          list_price_cents: 99900,
          discount_cents: 99900,
          status: "in_review",
          fulfilment_source: "free_audit",
          deep_dive_answers: deepDiveAnswers,
          goals: body.goals ?? [],
        })
        .select("id")
        .single();
      auditOrderId = inserted?.id ?? null;
    }

    // Trigger automatic audit generation
    if (auditOrderId) {
      try {
        const started = await serviceClient.rpc("start_automatic_audit_generation_v1", {
          p_audit_order_id: auditOrderId,
          p_expected_tenant_id: tenant.id,
          p_brand_brain_version: brandBrainVersion,
          p_budget_limit_usd: resolveAuditBudgetLimitUsd(),
        });
        const result = started.data as { success?: boolean; run_id?: string } | null;
        if (result?.run_id) {
          const executor = createLiveAutomaticAuditExecutor(serviceClient);
          try {
            const executionPromise = executor.execute({
              runId: result.run_id,
              attemptNumber: 1,
              maxAttempts: 3,
              expectedTenantId: tenant.id,
            });
            const timeoutPromise = new Promise<{ kind: string }>((resolve) =>
              setTimeout(() => resolve({ kind: "TIMEOUT_SLICE" }), 15_000)
            );
            await Promise.race([executionPromise, timeoutPromise]);
          } catch (execErr) {
            console.warn("onboarding: executor execution trace", execErr);
          }
        }
      } catch (autoErr) {
        console.warn("onboarding: non-fatal automatic audit start trace", autoErr);
      }
    }
  } catch (auditErr) {
    console.warn("onboarding: non-fatal audit order seed trace", auditErr);
  }

  let auditLogged = false;
  const auditRows: { tenant_id: string; actor_user_id: string; action: string; target_type: string; target_id: string; metadata: Record<string, unknown> }[] = [];
  if (body.goals?.length) {
    auditRows.push({
      tenant_id: tenant.id,
      actor_user_id: user.id,
      action: "onboarding.goals_selected",
      target_type: "tenant",
      target_id: tenant.id,
      metadata: { goals: body.goals },
    });
  }
  if (body.plan?.tier || body.plan?.note) {
    auditRows.push({
      tenant_id: tenant.id,
      actor_user_id: user.id,
      action: "onboarding.plan_requested",
      target_type: "tenant",
      target_id: tenant.id,
      metadata: { tier: body.plan?.tier ?? null, note: body.plan?.note ?? null },
    });
  }
  if (auditRows.length > 0) {
    const { error: auditError } = await serviceClient.from("audit_events").insert(auditRows);
    if (auditError) {
      console.error("onboarding: failed to write audit_events", auditError.message);
    } else {
      auditLogged = true;
    }
  }

  await supabase.auth.updateUser({ data: { [ONBOARDING_METADATA_KEY]: null } });
  return Response.json(
    { tenant, auditOrderId, created, brandBrainSaved, auditLogged, started: true },
    { status: created ? 201 : 200 }
  );
}

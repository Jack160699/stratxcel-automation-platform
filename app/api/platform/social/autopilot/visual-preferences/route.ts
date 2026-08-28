import { NextResponse, type NextRequest } from "next/server";
import { requireClientContext } from "@/lib/tenants/client-context";
import { isMemberOfTenant } from "@/lib/tenants/current-tenant";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ARCHETYPE_IDS, ARCHETYPE_REGISTRY, archetypesForTier, sanitizePreferredArchetypes, type SubscriptionPlanTier } from "@/lib/social/archetype-routing";
import { recordAudit } from "@/lib/social/repositories/system";

/**
 * Server-validated persistence for social_autopilot_visual_preferences
 * (Subscription-Gated Visual Archetypes brief Section 2/13): the Spotify-
 * style onboarding gallery and the "your visual style" summary both read
 * and write through here -- never the table directly from the client.
 * Every write is re-derived from the tenant's REAL, freshly-read plan tier
 * and re-validated against the real archetype registry; the request body
 * is never trusted for tier or for "is this archetype allowed" on its own.
 */

async function authorizeTenant(tenantId: string) {
  const ctx = await requireClientContext();
  if (!ctx.ok) return { ok: false as const, status: 401 as const, error: ctx.error };
  if (ctx.accessMode === "staff_support") {
    if (ctx.workspaceTenant.tenantId !== tenantId) return { ok: false as const, status: 403 as const, error: "Staff support mode is read-only" };
    return { ok: true as const, userId: ctx.userId, readOnly: true };
  }
  const isMember = await isMemberOfTenant(ctx.supabase, ctx.userId, tenantId);
  if (!isMember) return { ok: false as const, status: 403 as const, error: "Not a member of this client" };
  return { ok: true as const, userId: ctx.userId, readOnly: false };
}

async function resolveTier(service: ReturnType<typeof createSupabaseServiceClient>, tenantId: string): Promise<SubscriptionPlanTier> {
  // Same direct-query pattern as lib/image-generation/service.ts and
  // lib/social/package-autopilot.ts -- deliberately NOT
  // resolveTenantPlanTier (an AI-cost budget helper that defaults an
  // unrecognized/missing subscription to "starter", the wrong semantic for
  // a commercial access-control decision). No active subscription fails
  // closed to "free", which archetype-routing.ts already denies premium
  // access for.
  const { data } = await service.from("subscriptions").select("plan_tier").eq("tenant_id", tenantId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const tier = typeof data?.plan_tier === "string" ? data.plan_tier : "free";
  const known: SubscriptionPlanTier[] = ["free", "starter", "growth", "business", "scale", "launch", "custom_growth"];
  return (known as string[]).includes(tier) ? (tier as SubscriptionPlanTier) : "free";
}

function catalogForTier(tier: SubscriptionPlanTier) {
  const allowedIds = tier === "starter" || tier === "growth" || tier === "business" ? archetypesForTier(tier) : (["BASIC_ESSENTIAL"] as const);
  return ARCHETYPE_IDS.map((id) => ({
    ...ARCHETYPE_REGISTRY[id],
    allowedForTier: (allowedIds as readonly string[]).includes(id),
  }));
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  const auth = await authorizeTenant(tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const service = createSupabaseServiceClient();
  const [tier, { data: preferencesRow }] = await Promise.all([
    resolveTier(service, tenantId),
    service.from("social_autopilot_visual_preferences").select("preferred_archetypes, updated_at").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  // Whether premium (Growth/Business-only) archetype selection is even a
  // concept for this tenant -- Starter never sees the picker at all
  // (Section 14: "no premium selector, instead a fixed-system message").
  const premiumSelectionAvailable = tier === "growth" || tier === "business";

  return NextResponse.json({
    tier,
    premiumSelectionAvailable,
    preferredArchetypes: sanitizePreferredArchetypes(preferencesRow?.preferred_archetypes ?? []),
    onboardingCompleted: Boolean(preferencesRow && sanitizePreferredArchetypes(preferencesRow.preferred_archetypes ?? []).length > 0),
    updatedAt: preferencesRow?.updated_at ?? null,
    catalog: catalogForTier(tier),
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  const auth = await authorizeTenant(tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.readOnly) return NextResponse.json({ error: "Staff support mode is read-only" }, { status: 403 });

  const service = createSupabaseServiceClient();
  const tier = await resolveTier(service, tenantId);
  if (tier !== "growth" && tier !== "business") {
    // Section 22: never let an invalid/unauthorized request accidentally
    // upgrade visual privileges. A Starter (or free/legacy) tenant simply
    // cannot have a preference row that means anything -- automated
    // routing ignores it unconditionally either way, but rejecting the
    // write outright keeps the DB honest and gives the frontend a real
    // error instead of a silently-no-op save.
    return NextResponse.json({ error: "Visual style preferences are a Growth/Business feature. This workspace's current plan always uses StratXcel's Basic Essential visual system." }, { status: 403 });
  }

  const sanitized = sanitizePreferredArchetypes(body.preferredArchetypes);
  if (sanitized.length < 1) {
    return NextResponse.json({ error: "Choose at least 1 visual style to continue." }, { status: 400 });
  }
  if (!Array.isArray(body.preferredArchetypes) || sanitized.length !== body.preferredArchetypes.length) {
    // The raw input contained something sanitizePreferredArchetypes had to
    // drop (unknown id, duplicate, or over the cap) -- reject rather than
    // silently save a truncated/deduped version the user didn't see.
    return NextResponse.json({ error: "One or more selected visual styles are invalid or duplicated." }, { status: 400 });
  }

  const { error } = await service
    .from("social_autopilot_visual_preferences")
    .upsert({ tenant_id: tenantId, preferred_archetypes: sanitized, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) {
    return NextResponse.json({ error: "Could not save visual style preferences." }, { status: 400 });
  }

  await recordAudit({
    actorType: "USER",
    actorId: auth.userId,
    action: "social.archetype.preferences.updated",
    targetType: "social_autopilot_visual_preferences",
    targetId: tenantId,
    summary: `Saved ${sanitized.length} preferred visual archetype(s)`,
    meta: { tenantId, preferredArchetypes: sanitized },
  }).catch(() => {});

  return NextResponse.json({ ok: true, preferredArchetypes: sanitized });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
